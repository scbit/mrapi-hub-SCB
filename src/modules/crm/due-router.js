"use strict";
const express=require("express");
const {admin,crmDb,inboxDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const {PIPELINE_STAGES,DEAL_TYPES,DEAL_TYPE_LABELS}=require("./constants");
const {visibleOwners,canSeeOwner}=require("./access");
const wa=require("../inbox/whatsapp");
const router=express.Router();
router.use(authRequired);
const FieldValue=admin.firestore.FieldValue;

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
function modeBounds(mode){
  const today=isoDateBA();
  if(mode==="hoy")return {from:today,to:today};
  if(mode==="proximos_7")return {from:today,to:plusDaysISO(today,7)};
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
    const templates=await wa.listApprovedTemplates();
    return res.json({ok:true,templates});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/deals",async(req,res)=>{
  try{
    const mode=["vencidos","hoy","proximos_7"].includes(clean(req.query.mode,30))?clean(req.query.mode,30):"vencidos";
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
    const campaignName=clean(req.body?.campaignName,180)||`Vencimientos ${isoDateBA()}`;
    const nextDueDate=normalizeDate(req.body?.nextDueDate,7);
    if(!ids.length)return res.status(400).json({ok:false,error:"Seleccioná al menos un trato"});
    if(!contentSid)return res.status(400).json({ok:false,error:"Seleccioná una plantilla aprobada"});
    const refs=ids.map(id=>crmDb.collection("deals").doc(id));
    const docs=await crmDb.getAll(...refs);
    let templateName=contentSid;
    try{
      const ts=await wa.listApprovedTemplates();const t=ts.find(x=>x.sid===contentSid);if(t)templateName=t.name||contentSid;
    }catch{}
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
      const from=cd.preferredLineId||cd.inboundTo||cd.lineId||wa.defaultFrom;
      if(!from){results.push({id:doc.id,ok:false,error:"Sin línea WhatsApp"});continue;}
      try{
        const sent=await wa.sendTemplate({from,to:phone,contentSid,contentVariables:{},req,conversationId:convo?.id||""});
        const now=FieldValue.serverTimestamp();
        if(convo){
          await convo.ref.collection("messages").doc(String(sent.sid)).set({
            direction:"OUT",source:"due-center",text:`Plantilla enviada (${contentSid})`,body:`Plantilla enviada (${contentSid})`,
            from:wa.ensureWhatsappPrefix(from),to:phone,timestamp:now,createdAt:now,messageSid:sent.sid,sid:sent.sid,
            deliveryStatus:sent.status||"queued",template:{contentSid},sentBy:req.authUser.name||req.authUser.email||"",sentByEmail:req.authUser.email||""
          },{merge:true});
          await convo.ref.set({lastMessageAt:now,updatedAt:now,lastMessagePreview:`Plantilla enviada (${templateName})`,lastMessageDirection:"OUT",lastHumanMessageAt:now,hasUnread:false,unreadCount:0},{merge:true});
        }
        const prev=Number(d.dueMessageSentCount||0)||0;
        await doc.ref.set({
          dueDate:nextDueDate,dueMessageSentCount:prev+1,lastDueMessageAt:now,lastDueTemplateSid:contentSid,lastDueTemplateName:templateName,
          lastDueCampaignName:campaignName,updatedAt:now
        },{merge:true});
        await logDeal(doc.ref,{
          type:"due_template",status:"sent",templateSid:contentSid,templateName,campaignName,
          dueDateBefore:clean(d.dueDate,40),nextDueDate,lineId:wa.ensureWhatsappPrefix(from),
          messageSid:sent.sid,user:req.authUser.email||req.authUser.name||""
        });
        results.push({id:doc.id,ok:true,sid:sent.sid,nextDueDate});
      }catch(err){
        await logDeal(doc.ref,{type:"due_template",status:"error",templateSid:contentSid,templateName,campaignName,error:clean(err.message,800),user:req.authUser.email||req.authUser.name||""});
        results.push({id:doc.id,ok:false,error:err.message});
      }
    }
    const sent=results.filter(x=>x.ok).length;
    return res.json({ok:true,total:results.length,sent,errors:results.length-sent,results});
  }catch(e){console.error("due-center send",e);return res.status(500).json({ok:false,error:e.message});}
});

module.exports=router;
