"use strict";
const crypto=require("crypto");
const config=require("../../core/config");
const {admin,crmDb,inboxDb}=require("../../core/google");
const wa=require("../inbox/whatsapp");
const FieldValue=admin.firestore.FieldValue;
const {writeDealAudit}=require("./audit");

const CAMPAIGNS="recontact_campaigns";
const PHONE_WATCH="recontact_phone_watch";
const LINE_CATALOG_COLLECTION="mrapi_line_catalog";
const RESPONSE_STAGE="RESPONDIO RECOVERY";

function clean(v,n=500){return String(v??"").trim().slice(0,n)}
function digits(v){return String(v||"").replace(/\D/g,"")}
function waPhone(v){const d=digits(v);return d?`whatsapp:+${d}`:""}
function normalizedLine(v){return wa.ensureWhatsappPrefix(clean(v,120));}
function lineDocId(v){const d=digits(v);return d||clean(v,120).replace(/[^a-zA-Z0-9_-]+/g,"_");}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));}
function isoDateBA(date=new Date()){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
function addDaysISO(baseIso,days){
  const [y,m,d]=String(baseIso||isoDateBA()).split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d+Number(days||0))).toISOString().slice(0,10);
}
function scheduledDate(startDate,step){
  const date=addDaysISO(startDate,Math.max(0,Math.min(365,Number(step?.dayOffset||0)||0)));
  const time=/^\d{2}:\d{2}$/.test(String(step?.time||""))?String(step.time):"10:00";
  const dt=new Date(`${date}T${time}:00-03:00`);
  return Number.isNaN(dt.getTime())?new Date():dt;
}
function deterministicConversationId(from,to){
  const key=`${digits(from)}|${digits(to)}`;
  return `wa_${crypto.createHash("sha256").update(key).digest("hex").slice(0,40)}`;
}
async function addPhoneWatch(phone,campaignId,dealId){
  const d=digits(phone);if(!d)return;
  await crmDb.collection(PHONE_WATCH).doc(d).set({phone:d,entries:FieldValue.arrayUnion({campaignId,dealId}),updatedAt:FieldValue.serverTimestamp()},{merge:true});
}
async function removePhoneWatch(phone,campaignId,dealId){
  const d=digits(phone);if(!d)return;
  await crmDb.collection(PHONE_WATCH).doc(d).set({entries:FieldValue.arrayRemove({campaignId,dealId}),updatedAt:FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});
}
async function markRecontactResponse(phoneRaw,inboundSid,extra={}){
  try{
    const phone=digits(phoneRaw);if(!phone)return {matched:0};
    const watch=await crmDb.collection(PHONE_WATCH).doc(phone).get();
    if(!watch.exists)return {matched:0};
    const entries=Array.isArray((watch.data()||{}).entries)?(watch.data()||{}).entries.slice(0,100):[];
    let matched=0;
    for(const entry of entries){
      const campaignId=clean(entry?.campaignId,180),dealId=clean(entry?.dealId,180);if(!campaignId||!dealId)continue;
      const campaignRef=crmDb.collection(CAMPAIGNS).doc(campaignId);
      const memberRef=campaignRef.collection("members").doc(dealId);
      const [campaignSnap,memberSnap,dealSnap]=await Promise.all([campaignRef.get(),memberRef.get(),crmDb.collection("deals").doc(dealId).get()]);
      if(!campaignSnap.exists||!memberSnap.exists||!dealSnap.exists){await removePhoneWatch(phone,campaignId,dealId);continue;}
      const m=memberSnap.data()||{};
      const status=String(m.status||"").toUpperCase();
      if(status==="RESPONDED"||status==="CANCELLED"){await removePhoneWatch(phone,campaignId,dealId);continue;}
      const c=campaignSnap.data()||{};
      if(String(c.status||"ACTIVE").toUpperCase()==="CANCELLED"){await removePhoneWatch(phone,campaignId,dealId);continue;}
      const now=FieldValue.serverTimestamp();
      const deal=dealSnap.data()||{};
      const note=`RESPONDIÓ RECOVERY · ${new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"}).format(new Date())}\nCampaña: ${clean(c.name,180)||campaignId}\nEtapa automática: ${RESPONSE_STAGE}`;
      const prevNotes=clean(deal.notes,3500);
      const batch=crmDb.batch();
      batch.set(memberRef,{status:"RESPONDED",respondedAt:now,respondedMessageSid:clean(inboundSid,180),nextSendAt:null,sequenceStopped:true,updatedAt:now},{merge:true});
      batch.set(campaignRef,{responded:FieldValue.increment(1),updatedAt:now,lastResponseAt:now},{merge:true});
      batch.set(dealSnap.ref,{stage:RESPONSE_STAGE,lastCampaignResponseAt:now,lastCampaignResponseId:campaignId,lastCampaignResponseName:clean(c.name,180),lastCampaignResponseMessageSid:clean(inboundSid,180),notes:(note+(prevNotes?`\n\n${prevNotes}`:"")).slice(0,4000),updatedAt:now},{merge:true});
      await batch.commit();
      await dealSnap.ref.collection("notes").add({note,previousNote:prevNotes,action:"updated",user:"system:recovery",createdAt:FieldValue.serverTimestamp(),source:"recontact_response"}).catch(()=>{});
      if(String(deal.stage||"")!==RESPONSE_STAGE)await writeDealAudit(dealId,{action:"stage_changed",field:"stage",from:String(deal.stage||""),to:RESPONSE_STAGE,detail:"Cambio automático por respuesta de Recovery",actorLabel:"system:recovery"},null,"recovery");
      await dealSnap.ref.collection("message_logs").add({type:"recontact_response",status:"responded",campaignId,campaignName:clean(c.name,180),messageSid:clean(inboundSid,180),provider:clean(extra.provider,40),lineId:clean(extra.lineId,120),createdAt:FieldValue.serverTimestamp()}).catch(()=>{});
      await removePhoneWatch(phone,campaignId,dealId);
      matched++;
    }
    if(matched)await watch.ref.set({lastResponseAt:FieldValue.serverTimestamp(),lastResponseMessageSid:clean(inboundSid,180)},{merge:true});
    return {matched,stage:RESPONSE_STAGE};
  }catch(e){console.warn("recontact response match",e.message||String(e));return {matched:0,error:e.message};}
}

