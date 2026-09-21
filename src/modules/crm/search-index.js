"use strict";
const {admin,crmDb}=require("../../core/google");

const INDEX_VERSION=1;
const META_REF=()=>crmDb.collection("_system").doc("crm_search_index");

function norm(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9+]+/g," ").trim();
}
function digits(v){return String(v||"").replace(/\D/g,"");}
function prefixes(word){
  const w=norm(word).replace(/\s+/g,"");
  const out=[];
  if(w.length<3){if(w)out.push(`t:${w}`);return out;}
  for(let i=3;i<=Math.min(w.length,32);i++)out.push(`t:${w.slice(0,i)}`);
  return out;
}
function buildSearchTerms(data){
  const out=new Set();
  const text=[data?.title,data?.contactName,data?.company].map(norm).filter(Boolean).join(" ");
  for(const w of text.split(/\s+/).filter(Boolean).slice(0,40))for(const p of prefixes(w))out.add(p);
  const phone=digits(data?.contactPhone||data?.phone);
  if(phone){
    out.add(`p:${phone}`);
    for(let n=7;n<=Math.min(phone.length,15);n++)out.add(`p:${phone.slice(-n)}`);
  }
  return Array.from(out).slice(0,500);
}
function withSearchFields(data){return {...data,searchTerms:buildSearchTerms(data),searchIndexVersion:INDEX_VERSION};}

async function rebuildDealSearchIndex(){
  let last=null,reads=0,writes=0;
  for(;;){
    let q=crmDb.collection("deals").orderBy(admin.firestore.FieldPath.documentId(),"asc").limit(400);
    if(last)q=q.startAfter(last);
    const snap=await q.get(); reads+=snap.size;
    if(snap.empty)break;
    const batch=crmDb.batch();
    for(const d of snap.docs){
      const x=d.data()||{};
      batch.update(d.ref,{searchTerms:buildSearchTerms(x),searchIndexVersion:INDEX_VERSION});
      writes++;
    }
    await batch.commit();
    last=snap.docs[snap.docs.length-1];
    if(snap.size<400)break;
  }
  await META_REF().set({version:INDEX_VERSION,rebuiltAt:admin.firestore.FieldValue.serverTimestamp(),dealCount:writes},{merge:true});
  return {reads,writes};
}

let ensurePromise=null;
async function ensureDealSearchIndex(){
  if(ensurePromise)return ensurePromise;
  ensurePromise=(async()=>{
    const meta=await META_REF().get();
    if(meta.exists&&Number((meta.data()||{}).version||0)===INDEX_VERSION)return {ready:true,reads:1,writes:0,rebuild:false};
    const r=await rebuildDealSearchIndex();
    return {ready:true,reads:r.reads+1,writes:r.writes+1,rebuild:true};
  })().finally(()=>{ensurePromise=null;});
  return ensurePromise;
}

function queryToken(term){
  const d=digits(term);
  if(d.length>=7)return `p:${d}`;
  const n=norm(term);
  const first=n.split(/\s+/).find(Boolean)||"";
  return first?`t:${first.slice(0,32)}`:"";
}
function matchesAll(data,term){
  const q=norm(term),qd=digits(term);
  if(qd.length>=7){
    const pd=digits(data?.contactPhone||data?.phone);
    return !!pd&&(pd.includes(qd)||qd.includes(pd));
  }
  const hay=norm([data?.title,data?.contactName,data?.company].join(" "));
  return q.split(/\s+/).filter(Boolean).every(t=>hay.includes(t));
}
async function searchDealsIndexed(term,limit=50){
  const token=queryToken(term);if(!token)return {docs:[],reads:0};
  const snap=await crmDb.collection("deals").where("searchTerms","array-contains",token).limit(Math.max(limit,100)).get();
  return {docs:snap.docs.filter(d=>matchesAll(d.data()||{},term)).slice(0,limit),reads:snap.size};
}
module.exports={INDEX_VERSION,buildSearchTerms,withSearchFields,ensureDealSearchIndex,rebuildDealSearchIndex,searchDealsIndexed};
