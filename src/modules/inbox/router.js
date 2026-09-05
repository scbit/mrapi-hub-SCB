"use strict";
const express = require("express");
const Busboy = require("busboy");
const crypto = require("crypto");
const config = require("../../core/config");
const { inboxDb, crmDb, deskDb, admin, storage } = require("../../core/google");
const wa = require("./whatsapp");
const dialogflow = require("./dialogflow");
const { authRequired } = require("../../middleware/auth");
const router = express.Router();
const FieldValue = admin.firestore.FieldValue;
const { PIPELINE_STAGES } = require("../crm/constants");
const { visibleOwners, canSeeOwner, isAdminLike } = require("../crm/access");

function iso(v) {
  try { return v?.toDate ? v.toDate().toISOString() : (v instanceof Date ? v.toISOString() : v || null); }
  catch { return null; }
}
function digits(v){ return String(v || "").replace(/\D/g, ""); }
function cleanString(v, max=500){ return String(v || "").trim().slice(0,max); }
function uniqueStrings(values){ return [...new Set((values || []).map(v=>cleanString(v,220)).filter(Boolean))]; }
function deterministicConversationId(from,to){
  const key=`${digits(from)}|${digits(to)}`;
  return `wa_${crypto.createHash("sha256").update(key).digest("hex").slice(0,40)}`;
}
function twilioMedia(body){
  const count=Math.max(0,Math.min(Number(body?.NumMedia||0)||0,10));
  const items=[];
  for(let i=0;i<count;i+=1){
    const url=cleanString(body?.[`MediaUrl${i}`],1200);
    if(!url) continue;
    items.push({url,contentType:cleanString(body?.[`MediaContentType${i}`],160),filename:"",source:"twilio"});
  }
  return items;
}
function referralFromTwilio(body){
  const ctwa=cleanString(body?.ReferralCtwaClid,300);
  const sourceId=cleanString(body?.ReferralSourceId,300);
  const sourceType=cleanString(body?.ReferralSourceType,120);
  const headline=cleanString(body?.ReferralHeadline,500);
  const refBody=cleanString(body?.ReferralBody,1200);
  const image=cleanString(body?.ReferralMediaUrl,1200);
  const sourceUrl=cleanString(body?.ReferralSourceUrl,1200);
  const has=!!(ctwa||sourceId||sourceType||headline||refBody||image||sourceUrl);
  return {has,ctwa,sourceId,sourceType,headline,body:refBody,image,sourceUrl};
}
function twimlEmpty(res){ return res.status(200).type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>"); }
async function processBotInbound({conversationId,convoRef,from,to,body,inboundSid}){
  if(!dialogflow.configured() || !String(body||"").trim()) return {skipped:true};
  try{
    const detected=await dialogflow.detectIntent({conversationId,text:body});
    if(!detected.text) return {ok:true,skipped:true,reason:"empty_agent_response"};
    // A human may take over while Dialogflow is processing. Never send if mode changed.
    const latest=await convoRef.get();
    if(!latest.exists || normalizeMode((latest.data()||{}).mode)!=="BOT") return {ok:true,skipped:true,reason:"mode_changed_to_human"};
    const sent=await wa.sendText({from:to,to:from,body:detected.text,conversationId,req:{protocol:"https",get:()=>""}});
    const now=FieldValue.serverTimestamp();
    await convoRef.collection("messages").doc(String(sent.sid)).set({
      direction:"OUT",source:"dialogflow",body:detected.text,text:detected.text,from:wa.ensureWhatsappPrefix(to),to:wa.ensureWhatsappPrefix(from),
      timestamp:now,createdAt:now,status:sent.status||"queued",deliveryStatus:sent.status||"queued",messageSid:sent.sid,sid:sent.sid,numMedia:0,media:[],
      sentBy:"BOT",sentByName:"BOT",sentByEmail:"",sentByUserId:"",senderName:"BOT",bot:true,dialogflowSessionId:detected.sessionId,inReplyToMessageSid:inboundSid
    },{merge:false});
    await convoRef.set({lastMessageAt:now,lastBotMessageAt:now,updatedAt:now,lastMessagePreview:preview(detected.text,0),lastMessageDirection:"OUT",lastDeliveryStatus:sent.status||"queued",botLastError:"",botLastErrorAt:null},{merge:true});
    return {ok:true,sid:sent.sid,text:detected.text};
  }catch(error){
    console.error("dialogflow bot inbound",error?.response?.data || error);
    await convoRef.set({mode:"HUMAN",modeUpdatedAt:FieldValue.serverTimestamp(),modeUpdatedBy:"system:dialogflow-fallback",botLastError:cleanString(error?.response?.data?.error?.message || error?.message || "Dialogflow error",1000),botLastErrorAt:FieldValue.serverTimestamp()},{merge:true});
    return {ok:false,error:error?.message||"Dialogflow error",fallbackHuman:true};
  }
}
function summary(doc){
  const d = doc.data() || {};
  return {
    id: doc.id,
    contactId: d.contactId || "",
    dealId: d.dealId || "",
    contactName: d.contactName || d.profileName || d.name || "",
    companyName: d.companyName || "",
    waFrom: d.waFrom || "",
    inboundTo: d.inboundTo || "",
    lineId: d.lineId || d.inboundTo || "",
    preferredLineId: d.preferredLineId || "",
    linkedLineIds: uniqueStrings(d.linkedLineIds || []),
    ownerEmail: String(d.ownerEmail || "").toLowerCase(),
    isAssigned: Boolean(String(d.ownerEmail || "").trim()),
    isLinked: Boolean(String(d.dealId || "").trim() || String(d.contactId || "").trim()),
    stage: d.stage || d.dealStage || "nuevo",
    mode: String(d.mode || "BOT").toUpperCase() === "HUMAN" ? "HUMAN" : "BOT",
    lastMessage: d.lastMessagePreview || d.lastMessage || d.lastMessageText || "",
    lastMessageAt: iso(d.lastMessageAt || d.updatedAt),
    unreadCount: Number(d.unreadCount || 0),
    lastDeliveryStatus: d.lastDeliveryStatus || "",
    sourceChannel: d.sourceChannel || "",
    leadPlatform: d.leadPlatform || d.leadAd?.platform || "",
    referralCtwaClid: d.referralCtwaClid || "",
    referralAdId: d.referralAdId || d.leadAd?.adId || "",
    referralSourceType: d.referralSourceType || "",
    referralHeadline: d.referralHeadline || d.leadAd?.headline || d.leadAd?.title || d.leadAd?.adName || "",
    referralBody: d.referralBody || d.leadAd?.body || d.leadAd?.text || d.leadAd?.description || "",
    referralImageUrl: d.referralImageUrl || d.leadAd?.imageUrl || "",
    campaignName: d.campaignName || d.leadAd?.campaignName || "",
    adsetName: d.adsetName || d.leadAd?.adsetName || "",
    leadAd: d.leadAd && typeof d.leadAd === "object" ? d.leadAd : null,
    duplicateConversationIds: uniqueStrings(d.duplicateConversationIds || [])
  };
}
function message(doc, conversationId){
  const d=doc.data()||{};
  return {
    id: doc.id,
    conversationId,
    direction: d.direction || (d.from?.includes?.("whatsapp:") ? "in" : ""),
    source: d.source || "",
    body: d.body || d.text || d.message || "",
    text: d.text || d.body || d.message || "",
    from: d.from || "",
    to: d.to || "",
    timestamp: iso(d.timestamp || d.createdAt),
    status: d.status || d.deliveryStatus || "",
    messageSid: d.messageSid || d.sid || "",
    media: Array.isArray(d.media) ? d.media.map(m=>({
      url: m?.url || "", contentType: m?.contentType || m?.mimeType || "", filename: m?.filename || "", gcsPath: m?.gcsPath || "", source: m?.source || ""
    })) : [],
    template: d.template || null,
    referralCtwaClid: d.referralCtwaClid || d.payload?.referralCtwaClid || "",
    referralAdId: d.referralAdId || d.payload?.referralAdId || d.leadAd?.adId || "",
    referralSourceType: d.referralSourceType || d.payload?.referralSourceType || "",
    referralHeadline: d.referralHeadline || d.payload?.referralHeadline || d.leadAd?.headline || "",
    referralBody: d.referralBody || d.payload?.referralBody || d.leadAd?.body || "",
    referralImageUrl: d.referralImageUrl || d.payload?.referralImageUrl || d.leadAd?.imageUrl || "",
    campaignName: d.campaignName || d.leadAd?.campaignName || "",
    adsetName: d.adsetName || d.leadAd?.adsetName || "",
    sourceChannel: d.sourceChannel || d.payload?.sourceChannel || "",
    sentBy: d.sentBy || d.sentByName || d.senderName || d.sentByEmail || d.senderEmail || "",
    sentByName: d.sentByName || d.senderName || d.userName || "",
    sentByEmail: d.sentByEmail || d.senderEmail || "",
    sentByUserId: d.sentByUserId || d.userId || ""
  };
}


function normalizeMode(v){ return String(v||"BOT").toUpperCase()==="HUMAN" ? "HUMAN" : "BOT"; }
function preview(text, mediaCount=0){ const t=cleanString(text,160).replace(/\s+/g," "); return t || (mediaCount ? `Adjunto (${mediaCount})` : ""); }
async function saveOutbound(convoRef, sid, payload){ await convoRef.collection("messages").doc(String(sid)).set(payload,{merge:true}); }
async function loadConversationForSend(id){
  const ref=inboxDb.collection("conversations").doc(id); const snap=await ref.get();
  if(!snap.exists){ const e=new Error("Conversación no encontrada"); e.status=404; throw e; }
  const d=snap.data()||{}; if(normalizeMode(d.mode)!=="HUMAN"){ const e=new Error("La conversación debe estar en modo HUMAN"); e.status=409; throw e; }
  return {ref,data:d,reads:1};
}
async function updateAfterSend(ref, text, mediaCount, status){
  await ref.set({lastMessageAt:FieldValue.serverTimestamp(),lastMessagePreview:preview(text,mediaCount),updatedAt:FieldValue.serverTimestamp(),lastDeliveryStatus:status||"queued",lastMessageDirection:"OUT",lastHumanMessageAt:FieldValue.serverTimestamp(),hasUnread:false,unreadCount:0},{merge:true});
}
async function parseSingleUpload(req){
  return new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{fileSize:15*1024*1024,files:1}}); let text=""; let fileData=null; let limited=false;
    bb.on("field",(n,v)=>{if(n==="text") text=cleanString(v,4000)});
    bb.on("file",(n,file,info)=>{ const chunks=[]; let size=0; file.on("data",c=>{chunks.push(c);size+=c.length}); file.on("limit",()=>{limited=true}); file.on("end",()=>{fileData={originalname:info.filename||"archivo",mimetype:info.mimeType||"application/octet-stream",buffer:Buffer.concat(chunks),size}}); });
    bb.on("error",reject); bb.on("finish",()=>limited?reject(new Error("El archivo supera 15 MB")):resolve({text,file:fileData})); req.pipe(bb);
  });
}
async function uploadOutbound(file){
  if(!config.filesBucket) throw new Error("MRAPI_FILES_BUCKET no configurado");
  const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
  if(!allowed.has(file.mimetype)) throw Object.assign(new Error("Tipo de archivo no permitido. Usá PDF, JPG, PNG o WEBP."),{status:400});
  const safe=String(file.originalname||"archivo").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(-100);
  const path=`whatsapp-out/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safe}`;
  const obj=storage.bucket(config.filesBucket).file(path); await obj.save(file.buffer,{contentType:file.mimetype,resumable:false,metadata:{cacheControl:"private, max-age=3600"}});
  const [signedUrl]=await obj.getSignedUrl({action:"read",expires:Date.now()+60*60*1000});
  return {url:signedUrl,gcsPath:path,filename:file.originalname,contentType:file.mimetype,source:"gcs"};
}
function mediaExtension(contentType){
  const ct=String(contentType||"").toLowerCase();
  if(ct.includes("pdf")) return ".pdf"; if(ct.includes("ogg")) return ".ogg"; if(ct.includes("mpeg")) return ".mp3";
  if(ct.includes("mp4")) return ".mp4"; if(ct.includes("webm")) return ".webm"; if(ct.includes("jpeg")) return ".jpg";
  if(ct.includes("png")) return ".png"; if(ct.includes("webp")) return ".webp"; return "";
}
function filenameFromDisposition(value){
  const m=String(value||"").match(/filename\*?=(?:UTF-8''|["']?)([^"';]+)/i);
  if(!m) return ""; try{return decodeURIComponent(m[1].replace(/["']/g,""));}catch{return m[1].replace(/["']/g,"");}
}
async function signedMediaUrl(media){
  if(!media?.gcsPath || !config.filesBucket) return "";
  const [url]=await storage.bucket(config.filesBucket).file(media.gcsPath).getSignedUrl({action:"read",expires:Date.now()+60*60*1000});
  return url;
}
async function materializeMedia(conversationId,messageId,index){
  const msgRef=inboxDb.collection("conversations").doc(conversationId).collection("messages").doc(messageId);
  const snap=await msgRef.get(); if(!snap.exists){const e=new Error("Mensaje no encontrado");e.status=404;throw e;}
  const data=snap.data()||{}; const media=Array.isArray(data.media)?data.media.slice():[]; const item=media[index];
  if(!item){const e=new Error("Adjunto no encontrado");e.status=404;throw e;}
  if(item.gcsPath){ return {url:await signedMediaUrl(item),item,reads:1,writes:0}; }
  if(!item.url){const e=new Error("El adjunto no tiene URL disponible");e.status=404;throw e;}
  if(!config.filesBucket){const e=new Error("MRAPI_FILES_BUCKET no configurado");e.status=503;throw e;}
  const downloaded=await wa.downloadMedia(item.url);
  const contentType=String(item.contentType||downloaded.contentType||"application/octet-stream");
  const fallbackName=`${messageId}-${index}${mediaExtension(contentType)}`;
  const filename=String(item.filename||filenameFromDisposition(downloaded.contentDisposition)||fallbackName).replace(/[^a-zA-Z0-9._-]+/g,"_").slice(-120);
  const path=`whatsapp-in/${conversationId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${filename}`;
  await storage.bucket(config.filesBucket).file(path).save(downloaded.buffer,{contentType,resumable:false,metadata:{cacheControl:"private, max-age=3600"}});
  media[index]={...item,gcsPath:path,filename,contentType,source:"gcs",originalTwilioUrl:item.url};
  await msgRef.set({media},{merge:true});
  return {url:await signedMediaUrl(media[index]),item:media[index],reads:1,writes:1};
}

router.get("/conversations", authRequired, async(req,res)=>{
  try{
    const requested=Number(req.query.limit||config.inboxPageSize);
    const limit=Math.max(10,Math.min(requested,config.inboxMaxPageSize));
    const requestedOwners=uniqueStrings(String(req.query.owners||"").split(",").map(x=>String(x||"").toLowerCase())).slice(0,10);
    const visible=await visibleOwners(req.authUser);
    let owners=requestedOwners;
    if(visible!==null){
      if(owners.some(x=>!visible.includes(x))) return res.status(403).json({ok:false,error:"Owner fuera de tus permisos"});
      if(!owners.length){
        const own=String(req.authUser?.email||"").trim().toLowerCase();
        owners=visible.length>10?(own&&visible.includes(own)?[own]:visible.slice(0,10)):visible.slice(0,10);
      }
    }
    let q=inboxDb.collection("conversations");
    if(owners.length===1) q=q.where("ownerEmail","==",owners[0]);
    else if(owners.length>1) q=q.where("ownerEmail","in",owners);
    q=q.orderBy("lastMessageAt","desc").limit(limit);
    const cursor=cleanString(req.query.cursor,220);
    let cursorRead=0;
    if(cursor){
      const c=await inboxDb.collection("conversations").doc(cursor).get(); cursorRead=1;
      if(c.exists) q=q.startAfter(c);
    }
    const snap=await q.get();
    const items=snap.docs.map(summary);
    const last=snap.docs[snap.docs.length-1];
    return res.json({ok:true,items,nextCursor:last?.id||null,hasMore:snap.size===limit,readsEstimate:snap.size+cursorRead,ownersApplied:owners});
  }catch(e){
    console.error("inbox list",e);
    const msg=/index/i.test(String(e.message||""))?"Firestore requiere un índice para este filtro de owner. No se hizo fallback masivo.":e.message;
    return res.status(500).json({ok:false,error:msg});
  }
});


router.get("/conversations/changes", authRequired, async(req,res)=>{
  try{
    const sinceRaw=cleanString(req.query.since,80);
    const sinceDate=new Date(sinceRaw);
    if(!sinceRaw || Number.isNaN(sinceDate.getTime())) return res.status(400).json({ok:false,error:"Checkpoint inválido"});
    const requestedOwners=uniqueStrings(String(req.query.owners||"").split(",").map(x=>String(x||"").toLowerCase())).slice(0,10);
    const visible=await visibleOwners(req.authUser);
    let owners=requestedOwners;
    if(visible!==null){
      if(owners.some(x=>!visible.includes(x))) return res.status(403).json({ok:false,error:"Owner fuera de tus permisos"});
      if(!owners.length){
        const own=String(req.authUser?.email||"").trim().toLowerCase();
        owners=visible.length>10?(own&&visible.includes(own)?[own]:visible.slice(0,10)):visible.slice(0,10);
      }
    }
    let q=inboxDb.collection("conversations");
    if(owners.length===1) q=q.where("ownerEmail","==",owners[0]);
    else if(owners.length>1) q=q.where("ownerEmail","in",owners);
    q=q.where("lastMessageAt",">=",sinceDate).orderBy("lastMessageAt","desc").limit(100);
    const snap=await q.get();
    return res.json({ok:true,items:snap.docs.map(summary),readsEstimate:snap.size,serverNow:new Date().toISOString(),ownersApplied:owners});
  }catch(e){
    console.error("inbox changes",e);
    const msg=/index/i.test(String(e.message||""))?"Firestore requiere un índice para Inbox Live con este filtro de owner. No se hizo scan masivo.":e.message;
    return res.status(500).json({ok:false,error:msg});
  }
});

router.get("/conversations/search",authRequired,async(req,res)=>{
  try{
    const raw=cleanString(req.query.q,120); const phone=digits(raw);
    if(!raw) return res.json({ok:true,items:[],readsEstimate:0,scope:"none"});
    // v0.2: búsqueda histórica solo por teléfono exacto/variantes. Nunca escanea miles de docs.
    if(phone.length < 6) return res.json({ok:true,items:[],readsEstimate:0,scope:"loaded-page",note:"Nombre/texto se filtra sobre la página cargada; la búsqueda histórica v0.2 es por teléfono."});
    const variants=uniqueStrings([phone,`+${phone}`,`whatsapp:+${phone}`,`whatsapp:${phone}`]).slice(0,10);
    const snap=await inboxDb.collection("conversations").where("waFrom","in",variants).limit(50).get();
    return res.json({ok:true,items:snap.docs.map(summary),readsEstimate:snap.size,scope:"phone-index"});
  }catch(e){ console.error("inbox search",e); return res.status(500).json({ok:false,error:e.message}); }
});

router.get("/conversations/:id",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);if(!id)return res.status(400).json({ok:false,error:"Conversación inválida"});
    const snap=await inboxDb.collection("conversations").doc(id).get();if(!snap.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"});
    return res.json({ok:true,item:summary(snap),readsEstimate:1});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/conversations/:id/crm-summary",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);if(!id)return res.status(400).json({ok:false,error:"Conversación inválida"});
    const convo=await inboxDb.collection("conversations").doc(id).get();if(!convo.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"});
    const c=convo.data()||{};let reads=1,deal=null,contact=null;
    const dealId=cleanString(c.dealId,220),contactId=cleanString(c.contactId,220);
    if(dealId){const d=await crmDb.collection("deals").doc(dealId).get();reads++;if(d.exists){const x=d.data()||{};deal={id:d.id,title:x.title||x.name||"",stage:x.stage||"",owner:x.owner||"",dealType:x.dealType||"",leadQuality:x.leadQuality||"",value:Number(x.value||0),dueDate:iso(x.dueDate),notes:x.notes||"",contactId:x.contactId||contactId,files:Array.isArray(x.files)?x.files.map(f=>({id:f?.id||"",name:f?.name||f?.filename||"",mimeType:f?.mimeType||f?.contentType||""})):[]};}}
    const resolvedContactId=cleanString(deal?.contactId||contactId,220);
    if(resolvedContactId){const d=await crmDb.collection("contacts").doc(resolvedContactId).get();reads++;if(d.exists){const x=d.data()||{};contact={id:d.id,name:x.name||x.fullName||c.contactName||"",company:x.company||x.companyName||c.companyName||"",phone:x.phone||c.waFrom||"",email:x.email||"",owner:x.owner||deal?.owner||c.ownerEmail||"",city:x.city||x.location||""};}}
    return res.json({ok:true,deal,contact,stages:PIPELINE_STAGES,readsEstimate:reads});
  }catch(e){console.error("inbox crm-summary",e);return res.status(500).json({ok:false,error:e.message});}
});


function normalizedOwner(v){ return String(v||"").trim().toLowerCase(); }
async function chooseOwner(user, requested, fallback){
  const owner=normalizedOwner(requested||fallback||user?.email||"");
  if(!owner) return "";
  if(!(await canSeeOwner(user,owner)) && !isAdminLike(user)){ const e=new Error("No podés asignar ese owner"); e.status=403; throw e; }
  return owner;
}
router.post("/conversations/:id/contact",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const ref=inboxDb.collection("conversations").doc(id); const snap=await ref.get();
    if(!snap.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"}); const c=snap.data()||{};
    if(c.contactId)return res.json({ok:true,contactId:String(c.contactId),existing:true,readsEstimate:1,writesEstimate:0});
    const owner=await chooseOwner(req.authUser,req.body?.owner,c.ownerEmail); const contactRef=crmDb.collection("contacts").doc(); const now=FieldValue.serverTimestamp();
    const data={name:cleanString(req.body?.name||c.contactName||c.profileName||c.waFrom,180),phone:cleanString(req.body?.phone||c.waFrom,80),company:cleanString(req.body?.company||c.companyName,180),email:cleanString(req.body?.email,180).toLowerCase(),owner,source:"MRAPI_HUB",hubConversationId:id,createdAt:now,updatedAt:now};
    await contactRef.set(data);
    await ref.set({contactId:contactRef.id,ownerEmail:owner,crmLinked:true,isAssigned:Boolean(owner),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return res.json({ok:true,contactId:contactRef.id,readsEstimate:1,writesEstimate:2});
  }catch(e){return res.status(e.status||500).json({ok:false,error:e.message});}
});
router.post("/conversations/:id/deal",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const ref=inboxDb.collection("conversations").doc(id); const snap=await ref.get();
    if(!snap.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"}); const c=snap.data()||{};
    if(c.dealId)return res.json({ok:true,dealId:String(c.dealId),contactId:String(c.contactId||""),existing:true,readsEstimate:1,writesEstimate:0});
    const owner=await chooseOwner(req.authUser,req.body?.owner,c.ownerEmail); const now=FieldValue.serverTimestamp(); let contactId=cleanString(c.contactId,220); let contactRef=null; let writes=0;
    if(!contactId){contactRef=crmDb.collection("contacts").doc();contactId=contactRef.id;}
    const dealRef=crmDb.collection("deals").doc(); const stage=PIPELINE_STAGES.includes(req.body?.stage)?req.body.stage:"Nuevos Prospectos";
    const dealData={title:cleanString(req.body?.title||c.contactName||c.companyName||c.waFrom||"Nuevo trato",180),contactId,owner,stage,dealType:"",leadQuality:"",value:0,notes:"",hubConversationId:id,createdAt:now,updatedAt:now};
    if(contactRef){await contactRef.set({name:cleanString(req.body?.name||c.contactName||c.profileName||c.waFrom,180),phone:cleanString(c.waFrom,80),company:cleanString(c.companyName,180),email:"",owner,source:"MRAPI_HUB",hubConversationId:id,createdAt:now,updatedAt:now});writes++;}
    await dealRef.set(dealData);writes++;
    await ref.set({contactId,dealId:dealRef.id,ownerEmail:owner,stage,crmLinked:true,isAssigned:Boolean(owner),updatedAt:FieldValue.serverTimestamp()},{merge:true});writes++;
    return res.json({ok:true,dealId:dealRef.id,contactId,readsEstimate:1,writesEstimate:writes});
  }catch(e){return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.get("/conversations/:id/lines",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const selected=await inboxDb.collection("conversations").doc(id).get();
    if(!selected.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"});
    const c=selected.data()||{}; const waFrom=String(c.waFrom||""); if(!waFrom)return res.json({ok:true,items:[],readsEstimate:1});
    const snap=await inboxDb.collection("conversations").where("waFrom","==",waFrom).limit(20).get();
    const linked=new Set(uniqueStrings(c.duplicateConversationIds||[])); linked.add(id);
    const items=snap.docs.map(d=>{const x=d.data()||{};return {conversationId:d.id,lineId:x.inboundTo||x.lineId||"",lastMessageAt:iso(x.lastMessageAt||x.updatedAt),linked:linked.has(d.id),current:d.id===id,preferred:String(c.preferredLineId||"")===(x.inboundTo||x.lineId||"")};}).filter(x=>x.lineId);
    return res.json({ok:true,items,preferredLineId:c.preferredLineId||c.inboundTo||c.lineId||"",readsEstimate:1+snap.size});
  }catch(e){console.error("conversation lines",e);return res.status(500).json({ok:false,error:e.message});}
});
router.post("/conversations/:id/lines/link-all",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const selected=await inboxDb.collection("conversations").doc(id).get();
    if(!selected.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"}); const c=selected.data()||{}; const waFrom=String(c.waFrom||"");
    const snap=await inboxDb.collection("conversations").where("waFrom","==",waFrom).limit(20).get(); const ids=snap.docs.map(d=>d.id); const lines=uniqueStrings(snap.docs.map(d=>{const x=d.data()||{};return x.inboundTo||x.lineId||"";}));
    const batch=inboxDb.batch(); snap.docs.forEach(d=>batch.set(d.ref,{duplicateConversationIds:ids.filter(x=>x!==d.id),linkedLineIds:lines,updatedAt:FieldValue.serverTimestamp()},{merge:true})); await batch.commit();
    return res.json({ok:true,conversationIds:ids,linkedLineIds:lines,readsEstimate:1+snap.size,writesEstimate:snap.size});
  }catch(e){console.error("link all lines",e);return res.status(500).json({ok:false,error:e.message});}
});
router.post("/conversations/:id/lines/preferred",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const lineId=wa.ensureWhatsappPrefix(cleanString(req.body?.lineId,120));
    const selected=await inboxDb.collection("conversations").doc(id).get(); if(!selected.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"});
    const c=selected.data()||{}; const snap=await inboxDb.collection("conversations").where("waFrom","==",String(c.waFrom||"")).limit(20).get();
    const valid=snap.docs.some(d=>{const x=d.data()||{};return wa.ensureWhatsappPrefix(x.inboundTo||x.lineId||"")===lineId;}); if(!valid)return res.status(400).json({ok:false,error:"La línea no pertenece a este contacto"});
    await selected.ref.set({preferredLineId:lineId,updatedAt:FieldValue.serverTimestamp()},{merge:true}); return res.json({ok:true,preferredLineId:lineId,readsEstimate:1+snap.size,writesEstimate:1});
  }catch(e){console.error("preferred line",e);return res.status(500).json({ok:false,error:e.message});}
});
router.get("/conversations/:id/messages/:messageId/media/:index",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220), messageId=cleanString(decodeURIComponent(req.params.messageId||""),180), index=Math.max(0,Math.min(Number(req.params.index||0)||0,9));
    const result=await materializeMedia(id,messageId,index); return res.json({ok:true,url:result.url,media:{filename:result.item.filename||"",contentType:result.item.contentType||""},readsEstimate:result.reads,writesEstimate:result.writes});
  }catch(e){console.error("resolve media",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});
router.get("/conversations/:id/messages/:messageId/media/:index/download",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220), messageId=cleanString(decodeURIComponent(req.params.messageId||""),180), index=Math.max(0,Math.min(Number(req.params.index||0)||0,9));
    const result=await materializeMedia(id,messageId,index);
    if(!result.item?.gcsPath || !config.filesBucket) return res.redirect(result.url);
    const filename=String(result.item.filename||`archivo${mediaExtension(result.item.contentType)}`).replace(/[\r\n\"]/g,"_");
    res.setHeader("Content-Type",result.item.contentType||"application/octet-stream");
    res.setHeader("Content-Disposition",`attachment; filename="${filename}"`);
    res.setHeader("Cache-Control","private, max-age=60");
    const stream=storage.bucket(config.filesBucket).file(result.item.gcsPath).createReadStream();
    stream.on("error",err=>{console.error("download media stream",err);if(!res.headersSent)res.status(500).end("No se pudo descargar el archivo");else res.destroy(err)});
    stream.pipe(res);
  }catch(e){console.error("download media",e);return res.status(e.status||500).send(e.message||"No se pudo descargar el archivo");}
});

router.get("/conversations/:id/messages",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);
    if(!id) return res.status(400).json({ok:false,error:"Conversación inválida"});
    const requested=Math.max(20,Math.min(Number(req.query.limit||60),100));
    const related=uniqueStrings([id, ...(Array.isArray(req.query.relatedIds) ? req.query.relatedIds : String(req.query.relatedIds||"").split(","))]).slice(0,10);
    const all=[]; let reads=0;
    for(const conversationId of related){
      const snap=await inboxDb.collection("conversations").doc(conversationId).collection("messages").orderBy("timestamp","desc").limit(requested).get();
      reads += snap.size;
      for(const d of snap.docs) all.push(message(d,conversationId));
    }
    const seen=new Set();
    const dedup=all.filter(m=>{ const k=m.messageSid || `${m.conversationId}:${m.id}`; if(seen.has(k))return false; seen.add(k); return true; });
    dedup.sort((a,b)=>String(a.timestamp||"").localeCompare(String(b.timestamp||"")));
    return res.json({ok:true,items:dedup,readsEstimate:reads,relatedConversations:related.length});
  }catch(e){ console.error("inbox messages",e); return res.status(500).json({ok:false,error:e.message}); }
});


router.get("/conversations/:id/messages/changes",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);
    const sinceRaw=cleanString(req.query.since,80); const sinceDate=new Date(sinceRaw);
    if(!id) return res.status(400).json({ok:false,error:"Conversación inválida"});
    if(!sinceRaw || Number.isNaN(sinceDate.getTime())) return res.status(400).json({ok:false,error:"Checkpoint inválido"});
    const snap=await inboxDb.collection("conversations").doc(id).collection("messages")
      .where("timestamp",">=",sinceDate).orderBy("timestamp","asc").limit(100).get();
    return res.json({ok:true,items:snap.docs.map(d=>message(d,id)),readsEstimate:snap.size,serverNow:new Date().toISOString()});
  }catch(e){ console.error("inbox message changes",e); return res.status(500).json({ok:false,error:e.message}); }
});

