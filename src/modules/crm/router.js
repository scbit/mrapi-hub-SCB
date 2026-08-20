"use strict";
const express=require("express");
const {admin,crmDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const {PIPELINE_STAGES,DEAL_TYPES,DEAL_TYPE_LABELS,LEAD_QUALITY_VALUES,LEAD_QUALITY_LABELS}=require("./constants");
const {visibleOwners,canSeeOwner,canEditOwner,isAdminLike}=require("./access");
const router=express.Router();
router.use(authRequired);

function ts(v){if(!v)return null;if(v.toDate)return v.toDate().toISOString();if(v instanceof Date)return v.toISOString();return v;}
function enc(doc){if(!doc)return "";const d=doc.data()||{};return Buffer.from(JSON.stringify({id:doc.id,createdAt:ts(d.createdAt)})).toString("base64url");}
function dec(v){try{return JSON.parse(Buffer.from(String(v||""),"base64url").toString("utf8"));}catch{return null;}}
function normalizeDoc(doc){const d=doc.data()||{};return {id:doc.id,...d,createdAt:ts(d.createdAt),updatedAt:ts(d.updatedAt)};}
function publicDeal(doc,contact){const d=normalizeDoc(doc);return {...d,contactPhone:String(contact?.phone||d.contactPhone||""),company:String(contact?.company||d.company||"")};}
function cleanLimit(v,def=50){return Math.max(1,Math.min(100,Number(v||def)||def));}

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

router.get("/deals",async(req,res)=>{
  try{
    const limit=cleanLimit(req.query.limit,50), stage=String(req.query.stage||"").trim(), owner=String(req.query.owner||"").trim().toLowerCase(), dealType=String(req.query.dealType||"").trim(), cursor=dec(req.query.cursor);
    const visible=await visibleOwners(req.authUser);
    if(owner&&visible!==null&&!visible.includes(owner))return res.status(403).json({ok:false,error:"Owner fuera de tus permisos"});
    let q=crmDb.collection("deals");
    if(stage)q=q.where("stage","==",stage);
    if(dealType)q=q.where("dealType","==",dealType);
    if(owner)q=q.where("owner","==",owner);
    else if(Array.isArray(visible)&&visible.length===1)q=q.where("owner","==",visible[0]);
    else if(Array.isArray(visible)&&visible.length>1&&visible.length<=10)q=q.where("owner","in",visible);
    // Si un líder tiene >10 vendedores, exigimos owner explícito en vez de escanear toda la colección.
    else if(Array.isArray(visible)&&visible.length>10)return res.status(400).json({ok:false,error:"Seleccioná un vendedor para listar el pipeline"});
    q=q.orderBy("createdAt","desc").orderBy(admin.firestore.FieldPath.documentId(),"desc");
    if(cursor?.createdAt&&cursor?.id)q=q.startAfter(new Date(cursor.createdAt),cursor.id);
    const snap=await q.limit(limit).get();
    const contactIds=Array.from(new Set(snap.docs.map(d=>String((d.data()||{}).contactId||"")).filter(Boolean)));
    const contactDocs=contactIds.length?await crmDb.getAll(...contactIds.map(id=>crmDb.collection("contacts").doc(id))):[];
    const cmap=new Map(contactDocs.map(d=>[d.id,d.exists?(d.data()||{}):{}]));
    const items=snap.docs.map(d=>publicDeal(d,cmap.get(String((d.data()||{}).contactId||""))));
    return res.json({ok:true,items,nextCursor:snap.size===limit?enc(snap.docs[snap.docs.length-1]):"",hasMore:snap.size===limit,readsEstimate:snap.size+contactDocs.length});
  }catch(e){console.error("crm deals",e);const msg=/index/i.test(String(e.message||""))?"Firestore requiere un índice para este filtro. No se hizo fallback masivo.":e.message;return res.status(500).json({ok:false,error:msg});}
});

router.get("/deals/:id",async(req,res)=>{try{const d=await crmDb.collection("deals").doc(req.params.id).get();if(!d.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});const data=d.data()||{};if(!(await canSeeOwner(req.authUser,data.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});let c=null,reads=1;if(data.contactId){const x=await crmDb.collection("contacts").doc(data.contactId).get();reads++;if(x.exists)c={id:x.id,...x.data()};}res.json({ok:true,item:normalizeDoc(d),contact:c,readsEstimate:reads});}catch(e){res.status(500).json({ok:false,error:e.message});}});

router.put("/deals/:id",async(req,res)=>{
  try{const ref=crmDb.collection("deals").doc(req.params.id),d=await ref.get();if(!d.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});const old=d.data()||{};if(!(await canEditOwner(req.authUser,old.owner)))return res.status(403).json({ok:false,error:"Sin permiso"});
    const allowed=["stage","dealType","leadQuality","owner","dueDate","value","notes","title"];const p={updatedAt:new Date()};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(req.body||{},k))p[k]=req.body[k];
    if(p.stage&&!PIPELINE_STAGES.includes(p.stage))return res.status(400).json({ok:false,error:"Etapa inválida"});if(p.dealType&&!DEAL_TYPES.includes(p.dealType))return res.status(400).json({ok:false,error:"Tipo inválido"});if(p.leadQuality&&!LEAD_QUALITY_VALUES.includes(p.leadQuality))return res.status(400).json({ok:false,error:"Calidad inválida"});if(Object.prototype.hasOwnProperty.call(p,"value"))p.value=Number(p.value||0);
    if(p.owner&&!(await canSeeOwner(req.authUser,p.owner)))return res.status(403).json({ok:false,error:"No podés asignar ese owner"});
    const notesChanged=Object.prototype.hasOwnProperty.call(p,"notes")&&String(p.notes||"").trim()!==String(old.notes||"").trim();
    await ref.update(p);
    let writes=1;
    if(notesChanged&&String(p.notes||"").trim()){
      await ref.collection("notes").add({note:String(p.notes||"").trim(),user:String(req.authUser.email||req.authUser.name||"crm"),createdAt:admin.firestore.FieldValue.serverTimestamp()});
      writes++;
    }
    return res.json({ok:true,readsEstimate:1,writesEstimate:writes});
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

router.get("/contacts/:id",async(req,res)=>{try{const d=await crmDb.collection("contacts").doc(req.params.id).get();if(!d.exists)return res.status(404).json({ok:false,error:"Contacto no encontrado"});if(!(await canSeeOwner(req.authUser,(d.data()||{}).owner)))return res.status(403).json({ok:false,error:"Sin permiso"});return res.json({ok:true,item:normalizeDoc(d),readsEstimate:1});}catch(e){return res.status(500).json({ok:false,error:e.message});}});

router.get("/lookup",async(req,res)=>{
  try{const term=String(req.query.q||"").trim();if(!term)return res.json({ok:true,items:[],readsEstimate:0});let reads=0,items=[];
    // Búsqueda dirigida: IDs o teléfono exacto. Nunca collection scan.
    const [dealDoc,contactDoc]=await Promise.all([crmDb.collection("deals").doc(term).get(),crmDb.collection("contacts").doc(term).get()]);reads+=2;
    if(dealDoc.exists&&await canSeeOwner(req.authUser,(dealDoc.data()||{}).owner))items.push({kind:"deal",...normalizeDoc(dealDoc)});
    if(contactDoc.exists&&await canSeeOwner(req.authUser,(contactDoc.data()||{}).owner))items.push({kind:"contact",...normalizeDoc(contactDoc)});
    if(!items.length&&/^[+\d ()-]{7,}$/.test(term)){
      const variants=Array.from(new Set([term,term.replace(/\D/g,""),"+"+term.replace(/\D/g,"")].filter(Boolean))).slice(0,3);
      for(const phone of variants){const s=await crmDb.collection("contacts").where("phone","==",phone).limit(10).get();reads+=s.size;for(const d of s.docs)if(await canSeeOwner(req.authUser,(d.data()||{}).owner))items.push({kind:"contact",...normalizeDoc(d)});if(items.length)break;}
    }
    res.json({ok:true,items,readsEstimate:reads,note:"La búsqueda global por nombre se materializará en índice propio; no se escanea contacts/deals."});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
module.exports=router;
