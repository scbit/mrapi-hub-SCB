"use strict";
const express=require("express");
const {admin,crmDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const {visibleOwners,isAdminLike,role}=require("./access");
const {LEAD_QUALITY_VALUES}=require("./constants");
const router=express.Router();
router.use(authRequired);
const STATUS_STAGES=["Seguimiento","Marca personal","Esperando PI","Para cotizar","Cotizado para enviar","Horno"];
function cleanOwner(v){return String(v||"").trim().toLowerCase();}
function normalizeRole(v){const x=String(v||"").trim().toLowerCase();return ["admin","backoffice","team_leader","field_sales"].includes(x)?x:"field_sales";}
function todayBA(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const m={};for(const p of parts)if(p.type!=="literal")m[p.type]=p.value;return `${m.year}-${m.month}-${m.day}`;}
function addDays(iso,n){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function periodRange(period,start,end){const p=String(period||"today").toLowerCase(),today=todayBA();if(p==="total")return {period:p,start:"",end:"",startDate:null,endDate:null};if(p==="custom"&&/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)){const a=start<=end?start:end,b=start<=end?end:start;return {period:p,start:a,end:b,startDate:new Date(`${a}T00:00:00Z`),endDate:new Date(`${addDays(b,1)}T00:00:00Z`)};}let s=today;if(p==="week"){const d=new Date(`${today}T12:00:00Z`),day=d.getUTCDay()||7;s=addDays(today,1-day);}else if(p==="month")s=today.slice(0,8)+"01";return {period:["today","week","month"].includes(p)?p:"today",start:s,end:today,startDate:new Date(`${s}T00:00:00Z`),endDate:new Date(`${addDays(today,1)}T00:00:00Z`)};}
async function countQuery(q){const s=await q.count().get();return Number(s.data().count||0);}
async function safeCount(q,label,errors){try{return await countQuery(q);}catch(e){errors.push({metric:label,error:String(e&&e.message||e)});return 0;}}
async function userList(){const snap=await crmDb.collection("users").orderBy("name","asc").limit(250).get();return {items:snap.docs.map(d=>{const x=d.data()||{};return {id:d.id,name:x.name||"",email:cleanOwner(x.email),role:normalizeRole(x.role),teamLeaderId:x.teamLeaderId||""};}),reads:snap.size};}
async function allowedOwner(req,requested){const scope=await visibleOwners(req.authUser);const own=cleanOwner(req.authUser.email);const o=cleanOwner(requested||own);if(scope!==null&&!scope.includes(o)){const e=new Error("Owner fuera de tus permisos");e.status=403;throw e;}return o;}
router.get("/users",async(req,res)=>{try{if(isAdminLike(req.authUser)){const u=await userList();return res.json({ok:true,items:u.items,readsEstimate:u.reads,canManage:role(req.authUser)==="admin"});}const scope=await visibleOwners(req.authUser);if(!scope?.length)return res.json({ok:true,items:[],readsEstimate:0,canManage:false});let reads=0,items=[];for(const email of scope.slice(0,10)){const s=await crmDb.collection("users").where("email","==",email).limit(1).get();reads+=s.size;for(const d of s.docs){const x=d.data()||{};items.push({id:d.id,name:x.name||"",email:cleanOwner(x.email),role:normalizeRole(x.role),teamLeaderId:x.teamLeaderId||""});}}return res.json({ok:true,items,readsEstimate:reads,canManage:false});}catch(e){res.status(500).json({ok:false,error:e.message});}});
router.post("/users",async(req,res)=>{try{if(role(req.authUser)!=="admin")return res.status(403).json({ok:false,error:"Solo admin puede crear usuarios"});const name=String(req.body?.name||"").trim(),email=cleanOwner(req.body?.email),password=String(req.body?.password||""),r=normalizeRole(req.body?.role),teamLeaderId=String(req.body?.teamLeaderId||"").trim();if(!name||!email||!password)return res.status(400).json({ok:false,error:"Nombre, email y contraseña son obligatorios"});const exists=await crmDb.collection("users").where("email","==",email).limit(1).get();if(!exists.empty)return res.status(409).json({ok:false,error:"Ya existe un usuario con ese email",readsEstimate:exists.size});if(r==="field_sales"&&!teamLeaderId)return res.status(400).json({ok:false,error:"Field Sales requiere Team Leader"});if(teamLeaderId){const tl=await crmDb.collection("users").doc(teamLeaderId).get();if(!tl.exists||normalizeRole((tl.data()||{}).role)!=="team_leader")return res.status(400).json({ok:false,error:"Team Leader inválido",readsEstimate:1+exists.size});}const ref=crmDb.collection("users").doc();await ref.set({name,email,password,role:r,teamLeaderId:r==="field_sales"?teamLeaderId:"",createdAt:new Date(),updatedAt:new Date()});res.json({ok:true,id:ref.id,readsEstimate:exists.size+(teamLeaderId?1:0),writesEstimate:1});}catch(e){res.status(500).json({ok:false,error:e.message});}});
router.put("/users/:id",async(req,res)=>{try{if(role(req.authUser)!=="admin")return res.status(403).json({ok:false,error:"Solo admin puede editar usuarios"});const ref=crmDb.collection("users").doc(req.params.id),snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:"Usuario no encontrado"});const old=snap.data()||{},p={updatedAt:new Date()};if("name" in (req.body||{}))p.name=String(req.body.name||"").trim();if("email" in (req.body||{}))p.email=cleanOwner(req.body.email);if(req.body?.password)p.password=String(req.body.password);const r="role" in (req.body||{})?normalizeRole(req.body.role):normalizeRole(old.role);p.role=r;const teamLeaderId=String(req.body?.teamLeaderId??old.teamLeaderId??"").trim();if(r==="field_sales"&&!teamLeaderId)return res.status(400).json({ok:false,error:"Field Sales requiere Team Leader"});p.teamLeaderId=r==="field_sales"?teamLeaderId:"";if(p.teamLeaderId){const tl=await crmDb.collection("users").doc(p.teamLeaderId).get();if(!tl.exists||normalizeRole((tl.data()||{}).role)!=="team_leader")return res.status(400).json({ok:false,error:"Team Leader inválido"});}await ref.update(p);res.json({ok:true,readsEstimate:1+(p.teamLeaderId?1:0),writesEstimate:1});}catch(e){res.status(500).json({ok:false,error:e.message});}});
router.delete("/users/:id",async(req,res)=>{try{if(role(req.authUser)!=="admin")return res.status(403).json({ok:false,error:"Solo admin puede borrar usuarios"});if(req.params.id===req.authUser.id)return res.status(400).json({ok:false,error:"No podés borrar tu propio usuario"});const ref=crmDb.collection("users").doc(req.params.id),snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:"Usuario no encontrado"});await ref.delete();res.json({ok:true,readsEstimate:1,writesEstimate:1});}catch(e){res.status(500).json({ok:false,error:e.message});}});
const MY_STATUS_CACHE_TTL_MS=60000;
const myStatusOwnerCache=new Map();
function tsMillis(v){if(!v)return 0;if(typeof v.toMillis==="function")return Number(v.toMillis()||0);if(v instanceof Date)return Number(v.getTime()||0);if(typeof v._seconds==="number")return Number(v._seconds*1000);if(typeof v.seconds==="number")return Number(v.seconds*1000);const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getTime();}
function qualityKey(v){const q=String(v||"NO_RESPONDE").trim().toUpperCase();return LEAD_QUALITY_VALUES.includes(q)?q:"NO_RESPONDE";}
async function exactMyStatusFallback(owner,range,today){
  const now=Date.now(),cacheKey=owner;
  let cached=myStatusOwnerCache.get(cacheKey);
  let rows;
  if(cached&&cached.expiresAt>now){rows=cached.rows;}else{
    const snap=await crmDb.collection("deals").where("owner","==",owner).limit(5000).get();
    rows=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
    myStatusOwnerCache.set(cacheKey,{expiresAt:now+MY_STATUS_CACHE_TTL_MS,rows});
  }
  const m={owner,nuevosProspectos:0,nuevosProspectosVencidos:0,seguimiento:0,seguimientoVencidos:0,marcaPersonal:0,marcaPersonalVencidos:0,esperandoPI:0,esperandoPIVencidos:0,paraCotizar:0,paraCotizarVencidos:0,cotizadoParaEnviar:0,cotizadoParaEnviarVencidos:0,horno:0,hornoVencidos:0,vencidosClave:0,totalCalidad:0,calidadDescartado:0,calidadNoResponde:0,calidadRegular:0,calidadBueno:0,calidadExcelente:0,buenoExcelente:0,buenoExcelentePct:0};
  const stageMap={"Seguimiento":["seguimiento","seguimientoVencidos"],"Marca personal":["marcaPersonal","marcaPersonalVencidos"],"Esperando PI":["esperandoPI","esperandoPIVencidos"],"Para cotizar":["paraCotizar","paraCotizarVencidos"],"Cotizado para enviar":["cotizadoParaEnviar","cotizadoParaEnviarVencidos"],"Horno":["horno","hornoVencidos"]};
  const startMs=range.startDate?range.startDate.getTime():0,endMs=range.endDate?range.endDate.getTime():0;
  for(const x of rows){
    const stage=String(x.stage||"").trim(),due=String(x.dueDate||"").trim(),overdue=!!due&&due<today;
    const pair=stageMap[stage];if(pair){m[pair[0]]++;if(overdue)m[pair[1]]++;}
    if(overdue&&["Nuevos Prospectos",...STATUS_STAGES].includes(stage))m.vencidosClave++;
    const created=tsMillis(x.createdAt);const isNew=(!startMs&&!endMs)||(created&&created>=startMs&&created<endMs);
    if(isNew){m.nuevosProspectos++;if(overdue)m.nuevosProspectosVencidos++;m.totalCalidad++;const q=qualityKey(x.leadQuality);if(q==="DESCARTADO")m.calidadDescartado++;else if(q==="NO_RESPONDE")m.calidadNoResponde++;else if(q==="REGULAR")m.calidadRegular++;else if(q==="BUENO")m.calidadBueno++;else if(q==="EXCELENTE")m.calidadExcelente++;if(q==="BUENO"||q==="EXCELENTE")m.buenoExcelente++;}
  }
  m.buenoExcelentePct=m.totalCalidad?Math.round(m.buenoExcelente*100/m.totalCalidad):0;
  return {metrics:m,readsEstimate:cached&&cached.expiresAt>now?0:rows.length,cached:!!(cached&&cached.expiresAt>now),scanned:rows.length};
}
router.get("/my-status",async(req,res)=>{try{
  const owner=await allowedOwner(req,req.query.owner),range=periodRange(req.query.period,req.query.start,req.query.end),today=todayBA();
  let readsEstimate=0;const metricErrors=[];
  const metrics={owner,nuevosProspectos:0,nuevosProspectosVencidos:0,seguimiento:0,seguimientoVencidos:0,marcaPersonal:0,marcaPersonalVencidos:0,esperandoPI:0,esperandoPIVencidos:0,paraCotizar:0,paraCotizarVencidos:0,horno:0,hornoVencidos:0,vencidosClave:0,totalCalidad:0,calidadDescartado:0,calidadNoResponde:0,calidadRegular:0,calidadBueno:0,calidadExcelente:0,buenoExcelente:0,buenoExcelentePct:0};
  const base=crmDb.collection("deals").where("owner","==",owner);
  const stageMap={"Seguimiento":["seguimiento","seguimientoVencidos"],"Marca personal":["marcaPersonal","marcaPersonalVencidos"],"Esperando PI":["esperandoPI","esperandoPIVencidos"],"Para cotizar":["paraCotizar","paraCotizarVencidos"],"Cotizado para enviar":["cotizadoParaEnviar","cotizadoParaEnviarVencidos"],"Horno":["horno","hornoVencidos"]};
  for(const st of STATUS_STAGES){const keys=stageMap[st];metrics[keys[0]]=await safeCount(base.where("stage","==",st),`stage:${st}`,metricErrors);metrics[keys[1]]=await safeCount(base.where("stage","==",st).where("dueDate","<",today),`overdue:${st}`,metricErrors);readsEstimate+=2;}
  metrics.vencidosClave=Object.values(stageMap).reduce((n,k)=>n+Number(metrics[k[1]]||0),0);
  let newBase=base;if(range.startDate&&range.endDate)newBase=newBase.where("createdAt",">=",range.startDate).where("createdAt","<",range.endDate);
  metrics.nuevosProspectos=await safeCount(newBase,"newProspects",metricErrors);readsEstimate++;
  for(const q of LEAD_QUALITY_VALUES){const n=await safeCount(newBase.where("leadQuality","==",q),`quality:${q}`,metricErrors);readsEstimate++;metrics.totalCalidad+=n;if(q==="DESCARTADO")metrics.calidadDescartado=n;if(q==="NO_RESPONDE")metrics.calidadNoResponde=n;if(q==="REGULAR")metrics.calidadRegular=n;if(q==="BUENO")metrics.calidadBueno=n;if(q==="EXCELENTE")metrics.calidadExcelente=n;}
  metrics.buenoExcelente=metrics.calidadBueno+metrics.calidadExcelente;metrics.buenoExcelentePct=metrics.totalCalidad?Math.round(metrics.buenoExcelente*100/metrics.totalCalidad):0;
  // Para Nuevos Prospectos vencidos y para cualquier índice faltante, usamos UN fallback exacto sobre el owner.
  // Esto replica 1:1 la semántica del CRM legacy y evita mostrar ceros falsos.
  if(metricErrors.length || (range.startDate&&range.endDate)){
    const exact=await exactMyStatusFallback(owner,range,today);
    return res.json({ok:true,metrics:exact.metrics,period:range,readsEstimate:readsEstimate+exact.readsEstimate,degraded:false,fallback:true,fallbackCached:exact.cached,scanned:exact.scanned,note:exact.cached?"Mi Estado exacto · fallback cacheado (0 reads adicionales en esta instancia).":"Mi Estado exacto · fallback temporal por falta de índices. Se hizo una sola lectura del owner y se cachea 60 s."});
  }
  metrics.nuevosProspectosVencidos=await safeCount(base.where("dueDate","<",today),"newProspectsOverdue",metricErrors);readsEstimate++;
  return res.json({ok:true,metrics,period:range,readsEstimate,degraded:false,note:"Mi Estado exacto con agregaciones COUNT."});
}catch(e){res.status(e.status||500).json({ok:false,error:e.message||String(e)});}});
router.get("/my-status/deals",async(req,res)=>{try{const owner=await allowedOwner(req,req.query.owner),stage=String(req.query.stage||"").trim(),limit=Math.max(1,Math.min(100,Number(req.query.limit||30)||30)),overdue=String(req.query.overdue||"")==="1";let q=crmDb.collection("deals").where("owner","==",owner);if(stage)q=q.where("stage","==",stage);if(overdue)q=q.where("dueDate","<",todayBA()).orderBy("dueDate","asc");else q=q.orderBy("updatedAt","desc");const s=await q.limit(limit).get();res.json({ok:true,items:s.docs.map(d=>{const x=d.data()||{};return {id:d.id,title:x.title||"",contactName:x.contactName||"",stage:x.stage||"",dueDate:x.dueDate||"",owner:x.owner||"",leadQuality:x.leadQuality||"",value:Number(x.value||0)};}),readsEstimate:s.size});}catch(e){res.status(500).json({ok:false,error:/index/i.test(String(e.message||""))?"Firestore requiere un índice para listar este bloque. No se hizo scan masivo.":e.message});}});
module.exports=router;