async function resolveOutboundRoute(conversation={}){
  const from=normalizedLine(conversation.inboundTo||conversation.lineId||conversation.preferredLineId||wa.defaultFrom||"");
  if(!from)return {from:"",provider:"twilio",gatewayLineId:"",gatewayTenantId:""};
  if(String(conversation.provider||"").toLowerCase()==="meta"&&clean(conversation.gatewayLineId,120))return {from,provider:"meta",gatewayLineId:clean(conversation.gatewayLineId,120),gatewayTenantId:clean(conversation.gatewayTenantId,120)||config.gatewayTenantId||""};
  try{
    const snap=await inboxDb.collection(LINE_CATALOG_COLLECTION).doc(lineDocId(from)).get();
    if(snap.exists){const c=snap.data()||{};if(c.active!==false&&String(c.provider||"").toLowerCase()==="meta"&&clean(c.gatewayLineId,120))return {from:normalizedLine(c.lineId||c.phone||from)||from,provider:"meta",gatewayLineId:clean(c.gatewayLineId,120),gatewayTenantId:clean(c.gatewayTenantId,120)||config.gatewayTenantId||""};}
  }catch(e){console.warn("recovery route",e.message||String(e));}
  return {from,provider:"twilio",gatewayLineId:"",gatewayTenantId:""};
}
async function resolveConversation(deal,contact){
  let snap=await inboxDb.collection("conversations").where("dealId","==",deal.id).limit(10).get();
  if(!snap.empty){return snap.docs.sort((a,b)=>((b.data()||{}).lastMessageAt?.toMillis?.()||0)-((a.data()||{}).lastMessageAt?.toMillis?.()||0))[0];}
  const phone=waPhone(contact?.phone||deal.contactPhone||"");if(!phone)return null;
  snap=await inboxDb.collection("conversations").where("waFrom","==",phone).limit(10).get();
  if(snap.empty)return null;
  return snap.docs.sort((a,b)=>((b.data()||{}).lastMessageAt?.toMillis?.()||0)-((a.data()||{}).lastMessageAt?.toMillis?.()||0))[0];
}
function pickStepTemplate(step,route){
  if(route.provider==="meta"){
    const name=clean(step?.metaTemplateName,180),language=clean(step?.metaTemplateLanguage,40)||"es_AR";
    if(!name)throw new Error("El paso no tiene plantilla Meta para esta línea Cloud API");
    return {provider:"meta",name,language,label:name};
  }
  const sid=clean(step?.twilioTemplateSid,120),label=clean(step?.twilioTemplateName,180)||sid;
  if(!sid)throw new Error("El paso no tiene plantilla Twilio para esta línea Twilio");
  return {provider:"twilio",sid,label};
}
async function sendStep({campaignRef,campaign,memberRef,member,dealRef,deal,contact,step,index}){
  const phone=waPhone(contact.phone||deal.contactPhone||member.phone||"");
  const convo=await resolveConversation({id:dealRef.id,...deal},contact),cd=convo?(convo.data()||{}):{};
  const route=await resolveOutboundRoute(cd);
  if(!phone||!route.from)throw new Error("Sin teléfono o línea WhatsApp asignada");
  const template=pickStepTemplate(step,route);
  const sent=route.provider==="meta"
    ?await wa.sendGatewayTemplate({tenantId:route.gatewayTenantId,lineId:route.gatewayLineId,to:phone,name:template.name,language:template.language,components:[]})
    :await wa.sendTemplate({from:route.from,to:phone,contentSid:template.sid,contentVariables:{},conversationId:convo?.id||""});
  const now=FieldValue.serverTimestamp();
  const label=template.label,templateId=template.provider==="meta"?template.name:template.sid;
  if(convo){
    await convo.ref.collection("messages").doc(String(sent.sid)).set({direction:"OUT",source:"recovery-engine",text:`Plantilla enviada (${label})`,body:`Plantilla enviada (${label})`,from:wa.ensureWhatsappPrefix(route.from),to:phone,timestamp:now,createdAt:now,messageSid:sent.sid,sid:sent.sid,provider:template.provider,deliveryStatus:sent.status||"queued",template:template.provider==="meta"?{name:template.name,language:template.language}:{contentSid:template.sid},campaignId:campaignRef.id,recoveryStep:index+1,sentBy:"RECOVERY ENGINE",sentByEmail:""},{merge:true});
    await convo.ref.set({lastMessageAt:now,updatedAt:now,lastMessagePreview:`Recovery ${index+1}/${campaign.sequence.length}: ${campaign.name}`,lastMessageDirection:"OUT",hasUnread:false,unreadCount:0},{merge:true});
  }
  const nextIndex=index+1,nextStep=campaign.sequence[nextIndex];
  const nextSendAt=nextStep?admin.firestore.Timestamp.fromDate(scheduledDate(campaign.startDate||isoDateBA(),nextStep)):null;
  const nextStatus=nextStep?"WAITING":"COMPLETED";
  await memberRef.set({status:nextStatus,lastSentAt:now,lastMessageSid:sent.sid,lastProvider:template.provider,lastTemplateId:templateId,lastTemplateName:label,lastLineId:route.from,lastGatewayLineId:route.gatewayLineId||"",stepsSent:FieldValue.increment(1),nextStepIndex:nextIndex,nextSendAt,sequenceCompletedAt:nextStep?null:now,error:"",engineLeaseUntil:null,updatedAt:now},{merge:true});
  const campaignPatch={sent:FieldValue.increment(1),updatedAt:now,lastSentAt:now};
  if(String(member.status||"").toUpperCase()==="PENDING")campaignPatch.pending=FieldValue.increment(-1);
  await campaignRef.set(campaignPatch,{merge:true});
  await addPhoneWatch(phone,campaignRef.id,memberRef.id);
  const prev=Number(deal.dueMessageSentCount||0)||0;
  await dealRef.set({dueMessageSentCount:prev+1,lastDueMessageAt:now,lastDueTemplateSid:templateId,lastDueTemplateName:label,lastDueProvider:template.provider,lastDueCampaignName:campaign.name,updatedAt:now},{merge:true});
  await dealRef.collection("message_logs").add({type:"recovery_engine",status:"sent",provider:template.provider,campaignId:campaignRef.id,campaignName:campaign.name,step:index+1,templateSid:templateId,templateName:label,messageSid:sent.sid,lineId:route.from,gatewayLineId:route.gatewayLineId||"",createdAt:FieldValue.serverTimestamp()});
  return {sid:sent.sid,provider:template.provider,nextStatus,nextSendAt:nextSendAt?.toDate?.()?.toISOString?.()||null};
}

