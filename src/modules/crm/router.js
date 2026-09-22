"use strict";
const express=require("express");
const {admin,crmDb,inboxDb,storage}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const Busboy=require("busboy");
const crypto=require("crypto");
const config=require("../../core/config");
const {PIPELINE_STAGES,DEAL_TYPES,DEAL_TYPE_LABELS,LEAD_QUALITY_VALUES,LEAD_QUALITY_LABELS}=require("./constants");
const {visibleOwners,canSeeOwner,canEditOwner,isAdminLike}=require("./access");
const {searchDealsIndexed,searchContactsIndexed,buildSearchTerms}=require("./search-index");
const {TARGET_STAGE,sendCotizadoAlert}=require("./cotizado-alert");
const router=express.Router();
router.use(authRequired);

function ts(v){if(!v)return null;if(v.toDate)return v.toDate().toISOString();if(v instanceof Date)return v.toISOString();return v;}
function enc(doc){if(!doc)return "";const d=doc.data()||{};return Buffer.from(JSON.stringify({id:doc.id,createdAt:ts(d.createdAt),dueDate:String(d.dueDate||"")})).toString("base64url");}
function dec(v){try{return JSON.parse(Buffer.from(String(v||""),"base64url").toString("utf8"));}catch{return null;}}
function normalizeDoc(doc){const d=doc.data()||{};return {id:doc.id,...d,createdAt:ts(d.createdAt),updatedAt:ts(d.updatedAt)};}
function dueDateIso(v){
  try{
    if(!v)return "";
    if(v.toDate)return v.toDate().toISOString().slice(0,10);
    if(v instanceof Date)return v.toISOString().slice(0,10);
    const s=String(v).trim();
    const m=s.match(/^(\d{4}-\d{2}-\d{2})/);if(m)return m[1];
    const d=new Date(s);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);
  }catch{return "";}
}
function todayBA(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function addDaysIso(base,days){const [y,m,d]=String(base).split("-").map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);}
function publicDeal(doc,contact){const d=normalizeDoc(doc);return {...d,dueDate:dueDateIso(d.dueDate),contactPhone:String(contact?.phone||d.contactPhone||""),company:String(contact?.company||d.company||"")};}
function cleanLimit(v,def=50){return Math.max(1,Math.min(100,Number(v||def)||def));}

function sanitizeFilename(v){return String(v||"archivo").replace(/[^a-zA-Z0-9._() -]+/g,"_").replace(/\s+/g," ").trim().slice(-140)||"archivo";}
function dealFiles(d){return Array.isArray(d?.files)?d.files:[];}
function isAllowedDealFile(type){return new Set(["application/pdf","image/jpeg","image/png","image/webp"]).has(String(type||"").toLowerCase());}
function parseDealUpload(req){return new Promise((resolve,reject)=>{
  const bb=Busboy({headers:req.headers,limits:{fileSize:15*1024*1024,files:1}});let fileData=null,limited=false;
  bb.on("file",(name,file,info)=>{const chunks=[];let size=0;file.on("data",c=>{chunks.push(c);size+=c.length});file.on("limit",()=>{limited=true});file.on("end",()=>{fileData={name:sanitizeFilename(info.filename),mimeType:String(info.mimeType||"application/octet-stream"),buffer:Buffer.concat(chunks),size};});});
  bb.on("error",reject);bb.on("finish",()=>{if(limited)return reject(Object.assign(new Error("El archivo supera 15 MB"),{status:400}));resolve(fileData);});req.pipe(bb);
});}

