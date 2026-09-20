"use strict";
const express=require("express");
const {admin,crmDb,inboxDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const {PIPELINE_STAGES,DEAL_TYPES,DEAL_TYPE_LABELS}=require("./constants");
const {visibleOwners,canSeeOwner}=require("./access");
const wa=require("../inbox/whatsapp");
const {scheduledDate,processRecoveryEngine,RESPONSE_STAGE}=require("./recovery-service");
const router=express.Router();
router.use(authRequired);
const FieldValue=admin.firestore.FieldValue;

const CAMPAIGNS="recontact_campaigns";
const PHONE_WATCH="recontact_phone_watch";
const LINE_CATALOG_COLLECTION="mrapi_line_catalog";
function nowIso(){return new Date().toISOString()}
function noteText({campaignName,templateName,nextDueDate}){
  return `MSJ AUTOMÁTICO ENVIADO · ${new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"}).format(new Date())}\nCampaña: ${campaignName}\nPlantilla: ${templateName}\nPróximo vencimiento: ${nextDueDate}`;
}
async function addVisibleCrmNote(dealRef,oldData,note,user){
  const prev=String(oldData?.notes||"").trim();
  const merged=(note+(prev?`\n\n${prev}`:"")).slice(0,4000);
  await dealRef.set({notes:merged,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await dealRef.collection("notes").add({note,user:String(user||"sistema"),createdAt:FieldValue.serverTimestamp(),source:"recontact_campaign"});
}
function campaignMemberRef(campaignId,dealId){return crmDb.collection(CAMPAIGNS).doc(campaignId).collection("members").doc(dealId)}
async function addPhoneWatch(phone,campaignId,dealId){
  const d=digits(phone);if(!d)return;
  await crmDb.collection(PHONE_WATCH).doc(d).set({
    phone:d,entries:FieldValue.arrayUnion({campaignId,dealId}),updatedAt:FieldValue.serverTimestamp()
  },{merge:true});
}
function campaignPublic(doc){
  const d=doc.data()||{};
  const ts=v=>v?.toDate?v.toDate().toISOString():(v||null);
  return {id:doc.id,...d,createdAt:ts(d.createdAt),updatedAt:ts(d.updatedAt)};
}

function clean(v,n=500){return String(v??"").trim().slice(0,n)}
function digits(v){return String(v||"").replace(/\D/g,"")}
function waPhone(v){const d=digits(v);return d?`whatsapp:+${d}`:""}
function isoDateBA(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function plusDaysISO(baseIso,days){
  const [y,m,d]=String(baseIso||isoDateBA()).split("-").map(Number);
  const x=new Date(Date.UTC(y,m-1,d+Number(days||0)));
  return x.toISOString().slice(0,10);
}
function normalizeDate(v,fallbackDays=7){const s=clean(v,40);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;return plusDaysISO(isoDateBA(),fallbackDays)}

function normalizeSequence(body={}){
  const raw=Array.isArray(body.sequence)?body.sequence.slice(0,10):[];
  const seq=raw.map((x,i)=>({
    order:i+1,
    dayOffset:Math.max(0,Math.min(365,Number(x?.dayOffset||0)||0)),
    time:/^\d{2}:\d{2}$/.test(clean(x?.time,10))?clean(x.time,10):"10:00",
    metaTemplateName:clean(x?.metaTemplateName,180),
    metaTemplateLanguage:clean(x?.metaTemplateLanguage,40)||"es_AR",
    twilioTemplateSid:clean(x?.twilioTemplateSid,120),
    twilioTemplateName:clean(x?.twilioTemplateName,180)
  })).filter(x=>x.metaTemplateName||x.twilioTemplateSid);
  if(seq.length)return seq;
  const fallback={
    order:1,dayOffset:0,time:"10:00",
    metaTemplateName:clean(body.metaTemplateName,180),metaTemplateLanguage:clean(body.metaTemplateLanguage,40)||"es_AR",
    twilioTemplateSid:clean(body.twilioTemplateSid||body.contentSid,120),twilioTemplateName:clean(body.twilioTemplateName,180)
  };
  return fallback.metaTemplateName||fallback.twilioTemplateSid?[fallback]:[];
}

function modeBounds(mode){
  const today=isoDateBA();
  if(mode==="hoy")return {from:today,to:today};
  if(mode==="proximos_7")return {from:today,to:plusDaysISO(today,7)};
  if(mode==="vencidos_15")return {to:plusDaysISO(today,-15)};
  return {to:today};
}
function publicDeal(doc,contact){
  const d=doc.data()||{};
  return {
    id:doc.id,title:clean(d.title||d.contactName||"Sin título",240),
    contactId:clean(d.contactId,180),contactName:clean(d.contactName||contact?.name||"",220),
    stage:clean(d.stage,120),owner:clean(d.owner,220).toLowerCase(),dealType:clean(d.dealType,80),
    dueDate:clean(d.dueDate,40),notes:clean(d.notes,1200),
    phone:clean(contact?.phone||d.contactPhone||"",80),
    sentCount:Number(d.dueMessageSentCount||0)||0,
    lastDueMessageAt:d.lastDueMessageAt?.toDate?d.lastDueMessageAt.toDate().toISOString():(d.lastDueMessageAt||null),
    lastDueTemplateName:clean(d.lastDueTemplateName,180)
  };
}
async function ownerGuard(req,owner){
  const visible=await visibleOwners(req.authUser);
  if(owner&&visible!==null&&!visible.includes(owner))throw Object.assign(new Error("Owner fuera de tus permisos"),{status:403});
  return visible;
}
async function getContacts(rows){
  const ids=[...new Set(rows.map(x=>clean((x.data()||{}).contactId,180)).filter(Boolean))];
  const docs=ids.length?await crmDb.getAll(...ids.map(id=>crmDb.collection("contacts").doc(id))):[];
  return new Map(docs.map(d=>[d.id,d.exists?(d.data()||{}):{}]));
}
function normalizedLine(v){return wa.ensureWhatsappPrefix(clean(v,120));}
function lineDocId(v){const d=digits(v);return d||clean(v,120).replace(/[^a-zA-Z0-9_-]+/g,"_");}
async function resolveOutboundRoute(conversation={}){
  const from=normalizedLine(conversation.inboundTo||conversation.lineId||conversation.preferredLineId||wa.defaultFrom||"");
  if(!from)return {from:"",provider:"twilio",gatewayLineId:"",gatewayTenantId:"",catalog:null};
  if(String(conversation.provider||"").toLowerCase()==="meta"&&clean(conversation.gatewayLineId,120)){
    return {from,provider:"meta",gatewayLineId:clean(conversation.gatewayLineId,120),gatewayTenantId:clean(conversation.gatewayTenantId,120)||process.env.MRAPI_GATEWAY_TENANT_ID||"",catalog:null};
  }
  try{
    const snap=await inboxDb.collection(LINE_CATALOG_COLLECTION).doc(lineDocId(from)).get();
    if(snap.exists){
      const c=snap.data()||{};
      if(c.active!==false&&String(c.provider||"").toLowerCase()==="meta"&&clean(c.gatewayLineId,120)){
        return {from:normalizedLine(c.lineId||c.phone||from)||from,provider:"meta",gatewayLineId:clean(c.gatewayLineId,120),gatewayTenantId:clean(c.gatewayTenantId,120)||clean(conversation.gatewayTenantId,120)||process.env.MRAPI_GATEWAY_TENANT_ID||"",catalog:c};
      }
    }
  }catch(e){console.warn("due resolve route",e.message||String(e))}
  return {from,provider:"twilio",gatewayLineId:"",gatewayTenantId:"",catalog:null};
}
async function listRecontactTemplates(){
  let twilio=[];const metaMap=new Map();
  try{twilio=(await wa.listApprovedTemplates()).map(t=>({...t,provider:"twilio"}));}catch(e){console.warn("due twilio templates",e.message||String(e))}
  if(wa.gatewayConfigured()){
    try{
      const lines=await inboxDb.collection(LINE_CATALOG_COLLECTION).limit(500).get();
      for(const doc of lines.docs){
        const x=doc.data()||{};
        if(x.active===false||String(x.provider||"").toLowerCase()!=="meta"||!clean(x.gatewayLineId,120))continue;
        try{
          const items=await wa.listGatewayTemplates({tenantId:clean(x.gatewayTenantId,120)||process.env.MRAPI_GATEWAY_TENANT_ID||"",lineId:clean(x.gatewayLineId,120)});
          for(const t of items){
            const key=`${clean(t.name,180)}|${clean(t.language,40)||"es_AR"}`;
            const prev=metaMap.get(key)||{sid:clean(t.name,180),name:clean(t.name,180),language:clean(t.language,40)||"es_AR",category:clean(t.category,80),provider:"meta",lineIds:[]};
            if(!prev.lineIds.includes(clean(x.gatewayLineId,120)))prev.lineIds.push(clean(x.gatewayLineId,120));
            metaMap.set(key,prev);
          }
        }catch(e){console.warn("due meta templates line",clean(x.gatewayLineId,120),e.message||String(e))}
      }
    }catch(e){console.warn("due meta templates catalog",e.message||String(e))}
  }
  const meta=[...metaMap.values()].sort((a,b)=>a.name.localeCompare(b.name,"es",{sensitivity:"base"}));
  return {twilio,meta};
}
function selectedTemplate(body={},route={},campaign={}){
  if(route.provider==="meta"){
    const name=clean(body.metaTemplateName||campaign.metaTemplateName,180);
    const language=clean(body.metaTemplateLanguage||campaign.metaTemplateLanguage,40)||"es_AR";
    if(!name)throw new Error("Falta plantilla Meta para una línea Cloud API");
    return {provider:"meta",name,language,label:name};
  }
  const sid=clean(body.twilioTemplateSid||body.contentSid||campaign.twilioTemplateSid||campaign.templateSid,120);
  const label=clean(body.twilioTemplateName||body.templateName||campaign.twilioTemplateName||campaign.templateName,180)||sid;
  if(!sid)throw new Error("Falta plantilla Twilio para una línea Twilio");
  return {provider:"twilio",sid,label};
}
async function sendRoutedTemplate({route,to,template,req,conversationId}){
  if(route.provider==="meta")return wa.sendGatewayTemplate({tenantId:route.gatewayTenantId,lineId:route.gatewayLineId,to,name:template.name,language:template.language,components:[]});
  return wa.sendTemplate({from:route.from,to,contentSid:template.sid,contentVariables:{},req,conversationId});
}
async function resolveConversation(deal,contact){
  let snap=await inboxDb.collection("conversations").where("dealId","==",deal.id).limit(5).get();
  if(!snap.empty){
    const docs=snap.docs.slice().sort((a,b)=>{
      const av=(a.data()||{}).lastMessageAt?.toMillis?.()||0,bv=(b.data()||{}).lastMessageAt?.toMillis?.()||0;return bv-av;
    });
    return docs[0];
  }
  const phone=waPhone(contact?.phone||deal.contactPhone||"");
  if(!phone)return null;
  snap=await inboxDb.collection("conversations").where("waFrom","==",phone).limit(5).get();
  if(snap.empty)return null;
  return snap.docs[0];
}
async function logDeal(dealRef,data){
  await dealRef.collection("message_logs").add({...data,createdAt:FieldValue.serverTimestamp()});
}

router.get("/meta",async(req,res)=>{
  try{
    const visible=await visibleOwners(req.authUser);
    let users=[];
    if(visible===null){
      const snap=await crmDb.collection("users").limit(150).get();
      users=snap.docs.map(d=>({email:clean((d.data()||{}).email,220).toLowerCase(),name:clean((d.data()||{}).name,180)})).filter(x=>x.email);
    }else users=(visible||[]).map(email=>({email,name:email}));
    return res.json({ok:true,stages:PIPELINE_STAGES,dealTypes:DEAL_TYPES,dealTypeLabels:DEAL_TYPE_LABELS,owners:users,today:isoDateBA()});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/templates",async(req,res)=>{
  try{
    const {twilio,meta}=await listRecontactTemplates();
    return res.json({ok:true,twilio,meta,templates:[...twilio,...meta]});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/deals",async(req,res)=>{
  try{
    const mode=["vencidos","vencidos_15","hoy","proximos_7"].includes(clean(req.query.mode,30))?clean(req.query.mode,30):"vencidos";
    const stage=clean(req.query.stage,120),owner=clean(req.query.owner,220).toLowerCase(),dealType=clean(req.query.dealType,80),q=clean(req.query.q,160).toLowerCase();
    const sendState=clean(req.query.sendState,30).toLowerCase();
    const limit=Math.max(1,Math.min(200,Number(req.query.limit||100)||100));
    const visible=await ownerGuard(req,owner);
    const bounds=modeBounds(mode);
    let query=crmDb.collection("deals");
    if(stage)query=query.where("stage","==",stage);
    if(dealType)query=query.where("dealType","==",dealType);
    if(owner)query=query.where("owner","==",owner);
    else if(Array.isArray(visible)&&visible.length===1)query=query.where("owner","==",visible[0]);
    else if(Array.isArray(visible)&&visible.length>1&&visible.length<=10)query=query.where("owner","in",visible);
    else if(Array.isArray(visible)&&visible.length>10)return res.status(400).json({ok:false,error:"Seleccioná un owner para este listado"});
    if(bounds.from)query=query.where("dueDate",">=",bounds.from);
    if(bounds.to)query=query.where("dueDate","<=",bounds.to);
    query=query.orderBy("dueDate","asc").limit(limit);
    const snap=await query.get();
    const contacts=await getContacts(snap.docs);
    let rows=snap.docs.map(d=>publicDeal(d,contacts.get(clean((d.data()||{}).contactId,180))));
    if(q)rows=rows.filter(x=>[x.title,x.contactName,x.owner,x.stage,x.phone,x.notes].join(" ").toLowerCase().includes(q));
    rows=rows.map(x=>{
      const validPhone=digits(x.phone).length>=8;
      const canSend=validPhone;
      const status=x.sentCount>0?"sent":"ready";
      return {...x,validPhone,canSend,status,dealTypeLabel:DEAL_TYPE_LABELS[x.dealType]||x.dealType||"—"};
    });
    if(sendState==="ready")rows=rows.filter(x=>x.canSend&&x.sentCount===0);
    if(sendState==="resend")rows=rows.filter(x=>x.canSend&&x.sentCount>0);
    if(sendState==="blocked")rows=rows.filter(x=>!x.canSend);
    const groups={};
    for(const r of rows)(groups[r.stage||"Sin etapa"]||(groups[r.stage||"Sin etapa"]=[])).push(r);
    const summary={
      total:rows.length,ready:rows.filter(x=>x.canSend).length,
      blocked:rows.filter(x=>!x.canSend).length,sent:rows.filter(x=>x.sentCount>0).length
    };
    return res.json({ok:true,mode,deals:rows,groups,summary,today:isoDateBA(),readsEstimate:snap.size+contacts.size});
  }catch(e){
    console.error("due-center deals",e);
    const msg=/index/i.test(String(e.message||""))?"Firestore requiere un índice para esta combinación. Abrí el error de Cloud Run para usar el link automático de creación.":e.message;
    return res.status(e.status||500).json({ok:false,error:msg});
  }
});

router.get("/deals/:id/logs",async(req,res)=>{
  try{
    const dealRef=crmDb.collection("deals").doc(clean(req.params.id,180));
    const deal=await dealRef.get();
    if(!deal.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});
    if(!(await canSeeOwner(req.authUser,(deal.data()||{}).owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const snap=await dealRef.collection("message_logs").orderBy("createdAt","desc").limit(20).get();
    const items=snap.docs.map(d=>{const x=d.data()||{};return {id:d.id,...x,createdAt:x.createdAt?.toDate?x.createdAt.toDate().toISOString():x.createdAt||null}});
    return res.json({ok:true,items,readsEstimate:1+snap.size});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.post("/send",async(req,res)=>{
  try{
    const ids=[...new Set((Array.isArray(req.body?.dealIds)?req.body.dealIds:[]).map(x=>clean(x,180)).filter(Boolean))].slice(0,30);
    const contentSid=clean(req.body?.contentSid,120);
    const twilioTemplateSid=clean(req.body?.twilioTemplateSid||contentSid,120);
    const metaTemplateName=clean(req.body?.metaTemplateName,180);
    const metaTemplateLanguage=clean(req.body?.metaTemplateLanguage,40)||"es_AR";
    const campaignName=clean(req.body?.campaignName,180)||`Vencimientos ${isoDateBA()}`;
    const nextDueDate=normalizeDate(req.body?.nextDueDate,7);
    if(!ids.length)return res.status(400).json({ok:false,error:"Seleccioná al menos un trato"});
    if(!twilioTemplateSid&&!metaTemplateName)return res.status(400).json({ok:false,error:"Seleccioná al menos una plantilla (Meta o Twilio)"});
    const refs=ids.map(id=>crmDb.collection("deals").doc(id));
    const docs=await crmDb.getAll(...refs);
    let twilioTemplateName=twilioTemplateSid;
    try{const ts=await wa.listApprovedTemplates();const t=ts.find(x=>x.sid===twilioTemplateSid);if(t)twilioTemplateName=t.name||twilioTemplateSid;}catch{}
    const results=[];
    for(const doc of docs){
      if(!doc.exists){results.push({id:doc.id,ok:false,error:"Trato inexistente"});continue;}
      const d=doc.data()||{};
      if(!(await canSeeOwner(req.authUser,d.owner))){results.push({id:doc.id,ok:false,error:"Sin permiso"});continue;}
      let contact={};
      if(d.contactId){const c=await crmDb.collection("contacts").doc(String(d.contactId)).get();if(c.exists)contact=c.data()||{};}
      const phone=waPhone(contact.phone||d.contactPhone||"");
      if(!phone){results.push({id:doc.id,ok:false,error:"Sin teléfono válido"});continue;}
      const deal={id:doc.id,...d};
      const convo=await resolveConversation(deal,contact);
      const cd=convo?(convo.data()||{}):{};
      const route=await resolveOutboundRoute(cd);
      if(!route.from){results.push({id:doc.id,ok:false,error:"Sin línea WhatsApp"});continue;}
      try{
        const template=selectedTemplate({twilioTemplateSid,twilioTemplateName,metaTemplateName,metaTemplateLanguage},route);
        const sent=await sendRoutedTemplate({route,to:phone,template,req,conversationId:convo?.id||""});
        const templateName=template.label;
        const templateId=template.provider==="meta"?template.name:template.sid;
        const now=FieldValue.serverTimestamp();
        if(convo){
          await convo.ref.collection("messages").doc(String(sent.sid)).set({
            direction:"OUT",source:"due-center",text:`Plantilla enviada (${templateName})`,body:`Plantilla enviada (${templateName})`,
            from:wa.ensureWhatsappPrefix(route.from),to:phone,timestamp:now,createdAt:now,messageSid:sent.sid,sid:sent.sid,provider:template.provider,
            deliveryStatus:sent.status||"queued",template:template.provider==="meta"?{name:template.name,language:template.language}:{contentSid:template.sid},sentBy:req.authUser.name||req.authUser.email||"",sentByEmail:req.authUser.email||""
          },{merge:true});
          await convo.ref.set({lastMessageAt:now,updatedAt:now,lastMessagePreview:`Plantilla enviada (${templateName})`,lastMessageDirection:"OUT",lastHumanMessageAt:now,hasUnread:false,unreadCount:0},{merge:true});
        }
        const prev=Number(d.dueMessageSentCount||0)||0;
        await doc.ref.set({
          dueDate:nextDueDate,dueMessageSentCount:prev+1,lastDueMessageAt:now,lastDueTemplateSid:templateId,lastDueTemplateName:templateName,lastDueProvider:template.provider,
          lastDueCampaignName:campaignName,updatedAt:now
        },{merge:true});
        await logDeal(doc.ref,{
          type:"due_template",status:"sent",provider:template.provider,templateSid:templateId,templateName,campaignName,
          dueDateBefore:clean(d.dueDate,40),nextDueDate,lineId:wa.ensureWhatsappPrefix(route.from),gatewayLineId:route.gatewayLineId||"",
          messageSid:sent.sid,user:req.authUser.email||req.authUser.name||""
        });
        await addVisibleCrmNote(doc.ref,d,noteText({campaignName,templateName,nextDueDate}),req.authUser.email||req.authUser.name||"");
        results.push({id:doc.id,ok:true,sid:sent.sid,nextDueDate});
      }catch(err){
        await logDeal(doc.ref,{type:"due_template",status:"error",templateSid:twilioTemplateSid||metaTemplateName,templateName:twilioTemplateName||metaTemplateName,campaignName,error:clean(err.message,800),user:req.authUser.email||req.authUser.name||""});
        results.push({id:doc.id,ok:false,error:err.message});
      }
    }
    const sent=results.filter(x=>x.ok).length;
    return res.json({ok:true,total:results.length,sent,errors:results.length-sent,results});
  }catch(e){console.error("due-center send",e);return res.status(500).json({ok:false,error:e.message});}
});


router.post("/engine/run",async(req,res)=>{
  try{const maxMessages=Math.max(1,Math.min(50,Number(req.body?.maxMessages||20)||20));const out=await processRecoveryEngine({maxMessages});return res.json(out);}
  catch(e){console.error("recovery engine manual",e);return res.status(500).json({ok:false,error:e.message});}
});

router.get("/campaigns",async(req,res)=>{
  try{
    const snap=await crmDb.collection(CAMPAIGNS).orderBy("createdAt","desc").limit(40).get();
    let items=snap.docs.map(campaignPublic);
    const visible=await visibleOwners(req.authUser);
    if(Array.isArray(visible))items=items.filter(x=>!x.ownerScope?.length||x.ownerScope.some(o=>visible.includes(String(o).toLowerCase())));
    return res.json({ok:true,items,readsEstimate:snap.size});
  }catch(e){return res.status(500).json({ok:false,error:e.message})}
});

router.post("/campaigns",async(req,res)=>{
  try{
    const ids=[...new Set((Array.isArray(req.body?.dealIds)?req.body.dealIds:[]).map(x=>clean(x,180)).filter(Boolean))].slice(0,200);
    const name=clean(req.body?.name,180)||`Recontacto ${isoDateBA()}`;
    const contentSid=clean(req.body?.contentSid,120);
    const twilioTemplateSid=clean(req.body?.twilioTemplateSid||contentSid,120);
    const metaTemplateName=clean(req.body?.metaTemplateName,180);
    const metaTemplateLanguage=clean(req.body?.metaTemplateLanguage,40)||"es_AR";
    const nextDueDate=normalizeDate(req.body?.nextDueDate,7);
    const movePipeline=Boolean(req.body?.movePipeline);
    const targetPipeline=["COMERCIAL","RECONTACTO"].includes(clean(req.body?.targetPipeline,40).toUpperCase())?clean(req.body?.targetPipeline,40).toUpperCase():"RECONTACTO";
    const targetOwner=clean(req.body?.targetOwner,220).toLowerCase();
    const sequence=normalizeSequence(req.body||{});
    const startDate=/^\d{4}-\d{2}-\d{2}$/.test(clean(req.body?.startDate,20))?clean(req.body.startDate,20):isoDateBA();
    const interRecipientDelayMs=Math.max(500,Math.min(60000,Number(req.body?.interRecipientDelayMs||3000)||3000));
    const autoEngine=req.body?.autoEngine!==false;

    if(!ids.length)return res.status(400).json({ok:false,error:"Seleccioná al menos un trato"});
    if(!sequence.length)return res.status(400).json({ok:false,error:"Configurá al menos un mensaje en la secuencia"});
    if(targetOwner && !(await canSeeOwner(req.authUser,targetOwner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});

    let twilioTemplateName=twilioTemplateSid;
    try{const ts=await wa.listApprovedTemplates();const t=ts.find(x=>x.sid===twilioTemplateSid);if(t)twilioTemplateName=t.name||twilioTemplateSid}catch{}
    const templateName=metaTemplateName&&twilioTemplateName?`Meta: ${metaTemplateName} · Twilio: ${twilioTemplateName}`:(metaTemplateName||twilioTemplateName);

    const ref=crmDb.collection(CAMPAIGNS).doc();
    const docs=await crmDb.getAll(...ids.map(id=>crmDb.collection("deals").doc(id)));
    const batch=crmDb.batch();
    const owners=new Set();
    let added=0,blocked=0,moved=0,reassigned=0;

    for(const dealDoc of docs){
      if(!dealDoc.exists)continue;
      const x=dealDoc.data()||{};
      if(!(await canSeeOwner(req.authUser,x.owner)))continue;

      let contact={};
      if(x.contactId){
        const c=await crmDb.collection("contacts").doc(String(x.contactId)).get();
        if(c.exists)contact=c.data()||{};
      }

      const phone=waPhone(contact.phone||x.contactPhone||"");
      const status=phone?"PENDING":"EXCLUDED";
      if(!phone)blocked++;

      const currentPipeline=String(x.pipeline||"COMERCIAL").toUpperCase();
      const effectiveOwner=targetOwner||String(x.owner||"").toLowerCase();
      owners.add(effectiveOwner);

      const dealPatch={updatedAt:new Date()};
      let needsDealUpdate=false;

      if(movePipeline && currentPipeline!==targetPipeline){
        dealPatch.pipeline=targetPipeline;
        dealPatch.pipelineUpdatedAt=new Date();
        dealPatch.pipelineUpdatedBy=req.authUser.email||req.authUser.id||"";
        dealPatch.lastCampaignId=ref.id;
        needsDealUpdate=true;
        moved++;
      }

      if(targetOwner && targetOwner!==String(x.owner||"").toLowerCase()){
        dealPatch.owner=targetOwner;
        needsDealUpdate=true;
        reassigned++;
      }

      if(needsDealUpdate)batch.set(dealDoc.ref,dealPatch,{merge:true});

      batch.set(ref.collection("members").doc(dealDoc.id),{
        dealId:dealDoc.id,
        originalDealId:dealDoc.id,
        migratedDeal:false,
        contactId:String(x.contactId||""),
        contactName:String(x.contactName||contact.name||x.title||""),
        owner:effectiveOwner,
        stage:String(x.stage||""),
        pipeline:movePipeline?targetPipeline:currentPipeline,
        originalPipeline:currentPipeline,
        phone:digits(phone),
        status,
        templateSid:twilioTemplateSid,templateName,twilioTemplateSid,twilioTemplateName,metaTemplateName,metaTemplateLanguage,nextDueDate,
        nextStepIndex:0,stepsSent:0,errorCount:0,sequenceStopped:false,
        nextSendAt:phone?admin.firestore.Timestamp.fromDate(scheduledDate(startDate,sequence[0])):null,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
      });
      added++;
    }

    batch.set(ref,{
      name,type:"recontact",status:"ACTIVE",templateSid:twilioTemplateSid,templateName,twilioTemplateSid,twilioTemplateName,metaTemplateName,metaTemplateLanguage,nextDueDate,
      autoEngine,sequence,startDate,interRecipientDelayMs,responseStage:RESPONSE_STAGE,stopOnResponse:true,continueOnError:true,
      total:added,pending:Math.max(0,added-blocked),sent:0,responded:0,errors:0,excluded:blocked,
      movePipeline,targetPipeline:movePipeline?targetPipeline:"",targetOwner:targetOwner||"",
      movedDeals:moved,reassignedDeals:reassigned,
      parentCampaignId:clean(req.body?.parentCampaignId,180),generation:Number(req.body?.generation||0)||0,
      ownerScope:[...owners].filter(Boolean),createdBy:req.authUser.email||req.authUser.id||"",
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
    });

    await batch.commit();
    for(const dealDoc of docs){
      if(!dealDoc.exists)continue;const x=dealDoc.data()||{};let contact={};
      if(x.contactId){const c=await crmDb.collection("contacts").doc(String(x.contactId)).get();if(c.exists)contact=c.data()||{};}
      const phone=waPhone(contact.phone||x.contactPhone||"");if(phone)await addPhoneWatch(phone,ref.id,dealDoc.id).catch(()=>{});
    }

    return res.json({
      ok:true,id:ref.id,total:added,excluded:blocked,moved,reassigned,autoEngine,sequenceSteps:sequence.length,startDate,interRecipientDelayMs,responseStage:RESPONSE_STAGE,
      movePipeline,targetPipeline,targetOwner,writesEstimate:added+1+moved+reassigned
    });
  }catch(e){console.error("campaign create",e);return res.status(500).json({ok:false,error:e.message})}
});

router.get("/campaigns/:id/members",async(req,res)=>{
  try{
    const status=clean(req.query.status,30).toUpperCase();const q=crmDb.collection(CAMPAIGNS).doc(req.params.id).collection("members");
    const snap=await q.limit(250).get();
    let docs=snap.docs;
    if(status==="SIN_RESPUESTA")docs=docs.filter(d=>!["RESPONDED","EXCLUDED","CANCELLED"].includes(String((d.data()||{}).status||"").toUpperCase()));
    else if(status)docs=docs.filter(d=>String((d.data()||{}).status||"").toUpperCase()===status);
    const items=docs.map(d=>({id:d.id,...d.data(),createdAt:d.data()?.createdAt?.toDate?.()?.toISOString?.()||null,respondedAt:d.data()?.respondedAt?.toDate?.()?.toISOString?.()||null,nextSendAt:d.data()?.nextSendAt?.toDate?.()?.toISOString?.()||null,lastSentAt:d.data()?.lastSentAt?.toDate?.()?.toISOString?.()||null}));
    return res.json({ok:true,items,readsEstimate:snap.size});
  }catch(e){return res.status(500).json({ok:false,error:e.message})}
});

router.post("/campaigns/:id/send",async(req,res)=>{
  try{
    const cref=crmDb.collection(CAMPAIGNS).doc(req.params.id);const cs=await cref.get();if(!cs.exists)return res.status(404).json({ok:false,error:"Campaña no encontrada"});
    const c=cs.data()||{};const limit=Math.max(1,Math.min(30,Number(req.body?.limit||30)||30));
    const snap=await cref.collection("members").where("status","==","PENDING").limit(limit).get();
    const results=[];
    for(const md of snap.docs){
      const m=md.data()||{};const dealRef=crmDb.collection("deals").doc(md.id);const ds=await dealRef.get();
      if(!ds.exists){await md.ref.set({status:"ERROR",error:"Trato inexistente",updatedAt:FieldValue.serverTimestamp()},{merge:true});results.push({id:md.id,ok:false});continue}
      const d=ds.data()||{};let contact={};if(d.contactId){const cx=await crmDb.collection("contacts").doc(String(d.contactId)).get();if(cx.exists)contact=cx.data()||{}}
      const phone=waPhone(contact.phone||d.contactPhone||m.phone||"");const convo=await resolveConversation({id:md.id,...d},contact);const cd=convo?(convo.data()||{}):{};const route=await resolveOutboundRoute(cd);
      if(!phone||!route.from){await md.ref.set({status:"ERROR",error:"Sin teléfono/línea",updatedAt:FieldValue.serverTimestamp()},{merge:true});await cref.set({pending:FieldValue.increment(-1),errors:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});results.push({id:md.id,ok:false});continue}
      try{
        const template=selectedTemplate({},route,c);
        const sent=await sendRoutedTemplate({route,to:phone,template,req,conversationId:convo?.id||""});const now=FieldValue.serverTimestamp();
        const templateName=template.label;const templateId=template.provider==="meta"?template.name:template.sid;
        if(convo){
          await convo.ref.collection("messages").doc(String(sent.sid)).set({direction:"OUT",source:"recontact-campaign",text:`Plantilla enviada (${templateName})`,body:`Plantilla enviada (${templateName})`,from:wa.ensureWhatsappPrefix(route.from),to:phone,timestamp:now,createdAt:now,messageSid:sent.sid,sid:sent.sid,provider:template.provider,deliveryStatus:sent.status||"queued",template:template.provider==="meta"?{name:template.name,language:template.language}:{contentSid:template.sid},campaignId:cref.id,sentBy:req.authUser.name||req.authUser.email||"",sentByEmail:req.authUser.email||""},{merge:true});
          await convo.ref.set({lastMessageAt:now,updatedAt:now,lastMessagePreview:`Plantilla campaña: ${c.name}`,lastMessageDirection:"OUT",lastHumanMessageAt:now,hasUnread:false,unreadCount:0},{merge:true});
        }
        await md.ref.set({status:"SENT",sentAt:now,messageSid:sent.sid,lineId:wa.ensureWhatsappPrefix(route.from),gatewayLineId:route.gatewayLineId||"",provider:template.provider,updatedAt:now},{merge:true});
        await cref.set({pending:FieldValue.increment(-1),sent:FieldValue.increment(1),updatedAt:now},{merge:true});
        await addPhoneWatch(phone,cref.id,md.id);
        const prev=Number(d.dueMessageSentCount||0)||0;
        await dealRef.set({dueDate:c.nextDueDate,dueMessageSentCount:prev+1,lastDueMessageAt:now,lastDueTemplateSid:templateId,lastDueTemplateName:templateName,lastDueProvider:template.provider,lastDueCampaignName:c.name,updatedAt:now},{merge:true});
        await logDeal(dealRef,{type:"recontact_campaign",status:"sent",provider:template.provider,campaignId:cref.id,campaignName:c.name,templateSid:templateId,templateName,nextDueDate:c.nextDueDate,messageSid:sent.sid,lineId:route.from,gatewayLineId:route.gatewayLineId||"",user:req.authUser.email||req.authUser.name||""});
        await addVisibleCrmNote(dealRef,d,noteText({campaignName:c.name,templateName,nextDueDate:c.nextDueDate}),req.authUser.email||req.authUser.name||"");
        results.push({id:md.id,ok:true});
      }catch(err){
        await md.ref.set({status:"ERROR",error:clean(err.message,800),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        await cref.set({pending:FieldValue.increment(-1),errors:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
        results.push({id:md.id,ok:false,error:err.message});
      }
    }
    return res.json({ok:true,processed:results.length,sent:results.filter(x=>x.ok).length,errors:results.filter(x=>!x.ok).length,results});
  }catch(e){console.error("campaign send",e);return res.status(500).json({ok:false,error:e.message})}
});


router.patch("/campaigns/:id",async(req,res)=>{
  try{
    const ref=crmDb.collection(CAMPAIGNS).doc(clean(req.params.id,180));
    const snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:"Campaña no encontrada"});
    const old=snap.data()||{};
    const name=clean(req.body?.name,180)||old.name||"Campaña";
    const nextDueDate=normalizeDate(req.body?.nextDueDate||old.nextDueDate,7);
    const twilioTemplateSid=clean(req.body?.twilioTemplateSid||req.body?.contentSid,120)||old.twilioTemplateSid||old.templateSid||"";
    let twilioTemplateName=clean(req.body?.twilioTemplateName,180)||old.twilioTemplateName||twilioTemplateSid;
    const metaTemplateName=clean(req.body?.metaTemplateName,180)||old.metaTemplateName||"";
    const metaTemplateLanguage=clean(req.body?.metaTemplateLanguage,40)||old.metaTemplateLanguage||"es_AR";
    const sequence=Array.isArray(req.body?.sequence)?normalizeSequence(req.body||{}):(Array.isArray(old.sequence)&&old.sequence.length?old.sequence:normalizeSequence({...old,metaTemplateName,metaTemplateLanguage,twilioTemplateSid,twilioTemplateName}));
    const startDate=/^\d{4}-\d{2}-\d{2}$/.test(clean(req.body?.startDate,20))?clean(req.body.startDate,20):(old.startDate||isoDateBA());
    const interRecipientDelayMs=Math.max(500,Math.min(60000,Number(req.body?.interRecipientDelayMs??old.interRecipientDelayMs??3000)||3000));
    if(twilioTemplateSid && twilioTemplateSid!==(old.twilioTemplateSid||old.templateSid)){try{const ts=await wa.listApprovedTemplates();const t=ts.find(x=>x.sid===twilioTemplateSid);if(t)twilioTemplateName=t.name||twilioTemplateSid}catch{}}
    const templateName=metaTemplateName&&twilioTemplateName?`Meta: ${metaTemplateName} · Twilio: ${twilioTemplateName}`:(metaTemplateName||twilioTemplateName);
    await ref.set({name,nextDueDate,templateSid:twilioTemplateSid,templateName,twilioTemplateSid,twilioTemplateName,metaTemplateName,metaTemplateLanguage,sequence,startDate,interRecipientDelayMs,autoEngine:true,responseStage:RESPONSE_STAGE,stopOnResponse:true,continueOnError:true,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    const members=await ref.collection("members").limit(250).get();
    const active=members.docs.filter(d=>["PENDING","WAITING"].includes(String((d.data()||{}).status||"").toUpperCase()));
    if(active.length){
      const batch=crmDb.batch();
      active.forEach(d=>{const x=d.data()||{},idx=Math.max(0,Math.min(sequence.length-1,Number(x.nextStepIndex||0)||0));batch.set(d.ref,{templateSid:twilioTemplateSid,templateName,twilioTemplateSid,twilioTemplateName,metaTemplateName,metaTemplateLanguage,nextDueDate,nextSendAt:sequence[idx]?admin.firestore.Timestamp.fromDate(scheduledDate(startDate,sequence[idx])):null,updatedAt:FieldValue.serverTimestamp()},{merge:true});});
      await batch.commit();
    }
    return res.json({ok:true,id:ref.id,name,nextDueDate,sequence,startDate,interRecipientDelayMs,responseStage:RESPONSE_STAGE,writesEstimate:1+active.length});
  }catch(e){console.error("campaign update",e);return res.status(500).json({ok:false,error:e.message})}
});

router.post("/campaigns/:id/members",async(req,res)=>{
  try{
    const ref=crmDb.collection(CAMPAIGNS).doc(clean(req.params.id,180));
    const cs=await ref.get();if(!cs.exists)return res.status(404).json({ok:false,error:"Campaña no encontrada"});
    const c=cs.data()||{};
    const incoming=[...new Set((Array.isArray(req.body?.dealIds)?req.body.dealIds:[]).map(x=>clean(x,180)).filter(Boolean))].slice(0,200);
    if(!incoming.length)return res.status(400).json({ok:false,error:"Seleccioná al menos un trato"});
    const current=await ref.collection("members").limit(250).get();
    const existing=new Set(current.docs.map(d=>d.id));
    const room=Math.max(0,200-existing.size);
    const ids=incoming.filter(id=>!existing.has(id)).slice(0,room);
    if(!ids.length)return res.status(400).json({ok:false,error:room<=0?"La campaña ya alcanzó 200 contactos":"Los seleccionados ya están en la campaña"});
    const docs=await crmDb.getAll(...ids.map(id=>crmDb.collection("deals").doc(id)));
    const batch=crmDb.batch();let added=0,excluded=0,pending=0;const owners=new Set(Array.isArray(c.ownerScope)?c.ownerScope:[]);
    for(const d of docs){
      if(!d.exists)continue;const x=d.data()||{};
      if(!(await canSeeOwner(req.authUser,x.owner)))continue;
      let contact={};if(x.contactId){const cx=await crmDb.collection("contacts").doc(String(x.contactId)).get();if(cx.exists)contact=cx.data()||{}}
      const phone=waPhone(contact.phone||x.contactPhone||"");
      const status=phone?"PENDING":"EXCLUDED";
      if(status==="PENDING")pending++;else excluded++;
      owners.add(String(x.owner||"").toLowerCase());
      batch.set(ref.collection("members").doc(d.id),{
        dealId:d.id,contactId:String(x.contactId||""),contactName:String(x.contactName||contact.name||x.title||""),
        owner:String(x.owner||"").toLowerCase(),stage:String(x.stage||""),phone:digits(phone),status,
        templateSid:c.twilioTemplateSid||c.templateSid||"",templateName:c.templateName||"",twilioTemplateSid:c.twilioTemplateSid||c.templateSid||"",twilioTemplateName:c.twilioTemplateName||"",metaTemplateName:c.metaTemplateName||"",metaTemplateLanguage:c.metaTemplateLanguage||"es_AR",nextDueDate:c.nextDueDate||"",
        nextStepIndex:0,stepsSent:0,errorCount:0,sequenceStopped:false,nextSendAt:phone&&Array.isArray(c.sequence)&&c.sequence[0]?admin.firestore.Timestamp.fromDate(scheduledDate(c.startDate||isoDateBA(),c.sequence[0])):null,
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()
      });
      added++;
    }
    batch.set(ref,{
      total:FieldValue.increment(added),pending:FieldValue.increment(pending),excluded:FieldValue.increment(excluded),
      ownerScope:[...owners].filter(Boolean),updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    await batch.commit();
    for(const d of docs){if(!d.exists)continue;const x=d.data()||{};let contact={};if(x.contactId){const cx=await crmDb.collection("contacts").doc(String(x.contactId)).get();if(cx.exists)contact=cx.data()||{};}const phone=waPhone(contact.phone||x.contactPhone||"");if(phone)await addPhoneWatch(phone,ref.id,d.id).catch(()=>{});}
    return res.json({ok:true,added,pending,excluded,totalBefore:existing.size,writesEstimate:added+1});
  }catch(e){console.error("campaign add members",e);return res.status(500).json({ok:false,error:e.message})}
});

router.delete("/campaigns/:id/members/:dealId",async(req,res)=>{
  try{
    const campaignId=clean(req.params.id,180),dealId=clean(req.params.dealId,180);
    const cref=crmDb.collection(CAMPAIGNS).doc(campaignId),mref=cref.collection("members").doc(dealId);
    const [cs,ms]=await Promise.all([cref.get(),mref.get()]);
    if(!cs.exists)return res.status(404).json({ok:false,error:"Campaña no encontrada"});
    if(!ms.exists)return res.status(404).json({ok:false,error:"Contacto no está en la campaña"});
    const m=ms.data()||{},status=String(m.status||"").toUpperCase();
    const patch={total:FieldValue.increment(-1),updatedAt:FieldValue.serverTimestamp()};
    if(status==="PENDING")patch.pending=FieldValue.increment(-1);
    if(["SENT","NO_RESPONSE","RESPONDED"].includes(status))patch.sent=FieldValue.increment(-1);
    if(status==="RESPONDED")patch.responded=FieldValue.increment(-1);
    if(status==="ERROR")patch.errors=FieldValue.increment(-1);
    if(status==="EXCLUDED")patch.excluded=FieldValue.increment(-1);
    const batch=crmDb.batch();batch.delete(mref);batch.set(cref,patch,{merge:true});await batch.commit();
    if(m.phone){
      const w=crmDb.collection(PHONE_WATCH).doc(digits(m.phone));
      await w.set({entries:FieldValue.arrayRemove({campaignId,dealId}),updatedAt:FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});
    }
    return res.json({ok:true});
  }catch(e){console.error("campaign remove member",e);return res.status(500).json({ok:false,error:e.message})}
});

router.delete("/campaigns/:id",async(req,res)=>{
  try{
    const id=clean(req.params.id,180),ref=crmDb.collection(CAMPAIGNS).doc(id),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({ok:false,error:"Campaña no encontrada"});
    const members=await ref.collection("members").limit(250).get();
    const batch=crmDb.batch();members.docs.forEach(d=>batch.delete(d.ref));batch.delete(ref);await batch.commit();
    for(const d of members.docs){
      const m=d.data()||{};if(!m.phone)continue;
      await crmDb.collection(PHONE_WATCH).doc(digits(m.phone)).set({entries:FieldValue.arrayRemove({campaignId:id,dealId:d.id}),updatedAt:FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});
    }
    return res.json({ok:true,deletedMembers:members.size});
  }catch(e){console.error("campaign delete",e);return res.status(500).json({ok:false,error:e.message})}
});

router.post("/campaigns/:id/subcampaign",async(req,res)=>{
  try{
    const parent=crmDb.collection(CAMPAIGNS).doc(req.params.id);const ps=await parent.get();if(!ps.exists)return res.status(404).json({ok:false,error:"Campaña no encontrada"});
    const p=ps.data()||{};const ms=await parent.collection("members").where("status","in",["SENT","NO_RESPONSE"]).limit(200).get();
    if(ms.empty)return res.status(400).json({ok:false,error:"No hay contactos sin respuesta"});
    const name=clean(req.body?.name,180)||`${p.name} · Recontacto ${Number(p.generation||0)+1}`;
    const ref=crmDb.collection(CAMPAIGNS).doc();const batch=crmDb.batch();
    ms.docs.forEach(d=>batch.set(ref.collection("members").doc(d.id),{...d.data(),status:"PENDING",sentAt:null,respondedAt:null,messageSid:"",error:"",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}));
    batch.set(ref,{name,type:"recontact",status:"ACTIVE",templateSid:clean(req.body?.twilioTemplateSid||req.body?.contentSid,120)||p.twilioTemplateSid||p.templateSid,twilioTemplateSid:clean(req.body?.twilioTemplateSid||req.body?.contentSid,120)||p.twilioTemplateSid||p.templateSid,twilioTemplateName:clean(req.body?.twilioTemplateName,180)||p.twilioTemplateName||"",metaTemplateName:clean(req.body?.metaTemplateName,180)||p.metaTemplateName||"",metaTemplateLanguage:clean(req.body?.metaTemplateLanguage,40)||p.metaTemplateLanguage||"es_AR",templateName:clean(req.body?.templateName,180)||p.templateName,nextDueDate:normalizeDate(req.body?.nextDueDate||p.nextDueDate,7),total:ms.size,pending:ms.size,sent:0,responded:0,errors:0,excluded:0,parentCampaignId:parent.id,generation:Number(p.generation||0)+1,ownerScope:p.ownerScope||[],createdBy:req.authUser.email||req.authUser.id||"",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    await batch.commit();return res.json({ok:true,id:ref.id,total:ms.size});
  }catch(e){console.error("subcampaign",e);return res.status(500).json({ok:false,error:e.message})}
});

module.exports=router;
