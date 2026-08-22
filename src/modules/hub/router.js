"use strict";
const express=require("express");
const {admin,crmDb,inboxDb}=require("../../core/google");
const {getTenant}=require("../../core/tenant");
const {authRequired}=require("../../middleware/auth");
const {PIPELINE_STAGES}=require("../crm/constants");
const {canSeeOwner,canEditOwner}=require("../crm/access");
const router=express.Router();
const FieldValue=admin.firestore.FieldValue;

function clean(v,max=500){return String(v||"").trim().slice(0,max);}
function phone(v){return clean(v,80).replace(/^whatsapp:/i,"").replace(/[^\d+]/g,"").replace(/^\+/,"");}
function iso(v){try{return v?.toDate?v.toDate().toISOString():(v instanceof Date?v.toISOString():(v||null));}catch{return null;}}
function money(v){const n=Number(v||0);return Number.isFinite(n)?n:0;}
function publicDoc(doc){const d=doc.data()||{};return {id:doc.id,...d,createdAt:iso(d.createdAt),updatedAt:iso(d.updatedAt)};}
function splitConversationId(raw){
  const parts=clean(raw,220).replace(/^whatsapp:/i,"").replace(/\+/g,"").split(/__+|[_|]/g).map(phone).filter(Boolean);
  return {customerPhone:parts[0]||phone(raw),lineId:parts[1]||""};
}
function conversationPhone(c){return phone(c?.waFrom||c?.from||c?.phone||c?.customerPhone||c?.contactPhone||splitConversationId(c?.id||"").customerPhone);}
function conversationLine(c){return phone(c?.lineId||c?.inboundTo||c?.to||splitConversationId(c?.id||"").lineId);}
function notePayload(note,user){return {note:clean(note,4000),user:clean(user?.email||user?.name||"hub",140),createdAt:FieldValue.serverTimestamp()};}

async function readConversation(id){
  const conversationId=clean(id,220);
  if(!conversationId)return {conversation:null,reads:0};
  const snap=await inboxDb.collection("conversations").doc(conversationId).get();
  return {conversation:snap.exists?{id:snap.id,...(snap.data()||{})}:null,reads:1};
}
async function readContactById(id,user){
  const contactId=clean(id,160);
  if(!contactId)return {contact:null,reads:0};
  const snap=await crmDb.collection("contacts").doc(contactId).get();
  if(!snap.exists)return {contact:null,reads:1};
  const data=snap.data()||{};
  if(!(await canSeeOwner(user,data.owner)))return {contact:null,forbidden:true,reads:1};
  return {contact:publicDoc(snap),reads:1};
}
async function readContactByPhone(raw,user){
  const cleanPhone=phone(raw);
  if(!cleanPhone)return {contact:null,reads:0};
  let reads=0;
  const indexSnap=await crmDb.collection("contactPhones").doc(cleanPhone).get();reads++;
  if(indexSnap.exists&&indexSnap.data()?.contactId){
    const out=await readContactById(indexSnap.data().contactId,user);
    return {...out,reads:reads+out.reads};
  }
  const variants=Array.from(new Set([cleanPhone,`+${cleanPhone}`,`whatsapp:+${cleanPhone}`,`whatsapp:${cleanPhone}`]));
  const snap=await crmDb.collection("contacts").where("phone","in",variants.slice(0,10)).limit(5).get();reads+=snap.size;
  for(const doc of snap.docs){
    const data=doc.data()||{};
    if(await canSeeOwner(user,data.owner))return {contact:publicDoc(doc),reads};
  }
  return {contact:null,reads};
}
async function readDealById(id,user){
  const dealId=clean(id,160);
  if(!dealId)return {deal:null,reads:0};
  const snap=await crmDb.collection("deals").doc(dealId).get();
  if(!snap.exists)return {deal:null,reads:1};
  const data=snap.data()||{};
  if(!(await canSeeOwner(user,data.owner)))return {deal:null,forbidden:true,reads:1};
  return {deal:publicDoc(snap),reads:1};
}
async function readDealsByContact(contactId,user){
  const cleanContactId=clean(contactId,160);
  if(!cleanContactId)return {deals:[],reads:0};
  const snap=await crmDb.collection("deals").where("contactId","==",cleanContactId).limit(10).get();
  const deals=[];
  for(const doc of snap.docs){
    const data=doc.data()||{};
    if(await canSeeOwner(user,data.owner))deals.push(publicDoc(doc));
  }
  deals.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  return {deals,reads:snap.size};
}
async function readContactNotes(contactId,user){
  const cleanContactId=clean(contactId,160);
  if(!cleanContactId)return {notes:[],reads:0};
  const contact=await readContactById(cleanContactId,user);
  if(!contact.contact)return {notes:[],reads:contact.reads,forbidden:contact.forbidden};
  const snap=await crmDb.collection("contacts").doc(cleanContactId).collection("notes").orderBy("createdAt","desc").limit(10).get();
  return {notes:snap.docs.map(publicDoc),reads:contact.reads+snap.size};
}
async function readContactNotesDirect(contactId){
  const cleanContactId=clean(contactId,160);
  if(!cleanContactId)return {notes:[],reads:0};
  const snap=await crmDb.collection("contacts").doc(cleanContactId).collection("notes").orderBy("createdAt","desc").limit(10).get();
  return {notes:snap.docs.map(publicDoc),reads:snap.size};
}
async function readDealNotes(dealId,user){
  const cleanDealId=clean(dealId,160);
  if(!cleanDealId)return {notes:[],reads:0};
  const deal=await readDealById(cleanDealId,user);
  if(!deal.deal)return {notes:[],reads:deal.reads,forbidden:deal.forbidden};
  const snap=await crmDb.collection("deals").doc(cleanDealId).collection("notes").orderBy("createdAt","desc").limit(10).get();
  return {notes:snap.docs.map(publicDoc),reads:deal.reads+snap.size};
}
async function readDealNotesDirect(dealId){
  const cleanDealId=clean(dealId,160);
  if(!cleanDealId)return {notes:[],reads:0};
  const snap=await crmDb.collection("deals").doc(cleanDealId).collection("notes").orderBy("createdAt","desc").limit(10).get();
  return {notes:snap.docs.map(publicDoc),reads:snap.size};
}
async function readDealActivities(dealId,user){
  const cleanDealId=clean(dealId,160);
  if(!cleanDealId)return {activities:[],reads:0};
  const deal=await readDealById(cleanDealId,user);
  if(!deal.deal)return {activities:[],reads:deal.reads,forbidden:deal.forbidden};
  const snap=await crmDb.collection("deals").doc(cleanDealId).collection("activities").orderBy("createdAt","desc").limit(10).get();
  return {activities:snap.docs.map(publicDoc),reads:deal.reads+snap.size};
}
async function readDealActivitiesDirect(dealId){
  const cleanDealId=clean(dealId,160);
  if(!cleanDealId)return {activities:[],reads:0};
  const snap=await crmDb.collection("deals").doc(cleanDealId).collection("activities").orderBy("createdAt","desc").limit(10).get();
  return {activities:snap.docs.map(publicDoc),reads:snap.size};
}

