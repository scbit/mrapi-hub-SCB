"use strict";
const express=require("express");
const {admin,crmDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const {visibleOwners,canSeeOwner,canEditOwner,isAdminLike}=require("../crm/access");
const router=express.Router();
router.use(authRequired);

function ts(v){if(!v)return null;if(v.toDate)return v.toDate().toISOString();if(v instanceof Date)return v.toISOString();const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toISOString();}
function dueDateIso(v){if(!v)return"";if(v.toDate)return v.toDate().toISOString().slice(0,10);if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v).trim();const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:"";}
function norm(doc){const d=doc.data()||{};return{id:doc.id,...d,createdAt:ts(d.createdAt),updatedAt:ts(d.updatedAt)};}
function uniq(v=[]){return [...new Set(v.map(x=>String(x||"").trim()).filter(Boolean))];}
function clean(v,n=300){return String(v||"").trim().slice(0,n);}
function publicDeal(doc){const d=norm(doc);return {...d,dueDate:dueDateIso(d.dueDate),notes:String(d.notes||"")};}

async function hydrateOpportunity(doc,req){
  const o=norm(doc);
  const dealIds=uniq(o.dealIds||[]).slice(0,100);
  let reads=0;
  const dealDocs=dealIds.length?await crmDb.getAll(...dealIds.map(id=>crmDb.collection("deals").doc(id))):[];
  reads+=dealDocs.length;
  const deals=[];
  for(const d of dealDocs){
    if(!d.exists)continue;
    const x=d.data()||{};
    if(await canSeeOwner(req.authUser,x.owner))deals.push(publicDeal(d));
  }
  let contact=null;
  const contactId=clean(o.contactId,220);
  if(contactId){
    const c=await crmDb.collection("contacts").doc(contactId).get();reads++;
    if(c.exists && await canSeeOwner(req.authUser,(c.data()||{}).owner))contact=norm(c);
  }
  if(!contact && deals.length){
    const contactIds=uniq(deals.map(d=>d.contactId)).filter(Boolean);
    if(contactIds.length===1){
      const c=await crmDb.collection("contacts").doc(contactIds[0]).get();reads++;
      if(c.exists && await canSeeOwner(req.authUser,(c.data()||{}).owner))contact=norm(c);
    }
  }
  const notes=deals
    .filter(d=>String(d.notes||"").trim())
    .map(d=>({dealId:d.id,title:d.title||d.contactName||"Trato",note:String(d.notes||""),stage:d.stage||"",updatedAt:d.updatedAt||d.createdAt||null}))
    .sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
  let opportunityNotes=[];
  try{
    const ns=await doc.ref.collection("notes").orderBy("createdAt","desc").limit(50).get();reads+=ns.size;
    opportunityNotes=ns.docs.map(n=>{const x=n.data()||{};return{id:n.id,note:String(x.note||""),userEmail:String(x.userEmail||""),userName:String(x.userName||""),userLabel:String(x.userLabel||x.userName||x.userEmail||"Usuario"),createdAt:ts(x.createdAt)};});
  }catch(e){console.warn("opportunity notes",doc.id,e.message||String(e));}
  // Backward compatibility: v1.6.2 stored one mutable note on the opportunity itself.
  if(!opportunityNotes.length&&String(o.notes||"").trim()){
    opportunityNotes.push({id:"legacy",note:String(o.notes),userEmail:String(o.createdBy||""),userName:"",userLabel:String(o.createdBy||"Registro anterior"),createdAt:o.updatedAt||o.createdAt||null,legacy:true});
  }
  const summary={
    dealsCount:deals.length,
    totalValue:deals.reduce((a,d)=>a+Number(d.value||0),0),
    nearestDueDate:deals.map(d=>dueDateIso(d.dueDate)).filter(Boolean).sort()[0]||"",
    notes:notes.slice(0,12),
    opportunityNotes
  };
  return {item:{...o,dealIds:deals.map(d=>d.id),contactId:contact?.id||o.contactId||""},contact,deals,summary,reads};
}

