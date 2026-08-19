"use strict";
const config = require("./config");
const scb = require("../tenants/scb");
function getTenant(){ if(config.tenantId === "scb") return scb; throw new Error(`Tenant no configurado: ${config.tenantId}`); }
module.exports = { getTenant };
