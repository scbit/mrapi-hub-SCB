"use strict";
const axios = require("axios");
const crypto = require("crypto");
const config = require("../../core/config");
const { admin } = require("../../core/google");

function configured(){
  return Boolean(config.dfProjectId && config.dfAgentId && config.dfLocation);
}
function sessionIdForConversation(conversationId){
  return crypto.createHash("sha256").update(`${config.tenantId}|${String(conversationId||"")}`).digest("hex").slice(0,32);
}
function endpoint(sessionId){
  const loc=encodeURIComponent(config.dfLocation);
  const project=encodeURIComponent(config.dfProjectId);
  const agent=encodeURIComponent(config.dfAgentId);
  const session=encodeURIComponent(sessionId);
  const host=config.dfLocation === "global" ? "dialogflow.googleapis.com" : `${config.dfLocation}-dialogflow.googleapis.com`;
  return `https://${host}/v3/projects/${project}/locations/${loc}/agents/${agent}/sessions/${session}:detectIntent`;
}
async function accessToken(){
  const credential=admin.app().options.credential;
  if(!credential || typeof credential.getAccessToken !== "function") throw new Error("Google Application Default Credentials no disponibles para Conversational Agents");
  const token=await credential.getAccessToken();
  const value=String(token?.access_token || token?.accessToken || "").trim();
  if(!value) throw new Error("No se pudo obtener access token de Google");
  return value;
}
function extractTexts(data){
  const messages=Array.isArray(data?.queryResult?.responseMessages) ? data.queryResult.responseMessages : [];
  const texts=[];
  for(const msg of messages){
    const arr=Array.isArray(msg?.text?.text) ? msg.text.text : [];
    for(const t of arr){ const clean=String(t||"").trim(); if(clean) texts.push(clean); }
  }
  return [...new Set(texts)];
}
async function detectIntent({conversationId,text}){
  if(!configured()) throw Object.assign(new Error("Conversational Agent no configurado"),{code:"DF_NOT_CONFIGURED"});
  const clean=String(text||"").trim();
  if(!clean) return {ok:true,text:"",texts:[],sessionId:sessionIdForConversation(conversationId),skipped:true};
  const sid=sessionIdForConversation(conversationId);
  const token=await accessToken();
  const response=await axios.post(endpoint(sid),{
    queryInput:{
      text:{text:clean},
      languageCode:config.dfLanguageCode || "es"
    }
  },{
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    timeout:12000,
    validateStatus:status=>status>=200&&status<300
  });
  const texts=extractTexts(response.data);
  return {ok:true,text:texts.join("\n").trim(),texts,sessionId:sid,rawMatchType:response.data?.queryResult?.match?.matchType || ""};
}
module.exports={configured,detectIntent,sessionIdForConversation};
