"use strict";
const express=require("express");
const {getTenant}=require("../../core/tenant");
const {authRequired}=require("../../middleware/auth");
const router=express.Router();
router.get("/config",authRequired,(req,res)=>{const t=getTenant();res.json({ok:true,tenant:{id:t.id,name:t.name,product:t.product,modules:t.modules,branding:t.branding}});});
router.get("/modules",authRequired,(req,res)=>{const t=getTenant();res.json({ok:true,modules:t.modules});});
module.exports=router;
