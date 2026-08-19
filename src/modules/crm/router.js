"use strict";
const express=require("express");
const {crmDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const router=express.Router();
router.get("/pipeline/stages",authRequired,async(req,res)=>{
  try{ const snap=await crmDb.collection("pipeline_stages").orderBy("order","asc").limit(100).get(); return res.json({ok:true,items:snap.docs.map(d=>({id:d.id,...d.data()})),readsEstimate:snap.size}); }
  catch(e){ // compatibilidad SCB: si la colección todavía no existe, no escanear deals para inferir etapas.
    return res.json({ok:true,items:[],readsEstimate:0,note:"pipeline_stages aún no materializado"});
  }
});
router.get("/contacts/:id",authRequired,async(req,res)=>{try{const d=await crmDb.collection("contacts").doc(req.params.id).get();if(!d.exists)return res.status(404).json({ok:false,error:"Contacto no encontrado"});return res.json({ok:true,item:{id:d.id,...d.data()},readsEstimate:1});}catch(e){return res.status(500).json({ok:false,error:e.message});}});
router.get("/deals/:id",authRequired,async(req,res)=>{try{const d=await crmDb.collection("deals").doc(req.params.id).get();if(!d.exists)return res.status(404).json({ok:false,error:"Trato no encontrado"});return res.json({ok:true,item:{id:d.id,...d.data()},readsEstimate:1});}catch(e){return res.status(500).json({ok:false,error:e.message});}});
module.exports=router;
