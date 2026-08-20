"use strict";
const {crmDb}=require("../../core/google");
const {TTLCache}=require("../../core/cache");
const cache=new TTLCache(300000,200);
function role(u){return String(u?.role||"").trim().toLowerCase();}
function isAdminLike(u){return ["admin","backoffice"].includes(role(u));}
function isLeader(u){return role(u)==="team_leader";}
async function visibleOwners(user){
  if(!user)return [];
  if(isAdminLike(user))return null;
  const own=String(user.email||"").trim().toLowerCase();
  if(!isLeader(user))return own?[own]:[];
  const key=`leader:${user.id}`; const hit=cache.get(key); if(hit)return hit;
  const snap=await crmDb.collection("users").where("role","==","field_sales").where("teamLeaderId","==",user.id).limit(100).get();
  const values=Array.from(new Set([own,...snap.docs.map(d=>String((d.data()||{}).email||"").trim().toLowerCase())].filter(Boolean)));
  cache.set(key,values); return values;
}
async function canSeeOwner(user,owner){const v=await visibleOwners(user);if(v===null)return true;return v.includes(String(owner||"").trim().toLowerCase());}
async function canEditOwner(user,owner){return canSeeOwner(user,owner);}
module.exports={role,isAdminLike,visibleOwners,canSeeOwner,canEditOwner};
