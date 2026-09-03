"use strict";
const axios = require("axios");
const twilio = require("twilio");
const config = require("../../core/config");

const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const defaultFrom = String(process.env.TWILIO_WHATSAPP_FROM || "").trim();
const client = /^AC[a-zA-Z0-9]+$/.test(accountSid) && authToken ? twilio(accountSid, authToken) : null;

function ensureWhatsappPrefix(v){
  const s=String(v||"").trim();
  if(!s) return "";
  return /^whatsapp:/i.test(s) ? s : `whatsapp:${s}`;
}
function cleanWhatsappNumber(v){ return String(v||"").replace(/^whatsapp:/i,"").trim(); }
function statusCallback(req, conversationId){
  const base=(config.publicBaseUrl || `${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  const q=conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  return `${base}/api/inbox/twilio/status${q}`;
}
function assertConfigured(){ if(!client) throw new Error("Twilio no configurado"); }
async function sendText({from,to,body,mediaUrls=[],req,conversationId}){
  assertConfigured();
  const payload={from:ensureWhatsappPrefix(from||defaultFrom),to:ensureWhatsappPrefix(to)};
  if(body) payload.body=String(body);
  if(Array.isArray(mediaUrls)&&mediaUrls.length) payload.mediaUrl=mediaUrls;
  payload.statusCallback=statusCallback(req,conversationId);
  return client.messages.create(payload);
}
async function sendTemplate({from,to,contentSid,contentVariables={},req,conversationId}){
  assertConfigured();
  const payload={from:ensureWhatsappPrefix(from||defaultFrom),to:ensureWhatsappPrefix(to),contentSid:String(contentSid||"").trim(),statusCallback:statusCallback(req,conversationId)};
  if(contentVariables && Object.keys(contentVariables).length) payload.contentVariables=JSON.stringify(contentVariables);
  return client.messages.create(payload);
}
function approvalStatus(item){
  const status=String(item?.approval_requests?.status || item?.approvals?.whatsapp?.status || "").toLowerCase();
  if(status.includes("approved")) return "approved";
  if(status.includes("pending")) return "pending";
  if(status.includes("rejected")) return "rejected";
  if(status.includes("unsubmitted")) return "unsubmitted";
  const flat=JSON.stringify(item||{}).toLowerCase();
  if(flat.includes("approved")) return "approved";
  if(flat.includes("pending")) return "pending";
  if(flat.includes("rejected")) return "rejected";
  if(flat.includes("unsubmitted")) return "unsubmitted";
  return "unknown";
}
function templateCategory(item){
  const category=String(item?.approval_requests?.category || item?.category || "").toLowerCase();
  if(category.includes("utility")) return "utility";
  if(category.includes("marketing")) return "marketing";
  if(category.includes("authentication")) return "authentication";
  return "text";
}
async function listApprovedTemplates(){
  assertConfigured();
  const r=await axios.get("https://content.twilio.com/v1/ContentAndApprovals",{auth:{username:accountSid,password:authToken},timeout:20000});
  return (r.data?.contents||[]).map(item=>({sid:item.sid,name:item.friendly_name||item.friendlyName||item.sid,language:item.language||item.locale||"",category:templateCategory(item),whatsappStatus:approvalStatus(item)})).filter(x=>x.whatsappStatus==="approved").sort((a,b)=>a.name.localeCompare(b.name,"es",{sensitivity:"base"}));
}

function inboundWebhookUrl(req){
  const base=(config.publicBaseUrl || `${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  return `${base}/api/inbox/twilio/inbound`;
}
function validateInboundWebhook(req){
  if(!authToken) return {ok:false,reason:"TWILIO_AUTH_TOKEN no configurado"};
  const signature=String(req.get("x-twilio-signature")||"").trim();
  if(!signature) return {ok:false,reason:"Falta X-Twilio-Signature"};
  const url=inboundWebhookUrl(req);
  const ok=twilio.validateRequest(authToken,signature,url,req.body||{});
  return {ok,url,reason:ok?"":"Firma Twilio inválida"};
}
module.exports={client,defaultFrom,ensureWhatsappPrefix,cleanWhatsappNumber,sendText,sendTemplate,listApprovedTemplates,validateInboundWebhook,inboundWebhookUrl};