router.get("/config",authRequired,(req,res)=>{const t=getTenant();res.json({ok:true,tenant:{id:t.id,name:t.name,product:t.product,modules:t.modules,branding:t.branding}});});
router.get("/modules",authRequired,(req,res)=>{const t=getTenant();res.json({ok:true,modules:t.modules});});

router.get("/conversation-context/:id",authRequired,async(req,res)=>{
  try{
    let reads=0;
    const c=await readConversation(req.params.id);reads+=c.reads;
    if(!c.conversation)return res.status(404).json({ok:false,error:"Conversación no encontrada",readsEstimate:reads});
    const conv=c.conversation;
    const cleanPhone=conversationPhone(conv);
    const lineId=conversationLine(conv);
    let contact=null,deal=null,deals=[];
    if(conv.contactId){
      const out=await readContactById(conv.contactId,req.authUser);reads+=out.reads;contact=out.contact;
    }
    if(!contact&&cleanPhone){
      const out=await readContactByPhone(cleanPhone,req.authUser);reads+=out.reads;contact=out.contact;
    }
    if(conv.dealId){
      const out=await readDealById(conv.dealId,req.authUser);reads+=out.reads;deal=out.deal;
    }
    if(!deal&&contact?.id){
      const out=await readDealsByContact(contact.id,req.authUser);reads+=out.reads;deals=out.deals;deal=deals[0]||null;
    }else if(deal){
      deals=[deal];
    }
    let contactNotes=[],dealNotes=[],activities=[];
    if(contact?.id){const out=await readContactNotesDirect(contact.id);reads+=out.reads;contactNotes=out.notes;}
    if(deal?.id){
      const [n,a]=await Promise.all([readDealNotesDirect(deal.id),readDealActivitiesDirect(deal.id)]);
      reads+=n.reads+a.reads;dealNotes=n.notes;activities=a.activities;
    }
    return res.json({ok:true,status:contact?"contact_found":"no_contact",conversation:{id:conv.id,contactId:conv.contactId||"",dealId:conv.dealId||"",contactName:conv.contactName||"",waFrom:conv.waFrom||"",lineId,phone:cleanPhone,ownerEmail:conv.ownerEmail||conv.owner||""},contact,deal,deals,contactNotes,dealNotes,activities,stages:PIPELINE_STAGES,readsEstimate:reads});
  }catch(e){
    console.error("hub context",e);
    const msg=/index/i.test(String(e.message||""))?"Firestore requiere un índice para este contexto. No se hizo fallback masivo.":e.message;
    return res.status(500).json({ok:false,error:msg});
  }
});

