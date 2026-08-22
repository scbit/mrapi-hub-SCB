"use strict";
const config=require("../core/config");
const {verifySession}=require("../shared/crypto");
function cookie(req,name){
  const raw=String(req.headers.cookie||"");
  for(const part of raw.split(";")){
    const [k,...rest]=part.trim().split("=");
    if(k===name)return decodeURIComponent(rest.join("=")||"");
  }
  return "";
}
function bearer(req){
  const h=String(req.headers.authorization||"");
  if(h.startsWith("Bearer ")) return h.slice(7).trim();
  return String(cookie(req,"mrapi_hub_token") || req.query?.access_token || req.query?.token || "").trim();
}
function authOptional(req,res,next){ const p=verifySession(bearer(req),config.sessionSecret); req.authUser=p?{id:p.sub,email:p.email,name:p.name,role:p.role,tenantId:p.tenantId}:null; next(); }
function authRequired(req,res,next){ if(!req.authUser) return res.status(401).json({ok:false,error:"Sesión requerida"}); next(); }
function requireRole(...roles){ const allowed=new Set(roles.map(x=>String(x).toLowerCase())); return (req,res,next)=>{ if(!req.authUser || !allowed.has(String(req.authUser.role||"").toLowerCase())) return res.status(403).json({ok:false,error:"Sin permiso"}); next();}; }
module.exports={authOptional,authRequired,requireRole};
