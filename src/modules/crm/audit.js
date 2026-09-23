"use strict";
const {admin,crmDb}=require("../../core/google");
const FieldValue=admin.firestore.FieldValue;

function actor(user, fallback="system"){
  return {
    actorEmail:String(user?.email||"").trim().toLowerCase(),
    actorName:String(user?.name||user?.displayName||"").trim(),
    actorId:String(user?.id||user?.uid||"").trim(),
    actorLabel:String(user?.email||user?.name||fallback||"system").trim()
  };
}
function clean(v,n=4000){return String(v??"").slice(0,n);}
function auditPayload(event={},user=null,source="crm"){
  const a=actor(user,event.actorLabel||"system");
  return {
    action:clean(event.action,80),
    entityType:clean(event.entityType,40),
    entityId:clean(event.entityId,220),
    field:clean(event.field,80),
    from:clean(event.from,1000),
    to:clean(event.to,1000),
    detail:clean(event.detail,2000),
    source:clean(source||event.source||"crm",80),
    ...a,
    createdAt:FieldValue.serverTimestamp()
  };
}
async function writeDealAudit(dealId,event,user=null,source="crm"){
  try{
    const ref=crmDb.collection("deals").doc(String(dealId)).collection("audit").doc();
    await ref.set(auditPayload({...event,entityType:"deal",entityId:String(dealId)},user,source));
    return {writes:1};
  }catch(e){console.warn("deal audit",dealId,e.message||String(e));return {writes:0,error:e.message};}
}
async function writeContactAudit(contactId,event,user=null,source="crm"){
  try{
    const ref=crmDb.collection("contacts").doc(String(contactId)).collection("audit").doc();
    await ref.set(auditPayload({...event,entityType:"contact",entityId:String(contactId)},user,source));
    return {writes:1};
  }catch(e){console.warn("contact audit",contactId,e.message||String(e));return {writes:0,error:e.message};}
}
async function writeDealAudits(entries=[],user=null,source="crm"){
  try{
    const rows=(entries||[]).filter(x=>x?.dealId).slice(0,450);
    if(!rows.length)return {writes:0};
    const batch=crmDb.batch();
    for(const row of rows){
      const ref=crmDb.collection("deals").doc(String(row.dealId)).collection("audit").doc();
      batch.set(ref,auditPayload({...row.event,entityType:"deal",entityId:String(row.dealId)},user,source));
    }
    await batch.commit();
    return {writes:rows.length};
  }catch(e){console.warn("bulk deal audit",e.message||String(e));return {writes:0,error:e.message};}
}
module.exports={writeDealAudit,writeContactAudit,writeDealAudits};
