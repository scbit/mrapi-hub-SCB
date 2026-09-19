"use strict";
const express=require("express");
const crypto=require("crypto");
const config=require("../../core/config");
const {inboxDb,admin}=require("../../core/google");
const wa=require("./whatsapp");
const router=express.Router();
const FieldValue=admin.firestore.FieldValue;

function digits(v){return String(v||"").replace(/\D/g,"");}
function clean(v,max=4000){return String(v||"").trim().slice(0,max);}
function lineDocId(v){const d=digits(v);return d||crypto.createHash("sha1").update(String(v||"")).digest("hex").slice(0,24);}
function deterministicConversationId(from,to){
  const key=`${digits(from)}|${digits(to)}`;
  return `wa_${crypto.createHash("sha256").update(key).digest("hex").slice(0,40)}`;
}
function preview(text,type){
  const t=clean(text,180);
  if(t)return t;
  return type&&type!=="text"?`[${type}]`:"[mensaje]";
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
    label:clean(event?.lineId||displayPhoneNumber,120),
    active:true,
    source:"mrapi-gateway",
    provider:"meta",
    gatewayLineId:clean(event?.lineId,120),
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
        const msgRef=inboxDb.collection("conversations").doc(conversationId).collection("messages").doc(clean(event.providerMessageId,180));
        await msgRef.set({
          deliveryStatus:clean(event.status,60)||"unknown",
          deliveryUpdatedAt:FieldValue.serverTimestamp(),
          providerStatusRaw:event.raw||null
        },{merge:true});
        await inboxDb.collection("conversations").doc(conversationId).set({
          lastDeliveryStatus:clean(event.status,60)||"unknown",
          updatedAt:FieldValue.serverTimestamp()
        },{merge:true});
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

    let duplicate=false;
    await inboxDb.runTransaction(async tx=>{
      const [convoSnap,msgSnap]=await Promise.all([tx.get(convoRef),tx.get(msgRef)]);
      if(msgSnap.exists){duplicate=true;return;}
      const now=FieldValue.serverTimestamp();
      tx.set(msgRef,{
        direction:"IN",
        source:"mrapi-gateway",
        provider:"meta",
        body,
        text:body,
        from,
        to,
        timestamp:now,
        createdAt:now,
        status:"received",
        deliveryStatus:"received",
        messageSid:sid,
        sid,
        waId:fromDigits,
        numMedia:media.length,
        media,
        messageType:clean(event.type,80)||"unknown",
        gatewayEventId:clean(event.eventId,180),
        gatewayLineId:clean(event.lineId,120),
        gatewayTenantId:clean(event.tenantId,120),
        phoneNumberId:clean(event.phoneNumberId,120),
        rawGatewayEvent:event
      },{merge:false});

      const existing=convoSnap.exists?(convoSnap.data()||{}):{};
      const patch={
        waFrom:from,
        inboundTo:to,
        lineId:to,
        provider:"meta",
        gatewayLineId:clean(event.lineId,120),
        gatewayTenantId:clean(event.tenantId,120),
        phoneNumberId:clean(event.phoneNumberId,120),
        contactName:convoSnap.exists?undefined:fromDigits,
        lastMessageAt:now,
        lastInboundMessageAt:now,
        updatedAt:now,
        lastMessagePreview:preview(body,event.type),
        lastMessageDirection:"IN",
        hasUnread:true,
        unreadCount:FieldValue.increment(1),
        lastDeliveryStatus:"received",
        sourceChannel:existing.sourceChannel||"whatsapp"
      };
      Object.keys(patch).forEach(k=>patch[k]===undefined&&delete patch[k]);
      if(!convoSnap.exists){
        patch.createdAt=now;
        patch.mode="HUMAN";
        patch.stage="nuevo";
        patch.ownerEmail="";
        patch.isAssigned=false;
        patch.isLinked=false;
      }
      tx.set(convoRef,patch,{merge:true});
    });

    await touchLine(event.displayPhoneNumber,event);
    console.log(JSON.stringify({severity:"INFO",message:"Gateway inbound",conversationId,messageSid:sid,duplicate,from,to,gatewayLineId:event.lineId,tenantId:event.tenantId}));
    return res.json({ok:true,conversationId,messageSid:sid,duplicate});
  }catch(e){
    console.error("gateway-inbound",e);
    return res.status(500).json({ok:false,error:e.message||"Gateway inbound error"});
  }
});

module.exports=router;
