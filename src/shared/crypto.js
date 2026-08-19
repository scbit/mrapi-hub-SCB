"use strict";
const crypto = require("crypto");
function b64url(v){return Buffer.from(v).toString("base64url");}
function signSession(payload, secret){
  if(!secret) throw new Error("MRAPI_SESSION_SECRET no configurado");
  const body=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifySession(token, secret){
  if(!token || !secret) return null;
  const [body,sig]=String(token).split("."); if(!body||!sig) return null;
  const expected=crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a=Buffer.from(sig), b=Buffer.from(expected); if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  try { const p=JSON.parse(Buffer.from(body,"base64url").toString("utf8")); if(!p.exp || p.exp < Math.floor(Date.now()/1000)) return null; return p; } catch { return null; }
}
module.exports={signSession,verifySession};
