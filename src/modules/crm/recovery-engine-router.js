"use strict";
const express=require("express");
const config=require("../../core/config");
const {processRecoveryEngine}=require("./recovery-service");
const router=express.Router();
function authorized(req){
  const secret=String(process.env.MRAPI_RECOVERY_ENGINE_SECRET||config.gatewaySecret||"").trim();
  if(!secret)return false;
  return String(req.get("x-recovery-secret")||req.get("x-gateway-secret")||"")===secret;
}
router.post("/run",async(req,res)=>{
  if(!authorized(req))return res.status(401).json({ok:false,error:"Recovery engine secret inválido"});
  try{
    const maxMessages=Math.max(1,Math.min(50,Number(req.body?.maxMessages||20)||20));
    const out=await processRecoveryEngine({maxMessages});
    return res.json(out);
  }catch(e){console.error("recovery-engine",e);return res.status(500).json({ok:false,error:e.message||"Recovery engine error"});}
});
module.exports=router;
