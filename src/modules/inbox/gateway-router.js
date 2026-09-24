"use strict";
const express=require("express");
const crypto=require("crypto");
const config=require("../../core/config");
const {inboxDb,admin}=require("../../core/google");
const wa=require("./whatsapp");
const dialogflow=require("./dialogflow");
const {markRecontactResponse}=require("../crm/recovery-service");
const router=express.Router();
const FieldValue=admin.firestore.FieldValue;

function digits(v){return String(v||"").replace(/\D/g,"");}
function clean(v,max=4000){return String(v||"").trim().slice(0,max);}
function lineDocId(v){const d=digits(v);return d||crypto.createHash("sha1").update(String(v||"")).digest("hex").slice(0,24);}
function deterministicConversationId(from,to){
  const key=`${digits(from)}|${digits(to)}`;
  return `wa_${crypto.createHash("sha256").update(key).digest("hex").slice(0,40)}`;
}
function effectiveMode(conversation={}){
  const manual=String(conversation.manualModeOverride||"").toUpperCase();
  if(manual==="HUMAN"||manual==="BOT") return manual;
  return String(conversation.mode||"BOT").toUpperCase()==="HUMAN"?"HUMAN":"BOT";
}
function preview(text,type){
  const t=clean(text,180);
  if(t)return t;
  return type&&type!=="text"?`[${type}]`:"[mensaje]";
}

function referralFromGateway(event){
  const r=event?.referral||{};
  const ctwa=clean(r.ctwaClid||r.ctwa_clid||"",300);
  const sourceId=clean(r.sourceId||r.source_id||"",300);
  const sourceType=clean(r.sourceType||r.source_type||"",120);
  const headline=clean(r.headline||"",500);
  const body=clean(r.body||"",1200);
  const image=clean(r.imageUrl||r.image_url||"",1200);
  const sourceUrl=clean(r.sourceUrl||r.source_url||"",1200);
  const has=!!(ctwa||sourceId||sourceType||headline||body||image||sourceUrl);
  return {has,ctwa,sourceId,sourceType,headline,body,image,sourceUrl};
}
async function processGatewayBotInbound({conversationId,convoRef,from,body,inboundSid,event}){
  if(!dialogflow.configured() || !String(body||"").trim()) return {skipped:true};
  try{
    const detected=await dialogflow.detectIntent({conversationId,text:body});
    if(!detected.text) return {ok:true,skipped:true,reason:"empty_agent_response"};
    const latest=await convoRef.get();
    if(!latest.exists || effectiveMode(latest.data()||{})!=="BOT") return {ok:true,skipped:true,reason:"mode_changed_to_human"};
    const sent=await wa.sendGatewayText({tenantId:event.tenantId,lineId:event.lineId,to:from,body:detected.text});
    const now=FieldValue.serverTimestamp();
    await convoRef.collection("messages").doc(String(sent.sid)).set({
      direction:"OUT",source:"dialogflow",provider:"meta",body:detected.text,text:detected.text,from:wa.ensureWhatsappPrefix(`+${digits(event.displayPhoneNumber||"")}`),to:wa.ensureWhatsappPrefix(`+${digits(from)}`),
      timestamp:now,createdAt:now,status:sent.status||"accepted",deliveryStatus:sent.status||"accepted",messageSid:sent.sid,sid:sent.sid,numMedia:0,media:[],
      sentBy:"BOT",sentByName:"BOT",sentByEmail:"",sentByUserId:"",senderName:"BOT",bot:true,dialogflowSessionId:detected.sessionId,inReplyToMessageSid:inboundSid
    },{merge:false});
    await convoRef.set({lastMessageAt:now,lastBotMessageAt:now,updatedAt:now,lastMessagePreview:preview(detected.text,"text"),lastMessageDirection:"OUT",lastDeliveryStatus:sent.status||"accepted",botLastError:"",botLastErrorAt:null},{merge:true});
    return {ok:true,sid:sent.sid,text:detected.text};
  }catch(error){
    console.error("gateway dialogflow bot inbound",error?.response?.data||error);
    await convoRef.set({mode:"HUMAN",modeUpdatedAt:FieldValue.serverTimestamp(),modeUpdatedBy:"system:dialogflow-fallback",botLastError:clean(error?.response?.data?.error?.message||error?.message||"Dialogflow error",1000),botLastErrorAt:FieldValue.serverTimestamp()},{merge:true});
    return {ok:false,error:error?.message||"Dialogflow error",fallbackHuman:true};
  }
}

