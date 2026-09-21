"use strict";
const config=require("../../core/config");
const {crmDb,inboxDb}=require("../../core/google");

const TARGET_STAGE="Cotizado para enviar";

function clean(v,max=500){return String(v??"").trim().slice(0,max);}
function formatValue(v){
  const n=Number(v||0);
  return `USD ${Number.isFinite(n)?n.toLocaleString("es-AR",{minimumFractionDigits:0,maximumFractionDigits:2}):"0"}`;
}
async function ownerDisplayName(deal){
  const email=clean(deal?.owner,220).toLowerCase();
  if(!email)return "Dueño sin asignar";
  try{
    const snap=await crmDb.collection("users").where("email","==",email).limit(1).get();
    if(!snap.empty){const x=snap.docs[0].data()||{};return clean(x.name||x.displayName||x.email||email,220)||email;}
  }catch(e){console.error("[cotizado-alert] owner lookup",e.message||e);}
  return email;
}
async function contactName(deal){
  const direct=clean(deal?.contactName||deal?.clientName||deal?.company,220);
  if(direct)return direct;
  const id=clean(deal?.contactId,220);
  if(!id)return "Cliente sin nombre";
  try{const s=await crmDb.collection("contacts").doc(id).get();if(s.exists){const x=s.data()||{};return clean(x.name||x.fullName||x.company||"Cliente sin nombre",220);}}catch(e){console.error("[cotizado-alert] contact lookup",e.message||e);}
  return "Cliente sin nombre";
}
async function hubUrl(dealId,deal){
  const base=(config.publicBaseUrl||"https://hub.sentirecustomsbroker.com").replace(/\/$/,"");
  let conversationId=clean(deal?.hubConversationId,260);
  if(!conversationId){
    try{
      const snap=await inboxDb.collection("conversations").where("dealId","==",dealId).limit(1).get();
      if(!snap.empty)conversationId=snap.docs[0].id;
    }catch(e){console.error("[cotizado-alert] hub link lookup",e.message||e);}
  }
  return conversationId?`${base}/inbox?conversationId=${encodeURIComponent(conversationId)}`:base;
}
async function sendCotizadoAlert(dealId,deal){
  if(!config.whatsappNotifySystemToken)return {ok:false,skipped:true,reason:"missing_MRAPI_WHATSAPP_SYSTEM_TOKEN"};
  const payload={
    usuario:await ownerDisplayName(deal),
    trato:clean(deal?.title||"Trato sin nombre",220),
    cliente:await contactName(deal),
    valorTrato:formatValue(deal?.value),
    hubUrl:await hubUrl(dealId,deal)
  };
  try{
    const r=await fetch(`${config.whatsappNotifyBaseUrl}/api/system/alerts/crm-cotizado-para-enviar`,{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${config.whatsappNotifySystemToken}`},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(10000)
    });
    let data=null;try{data=await r.json();}catch{data={};}
    const ok=r.ok&&data?.ok!==false;
    if(!ok)console.error("[cotizado-alert] MRAPI-WP rechazó",r.status,data);
    else console.log("[cotizado-alert] enviado",{dealId,owner:payload.usuario,status:r.status});
    return {ok,statusCode:r.status,response:data};
  }catch(e){console.error("[cotizado-alert] error",e.message||e);return {ok:false,error:e.message||String(e)};}
}
module.exports={TARGET_STAGE,sendCotizadoAlert};
