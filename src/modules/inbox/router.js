"use strict";
const express=require("express");
const config=require("../../core/config");
const {inboxDb}=require("../../core/google");
const {authRequired}=require("../../middleware/auth");
const router=express.Router();
function iso(v){ try{return v?.toDate?v.toDate().toISOString():(v instanceof Date?v.toISOString():v||null);}catch{return null;} }
function summary(doc){const d=doc.data()||{};return {id:doc.id,contactId:d.contactId||"",dealId:d.dealId||"",contactName:d.contactName||d.profileName||d.name||"",companyName:d.companyName||"",waFrom:d.waFrom||"",ownerEmail:d.ownerEmail||"",stage:d.stage||d.dealStage||"",lastMessage:d.lastMessage||d.lastMessagePreview||d.lastMessageText||"",lastMessageAt:iso(d.lastMessageAt),unreadCount:Number(d.unreadCount||0),mode:d.mode||""};}
router.get("/conversations",authRequired,async(req,res)=>{
  try{
    const requested=Number(req.query.limit||config.inboxPageSize); const limit=Math.max(10,Math.min(requested,config.inboxMaxPageSize));
    let q=inboxDb.collection("conversations").orderBy("lastMessageAt","desc").limit(limit);
    const cursor=String(req.query.cursor||"").trim();
    if(cursor){ const c=await inboxDb.collection("conversations").doc(cursor).get(); if(c.exists) q=q.startAfter(c); }
    const snap=await q.get(); const items=snap.docs.map(summary); const last=snap.docs[snap.docs.length-1];
    return res.json({ok:true,items,nextCursor:last?.id||null,readsEstimate:snap.size+(cursor?1:0)});
  }catch(e){console.error("inbox list",e);return res.status(500).json({ok:false,error:e.message});}
});
router.get("/conversations/by-phone",authRequired,async(req,res)=>{
  try{ const phone=String(req.query.phone||"").replace(/\D/g,""); if(!phone) return res.status(400).json({ok:false,error:"Falta phone"});
    const variants=[phone,`+${phone}`,`whatsapp:+${phone}`]; const snap=await inboxDb.collection("conversations").where("waFrom","in",variants).limit(20).get();
    return res.json({ok:true,items:snap.docs.map(summary),readsEstimate:snap.size});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
});
module.exports=router;
