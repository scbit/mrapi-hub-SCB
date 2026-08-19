"use strict";
const express=require("express");
const crypto=require("crypto");
const config=require("../../core/config");
const {crmDb}=require("../../core/google");
const {getTenant}=require("../../core/tenant");
const {signSession}=require("../../shared/crypto");
const router=express.Router();
function cleanRole(v){return String(v||"user").trim().toLowerCase();}
function safeEq(a,b){ const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||"")); return x.length===y.length && crypto.timingSafeEqual(x,y); }
router.post("/login",async(req,res)=>{
  try{
    const email=String(req.body?.email||"").trim().toLowerCase(); const password=String(req.body?.password||"");
    if(!email||!password) return res.status(400).json({ok:false,error:"Faltan email o contraseña"});
    if(!config.sessionSecret) return res.status(503).json({ok:false,error:"MRAPI_SESSION_SECRET no configurado"});
    const snap=await crmDb.collection("users").where("email","==",email).limit(1).get();
    if(snap.empty) return res.status(401).json({ok:false,error:"Usuario o contraseña incorrectos"});
    const doc=snap.docs[0], user=doc.data()||{};
    // Compatibilidad temporal: el CRM actual guarda password en texto plano. Debe migrarse luego a hash.
    if(!safeEq(user.password,password)) return res.status(401).json({ok:false,error:"Usuario o contraseña incorrectos"});
    const tenant=getTenant(); const now=Math.floor(Date.now()/1000);
    const payload={sub:doc.id,email:user.email||email,name:user.name||"",role:cleanRole(user.role),tenantId:tenant.id,iat:now,exp:now+8*3600};
    return res.json({ok:true,token:signSession(payload,config.sessionSecret),user:{id:doc.id,email:payload.email,name:payload.name,role:payload.role,tenantId:tenant.id}});
  }catch(e){console.error("login",e);return res.status(500).json({ok:false,error:"Error de login"});}
});
router.get("/me",(req,res)=>res.json({ok:true,user:req.authUser||null}));
module.exports=router;