router.post("/contacts",authRequired,async(req,res)=>{
  try{
    const name=clean(req.body?.name,120), cleanPhone=phone(req.body?.phone), conversationId=clean(req.body?.conversationId,220), lineId=phone(req.body?.lineId);
    if(!cleanPhone)return res.status(400).json({ok:false,error:"Falta teléfono"});
    let reads=0;
    const existing=await readContactByPhone(cleanPhone,req.authUser);reads+=existing.reads;
    if(existing.contact)return res.json({ok:true,item:existing.contact,existed:true,readsEstimate:reads,writesEstimate:0});
    const owner=clean(req.authUser.email,180).toLowerCase();
    const ref=crmDb.collection("contacts").doc();
    const payload={name,phone:cleanPhone,company:"",email:"",owner,contactStatus:"lead",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
    await ref.set(payload);
    await crmDb.collection("contactPhones").doc(cleanPhone).set({contactId:ref.id,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    let writes=2;
    if(conversationId){
      await inboxDb.collection("conversations").doc(conversationId).set({contactId:ref.id,contactName:name,ownerEmail:owner,owner,customerPhone:cleanPhone,phone:cleanPhone,waFrom:cleanPhone,lineId,inboundTo:lineId,hasDeal:false,isNewUnassigned:true,crmSyncedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      writes++;
    }
    return res.json({ok:true,item:{id:ref.id,...payload,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},readsEstimate:reads,writesEstimate:writes});
  }catch(e){console.error("hub create contact",e);return res.status(500).json({ok:false,error:e.message});}
});

router.post("/deals",authRequired,async(req,res)=>{
  try{
    const contactId=clean(req.body?.contactId,160), conversationId=clean(req.body?.conversationId,220), title=clean(req.body?.title,160)||"Nuevo trato", stage=PIPELINE_STAGES.includes(req.body?.stage)?req.body.stage:"No responde", value=money(req.body?.value), lineId=phone(req.body?.lineId);
    if(!contactId)return res.status(400).json({ok:false,error:"Falta contacto"});
    if(!conversationId)return res.status(400).json({ok:false,error:"Falta conversación"});
    const contact=await readContactById(contactId,req.authUser);
    if(!contact.contact)return res.status(contact.forbidden?403:404).json({ok:false,error:contact.forbidden?"Sin permiso":"Contacto no encontrado",readsEstimate:contact.reads});
    if(!(await canEditOwner(req.authUser,contact.contact.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const owner=clean(contact.contact.owner||req.authUser.email,180).toLowerCase();
    const ref=crmDb.collection("deals").doc();
    const payload={contactId,contactName:contact.contact.name||"",title,value,owner,notes:"",stage,dueDate:"",preferredLineId:lineId,lineId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
    await ref.set(payload);
    await ref.collection("activities").add({type:"deal_created",stage,user:req.authUser.email||req.authUser.name||owner,createdAt:FieldValue.serverTimestamp()});
    await inboxDb.collection("conversations").doc(conversationId).set({contactId,dealId:ref.id,contactName:contact.contact.name||"",dealTitle:title,stage,ownerEmail:owner,owner,hasDeal:true,isNewUnassigned:false,lineId,inboundTo:lineId,crmSyncedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return res.json({ok:true,item:{id:ref.id,...payload,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},readsEstimate:contact.reads,writesEstimate:3});
  }catch(e){console.error("hub create deal",e);return res.status(500).json({ok:false,error:e.message});}
});

router.post("/contacts/:id/notes",authRequired,async(req,res)=>{
  try{
    const contact=await readContactById(req.params.id,req.authUser);
    if(!contact.contact)return res.status(contact.forbidden?403:404).json({ok:false,error:contact.forbidden?"Sin permiso":"Contacto no encontrado",readsEstimate:contact.reads});
    const note=clean(req.body?.note,4000);if(!note)return res.status(400).json({ok:false,error:"Escribí una nota"});
    const ref=await crmDb.collection("contacts").doc(contact.contact.id).collection("notes").add(notePayload(note,req.authUser));
    return res.json({ok:true,noteId:ref.id,readsEstimate:contact.reads,writesEstimate:1});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.post("/deals/:id/notes",authRequired,async(req,res)=>{
  try{
    const deal=await readDealById(req.params.id,req.authUser);
    if(!deal.deal)return res.status(deal.forbidden?403:404).json({ok:false,error:deal.forbidden?"Sin permiso":"Trato no encontrado",readsEstimate:deal.reads});
    if(!(await canEditOwner(req.authUser,deal.deal.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const note=clean(req.body?.note,4000);if(!note)return res.status(400).json({ok:false,error:"Escribí una nota"});
    const ref=crmDb.collection("deals").doc(deal.deal.id);
    const noteRef=await ref.collection("notes").add(notePayload(note,req.authUser));
    await ref.update({notes:note,updatedAt:FieldValue.serverTimestamp()});
    return res.json({ok:true,noteId:noteRef.id,readsEstimate:deal.reads,writesEstimate:2});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

module.exports=router;