function authorized(req){
  if(!config.gatewaySecret)return false;
  return String(req.get("x-gateway-secret")||"")===config.gatewaySecret;
}
async function touchLine(displayPhoneNumber,event){
  const normalized=wa.ensureWhatsappPrefix(displayPhoneNumber?`+${digits(displayPhoneNumber)}`:"");
  if(!normalized)return;
  await inboxDb.collection("mrapi_line_catalog").doc(lineDocId(normalized)).set({
    lineId:normalized,
    phone:wa.cleanWhatsappNumber(normalized),
    label:clean(event?.lineName||event?.lineId||displayPhoneNumber,120),
    active:true,
    source:"mrapi-gateway",
    provider:"meta",
    gatewayLineId:clean(event?.lineId,120),
    gatewayTenantId:clean(event?.tenantId,120),
    gatewayLineName:clean(event?.lineName,120),
    phoneNumberId:clean(event?.phoneNumberId,120),
    updatedAt:FieldValue.serverTimestamp(),
    lastSeenAt:FieldValue.serverTimestamp()
  },{merge:true});
}

router.post("/events",async(req,res)=>{
  if(!authorized(req))return res.status(401).json({ok:false,error:"Gateway secret inválido"});
  const event=req.body||{};
  try{
    if(event.kind==="status"){
      const customer=digits(event.to||"");
      const display=digits(event.displayPhoneNumber||"");
      if(customer&&display&&event.providerMessageId){
        const from=wa.ensureWhatsappPrefix(`+${customer}`);
        const to=wa.ensureWhatsappPrefix(`+${display}`);
        const conversationId=deterministicConversationId(from,to);
        const sid=clean(event.providerMessageId,180);
        const status=clean(event.status,60)||"unknown";
        const candidates=new Map();
        const direct=await inboxDb.collection("conversations").doc(conversationId).get();
        if(direct.exists)candidates.set(direct.id,direct);
        const variants=[customer,`+${customer}`,`whatsapp:+${customer}`,`whatsapp:${customer}`];
        try{
          const q=await inboxDb.collection("conversations").where("waFrom","in",variants).limit(30).get();
          for(const d of q.docs){const x=d.data()||{};const line=digits(x.inboundTo||x.lineId||x.preferredLineId||"");if(line===display)candidates.set(d.id,d)}
        }catch(e){console.warn("gateway status legacy lookup",e.message||String(e))}

        let updated=0;
        for(const [id] of candidates){
          const ref=inboxDb.collection("conversations").doc(id).collection("messages").doc(sid);
          const existing=await ref.get();
          if(!existing.exists)continue;
          await ref.set({deliveryStatus:status,deliveryUpdatedAt:FieldValue.serverTimestamp(),providerStatusRaw:event.raw||null},{merge:true});
          await inboxDb.collection("conversations").doc(id).set({lastDeliveryStatus:status,updatedAt:FieldValue.serverTimestamp()},{merge:true});
          updated++;
        }
        // Si todavía no existe el mensaje (race de webhook), conservar el estado en la conversación canónica.
        if(!updated){
          const msgRef=inboxDb.collection("conversations").doc(conversationId).collection("messages").doc(sid);
          await msgRef.set({deliveryStatus:status,deliveryUpdatedAt:FieldValue.serverTimestamp(),providerStatusRaw:event.raw||null},{merge:true});
          await inboxDb.collection("conversations").doc(conversationId).set({lastDeliveryStatus:status,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        }
      }
      return res.json({ok:true,kind:"status"});
    }

    if(event.kind!=="message")return res.json({ok:true,ignored:true,kind:event.kind||""});

    const fromDigits=digits(event.from||"");
    const toDigits=digits(event.displayPhoneNumber||"");
    const sid=clean(event.providerMessageId||event.eventId,180);
    if(!fromDigits||!toDigits||!sid)return res.status(400).json({ok:false,error:"Evento incompleto"});

    const from=wa.ensureWhatsappPrefix(`+${fromDigits}`);
    const to=wa.ensureWhatsappPrefix(`+${toDigits}`);
    const body=event.type==="text"?clean(event.content?.text,4000):clean(event.content?.caption,4000);
    const media=["image","audio","document"].includes(event.type)&&event.content?.id?[{source:"gateway-meta",gatewayMediaId:String(event.content.id),gatewayLineId:clean(event.lineId,120),contentType:clean(event.content.mimeType||"application/octet-stream",160),filename:clean(event.content.filename||"",180),sha256:clean(event.content.sha256||"",180)}]:[];
    const conversationId=deterministicConversationId(from,to);
    const convoRef=inboxDb.collection("conversations").doc(conversationId);
    const msgRef=convoRef.collection("messages").doc(sid);

    const profileName=clean(event.profileName||"",220);
    const referral=referralFromGateway(event);
    let duplicate=false;
    let shouldBot=false;
    let isNewConversation=false;
    await inboxDb.runTransaction(async tx=>{
      const [convoSnap,msgSnap]=await Promise.all([tx.get(convoRef),tx.get(msgRef)]);
      if(msgSnap.exists){duplicate=true;return;}
      const now=FieldValue.serverTimestamp();
      tx.set(msgRef,{
        direction:"IN",source:"mrapi-gateway",provider:"meta",body,text:body,from,to,timestamp:now,createdAt:now,status:"received",deliveryStatus:"received",
        messageSid:sid,sid,waId:fromDigits,numMedia:media.length,media,profileName,
        sourceChannel:referral.has?"meta_ad":"whatsapp",
        referralCtwaClid:referral.ctwa,referralAdId:referral.sourceId,referralSourceType:referral.sourceType,
        referralHeadline:referral.headline,referralBody:referral.body,referralImageUrl:referral.image,referralSourceUrl:referral.sourceUrl,
        messageType:clean(event.type,80)||"unknown",gatewayEventId:clean(event.eventId,180),gatewayLineId:clean(event.lineId,120),gatewayLineName:clean(event.lineName,120),gatewayTenantId:clean(event.tenantId,120),phoneNumberId:clean(event.phoneNumberId,120),rawGatewayEvent:event
      },{merge:false});

      const existing=convoSnap.exists?(convoSnap.data()||{}):{};
      const priorSource=String(existing.leadOriginType||existing.sourceChannel||"").toLowerCase();
      const oldName=clean(existing.contactName||existing.profileName||"",220);
      const oldIsFallback=!oldName || digits(oldName)===fromDigits || oldName.toLowerCase()===`whatsapp:+${fromDigits}`.toLowerCase() || oldName.toLowerCase()===`whatsapp:${fromDigits}`.toLowerCase();
      const patch={
        waFrom:from,inboundTo:to,lineId:to,provider:"meta",gatewayLineId:clean(event.lineId,120),gatewayLineName:clean(event.lineName,120),gatewayTenantId:clean(event.tenantId,120),phoneNumberId:clean(event.phoneNumberId,120),
        profileName:profileName||(existing.profileName||""),
        contactName:profileName&&oldIsFallback?profileName:(!convoSnap.exists?(profileName||fromDigits):undefined),
        lineLabel:clean(event.lineName||event.lineId||event.displayPhoneNumber,120),
        lastMessageAt:now,lastInboundMessageAt:now,updatedAt:now,lastMessagePreview:preview(body,event.type),lastMessageDirection:"IN",
        hasUnread:true,unreadCount:FieldValue.increment(1),lastDeliveryStatus:"received",
        sourceChannel:referral.has?"meta_ad":(priorSource==="meta_ad"?"meta_ad":(existing.sourceChannel||"whatsapp"))
      };
      Object.keys(patch).forEach(k=>patch[k]===undefined&&delete patch[k]);
      const currentMode=convoSnap.exists?effectiveMode(existing):(dialogflow.configured()?"BOT":"HUMAN");
      shouldBot=currentMode==="BOT";
      isNewConversation=!convoSnap.exists;
      if(!convoSnap.exists){patch.createdAt=now;patch.mode=currentMode;patch.stage="nuevo";patch.ownerEmail="";patch.isAssigned=false;patch.isLinked=false;}
      if(referral.has){
        patch.leadPlatform="meta";
        patch.referralCtwaClid=referral.ctwa;patch.referralAdId=referral.sourceId;patch.referralSourceType=referral.sourceType;patch.referralHeadline=referral.headline;patch.referralBody=referral.body;patch.referralImageUrl=referral.image;patch.referralSourceUrl=referral.sourceUrl;
        if(!existing.leadOriginType){
          patch.leadOriginType="meta_ad";patch.leadOriginPlatform="meta";patch.leadOriginMessage=clean(body,2000);patch.leadOriginAt=now;
          patch.leadOriginCtwaClid=referral.ctwa;patch.leadOriginAdId=referral.sourceId;patch.leadOriginSourceType=referral.sourceType;patch.leadOriginHeadline=referral.headline;patch.leadOriginBody=referral.body;patch.leadOriginImageUrl=referral.image;patch.leadOriginSourceUrl=referral.sourceUrl;
        }
      }
      tx.set(convoRef,patch,{merge:true});
    });

    await touchLine(event.displayPhoneNumber,event);
    if(!duplicate && isNewConversation){
      try{
        const siblings=await inboxDb.collection("conversations").where("waFrom","==",from).limit(20).get();
        const ids=siblings.docs.map(d=>d.id);
        const lines=[...new Set(siblings.docs.map(d=>digits((d.data()||{}).inboundTo||(d.data()||{}).lineId||"")).filter(Boolean))].map(x=>`whatsapp:+${x}`);
        if(lines.length>1&&siblings.size>1){const batch=inboxDb.batch();siblings.docs.forEach(d=>batch.set(d.ref,{duplicateConversationIds:ids.filter(x=>x!==d.id),linkedLineIds:lines,multiLineDetected:true,multiLineCount:lines.length,multiLineUpdatedAt:FieldValue.serverTimestamp()},{merge:true}));await batch.commit();}
      }catch(linkErr){console.warn("gateway multi-line auto-link",linkErr.message)}
    }
    let campaignResponse={matched:0};
    if(!duplicate) campaignResponse=await markRecontactResponse(from,sid,{provider:"meta",lineId:to});
    let botResult={skipped:true};
    if(!duplicate&&shouldBot) botResult=await processGatewayBotInbound({conversationId,convoRef,from:fromDigits,body,inboundSid:sid,event});
    console.log(JSON.stringify({severity:"INFO",message:"Gateway inbound",conversationId,messageSid:sid,duplicate,from,to,gatewayLineId:event.lineId,tenantId:event.tenantId,profileName:!!profileName,referral:referral.has,shouldBot,campaignResponses:Number(campaignResponse?.matched||0),botOk:botResult?.ok===true,botFallbackHuman:botResult?.fallbackHuman===true}));
    return res.json({ok:true,conversationId,messageSid:sid,duplicate});
  }catch(e){
    console.error("gateway-inbound",e);
    return res.status(500).json({ok:false,error:e.message||"Gateway inbound error"});
  }
});

module.exports=router;
