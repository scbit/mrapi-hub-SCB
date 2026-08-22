"use strict";
const express = require("express");
const Busboy = require("busboy");
const crypto = require("crypto");
const axios = require("axios");
const config = require("../../core/config");
const { crmDb, inboxDb, admin, storage } = require("../../core/google");
const wa = require("./whatsapp");
const { authRequired } = require("../../middleware/auth");
const { visibleOwners, isAdminLike } = require("../crm/access");
const { PIPELINE_STAGES } = require("../crm/constants");
const router = express.Router();
const FieldValue = admin.firestore.FieldValue;

function iso(v) {
  try { return v?.toDate ? v.toDate().toISOString() : (v instanceof Date ? v.toISOString() : v || null); }
  catch { return null; }
}
function digits(v){ return String(v || "").replace(/\D/g, ""); }
function cleanString(v, max=500){ return String(v || "").trim().slice(0,max); }
function uniqueStrings(values){ return [...new Set((values || []).map(v=>cleanString(v,220)).filter(Boolean))]; }
function normLower(v){ return cleanString(v,220).toLowerCase(); }
function ownerValues(d){
  return uniqueStrings([d.ownerEmail,d.owner,d.assignedOwner,d.assignedOwnerEmail].map(normLower));
}
function summary(doc){
  const d = doc.data() || {};
  const owners=ownerValues(d);
  return {
    id: doc.id,
    contactId: d.contactId || "",
    dealId: d.dealId || "",
    hasDeal: d.hasDeal === true || !!d.dealId,
    contactName: d.contactName || d.profileName || d.name || "",
    companyName: d.companyName || "",
    waFrom: d.waFrom || "",
    inboundTo: d.inboundTo || "",
    lineId: d.lineId || d.inboundTo || "",
    ownerEmail: d.ownerEmail || d.owner || d.assignedOwnerEmail || d.assignedOwner || "",
    ownerAliases: owners,
    stage: d.stage || d.dealStage || "nuevo",
    mode: String(d.mode || "BOT").toUpperCase() === "HUMAN" ? "HUMAN" : "BOT",
    lastMessage: d.lastMessagePreview || d.lastMessage || d.lastMessageText || "",
    lastMessageAt: iso(d.lastMessageAt || d.updatedAt),
    unreadCount: Number(d.unreadCount || 0),
    hasUnread: d.hasUnread === true || Number(d.unreadCount || 0) > 0,
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
function normalizeMediaItem(item, index){
  if(!item || typeof item !== "object") return null;
  const url=cleanString(item.url || item.mediaUrl || item.downloadUrl || item.publicUrl || item.signedUrl || item.path,2000);
  const contentType=cleanString(item.contentType || item.mimeType || item.mediaContentType || item.type,160);
  const rawName=cleanString(item.filename || item.mediaName || item.name || item.originalname,180);
  if(!url && !contentType && !rawName) return null;
  const filename=rawName || (contentType ? `adjunto-${index+1}` : "archivo");
  return {url,contentType,filename,source:cleanString(item.source,60),index};
}
function mediaFromMessageData(d){
  const items=[];
  if(Array.isArray(d.media)) d.media.forEach((m,i)=>{ const item=normalizeMediaItem(m,i); if(item) items.push(item); });
  if(!items.length && Array.isArray(d.mediaUrls)) d.mediaUrls.forEach((url,i)=>{ const item=normalizeMediaItem({url,source:d.source},i); if(item) items.push(item); });
  const n=Math.max(Number(d.numMedia || d.NumMedia || 0),0);
  for(let i=0;i<n;i++){
    const url=d[`MediaUrl${i}`] || d[`mediaUrl${i}`] || (i===0 ? (d.mediaUrl || d.MediaUrl) : "");
    const contentType=d[`MediaContentType${i}`] || d[`mediaContentType${i}`] || d.mediaContentType || d.contentType || "";
    const item=normalizeMediaItem({url,contentType,source:d.source},i);
    if(item && !items.some(x=>x.url && x.url===item.url)) items.push(item);
  }
  if(!items.length && (d.mediaUrl || d.downloadUrl || d.publicUrl || d.signedUrl)){
    const item=normalizeMediaItem(d,0); if(item) items.push(item);
  }
  return items;
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
    sentBy: d.sentBy || d.sentByName || d.sentByEmail || d.senderName || d.senderEmail || "",
    sentByName: d.sentByName || d.senderName || d.sentBy || "",
    sentByEmail: d.sentByEmail || d.senderEmail || d.sentBy || "",
    sentByUserId: d.sentByUserId || "",
    messageSid: d.messageSid || d.sid || "",
    media: mediaFromMessageData(d),
    template: d.template || null,
    referralCtwaClid: d.referralCtwaClid || d.payload?.referralCtwaClid || "",
    referralAdId: d.referralAdId || d.payload?.referralAdId || d.leadAd?.adId || "",
    referralSourceType: d.referralSourceType || d.payload?.referralSourceType || "",
    referralHeadline: d.referralHeadline || d.payload?.referralHeadline || d.leadAd?.headline || "",
    referralBody: d.referralBody || d.payload?.referralBody || d.leadAd?.body || "",
    referralImageUrl: d.referralImageUrl || d.payload?.referralImageUrl || d.leadAd?.imageUrl || "",
    campaignName: d.campaignName || d.leadAd?.campaignName || "",
    adsetName: d.adsetName || d.leadAd?.adsetName || "",
    sourceChannel: d.sourceChannel || d.payload?.sourceChannel || ""
  };
}

function isSafeRemoteMediaUrl(raw){
  try{
    const u=new URL(String(raw||""));
    if(u.protocol!=="https:") return false;
    const host=u.hostname.toLowerCase();
    if(host==="localhost" || host==="127.0.0.1" || host==="0.0.0.0" || host==="::1") return false;
    if(host.endsWith(".local")) return false;
    return true;
  }catch{return false;}
}
function contentDisposition(filename, download){
  const safe=String(filename||"archivo").replace(/[\r\n"]/g,"").slice(0,160) || "archivo";
  return `${download ? "attachment" : "inline"}; filename="${safe}"`;
}
function twilioAuthFor(url, source){
  const host=(()=>{try{return new URL(url).hostname.toLowerCase();}catch{return "";}})();
  const looksTwilio=String(source||"").toLowerCase().includes("twilio") || host.endsWith("twilio.com");
  return looksTwilio && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? {username:process.env.TWILIO_ACCOUNT_SID,password:process.env.TWILIO_AUTH_TOKEN}
    : undefined;
}


function normalizeMode(v){ return String(v||"BOT").toUpperCase()==="HUMAN" ? "HUMAN" : "BOT"; }
function preview(text, mediaCount=0){ const t=cleanString(text,160).replace(/\s+/g," "); return t || (mediaCount ? `Adjunto (${mediaCount})` : ""); }
function cleanOwner(v){ return cleanString(v,180).toLowerCase(); }
function ownerAliases(owner){ const o=cleanOwner(owner); return uniqueStrings([o,o.includes("@")?o.split("@")[0]:""]).slice(0,2); }
function cursorAfter(doc){ return doc?.exists ? doc : null; }
function lineMatches(item,line){
  const wanted=cleanString(line,80).replace(/^whatsapp:/i,"");
  if(!wanted) return true;
  const values=uniqueStrings([item.lineId,item.inboundTo].map(v=>cleanString(v,80).replace(/^whatsapp:/i,"")));
  return values.includes(wanted);
}
function conversationMatches(item,filters){
  const ownerSet=filters.ownerSet || new Set();
  if(ownerSet.size){
    const values=uniqueStrings([item.ownerEmail,...(item.ownerAliases||[])].map(normLower));
    if(!values.some(v=>ownerSet.has(v))) return false;
  }
  if(!lineMatches(item,filters.line)) return false;
  if(filters.stage && String(item.stage||"")!==filters.stage) return false;
  if(filters.mode && item.mode!==filters.mode) return false;
  if(filters.flag==="unread" && !item.hasUnread) return false;
  if(filters.flag==="ads" && String(item.sourceChannel||"").toLowerCase()!=="meta_ad") return false;
  if(filters.flag==="nuevo" && (item.contactId || item.dealId || item.hasDeal)) return false;
  return true;
}
async function loadOrderedFilteredConversations({limit,cursor,filters}){
  const batchSize=75;
  const maxReads=300;
  const items=[];
  let cursorRead=0;
  let reads=0;
  let lastDoc=null;
  let processedAll=false;
  let scannedCursor=cursor;
  if(cursor){
    const c=await inboxDb.collection("conversations").doc(cursor).get();
    cursorRead=1;
    const after=cursorAfter(c);
    if(after) lastDoc=after;
  }
  while(items.length<limit && reads<maxReads){
    const remaining=Math.max(1,Math.min(batchSize,maxReads-reads));
    let q=inboxDb.collection("conversations").orderBy("lastMessageAt","desc").limit(remaining);
    if(lastDoc) q=q.startAfter(lastDoc);
    const snap=await q.get();
    reads += snap.size;
    if(snap.empty){ processedAll=true; break; }
    lastDoc=snap.docs[snap.docs.length-1];
    scannedCursor=lastDoc.id;
    if(snap.size<remaining) processedAll=true;
    for(const doc of snap.docs){
      const item=summary(doc);
      if(conversationMatches(item,filters)) items.push(item);
      if(items.length>=limit) break;
    }
    if(processedAll) break;
  }
  return {
    items,
    nextCursor: scannedCursor || null,
    hasMore: !processedAll,
    readsEstimate: reads + cursorRead,
    source: "ordered-filter-scan",
    scanLimit: maxReads
  };
}
async function saveOutbound(convoRef, sid, payload){ await convoRef.collection("messages").doc(String(sid)).set(payload,{merge:true}); }
function actorFields(user){
  const email=cleanString(user?.email,180).toLowerCase();
  const name=cleanString(user?.name,180);
  const id=cleanString(user?.id,120);
  return {sentBy:name||email||id,sentByName:name||email||id,sentByEmail:email,sentByUserId:id};
}
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
router.get("/conversations", authRequired, async(req,res)=>{
  try{
    const requested=Number(req.query.limit||config.inboxPageSize);
    const limit=Math.max(10,Math.min(requested,config.inboxMaxPageSize));
    const owner=cleanOwner(req.query.owner);
    const line=cleanString(req.query.line,80).replace(/^whatsapp:/i,"");
    const stage=cleanString(req.query.stage,80);
    const mode=String(req.query.mode||"").toUpperCase();
    const flag=cleanString(req.query.flag,40).toLowerCase();
    const visible=await visibleOwners(req.authUser);
    const aliases=ownerAliases(owner);
    if(owner && visible!==null && !visible.includes(owner))return res.status(403).json({ok:false,error:"Vendedor fuera de tus permisos"});
    const effectiveOwner=flag==="nuevo" ? "" : owner;
    const effectiveAliases=ownerAliases(effectiveOwner);
    let ownerSet=new Set(effectiveAliases);
    if(!effectiveOwner && flag!=="nuevo" && Array.isArray(visible)&&visible.length===1)ownerSet=new Set(ownerAliases(visible[0]));
    else if(!effectiveOwner && flag!=="nuevo" && Array.isArray(visible)&&visible.length>1&&visible.length<=5)ownerSet=new Set(uniqueStrings(visible.flatMap(ownerAliases)).slice(0,10));
    else if(Array.isArray(visible)&&visible.length>5)return res.status(400).json({ok:false,error:"Seleccioná un vendedor para listar la bandeja"});
    const hasFilters=!!(effectiveOwner||ownerSet.size||line||stage||mode||flag);
    if(hasFilters){
      const filtered=await loadOrderedFilteredConversations({limit,cursor:cleanString(req.query.cursor,220),filters:{ownerSet,line,stage,mode:mode==="BOT"||mode==="HUMAN"?mode:"",flag}});
      return res.json({ok:true,items:filtered.items,nextCursor:filtered.nextCursor,hasMore:filtered.hasMore,readsEstimate:filtered.readsEstimate,scope:{owner:effectiveOwner,line,stage,mode,flag,source:filtered.source,scanLimit:filtered.scanLimit}});
    }
    let q=inboxDb.collection("conversations");
    if(line)q=q.where("lineId","==",line);
    if(stage)q=q.where("stage","==",stage);
    if(mode==="BOT"||mode==="HUMAN")q=q.where("mode","==",mode);
    if(flag==="unread")q=q.where("hasUnread","==",true);
    if(flag==="ads")q=q.where("sourceChannel","==","meta_ad");
    q=q.orderBy("lastMessageAt","desc");
    q=q.limit(limit);
    const cursor=cleanString(req.query.cursor,220);
    let cursorRead=0;
    if(cursor){
      const c=await inboxDb.collection("conversations").doc(cursor).get(); cursorRead=1;
      const after=cursorAfter(c);
      if(after) q=q.startAfter(after);
    }
    const snap=await q.get();
    const items=snap.docs.map(summary).sort((a,b)=>String(b.lastMessageAt||"").localeCompare(String(a.lastMessageAt||"")));
    const last=snap.docs[snap.docs.length-1];
    return res.json({ok:true,items,nextCursor:last?.id||null,hasMore:snap.size===limit,readsEstimate:snap.size+cursorRead,scope:{owner,line,stage,mode,flag}});
  }catch(e){ console.error("inbox list",e); const msg=/index/i.test(String(e.message||""))?"Firestore requiere un índice para este filtro. No se hizo fallback masivo.":e.message; return res.status(500).json({ok:false,error:msg}); }
});

router.get("/filters",authRequired,async(req,res)=>{
  try{
    const owners=await visibleOwners(req.authUser);
    let ownerOptions=[]; let reads=0;
    if(isAdminLike(req.authUser)){
      const s=await crmDb.collection("users").orderBy("name","asc").limit(250).get(); reads+=s.size;
      ownerOptions=s.docs.map(d=>({id:d.id,name:(d.data()||{}).name||"",email:String((d.data()||{}).email||"").toLowerCase(),role:(d.data()||{}).role||""})).filter(x=>x.email);
    }else if(Array.isArray(owners)) ownerOptions=owners.map(email=>({email,name:email}));
    return res.json({ok:true,owners:ownerOptions,stages:PIPELINE_STAGES,readsEstimate:reads});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
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

router.get("/conversations/:id/messages",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);
    if(!id) return res.status(400).json({ok:false,error:"Conversación inválida"});
    const requested=Math.max(20,Math.min(Number(req.query.limit||60),100));
    const related=uniqueStrings([id, ...(Array.isArray(req.query.relatedIds) ? req.query.relatedIds : String(req.query.relatedIds||"").split(","))]).slice(0,4);
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

router.get("/conversations/:id/messages/:messageId/media/:index",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220);
    const messageId=cleanString(decodeURIComponent(req.params.messageId||""),220);
    const mediaIndex=Number(req.params.index||0);
    if(!id || !messageId) return res.status(400).send("Mensaje inválido");
    if(!Number.isInteger(mediaIndex) || mediaIndex<0 || mediaIndex>20) return res.status(400).send("Índice de media inválido");

    const msgSnap=await inboxDb.collection("conversations").doc(id).collection("messages").doc(messageId).get();
    if(!msgSnap.exists) return res.status(404).send("Mensaje no encontrado");

    const media=mediaFromMessageData(msgSnap.data()||{});
    const item=media[mediaIndex];
    if(!item || !item.url) return res.status(404).send("Adjunto no encontrado");
    if(!isSafeRemoteMediaUrl(item.url)) return res.status(400).send("URL de adjunto inválida");

    const r=await axios.get(item.url,{
      auth:twilioAuthFor(item.url,item.source),
      responseType:"arraybuffer",
      timeout:45000,
      maxRedirects:3,
      validateStatus:()=>true
    });
    if(r.status<200 || r.status>=300) return res.status(r.status||502).send("No se pudo leer adjunto");

    const contentType=item.contentType || r.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type",contentType);
    res.setHeader("Cache-Control","private, max-age=300");
    res.setHeader("Content-Disposition",contentDisposition(item.filename, String(req.query.download||"")==="1"));
    return res.send(Buffer.from(r.data));
  }catch(e){ console.error("inbox media",e); return res.status(500).send("Error obteniendo adjunto"); }
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
    await inboxDb.collection("conversations").doc(id).set({unreadCount:0,lastReadAt:FieldValue.serverTimestamp(),lastReadBy:req.authUser.email||req.authUser.id},{merge:true});
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
    const c=await loadConversationForSend(id); const from=c.data.inboundTo||c.data.lineId||wa.defaultFrom; const to=c.data.waFrom; if(!from||!to) return res.status(400).json({ok:false,error:"Falta línea o teléfono del contacto"});
    const sent=await wa.sendText({from,to,body:text,req,conversationId:id});
    await saveOutbound(c.ref,sent.sid,{direction:"OUT",text,source:"human",timestamp:FieldValue.serverTimestamp(),from:wa.ensureWhatsappPrefix(from),to:wa.ensureWhatsappPrefix(to),messageSid:sent.sid,numMedia:0,media:[],deliveryStatus:sent.status||"queued",...actorFields(req.authUser)});
    await updateAfterSend(c.ref,text,0,sent.status); return res.json({ok:true,sid:sent.sid,status:sent.status||"queued",readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("send",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.post("/conversations/:id/send-file",authRequired,async(req,res)=>{
  try{
    if(!String(req.headers["content-type"]||"").toLowerCase().includes("multipart/form-data")) return res.status(400).json({ok:false,error:"Content-Type inválido"});
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const parsed=await parseSingleUpload(req); if(!parsed.text&&!parsed.file) return res.status(400).json({ok:false,error:"Falta texto o archivo"});
    const c=await loadConversationForSend(id); const from=c.data.inboundTo||c.data.lineId||wa.defaultFrom; const to=c.data.waFrom; if(!from||!to) return res.status(400).json({ok:false,error:"Falta línea o teléfono del contacto"});
    const media=parsed.file ? [await uploadOutbound(parsed.file)] : []; const sent=await wa.sendText({from,to,body:parsed.text,mediaUrls:media.map(x=>x.url),req,conversationId:id});
    await saveOutbound(c.ref,sent.sid,{direction:"OUT",text:parsed.text,source:"human",timestamp:FieldValue.serverTimestamp(),from:wa.ensureWhatsappPrefix(from),to:wa.ensureWhatsappPrefix(to),messageSid:sent.sid,numMedia:media.length,media,deliveryStatus:sent.status||"queued",...actorFields(req.authUser)});
    await updateAfterSend(c.ref,parsed.text,media.length,sent.status); return res.json({ok:true,sid:sent.sid,mediaCount:media.length,readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("send-file",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.post("/conversations/:id/send-template",authRequired,async(req,res)=>{
  try{
    const id=cleanString(decodeURIComponent(req.params.id||""),220); const contentSid=cleanString(req.body?.contentSid,100); const contentVariables=req.body?.contentVariables&&typeof req.body.contentVariables==="object"?req.body.contentVariables:{}; if(!contentSid)return res.status(400).json({ok:false,error:"Falta contentSid"});
    const c=await loadConversationForSend(id); const from=c.data.inboundTo||c.data.lineId||wa.defaultFrom; const to=c.data.waFrom; if(!from||!to)return res.status(400).json({ok:false,error:"Falta línea o teléfono del contacto"});
    const sent=await wa.sendTemplate({from,to,contentSid,contentVariables,req,conversationId:id}); const text=`Plantilla enviada (${contentSid})`;
    await saveOutbound(c.ref,sent.sid,{direction:"OUT",text,source:"human-template",timestamp:FieldValue.serverTimestamp(),from:wa.ensureWhatsappPrefix(from),to:wa.ensureWhatsappPrefix(to),messageSid:sent.sid,numMedia:0,media:[],template:{contentSid,contentVariables},deliveryStatus:sent.status||"queued",...actorFields(req.authUser)});
    await updateAfterSend(c.ref,text,0,sent.status); return res.json({ok:true,sid:sent.sid,contentSid,readsEstimate:1,writesEstimate:2});
  }catch(e){console.error("send-template",e);return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.post("/twilio/status",express.urlencoded({extended:false}),async(req,res)=>{
  try{
    const sid=cleanString(req.body?.MessageSid,100); const status=cleanString(req.body?.MessageStatus,50); const conversationId=cleanString(req.query?.conversationId,220); if(!sid||!conversationId)return res.status(204).end();
    await inboxDb.collection("conversations").doc(conversationId).collection("messages").doc(sid).set({deliveryStatus:status,deliveryUpdatedAt:FieldValue.serverTimestamp()},{merge:true});
    await inboxDb.collection("conversations").doc(conversationId).set({lastDeliveryStatus:status},{merge:true});
    return res.status(204).end();
  }catch(e){console.error("twilio-status",e);return res.status(204).end();}
});

module.exports=router;