async function claimMember(memberRef){
  const now=Date.now(),leaseUntil=admin.firestore.Timestamp.fromDate(new Date(now+120000));
  return crmDb.runTransaction(async tx=>{
    const snap=await tx.get(memberRef);if(!snap.exists)return null;const d=snap.data()||{};
    const status=String(d.status||"").toUpperCase();if(!["PENDING","WAITING"].includes(status)||d.sequenceStopped)return null;
    const lease=d.engineLeaseUntil?.toMillis?.()||0;if(lease>now)return null;
    const due=d.nextSendAt?.toMillis?.()||0;if(due&&due>now)return null;
    tx.set(memberRef,{engineLeaseUntil:leaseUntil,engineLeaseAt:FieldValue.serverTimestamp()},{merge:true});
    return d;
  });
}

async function processRecoveryEngine({maxMessages=20}={}){
  const campaignSnap=await crmDb.collection(CAMPAIGNS).where("status","==","ACTIVE").limit(30).get();
  const nowTs=admin.firestore.Timestamp.now();
  const results=[];let processed=0;
  for(const campaignDoc of campaignSnap.docs){
    if(processed>=maxMessages)break;
    const campaign=campaignDoc.data()||{};
    if(!campaign.autoEngine||!Array.isArray(campaign.sequence)||!campaign.sequence.length)continue;
    let members;
    try{members=await campaignDoc.ref.collection("members").where("nextSendAt","<=",nowTs).limit(Math.min(50,maxMessages-processed)).get();}
    catch(e){console.warn("recovery engine member query",campaignDoc.id,e.message);continue;}
    const delayMs=Math.max(500,Math.min(60000,Number(campaign.interRecipientDelayMs||3000)||3000));
    for(const memberDoc of members.docs){
      if(processed>=maxMessages)break;
      const member=await claimMember(memberDoc.ref);if(!member)continue;
      const status=String(member.status||"").toUpperCase();
      const index=Math.max(0,Number(member.nextStepIndex||0)||0),step=campaign.sequence[index];
      if(!step){await memberDoc.ref.set({status:"COMPLETED",nextSendAt:null,engineLeaseUntil:null,sequenceCompletedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});continue;}
      const dealRef=crmDb.collection("deals").doc(memberDoc.id),dealSnap=await dealRef.get();
      if(!dealSnap.exists){await memberDoc.ref.set({status:"COMPLETED_ERROR",error:"Trato inexistente",nextSendAt:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});continue;}
      const deal=dealSnap.data()||{};let contact={};if(deal.contactId){const cs=await crmDb.collection("contacts").doc(String(deal.contactId)).get();if(cs.exists)contact=cs.data()||{};}
      try{
        const out=await sendStep({campaignRef:campaignDoc.ref,campaign,memberRef:memberDoc.ref,member,dealRef,deal,contact,step,index});
        results.push({campaignId:campaignDoc.id,dealId:memberDoc.id,ok:true,step:index+1,...out});
      }catch(err){
        const nextIndex=index+1,nextStep=campaign.sequence[nextIndex];
        const nextSendAt=nextStep?admin.firestore.Timestamp.fromDate(scheduledDate(campaign.startDate||isoDateBA(),nextStep)):null;
        await memberDoc.ref.set({status:nextStep?"WAITING":"COMPLETED_ERROR",error:clean(err.message,800),lastErrorAt:FieldValue.serverTimestamp(),errorCount:FieldValue.increment(1),nextStepIndex:nextIndex,nextSendAt,sequenceCompletedAt:nextStep?null:FieldValue.serverTimestamp(),engineLeaseUntil:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        const errorPatch={errors:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp(),lastError:clean(err.message,800),lastErrorAt:FieldValue.serverTimestamp()};
        if(status==="PENDING")errorPatch.pending=FieldValue.increment(-1);
        await campaignDoc.ref.set(errorPatch,{merge:true});
        await dealRef.collection("message_logs").add({type:"recovery_engine",status:"error",campaignId:campaignDoc.id,campaignName:campaign.name,step:index+1,error:clean(err.message,800),createdAt:FieldValue.serverTimestamp()}).catch(()=>{});
        results.push({campaignId:campaignDoc.id,dealId:memberDoc.id,ok:false,step:index+1,error:err.message});
      }
      processed++;
      if(processed<maxMessages)await sleep(delayMs);
    }
  }
  return {ok:true,processed,sent:results.filter(x=>x.ok).length,errors:results.filter(x=>!x.ok).length,results};
}

module.exports={CAMPAIGNS,PHONE_WATCH,RESPONSE_STAGE,isoDateBA,scheduledDate,addPhoneWatch,removePhoneWatch,markRecontactResponse,processRecoveryEngine};