router.post("/conversations/:id/mode",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);
    const mode=String(req.body?.mode||"").toUpperCase()==="HUMAN" ? "HUMAN" : "BOT";
    await inboxDb.collection("conversations").doc(id).set({mode,modeUpdatedAt:FieldValue.serverTimestamp(),modeUpdatedBy:req.authUser.email||req.authUser.id},{merge:true});
    return res.json({ok:true,mode,writesEstimate:1});
  }catch(e){ console.error("inbox mode",e); return res.status(500).json({ok:false,error:e.message}); }
});

router.post("/conversations/:id/read",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);
    await inboxDb.collection("conversations").doc(id).set({hasUnread:false,unreadCount:0,lastReadAt:FieldValue.serverTimestamp(),lastReadBy:req.authUser.email||req.authUser.id},{merge:true});
    return res.json({ok:true,writesEstimate:1});
  }catch(e){ console.error("inbox read",e); return res.status(500).json({ok:false,error:e.message}); }
});


router.get("/templates",authRequired,async(req,res)=>{
  try{ const templates=await wa.listApprovedTemplates(); return res.json({ok:true,templates,readsEstimate:0}); }
  catch(e){ console.error("templates",e); return res.status(500).json({ok:false,error:e.message}); }
});

router.post("/conversations/:id/send",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const text=cleanString(req.body?.text,4000); if(!text) return res.status(400).json({ok:false,error:"Falta el mensaje"});
    const c=await loadConversationForSend(id); const from=c.data.preferredLineId||c.data.inboundTo||c.data.lineId||wa.defaultFrom; const to=c.data.waFrom; if(!from||!to) return res.status(400).json({ok:false,error:"Falta línea o teléfono del contacto"});
    const sent=await wa.sendText({from,to,body:text,req,conversationId:id});
    await saveOutbound(c.ref,sent.sid,{direction:"OUT",text,source:"human",timestamp:FieldValue.serverTimestamp(),from:wa.ensureWhatsappPrefix(from),to:wa.ensureWhatsappPrefix(to),messageSid:sent.sid,numMedia:0,media:[],deliveryStatus:sent.status||"queued",sentBy:req.authUser.name||req.authUser.email||req.authUser.id,sentByName:req.authUser.name||"",sentByEmail:req.authUser.email||"",sentByUserId:req.authUser.id||"",senderName:req.authUser.name||req.authUser.email||"",senderEmail:req.authUser.email||""});
    await updateAfterSend(c.ref,text,0,sent.status); return res.json({ok:true,sid:sent.sid,status:sent.status||"queued",readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("send",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.post("/conversations/:id/send-file",authRequired,async(req,res)=>{
  try{
    if(!String(req.headers["content-type"]||"").toLowerCase().includes("multipart/form-data")) return res.status(400).json({ok:false,error:"Content-Type inválido"});
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const parsed=await parseSingleUpload(req); if(!parsed.text&&!parsed.file) return res.status(400).json({ok:false,error:"Falta texto o archivo"});
    const c=await loadConversationForSend(id); const from=c.data.preferredLineId||c.data.inboundTo||c.data.lineId||wa.defaultFrom; const to=c.data.waFrom; if(!from||!to) return res.status(400).json({ok:false,error:"Falta línea o teléfono del contacto"});
    const media=parsed.file ? [await uploadOutbound(parsed.file)] : []; const sent=await wa.sendText({from,to,body:parsed.text,mediaUrls:media.map(x=>x.url),req,conversationId:id});
    await saveOutbound(c.ref,sent.sid,{direction:"OUT",text:parsed.text,source:"human",timestamp:FieldValue.serverTimestamp(),from:wa.ensureWhatsappPrefix(from),to:wa.ensureWhatsappPrefix(to),messageSid:sent.sid,numMedia:media.length,media,deliveryStatus:sent.status||"queued",sentBy:req.authUser.name||req.authUser.email||req.authUser.id,sentByName:req.authUser.name||"",sentByEmail:req.authUser.email||"",sentByUserId:req.authUser.id||"",senderName:req.authUser.name||req.authUser.email||"",senderEmail:req.authUser.email||""});
    await updateAfterSend(c.ref,parsed.text,media.length,sent.status); return res.json({ok:true,sid:sent.sid,mediaCount:media.length,readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("send-file",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.post("/conversations/:id/send-template",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const contentSid=cleanString(req.body?.contentSid,100); const contentVariables=req.body?.contentVariables&&typeof req.body.contentVariables==="object"?req.body.contentVariables:{}; if(!contentSid)return res.status(400).json({ok:false,error:"Falta contentSid"});
    const c=await loadConversationForSend(id); const from=c.data.preferredLineId||c.data.inboundTo||c.data.lineId||wa.defaultFrom; const to=c.data.waFrom; if(!from||!to)return res.status(400).json({ok:false,error:"Falta línea o teléfono del contacto"});
    const sent=await wa.sendTemplate({from,to,contentSid,contentVariables,req,conversationId:id}); const text=`Plantilla enviada (${contentSid})`;
    await saveOutbound(c.ref,sent.sid,{direction:"OUT",text,source:"human-template",timestamp:FieldValue.serverTimestamp(),from:wa.ensureWhatsappPrefix(from),to:wa.ensureWhatsappPrefix(to),messageSid:sent.sid,numMedia:0,media:[],template:{contentSid,contentVariables},deliveryStatus:sent.status||"queued",sentBy:req.authUser.name||req.authUser.email||req.authUser.id,sentByName:req.authUser.name||"",sentByEmail:req.authUser.email||"",sentByUserId:req.authUser.id||"",senderName:req.authUser.name||req.authUser.email||"",senderEmail:req.authUser.email||""});
    await updateAfterSend(c.ref,text,0,sent.status); return res.json({ok:true,sid:sent.sid,contentSid,readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("send-template",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.post("/twilio/inbound",async(req,res)=>{
  try{
    const validation=wa.validateInboundWebhook(req);
    if(!validation.ok){
      console.warn("twilio-inbound rejected",validation.reason,validation.url||"");
      return res.status(validation.reason?.includes("no configurado")?503:403).type("text/plain").send(validation.reason||"Webhook inválido");
    }
    const sid=cleanString(req.body?.MessageSid||req.body?.SmsMessageSid,120);
    const from=wa.ensureWhatsappPrefix(cleanString(req.body?.From,120));
    const to=wa.ensureWhatsappPrefix(cleanString(req.body?.To,120));
    const body=cleanString(req.body?.Body,4000);
    const profileName=cleanString(req.body?.ProfileName,220);
    const waId=cleanString(req.body?.WaId,80);
    const media=twilioMedia(req.body||{});
    const referral=referralFromTwilio(req.body||{});
    if(!sid||!from||!to){
      console.warn("twilio-inbound missing fields",{sid:!!sid,from:!!from,to:!!to});
      return twimlEmpty(res);
    }
    const conversationId=deterministicConversationId(from,to);
    const convoRef=inboxDb.collection("conversations").doc(conversationId);
    const msgRef=convoRef.collection("messages").doc(sid);
    let duplicate=false;
    let shouldBot=false;
    await inboxDb.runTransaction(async tx=>{
      const [convoSnap,msgSnap]=await Promise.all([tx.get(convoRef),tx.get(msgRef)]);
      if(msgSnap.exists){ duplicate=true; return; }
      const now=FieldValue.serverTimestamp();
      const msgData={
        direction:"IN",source:"twilio",body,text:body,from,to,timestamp:now,createdAt:now,status:"received",deliveryStatus:"received",
        messageSid:sid,sid,waId,numMedia:media.length,media,profileName,
        sourceChannel:referral.has?"meta_ad":"whatsapp",
        referralCtwaClid:referral.ctwa,referralAdId:referral.sourceId,referralSourceType:referral.sourceType,
        referralHeadline:referral.headline,referralBody:referral.body,referralImageUrl:referral.image,referralSourceUrl:referral.sourceUrl
      };
      tx.set(msgRef,msgData,{merge:false});
      const patch={
        waFrom:from,inboundTo:to,lineId:to,profileName,contactName:convoSnap.exists?undefined:(profileName||wa.cleanWhatsappNumber(from)),
        lastMessageAt:now,lastInboundMessageAt:now,updatedAt:now,lastMessagePreview:preview(body,media.length),lastMessageDirection:"IN",
        hasUnread:true,unreadCount:FieldValue.increment(1),lastDeliveryStatus:"received",sourceChannel:referral.has?"meta_ad":"whatsapp"
      };
      Object.keys(patch).forEach(k=>patch[k]===undefined&&delete patch[k]);
      const currentMode=convoSnap.exists ? normalizeMode((convoSnap.data()||{}).mode) : (dialogflow.configured()?"BOT":"HUMAN");
      shouldBot=currentMode==="BOT";
      if(!convoSnap.exists){
        patch.createdAt=now;patch.mode=currentMode;patch.stage="nuevo";patch.ownerEmail="";patch.isAssigned=false;patch.isLinked=false;
      }
      if(referral.has){
        patch.leadPlatform="meta";patch.referralCtwaClid=referral.ctwa;patch.referralAdId=referral.sourceId;patch.referralSourceType=referral.sourceType;
        patch.referralHeadline=referral.headline;patch.referralBody=referral.body;patch.referralImageUrl=referral.image;patch.referralSourceUrl=referral.sourceUrl;
      }
      tx.set(convoRef,patch,{merge:true});
    });
    let botResult={skipped:true};
    if(!duplicate && shouldBot){
      botResult=await processBotInbound({conversationId,convoRef,from,to,body,inboundSid:sid});
    }
    console.log(JSON.stringify({severity:"INFO",message:"Twilio inbound",tenant:config.tenantId,conversationId,messageSid:sid,duplicate,from,to,numMedia:media.length,referral:referral.has,shouldBot,botOk:botResult?.ok===true,botFallbackHuman:botResult?.fallbackHuman===true}));
    return twimlEmpty(res);
  }catch(e){
    console.error("twilio-inbound",e);
    // Twilio should receive 200 for a handled webhook error only if it was already persisted.
    return res.status(500).type("text/plain").send("Inbound error");
  }
});

router.post("/twilio/status",express.urlencoded({extended:false}),async(req,res)=>{
  try{
    const sid=cleanString(req.body?.MessageSid,100); const status=cleanString(req.body?.MessageStatus,50); const conversationId=cleanString(req.query?.conversationId,220); if(!sid||!conversationId)return res.status(204).end();
    await inboxDb.collection("conversations").doc(conversationId).collection("messages").doc(sid).set({deliveryStatus:status,deliveryUpdatedAt:FieldValue.serverTimestamp()},{merge:true});
    await inboxDb.collection("conversations").doc(conversationId).set({lastDeliveryStatus:status},{merge:true});
    return res.status(204).end();
  }catch(e){console.error("twilio-status",e);return res.status(204).end();}
});

router.post("/conversations/:id/tickets",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);if(!id)return res.status(400).json({ok:false,error:"Conversación inválida"});
    const convo=await inboxDb.collection("conversations").doc(id).get();if(!convo.exists)return res.status(404).json({ok:false,error:"Conversación no encontrada"});
    const c=convo.data()||{}, body=req.body||{};
    const ref=deskDb.collection("tickets").doc();
    const userId=String(req.authUser.id||"");const userName=String(req.authUser.name||req.authUser.email||"");const userEmail=String(req.authUser.email||"").toLowerCase();
    const title=cleanString(body.title||`Seguimiento: ${c.contactName||c.profileName||c.waFrom||"cliente"}`,180);
    if(!title)return res.status(400).json({ok:false,error:"El título es obligatorio"});
    const priority=["low","medium","high","urgent"].includes(String(body.priority||""))?String(body.priority):"medium";
    let dueAt=null;if(body.dueAt){const d=new Date(body.dueAt);if(!Number.isNaN(d.getTime()))dueAt=d;}
    const ticketNumber=`TCK-${new Date().getFullYear()}-${ref.id.slice(0,6).toUpperCase()}`;
    const data={ticketNumber,ticketType:"personal",title,description:cleanString(body.description,3000),status:"open",priority,assignedUserId:userId,assignedUserIds:userId?[userId]:[],assignedUsers:userId?[{id:userId,name:userName,email:userEmail}]:[],assignedUserName:userName,createdByUserId:userId,createdByUserName:userName,dueAt,checklist:[],crmContactId:cleanString(c.contactId,220),crmDealId:cleanString(c.dealId,220),crmDealName:cleanString(body.dealName,220),opsOperationId:"",opsOperationName:"",commentCount:0,fileCount:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),createdFrom:"MRAPI_HUB",hubConversationId:id,hubUrl:`${config.publicBaseUrl||""}/inbox?conversationId=${encodeURIComponent(id)}`,hubCustomerName:cleanString(c.contactName||c.profileName,220),hubPhone:cleanString(c.waFrom,80),hubStage:cleanString(body.stage||c.stage||c.dealStage,120)};
    await ref.set(data);
    await ref.collection("events").add({type:"created",text:"Ticket creado desde MR API HUB",userId,userName,createdAt:FieldValue.serverTimestamp()});
    return res.json({ok:true,ticketId:ref.id,ticketNumber,deskUrl:`${config.deskBaseUrl}/?ticketId=${encodeURIComponent(ref.id)}`,readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("create hub ticket",e);return res.status(500).json({ok:false,error:e.message||"Error creando ticket"});}
});

module.exports=router;
