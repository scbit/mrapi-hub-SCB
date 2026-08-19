"use strict";
class TTLCache {
  constructor(defaultTtlMs = 60000, maxEntries = 500) { this.defaultTtlMs = defaultTtlMs; this.maxEntries = maxEntries; this.map = new Map(); }
  get(key) { const v=this.map.get(key); if(!v) return undefined; if(v.expiresAt <= Date.now()){this.map.delete(key);return undefined;} return v.value; }
  set(key, value, ttlMs=this.defaultTtlMs) { if(this.map.size>=this.maxEntries){ const first=this.map.keys().next().value; if(first) this.map.delete(first); } this.map.set(key,{value,expiresAt:Date.now()+ttlMs}); return value; }
  delete(key){this.map.delete(key);} clear(){this.map.clear();}
}
module.exports = { TTLCache };
