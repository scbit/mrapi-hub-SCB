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
  const host=req && typeof req.get==="function" ? String(req.get("host")||"") : "";
  const protocol=req?.protocol || "https";
  const base=(config.publicBaseUrl || (host?`${protocol}://${host}`:"")).replace(/\/$/,"");
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
  return (r.data?.contents||[]).map(item=>{const body=String(item?.types?.["twilio/text"]?.body||item?.types?.["twilio/quick-reply"]?.body||item?.body||"").trim();return {sid:item.sid,name:item.friendly_name||item.friendlyName||item.sid,language:item.language||item.locale||"",category:templateCategory(item),whatsappStatus:approvalStatus(item),body,components:body?[{type:"BODY",text:body}]:[]};}).filter(x=>x.whatsappStatus==="approved").sort((a,b)=>a.name.localeCompare(b.name,"es",{sensitivity:"base"}));
}

async function downloadMedia(url){
  assertConfigured();
  const r=await axios.get(String(url||""),{auth:{username:accountSid,password:authToken},responseType:"arraybuffer",timeout:30000,maxContentLength:20*1024*1024});
  return {buffer:Buffer.from(r.data),contentType:String(r.headers?.["content-type"]||"application/octet-stream"),contentDisposition:String(r.headers?.["content-disposition"]||"")};
}

function inboundWebhookUrl(req){
  const host=req && typeof req.get==="function" ? String(req.get("host")||"") : "";
  const protocol=req?.protocol || "https";
  const base=(config.publicBaseUrl || (host?`${protocol}://${host}`:"")).replace(/\/$/,"");
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
function gatewayConfigured(){
  return Boolean(config.gatewayUrl && config.gatewayApiKey);
}
async function sendGatewayText({tenantId,lineId,to,body}){
  if(!gatewayConfigured()) throw new Error("MRAPI Gateway no configurado");
  if(!lineId) throw new Error("Falta gatewayLineId");
  const r=await axios.post(`${config.gatewayUrl}/v1/messages`,{
    tenantId:String(tenantId||config.gatewayTenantId||config.tenantId),
    lineId:String(lineId),
    to:cleanWhatsappNumber(to),
    type:"text",
    text:String(body||"")
  },{
    headers:{"x-api-key":config.gatewayApiKey,"content-type":"application/json"},
    timeout:20000
  });
  const sid=String(r.data?.id || r.data?.providerResponse?.messages?.[0]?.id || "");
  return {sid,status:"accepted",provider:"meta",raw:r.data};
}


async function sendGatewayMedia({tenantId,lineId,to,type,mediaUrl,filename,caption}){
  if(!gatewayConfigured()) throw new Error("MRAPI Gateway no configurado");
  const r=await axios.post(`${config.gatewayUrl}/v1/messages`,{tenantId:String(tenantId||config.gatewayTenantId||config.tenantId),lineId:String(lineId),to:cleanWhatsappNumber(to),type,mediaUrl,filename,caption},{headers:{"x-api-key":config.gatewayApiKey,"content-type":"application/json"},timeout:30000});
  const sid=String(r.data?.id||r.data?.providerResponse?.messages?.[0]?.id||"");
  return {sid,status:"accepted",provider:"meta",raw:r.data};
}
async function listGatewayTemplates({tenantId,lineId}){
  if(!gatewayConfigured()) throw new Error("MRAPI Gateway no configurado");
  const resolvedTenant=String(tenantId||config.gatewayTenantId||config.tenantId);
  const resolvedLine=String(lineId||"");
  try{
    const r=await axios.get(`${config.gatewayUrl}/v1/templates`,{params:{tenantId:resolvedTenant,lineId:resolvedLine},headers:{"x-api-key":config.gatewayApiKey},timeout:20000});
    console.info("gateway templates ok",JSON.stringify({tenantId:resolvedTenant,lineId:resolvedLine,count:(r.data?.templates||[]).length}));
    return (r.data?.templates||[]).map(t=>({sid:t.name,name:t.name,language:t.language||"",provider:"meta",components:t.components||[],category:t.category||""}));
  }catch(e){
    console.error("gateway templates failed",JSON.stringify({tenantId:resolvedTenant,lineId:resolvedLine,status:e?.response?.status||null,data:e?.response?.data||null,message:e?.message||String(e)}));
    throw e;
  }
}
async function sendGatewayTemplate({tenantId,lineId,to,name,language,components=[]}){
  if(!gatewayConfigured()) throw new Error("MRAPI Gateway no configurado");
  const r=await axios.post(`${config.gatewayUrl}/v1/messages`,{tenantId:String(tenantId||config.gatewayTenantId||config.tenantId),lineId:String(lineId),to:cleanWhatsappNumber(to),type:"template",template:{name,language:language||"es_AR",components}},{headers:{"x-api-key":config.gatewayApiKey,"content-type":"application/json"},timeout:30000});
  const sid=String(r.data?.id||r.data?.providerResponse?.messages?.[0]?.id||"");
  return {sid,status:"accepted",provider:"meta",raw:r.data};
}
async function downloadGatewayMedia({lineId,mediaId}){
  if(!gatewayConfigured()) throw new Error("MRAPI Gateway no configurado");
  const r=await axios.get(`${config.gatewayUrl}/v1/media/${encodeURIComponent(mediaId)}`,{params:{lineId},headers:{"x-api-key":config.gatewayApiKey},responseType:"arraybuffer",timeout:30000});
  return {buffer:Buffer.from(r.data),contentType:String(r.headers["content-type"]||"application/octet-stream")};
}
module.exports={client,defaultFrom,ensureWhatsappPrefix,cleanWhatsappNumber,sendText,sendTemplate,listApprovedTemplates,downloadMedia,validateInboundWebhook,inboundWebhookUrl,gatewayConfigured,sendGatewayText,sendGatewayMedia,listGatewayTemplates,sendGatewayTemplate,downloadGatewayMedia};