router.get("/meta",async(req,res)=>{
  try{
    const owners=await visibleOwners(req.authUser);
    let ownerOptions=[]; let reads=0;
    if(isAdminLike(req.authUser)){
      const s=await crmDb.collection("users").orderBy("name","asc").limit(250).get();reads+=s.size;
      ownerOptions=s.docs.map(d=>({id:d.id,name:(d.data()||{}).name||"",email:String((d.data()||{}).email||"").toLowerCase(),role:(d.data()||{}).role||""})).filter(x=>x.email);
    }else if(Array.isArray(owners)) ownerOptions=owners.map(email=>({email,name:email}));
    res.json({ok:true,stages:PIPELINE_STAGES,dealTypes:DEAL_TYPES,dealTypeLabels:DEAL_TYPE_LABELS,leadQualities:LEAD_QUALITY_VALUES,leadQualityLabels:LEAD_QUALITY_LABELS,owners:ownerOptions,readsEstimate:reads});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});


router.get("/views",async(req,res)=>{
  try{
    const snap=await crmDb.collection("users").doc(req.authUser.id).collection("crmViews").orderBy("updatedAt","desc").limit(30).get();
    const items=snap.docs.map(d=>({id:d.id,...(d.data()||{}),createdAt:ts((d.data()||{}).createdAt),updatedAt:ts((d.data()||{}).updatedAt)}));
    return res.json({ok:true,items,readsEstimate:snap.size});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});
router.post("/views",async(req,res)=>{
  try{
    const name=String(req.body?.name||"").trim().slice(0,80); if(!name)return res.status(400).json({ok:false,error:"Falta nombre de vista"});
    const cfg=req.body?.config&&typeof req.body.config==="object"?req.body.config:{};
    const clean={view:["kanban","list"].includes(cfg.view)?cfg.view:"kanban",pipeline:["COMERCIAL","RECONTACTO"].includes(String(cfg.pipeline||"").toUpperCase())?String(cfg.pipeline).toUpperCase():"COMERCIAL",stage:String(cfg.stage||""),owner:String(cfg.owner||"").toLowerCase(),dealType:String(cfg.dealType||""),stageOrder:Array.isArray(cfg.stageOrder)?cfg.stageOrder.filter(x=>PIPELINE_STAGES.includes(x)).slice(0,50):PIPELINE_STAGES,hiddenStages:Array.isArray(cfg.hiddenStages)?cfg.hiddenStages.filter(x=>PIPELINE_STAGES.includes(x)).slice(0,50):[],collapsedStages:Array.isArray(cfg.collapsedStages)?cfg.collapsedStages.filter(x=>PIPELINE_STAGES.includes(x)).slice(0,50):[],mobileStage:PIPELINE_STAGES.includes(cfg.mobileStage)?cfg.mobileStage:"Seguimiento"};
    const ref=crmDb.collection("users").doc(req.authUser.id).collection("crmViews").doc();
    const now=admin.firestore.FieldValue.serverTimestamp(); await ref.set({name,config:clean,createdAt:now,updatedAt:now});
    return res.json({ok:true,item:{id:ref.id,name,config:clean},readsEstimate:0,writesEstimate:1});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});
router.delete("/views/:id",async(req,res)=>{
  try{await crmDb.collection("users").doc(req.authUser.id).collection("crmViews").doc(req.params.id).delete();return res.json({ok:true,readsEstimate:0,writesEstimate:1});}
  catch(e){return res.status(500).json({ok:false,error:e.message});}
});
router.post("/deals/bulk-stage",async(req,res)=>{
  try{
    const ids=Array.from(new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(x=>String(x||"").trim()).filter(Boolean))).slice(0,450);
    const stage=String(req.body?.stage||"").trim(); if(!ids.length)return res.status(400).json({ok:false,error:"No hay tratos seleccionados"}); if(!PIPELINE_STAGES.includes(stage))return res.status(400).json({ok:false,error:"Etapa inválida"});
    const refs=ids.map(id=>crmDb.collection("deals").doc(id)); const docs=await crmDb.getAll(...refs); const allowed=[];
    for(const d of docs){if(d.exists&&await canEditOwner(req.authUser,(d.data()||{}).owner))allowed.push(d.ref);}
    if(!allowed.length)return res.status(403).json({ok:false,error:"Sin permiso sobre los tratos seleccionados"});
    const batch=crmDb.batch(); const now=new Date(); allowed.forEach(ref=>batch.update(ref,{stage,updatedAt:now})); await batch.commit();
    return res.json({ok:true,updated:allowed.length,readsEstimate:docs.length,writesEstimate:allowed.length});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});


router.post("/deals/bulk-owner",async(req,res)=>{
  try{
    const ids=Array.from(new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(x=>String(x||"").trim()).filter(Boolean))).slice(0,450);
    const owner=String(req.body?.owner||"").trim().toLowerCase();
    if(!ids.length)return res.status(400).json({ok:false,error:"No hay tratos seleccionados"});
    if(!owner)return res.status(400).json({ok:false,error:"Seleccioná un owner"});
    if(!(await canSeeOwner(req.authUser,owner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});
    const refs=ids.map(id=>crmDb.collection("deals").doc(id));
    const docs=await crmDb.getAll(...refs);
    const allowed=[];
    for(const d of docs){
      if(d.exists && await canEditOwner(req.authUser,(d.data()||{}).owner))allowed.push(d.ref);
    }
    if(!allowed.length)return res.status(403).json({ok:false,error:"Sin permiso sobre los tratos seleccionados"});
    const batch=crmDb.batch();
    const now=new Date();
    allowed.forEach(ref=>batch.update(ref,{owner,updatedAt:now}));
    await batch.commit();
    return res.json({ok:true,updated:allowed.length,readsEstimate:docs.length,writesEstimate:allowed.length});
  }catch(e){
    console.error("bulk owner",e);
    return res.status(500).json({ok:false,error:e.message});
  }
});

router.get("/deals",async(req,res)=>{
  try{
    const limit=cleanLimit(req.query.limit,50),
      stage=String(req.query.stage||"").trim(),
      owner=String(req.query.owner||"").trim().toLowerCase(),
      dealType=String(req.query.dealType||"").trim(),
      pipeline=String(req.query.pipeline||"").trim().toUpperCase(),
      overdueDays=Math.max(0,Math.min(3650,Number(req.query.overdueDays||0)||0)),
      cursor=dec(req.query.cursor);
    const visible=await visibleOwners(req.authUser);
    if(owner&&visible!==null&&!visible.includes(owner))return res.status(403).json({ok:false,error:"Owner fuera de tus permisos"});

    if(overdueDays){
      const cutoffStr=addDaysIso(todayBA(),-overdueDays);
      const all=[];let last=null,reads=0;
      for(let page=0;page<10;page++){
        let aq=crmDb.collection("deals").orderBy(admin.firestore.FieldPath.documentId(),"asc").limit(1000);
        if(last)aq=aq.startAfter(last);
        const as=await aq.get();reads+=as.size;all.push(...as.docs);
        if(as.size<1000)break;last=as.docs[as.docs.length-1];
      }
      const filtered=all.filter(doc=>{
        const x=doc.data()||{},own=String(x.owner||"").trim().toLowerCase(),pipe=String(x.pipeline||"COMERCIAL").toUpperCase();
        if(owner&&own!==owner)return false;
        if(!owner&&Array.isArray(visible)&&!visible.includes(own))return false;
        if(stage&&String(x.stage||"")!==stage)return false;
        if(dealType&&String(x.dealType||"")!==dealType)return false;
        if(pipeline==="RECONTACTO"&&pipe!=="RECONTACTO")return false;
        if(pipeline==="COMERCIAL"&&pipe==="RECONTACTO")return false;
        const due=dueDateIso(x.dueDate);return !!due&&due<=cutoffStr;
      }).sort((a,b)=>dueDateIso((a.data()||{}).dueDate).localeCompare(dueDateIso((b.data()||{}).dueDate))||a.id.localeCompare(b.id));
      const contactIds=Array.from(new Set(filtered.map(d=>String((d.data()||{}).contactId||"")).filter(Boolean)));
      const contactDocs=contactIds.length?await crmDb.getAll(...contactIds.map(id=>crmDb.collection("contacts").doc(id))):[];reads+=contactDocs.length;
      const cmap=new Map(contactDocs.map(d=>[d.id,d.exists?(d.data()||{}):{}]));
      const items=filtered.map(d=>publicDeal(d,cmap.get(String((d.data()||{}).contactId||""))));
      return res.json({ok:true,items,overdueDays,totalMatching:items.length,nextCursor:"",hasMore:false,readsEstimate:reads,cutoffDate:cutoffStr});
    }

    let q=crmDb.collection("deals");
    if(stage)q=q.where("stage","==",stage);
    if(dealType)q=q.where("dealType","==",dealType);
    if(pipeline==="RECONTACTO")q=q.where("pipeline","==","RECONTACTO");
    if(owner)q=q.where("owner","==",owner);
    else if(Array.isArray(visible)&&visible.length===1)q=q.where("owner","==",visible[0]);
    else if(Array.isArray(visible)&&visible.length>1&&visible.length<=10)q=q.where("owner","in",visible);
    else if(Array.isArray(visible)&&visible.length>10)return res.status(400).json({ok:false,error:"Seleccioná un vendedor para listar el pipeline"});

    if(overdueDays){
      const cutoff=new Date();
      cutoff.setHours(0,0,0,0);
      cutoff.setDate(cutoff.getDate()-overdueDays);
      const cutoffStr=cutoff.toISOString().slice(0,10);
      q=q.where("dueDate","<=",cutoffStr).orderBy("dueDate","asc").orderBy(admin.firestore.FieldPath.documentId(),"asc");
      if(cursor?.dueDate&&cursor?.id)q=q.startAfter(String(cursor.dueDate),cursor.id);
    }else{
      q=q.orderBy("createdAt","desc").orderBy(admin.firestore.FieldPath.documentId(),"desc");
      if(cursor?.createdAt&&cursor?.id)q=q.startAfter(new Date(cursor.createdAt),cursor.id);
    }

    const snap=await q.limit(limit).get();
    const contactIds=Array.from(new Set(snap.docs.map(d=>String((d.data()||{}).contactId||"")).filter(Boolean)));
    const contactDocs=contactIds.length?await crmDb.getAll(...contactIds.map(id=>crmDb.collection("contacts").doc(id))):[];
    const cmap=new Map(contactDocs.map(d=>[d.id,d.exists?(d.data()||{}):{}]));
    let items=snap.docs.map(d=>publicDeal(d,cmap.get(String((d.data()||{}).contactId||""))));
    if(pipeline==="COMERCIAL")items=items.filter(x=>String(x.pipeline||"COMERCIAL").toUpperCase()!=="RECONTACTO");
    return res.json({
      ok:true,
      items,
      overdueDays,
      nextCursor:snap.size===limit?enc(snap.docs[snap.docs.length-1]):"",
      hasMore:snap.size===limit,
      readsEstimate:snap.size+contactDocs.length
    });
  }catch(e){
    console.error("crm deals",e);
    const msg=/index/i.test(String(e.message||""))
      ?"El filtro Vencidos +15 necesita terminar de activar un índice de Firestore para esta combinación de filtros. Los índices requeridos están incluidos en esta versión."
      :e.message;
    return res.status(500).json({ok:false,error:msg});
  }
});

router.get("/deals/:id",async(req,res)=>{try{const d=await crmDb.collection("deals").doc(req.params.id).get();if(!d.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});const data=d.data()||{};if(!(await canSeeOwner(req.authUser,data.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});let c=null,reads=1;if(data.contactId){const x=await crmDb.collection("contacts").doc(data.contactId).get();reads++;if(x.exists)c={id:x.id,...x.data()};}res.json({ok:true,item:normalizeDoc(d),contact:c,readsEstimate:reads});}catch(e){res.status(500).json({ok:false,error:e.message});}});

router.put("/deals/:id",async(req,res)=>{
  try{const ref=crmDb.collection("deals").doc(req.params.id),d=await ref.get();if(!d.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});const old=d.data()||{};if(!(await canEditOwner(req.authUser,old.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const allowed=["stage","dealType","leadQuality","owner","dueDate","value","notes","title"];const p={updatedAt:new Date()};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(req.body||{},k))p[k]=req.body[k];
    if(p.stage&&!PIPELINE_STAGES.includes(p.stage))return res.status(400).json({ok:false,error:"Etapa inválida"});if(p.dealType&&!DEAL_TYPES.includes(p.dealType))return res.status(400).json({ok:false,error:"Tipo inválido"});if(p.leadQuality&&!LEAD_QUALITY_VALUES.includes(p.leadQuality))return res.status(400).json({ok:false,error:"Calidad inválida"});if(Object.prototype.hasOwnProperty.call(p,"value"))p.value=Number(p.value||0);
    if(p.owner&&!(await canSeeOwner(req.authUser,p.owner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});
    const notesChanged=Object.prototype.hasOwnProperty.call(p,"notes")&&String(p.notes||"").trim()!==String(old.notes||"").trim();
    if(Object.prototype.hasOwnProperty.call(p,"title"))p.searchTerms=buildSearchTerms({...old,...p});
    await ref.update(p);
    let writes=1;
    let whatsappAlert={ok:true,skipped:true,reason:"not_entering_cotizado_para_enviar"};
    if(Object.prototype.hasOwnProperty.call(p,"stage")&&p.stage===TARGET_STAGE&&String(old.stage||"").trim()!==TARGET_STAGE){
      // El cambio del trato ya quedó guardado. Una falla de WhatsApp nunca revierte el CRM.
      whatsappAlert=await sendCotizadoAlert(req.params.id,{...old,...p});
    }
    if(notesChanged&&String(p.notes||"").trim()){
      await ref.collection("notes").add({note:String(p.notes||"").trim(),user:String(req.authUser.email||req.authUser.name||"crm"),createdAt:admin.firestore.FieldValue.serverTimestamp()});
      writes++;
    }
    return res.json({ok:true,readsEstimate:1,writesEstimate:writes,whatsappAlert});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

router.get("/deals/:id/note-history",async(req,res)=>{
  try{
    const dealRef=crmDb.collection("deals").doc(req.params.id);
    const deal=await dealRef.get();
    if(!deal.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});
    if(!(await canSeeOwner(req.authUser,(deal.data()||{}).owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const snap=await dealRef.collection("notes").orderBy("createdAt","desc").limit(30).get();
    const history=snap.docs.map(d=>{const x=d.data()||{};let date=null;if(x.createdAt?.toDate)date=x.createdAt.toDate();else if(x.createdAt)date=new Date(x.createdAt);return {id:d.id,note:String(x.note||""),user:String(x.user||""),createdAt:date&&!isNaN(date)?date.toISOString():null,createdAtLabel:date&&!isNaN(date)?date.toLocaleString("es-AR"):""};});
    return res.json({ok:true,history,readsEstimate:1+snap.size});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/deals/:id/hub-link",async(req,res)=>{
  try{
    const dealRef=crmDb.collection("deals").doc(req.params.id);const dealSnap=await dealRef.get();
    if(!dealSnap.exists)return res.status(404).json({ok:false,found:false,error:"Trato no encontrado"});
    const deal=dealSnap.data()||{};if(!(await canSeeOwner(req.authUser,deal.owner)))return res.status(403).json({ok:false,found:false,error:"Sin permiso"});
    let reads=1;const candidates=new Map();
    const addSnap=snap=>{reads+=snap.size;for(const d of snap.docs)candidates.set(d.id,{id:d.id,...(d.data()||{})})};
    const safeQuery=async(fn)=>{try{addSnap(await fn())}catch(e){console.warn("hub-link lookup",e.message||String(e))}};

    // 1) Vínculos explícitos del trato: formato actual + multi-trato.
    await safeQuery(()=>inboxDb.collection("conversations").where("dealId","==",req.params.id).limit(20).get());
    await safeQuery(()=>inboxDb.collection("conversations").where("dealIds","array-contains",req.params.id).limit(20).get());

    // 2) Si el trato viejo guardó un conversationId directo, conservarlo como candidato.
    const directId=String(deal.hubConversationId||deal.conversationId||"").trim();
    if(directId){const d=await inboxDb.collection("conversations").doc(directId).get();reads++;if(d.exists)candidates.set(d.id,{id:d.id,...(d.data()||{})})}

    // 3) Tratos legacy: resolver por contacto y, como último fallback, por teléfono del contacto.
    let contact=null;
    if(deal.contactId){const c=await crmDb.collection("contacts").doc(String(deal.contactId)).get();reads++;if(c.exists)contact={id:c.id,...(c.data()||{})}}
    if(deal.contactId)await safeQuery(()=>inboxDb.collection("conversations").where("contactId","==",String(deal.contactId)).limit(30).get());
    const phone=String(contact?.phone||deal.contactPhone||deal.phone||"").replace(/\D/g,"");
    if(phone){
      const variants=[phone,`+${phone}`,`whatsapp:+${phone}`,`whatsapp:${phone}`];
      for(const field of ["waFrom","customerPhone","phone","from","contactPhone"]){
        await safeQuery(()=>inboxDb.collection("conversations").where(field,"in",variants).limit(30).get());
      }
    }

    if(!candidates.size)return res.json({ok:true,found:false,error:"No se encontró conversación vinculada",readsEstimate:reads});
    const digits=v=>String(v||"").replace(/\D/g,"");
    const customerOf=x=>digits(x.waFrom||x.from||x.phone||x.customerPhone||x.contactPhone||"")||digits(String(x.id||"").split(/__+|[_|]/)[0]);
    const lineOf=x=>digits(x.lineId||x.inboundTo||x.preferredLineId||"")||digits(String(x.id||"").split(/__+/)[1]||"");
    const tsMillis=v=>{try{return v?.toMillis?v.toMillis():(v?.toDate?v.toDate().getTime():new Date(v||0).getTime()||0)}catch{return 0}};
    const rows=[...candidates.values()].sort((a,b)=>{
      const aExplicit=(String(a.dealId||"")===req.params.id||(Array.isArray(a.dealIds)&&a.dealIds.includes(req.params.id)))?1:0;
      const bExplicit=(String(b.dealId||"")===req.params.id||(Array.isArray(b.dealIds)&&b.dealIds.includes(req.params.id)))?1:0;
      if(aExplicit!==bExplicit)return bExplicit-aExplicit;
      return tsMillis(b.lastMessageAt||b.updatedAt)-tsMillis(a.lastMessageAt||a.updatedAt);
    });
    const selected=rows[0],customer=customerOf(selected),line=lineOf(selected);
    const publicId=customer&&line?`${customer}__${line}`:selected.id;
    return res.json({ok:true,found:true,conversationId:publicId,url:`/inbox?conversationId=${encodeURIComponent(publicId)}`,readsEstimate:reads,legacyResolved:publicId!==selected.id});
  }catch(e){console.error("hub-link",e);return res.status(500).json({ok:false,found:false,error:e.message});}
});

router.post("/deals/:id/upload",async(req,res)=>{
  try{
    if(!config.filesBucket)return res.status(500).json({ok:false,error:"MRAPI_FILES_BUCKET no configurado"});
    if(!String(req.headers["content-type"]||"").toLowerCase().includes("multipart/form-data"))return res.status(400).json({ok:false,error:"Content-Type inválido"});
    const ref=crmDb.collection("deals").doc(req.params.id);const snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});
    const deal=snap.data()||{};if(!(await canEditOwner(req.authUser,deal.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const file=await parseDealUpload(req);if(!file||!file.buffer?.length)return res.status(400).json({ok:false,error:"Seleccioná un archivo"});
    if(!isAllowedDealFile(file.mimeType))return res.status(400).json({ok:false,error:"Solo PDF, JPG, PNG o WEBP"});
    const fileId=`file_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;const objectPath=`crm-deals/${req.params.id}/${fileId}-${sanitizeFilename(file.name)}`;
    const obj=storage.bucket(config.filesBucket).file(objectPath);await obj.save(file.buffer,{resumable:false,contentType:file.mimeType,metadata:{metadata:{dealId:req.params.id,fileId,originalName:file.name}}});
    const meta={id:fileId,name:file.name,mimeType:file.mimeType,size:file.size,bucket:config.filesBucket,objectPath,createdAt:new Date().toISOString(),createdBy:req.authUser.email||req.authUser.id};
    await ref.update({files:[...dealFiles(deal),meta],updatedAt:new Date()});return res.json({ok:true,file:meta,readsEstimate:1,writesEstimate:1});
  }catch(e){console.error("deal upload",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.get("/deals/:id/files/:fileId/view",async(req,res)=>{
  try{
    const snap=await crmDb.collection("deals").doc(req.params.id).get();if(!snap.exists)return res.status(404).send("Trato no encontrado");
    const deal=snap.data()||{};if(!(await canSeeOwner(req.authUser,deal.owner)))return res.status(403).send("Sin permiso");
    const meta=dealFiles(deal).find(f=>String(f.id)===String(req.params.fileId));if(!meta?.objectPath)return res.status(404).send("Archivo no encontrado");
    const obj=storage.bucket(meta.bucket||config.filesBucket).file(meta.objectPath);res.setHeader("Content-Type",meta.mimeType||"application/octet-stream");res.setHeader("Content-Disposition",`inline; filename="${sanitizeFilename(meta.name)}"`);obj.createReadStream().on("error",()=>{if(!res.headersSent)res.status(500).send("Error leyendo archivo")}).pipe(res);
  }catch(e){return res.status(500).send(e.message||"Error");}
});

router.delete("/deals/:id/files/:fileId",async(req,res)=>{
  try{
    const ref=crmDb.collection("deals").doc(req.params.id);const snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});
    const deal=snap.data()||{};if(!(await canEditOwner(req.authUser,deal.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const files=dealFiles(deal),meta=files.find(f=>String(f.id)===String(req.params.fileId));if(!meta)return res.status(404).json({ok:false,error:"Archivo no encontrado"});
    if(meta.objectPath)await storage.bucket(meta.bucket||config.filesBucket).file(meta.objectPath).delete({ignoreNotFound:true});
    await ref.update({files:files.filter(f=>String(f.id)!==String(req.params.fileId)),updatedAt:new Date()});return res.json({ok:true,readsEstimate:1,writesEstimate:1});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/contacts/:id",async(req,res)=>{try{const d=await crmDb.collection("contacts").doc(req.params.id).get();if(!d.exists)return res.status(404).json({ok:false,error:"Contacto no encontrado"});if(!(await canSeeOwner(req.authUser,(d.data()||{}).owner)))return res.status(403).json({ok:false,error:"Sin permiso"});return res.json({ok:true,item:normalizeDoc(d),readsEstimate:1});}catch(e){return res.status(500).json({ok:false,error:e.message});}});
router.put("/contacts/:id",async(req,res)=>{
  try{
    const ref=crmDb.collection("contacts").doc(req.params.id),d=await ref.get();
    if(!d.exists)return res.status(404).json({ok:false,error:"Contacto no encontrado"});
    const old=d.data()||{};
    if(!(await canEditOwner(req.authUser,old.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const p={updatedAt:new Date()};
    if(Object.prototype.hasOwnProperty.call(req.body||{},"owner")){
      const owner=String(req.body.owner||"").trim().toLowerCase();
      if(owner&&!(await canSeeOwner(req.authUser,owner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});
      p.owner=owner;
    }
    await ref.update(p);
    return res.json({ok:true,readsEstimate:1,writesEstimate:1});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/lookup",async(req,res)=>{
  try{
    const term=String(req.query.q||"").trim();
    if(!term)return res.json({ok:true,items:[],readsEstimate:0});
    const qLower=term.toLocaleLowerCase("es");
    const qDigits=term.replace(/\D/g,"");
    const looksPhone=qDigits.length>=7;
    let reads=0,writes=0;
    const items=[];
    const seen=new Set();
    const add=async(kind,doc)=>{
      if(!doc?.exists)return;
      const data=doc.data()||{};
      if(!(await canSeeOwner(req.authUser,data.owner)))return;
      const key=`${kind}:${doc.id}`;
      if(seen.has(key))return;
      seen.add(key);
      items.push({kind,...normalizeDoc(doc)});
    };

    // IDs exactos: 2 reads como máximo.
    const [dealDoc,contactDoc]=await Promise.all([
      crmDb.collection("deals").doc(term).get(),
      crmDb.collection("contacts").doc(term).get()
    ]);
    reads+=2;await add("deal",dealDoc);await add("contact",contactDoc);

    // Teléfono exacto en contactos: consultas acotadas, sin scan global.
    if(looksPhone){
      const variants=Array.from(new Set([term,qDigits,"+"+qDigits].filter(Boolean))).slice(0,3);
      for(const phone of variants){
        const snap=await crmDb.collection("contacts").where("phone","==",phone).limit(30).get();
        reads+=snap.size;for(const d of snap.docs)await add("contact",d);
      }
    }

    // Búsqueda global rápida sobre el índice persistente ya creado.
    // IMPORTANTE: nunca reconstruir/backfillear el índice dentro de una búsqueda interactiva,
    // porque puede dejar al usuario esperando y disparar miles de reads.
    const idx={rebuild:false};
    const [foundDeals,foundContacts]=await Promise.all([searchDealsIndexed(term,50),searchContactsIndexed(term,50)]);
    reads+=foundDeals.reads+foundContacts.reads;
    for(const d of foundDeals.docs)await add("deal",d);
    for(const d of foundContacts.docs)await add("contact",d);

    // Si encontramos el contacto por nombre o teléfono, traer sus tratos vinculados.
    const contactIds=Array.from(new Set(items.filter(x=>x.kind==="contact").map(x=>x.id)));
    for(let i=0;i<contactIds.length;i+=30){
      const chunk=contactIds.slice(i,i+30);if(!chunk.length)continue;
      const snap=await crmDb.collection("deals").where("contactId","in",chunk).limit(50).get();
      reads+=snap.size;for(const d of snap.docs)await add("deal",d);
    }

    items.sort((a,b)=>{
      const aExact=String(a.title||a.name||"").toLocaleLowerCase("es")===qLower?1:0;
      const bExact=String(b.title||b.name||"").toLocaleLowerCase("es")===qLower?1:0;
      if(aExact!==bExact)return bExact-aExact;
      return (a.kind==="deal"?-1:1)-(b.kind==="deal"?-1:1);
    });
    return res.json({ok:true,items:items.slice(0,50),readsEstimate:reads,writesEstimate:writes,indexRebuilt:!!idx.rebuild});
  }catch(e){
    console.error("crm lookup",e);
    return res.status(500).json({ok:false,error:e.message});
  }
});

module.exports=router;