router.get("/meta",async(req,res)=>{
  try{
    const owners=await visibleOwners(req.authUser);
    let ownerOptions=[],reads=0;
    if(isAdminLike(req.authUser)){
      const s=await crmDb.collection("users").orderBy("name","asc").limit(250).get();reads+=s.size;
      ownerOptions=s.docs.map(d=>({id:d.id,name:(d.data()||{}).name||"",email:String((d.data()||{}).email||"").toLowerCase(),role:(d.data()||{}).role||""})).filter(x=>x.email);
    }else if(Array.isArray(owners)) ownerOptions=owners.map(email=>({email,name:email}));
    return res.json({ok:true,owners:ownerOptions,readsEstimate:reads});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

router.get("/",async(req,res)=>{
  try{
    const owner=clean(req.query.owner,220).toLowerCase();
    const q=clean(req.query.q,180).toLocaleLowerCase("es");
    const visible=await visibleOwners(req.authUser);
    if(owner&&visible!==null&&!visible.includes(owner))return res.status(403).json({ok:false,error:"Owner fuera de tus permisos"});
    let query=crmDb.collection("opportunities");
    if(owner)query=query.where("owner","==",owner);
    else if(Array.isArray(visible)&&visible.length===1)query=query.where("owner","==",visible[0]);
    query=query.orderBy("updatedAt","desc").limit(100);
    const snap=await query.get();let reads=snap.size;
    let docs=snap.docs;
    if(Array.isArray(visible)&&visible.length>1&&!owner)docs=docs.filter(d=>visible.includes(String((d.data()||{}).owner||"").toLowerCase()));
    if(q)docs=docs.filter(d=>{const x=d.data()||{};return [x.title,x.notes,x.contactName,x.owner].some(v=>String(v||"").toLocaleLowerCase("es").includes(q));});
    const items=[];
    for(const d of docs){
      const h=await hydrateOpportunity(d,req);reads+=h.reads;
      items.push({...h.item,contact:h.contact,deals:h.deals,summary:h.summary});
    }
    return res.json({ok:true,items,readsEstimate:reads});
  }catch(e){console.error("opportunities list",e);return res.status(500).json({ok:false,error:e.message});}
});

router.get("/:id",async(req,res)=>{
  try{
    const d=await crmDb.collection("opportunities").doc(req.params.id).get();
    if(!d.exists)return res.status(404).json({ok:false,error:"Oportunidad no encontrada"});
    const raw=d.data()||{};
    if(!(await canSeeOwner(req.authUser,raw.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const h=await hydrateOpportunity(d,req);
    return res.json({ok:true,...h,readsEstimate:1+h.reads});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

async function validateLinks(req,contactId,dealIds){
  const ids=uniq(dealIds).slice(0,100);
  const docs=ids.length?await crmDb.getAll(...ids.map(id=>crmDb.collection("deals").doc(id))):[];
  const deals=[];
  for(const d of docs){
    if(!d.exists)continue;
    const x=d.data()||{};
    if(!(await canSeeOwner(req.authUser,x.owner)))continue;
    deals.push({id:d.id,...x});
  }
  if(ids.length!==deals.length)throw Object.assign(new Error("Uno o más tratos no existen o no están dentro de tus permisos"),{status:400});
  let resolvedContactId=clean(contactId,220);
  const linkedContacts=uniq(deals.map(d=>d.contactId));
  if(!resolvedContactId&&linkedContacts.length===1)resolvedContactId=linkedContacts[0];
  if(resolvedContactId&&linkedContacts.some(id=>id&&id!==resolvedContactId)){
    throw Object.assign(new Error("Todos los tratos de una oportunidad deben pertenecer al mismo contacto"),{status:400});
  }
  return {contactId:resolvedContactId,deals};
}

router.post("/",async(req,res)=>{
  try{
    const title=clean(req.body?.title,180);
    if(!title)return res.status(400).json({ok:false,error:"Falta el nombre de la oportunidad"});
    const links=await validateLinks(req,req.body?.contactId,Array.isArray(req.body?.dealIds)?req.body.dealIds:[]);
    if(!links.contactId&&!links.deals.length)return res.status(400).json({ok:false,error:"Vinculá al menos un contacto o un trato"});
    let owner=clean(req.body?.owner,220).toLowerCase();
    if(!owner)owner=clean(links.deals[0]?.owner||req.authUser?.email,220).toLowerCase();
    if(owner&&!(await canSeeOwner(req.authUser,owner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});
    let contactName="";
    if(links.contactId){
      const c=await crmDb.collection("contacts").doc(links.contactId).get();
      if(c.exists)contactName=String((c.data()||{}).name||"");
    }
    if(!contactName)contactName=String(links.deals[0]?.contactName||"");
    const ref=crmDb.collection("opportunities").doc();
    const now=admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
      title,
      contactId:links.contactId||"",
      contactName,
      dealIds:links.deals.map(d=>d.id),
      owner,
      createdAt:now,updatedAt:now,
      createdBy:String(req.authUser?.email||req.authUser?.id||"")
    });
    let writes=1;
    const newNote=String(req.body?.newNote||req.body?.notes||"").trim().slice(0,6000);
    if(newNote){
      await ref.collection("notes").add({note:newNote,userEmail:String(req.authUser?.email||""),userName:String(req.authUser?.name||""),userLabel:String(req.authUser?.name||req.authUser?.email||req.authUser?.id||"Usuario"),createdAt:admin.firestore.FieldValue.serverTimestamp()});
      writes++;
    }
    return res.json({ok:true,id:ref.id,writesEstimate:writes});
  }catch(e){return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.put("/:id",async(req,res)=>{
  try{
    const ref=crmDb.collection("opportunities").doc(req.params.id),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({ok:false,error:"Oportunidad no encontrada"});
    const old=snap.data()||{};
    if(!(await canEditOwner(req.authUser,old.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const nextContact=Object.prototype.hasOwnProperty.call(req.body||{},"contactId")?req.body.contactId:old.contactId;
    const nextDeals=Object.prototype.hasOwnProperty.call(req.body||{},"dealIds")?req.body.dealIds:old.dealIds;
    const links=await validateLinks(req,nextContact,Array.isArray(nextDeals)?nextDeals:[]);
    const p={updatedAt:admin.firestore.FieldValue.serverTimestamp()};
    if(Object.prototype.hasOwnProperty.call(req.body||{},"title")){p.title=clean(req.body.title,180);if(!p.title)return res.status(400).json({ok:false,error:"El nombre no puede quedar vacío"});}
    if(Object.prototype.hasOwnProperty.call(req.body||{},"owner")){p.owner=clean(req.body.owner,220).toLowerCase();if(p.owner&&!(await canSeeOwner(req.authUser,p.owner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});}
    p.contactId=links.contactId||"";
    p.dealIds=links.deals.map(d=>d.id);
    await ref.update(p);
    let writes=1;
    const newNote=String(req.body?.newNote||"").trim().slice(0,6000);
    if(newNote){
      await ref.collection("notes").add({note:newNote,userEmail:String(req.authUser?.email||""),userName:String(req.authUser?.name||""),userLabel:String(req.authUser?.name||req.authUser?.email||req.authUser?.id||"Usuario"),createdAt:admin.firestore.FieldValue.serverTimestamp()});
      writes++;
    }
    return res.json({ok:true,writesEstimate:writes});
  }catch(e){return res.status(e.status||500).json({ok:false,error:e.message});}
});

router.delete("/:id",async(req,res)=>{
  try{
    const ref=crmDb.collection("opportunities").doc(req.params.id),snap=await ref.get();
    if(!snap.exists)return res.status(404).json({ok:false,error:"Oportunidad no encontrada"});
    if(!(await canEditOwner(req.authUser,(snap.data()||{}).owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    await ref.delete();
    return res.json({ok:true,writesEstimate:1});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});

module.exports=router;
