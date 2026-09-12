(()=>{'use strict';
const TK='mrapi_hub_token',UK='mrapi_hub_user';
const S={token:localStorage.getItem(TK)||'',user:null,meta:null,templates:[],rows:[],groups:{},campaigns:[],selected:new Set(),reads:0,mode:'vencidos'};
try{S.user=JSON.parse(localStorage.getItem(UK)||'null')}catch{}
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function api(url,opt={}){
  const h={...(opt.headers||{})};if(S.token)h.Authorization='Bearer '+S.token;
  const r=await fetch(url,{...opt,headers:h});const d=await r.json().catch(()=>({ok:false,error:'Respuesta inválida'}));
  if(r.status===401){location.href='/crm';throw Error('Sesión vencida')}
  if(!r.ok||d.ok===false)throw Error(d.error||'Error');
  S.reads+=Number(d.readsEstimate||0);updateReads();return d;
}
function shell(){
  document.body.innerHTML=`<div class="dueShell">
  <header class="dueTop"><a class="dueBrand" href="/"><img src="/assets/tenant-logo"><div><b>MR API HUB</b><small>${esc(window.MRAPI_TENANT?.shortName||'MRAPI')}</small></div></a>
    <nav><a href="/inbox">▣ Bandeja</a><a class="active" href="/crm">▦ CRM</a><a href="/">◇ HUB</a></nav>
    <span class="spacer"></span><span class="version-pill">v1.5.26</span><span class="who">${esc(S.user?.name||S.user?.email||'')}</span>
  </header>
  <main class="dueMain">
    <div class="dueHead"><div><h1>Centro de Vencimientos</h1><p>Seguimiento comercial, selección masiva y plantillas aprobadas.</p></div><span class="spacer"></span><a class="btn secondary" href="/agenda">Agenda</a></div>
    <div class="dueModules"><a href="/crm">Pipeline</a><a href="/contacts">Contactos</a><a href="/agenda">Agenda</a><a class="active" href="/vencimientos">Vencimientos</a></div>
    <section class="dueCard">
      <div class="dueTabs" id="tabs">${[['vencidos','Vencidos'],['hoy','Hoy'],['proximos_7','Próximos 7 días']].map(x=>`<button class="${S.mode===x[0]?'active':''}" data-mode="${x[0]}">${x[1]}</button>`).join('')}</div>
      <div class="dueFilters">
        <select id="stage"><option value="">Todas las etapas</option></select>
        <select id="owner"><option value="">Todos mis vendedores</option></select>
        <select id="dtype"><option value="">Todos los tipos</option></select>
        <select id="sendState"><option value="">Todos</option><option value="ready">Listos para enviar</option><option value="resend">Con historial / reenviar</option><option value="blocked">Bloqueados</option></select>
        <select id="limit"><option>50</option><option selected>100</option><option>200</option></select>
        <input id="q" placeholder="Buscar cliente, trato, owner, teléfono...">
        <button class="btn" id="reload">Actualizar</button>
      </div>
      <div class="dueStats" id="stats"></div>
      <div class="dueInfo"><span id="loadedInfo"></span><span id="reads"></span></div>
      <div id="notice"></div>
    </section>

    <section class="sendCard">
      <div class="sendHead"><div><b id="selectedPill">0 seleccionados</b><span>Crear campaña o hacer un envío directo</span></div><button class="btn secondary small" id="clearSel">Limpiar selección</button></div>
      <div class="sendGrid">
        <label>Plantilla<select id="template"><option value="">Seleccionar plantilla...</option></select></label>
        <label>Próximo vencimiento<input type="date" id="nextDue"></label>
        <label>Nombre campaña<input id="campaign" placeholder="Ej. Seguimiento vencidos septiembre"></label>
        <div class="sendActions"><button class="btn secondary sendBtn" id="createCampaignBtn">Crear campaña</button><button class="btn sendBtn" id="sendBtn">Enviar directo</button></div>
      </div>
      <div class="sendHint" id="templateHint">Las plantillas se cargan desde Twilio del tenant.</div>
      <div id="sendMsg"></div>
    </section>

    <section class="campaignSection">
      <div class="campaignSectionHead"><div><h2>Campañas de Recontacto</h2><p>Se purgan automáticamente cuando el contacto responde.</p></div><button class="btn secondary small" id="refreshCampaigns">Actualizar campañas</button></div>
      <div id="campaignsBox"><div class="loading">Cargando campañas...</div></div>
    </section>

    <section id="groupsBox"><div class="loading">Cargando vencimientos...</div></section>
  </main>
  <div class="dueModalBack" id="modalBack"><section class="dueModal"><div class="dueModalHead"><b id="modalTitle">Historial</b><button class="btn secondary small" id="modalClose">Cerrar</button></div><div id="modalBody" class="dueModalBody"></div></section></div>
  </div>`;
  $('tabs').querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;$('tabs').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.mode===S.mode));load()});
  ['stage','owner','dtype','sendState','limit'].forEach(id=>$(id).onchange=load);
  let tm;$('q').oninput=()=>{clearTimeout(tm);tm=setTimeout(load,350)};
  $('reload').onclick=load;$('clearSel').onclick=()=>{S.selected.clear();renderGroups();updateSelection()};
  $('sendBtn').onclick=sendSelected;$('createCampaignBtn').onclick=createCampaign;$('refreshCampaigns').onclick=loadCampaigns;$('modalClose').onclick=closeModal;$('modalBack').onclick=e=>{if(e.target===$('modalBack'))closeModal()};
}
function updateReads(){if($('reads'))$('reads').textContent=`Reads aprox. sesión: ${S.reads}`}
function notice(msg,type=''){const el=$('notice');if(!el)return;el.className=msg?`dueNotice ${type}`:'';el.textContent=msg||''}
function fillMeta(){
  for(const s of S.meta.stages||[])$('stage').insertAdjacentHTML('beforeend',`<option>${esc(s)}</option>`);
  for(const o of S.meta.owners||[])$('owner').insertAdjacentHTML('beforeend',`<option value="${esc(o.email)}">${esc(o.name||o.email)}</option>`);
  for(const t of S.meta.dealTypes||[])$('dtype').insertAdjacentHTML('beforeend',`<option value="${esc(t)}">${esc(S.meta.dealTypeLabels?.[t]||t)}</option>`);
  $('nextDue').value=plusDays(S.meta.today||new Date().toISOString().slice(0,10),7);
}
function plusDays(iso,n){const [y,m,d]=String(iso).split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d+n));return x.toISOString().slice(0,10)}
async function loadTemplates(){
  try{
    const d=await api('/api/due-center/templates');S.templates=d.templates||[];
    $('template').innerHTML='<option value="">Seleccionar plantilla...</option>'+S.templates.map(t=>`<option value="${esc(t.sid)}">${esc(t.name)}${t.language?' · '+esc(t.language):''}${t.category?' · '+esc(t.category):''}</option>`).join('');
    $('templateHint').textContent=S.templates.length?`${S.templates.length} plantilla(s) aprobada(s) disponibles.`:'No hay plantillas aprobadas.';
  }catch(e){$('templateHint').textContent='No se pudieron cargar plantillas: '+e.message}
}
function query(){
  const p=new URLSearchParams({mode:S.mode,limit:$('limit').value||'100'});
  if($('stage').value)p.set('stage',$('stage').value);if($('owner').value)p.set('owner',$('owner').value);
  if($('dtype').value)p.set('dealType',$('dtype').value);if($('sendState').value)p.set('sendState',$('sendState').value);
  if($('q').value.trim())p.set('q',$('q').value.trim());return p;
}
async function load(){
  notice('');$('groupsBox').innerHTML='<div class="loading">Cargando vencimientos...</div>';
  try{
    const d=await api('/api/due-center/deals?'+query());S.rows=d.deals||[];S.groups=d.groups||{};
    S.selected=new Set([...S.selected].filter(id=>S.rows.some(r=>r.id===id&&r.canSend)));
    renderStats(d.summary||{});renderGroups();updateSelection();
    $('loadedInfo').textContent=`${S.mode==='vencidos'?'Vencidos':S.mode==='hoy'?'Hoy':'Próximos 7 días'} · ${S.rows.length} trato(s) cargados`;
  }catch(e){$('groupsBox').innerHTML=`<div class="dueCard"><div class="dueNotice error">${esc(e.message)}</div></div>`}
}
function renderStats(s){
  $('stats').innerHTML=[['Total cargado',s.total||0],['Habilitados para enviar',s.ready||0],['Bloqueados / sin teléfono',s.blocked||0],['Con historial',s.sent||0]].map(x=>`<div class="metric"><small>${esc(x[0])}</small><strong>${Number(x[1]||0)}</strong></div>`).join('');
}
function rowHtml(r){
  const selected=S.selected.has(r.id);const hist=Number(r.sentCount||0)>0;
  return `<article class="dueRow ${!r.canSend?'blocked':''}">
    <label class="check"><input type="checkbox" data-check="${esc(r.id)}" ${selected?'checked':''} ${r.canSend?'':'disabled'}></label>
    <div class="dueMainCell"><div class="dueTitle">${esc(r.title||'Sin título')}</div><div class="dueContact">${esc(r.contactName||'')} ${r.phone?'· '+esc(r.phone):''}</div><div class="dueTags"><span>${esc(r.dealTypeLabel||'—')}</span><span>${esc(r.owner||'Sin owner')}</span>${hist?`<span class="sent">Enviado ${Number(r.sentCount)}x</span>`:''}${!r.canSend?'<span class="bad">Sin teléfono válido</span>':''}</div></div>
    <div class="dueDateCell"><small>Vence</small><b>${esc(r.dueDate||'—')}</b></div>
    <div class="rowActions"><a class="miniBtn" href="/crm?dealId=${encodeURIComponent(r.id)}">Abrir trato</a><button class="miniBtn" data-logs="${esc(r.id)}">Historial</button></div>
  </article>`;
}
function renderGroups(){
  const stages=Object.keys(S.groups||{});
  if(!stages.length){$('groupsBox').innerHTML='<div class="dueCard empty">No hay tratos para mostrar.</div>';return}
  $('groupsBox').innerHTML=stages.map(stage=>{
    const rows=S.groups[stage]||[],ready=rows.filter(x=>x.canSend).length;
    return `<section class="dueGroup"><div class="groupHead"><div><h3>${esc(stage)}</h3><span>${rows.length} trato(s) · ${ready} habilitado(s)</span></div><button class="miniBtn" data-selectstage="${esc(stage)}">Seleccionar habilitados</button></div><div class="groupRows">${rows.map(rowHtml).join('')}</div></section>`;
  }).join('');
  document.querySelectorAll('[data-check]').forEach(el=>el.onchange=()=>{if(el.checked)S.selected.add(el.dataset.check);else S.selected.delete(el.dataset.check);updateSelection()});
  document.querySelectorAll('[data-selectstage]').forEach(btn=>btn.onclick=()=>{for(const r of S.groups[btn.dataset.selectstage]||[])if(r.canSend)S.selected.add(r.id);renderGroups();updateSelection()});
  document.querySelectorAll('[data-logs]').forEach(btn=>btn.onclick=()=>openLogs(btn.dataset.logs));
}
function updateSelection(){if($('selectedPill'))$('selectedPill').textContent=`${S.selected.size} seleccionado${S.selected.size===1?'':'s'}`}

async function loadCampaigns(){
  try{
    const d=await api('/api/due-center/campaigns');S.campaigns=d.items||[];renderCampaigns();
  }catch(e){$('campaignsBox').innerHTML=`<div class="dueNotice error">${esc(e.message)}</div>`}
}
function campaignNoResponse(c){return Math.max(0,Number(c.sent||0)-Number(c.responded||0))}
function renderCampaigns(){
  if(!S.campaigns.length){$('campaignsBox').innerHTML='<div class="dueCard empty">Todavía no hay campañas creadas.</div>';return}
  $('campaignsBox').innerHTML=S.campaigns.map(c=>`<article class="campaignCard">
    <div class="campaignTop"><div><small>CAMPAÑA ${Number(c.generation||0)>0?'· RECONTACTO '+Number(c.generation):''}</small><h3>${esc(c.name||'Sin nombre')}</h3><span>${c.templateName?esc(c.templateName):''}${c.nextDueDate?' · próximo '+esc(c.nextDueDate):''}</span></div><span class="campaignStatus">${esc(c.status||'ACTIVE')}</span></div>
    <div class="campaignMetrics">
      <button data-cmembers="${esc(c.id)}" data-status=""><small>Todos</small><b>${Number(c.total||0)}</b></button>
      <button data-cmembers="${esc(c.id)}" data-status="RESPONDED" class="good"><small>Respondieron</small><b>${Number(c.responded||0)}</b></button>
      <button data-cmembers="${esc(c.id)}" data-status="SIN_RESPUESTA" class="warn"><small>Sin respuesta</small><b>${campaignNoResponse(c)}</b></button>
      <button data-cmembers="${esc(c.id)}" data-status="PENDING"><small>Pendientes</small><b>${Number(c.pending||0)}</b></button>
      <button data-cmembers="${esc(c.id)}" data-status="ERROR" class="bad"><small>Errores</small><b>${Number(c.errors||0)}</b></button>
    </div>
    <div class="campaignActions">
      <button class="miniBtn" data-csend="${esc(c.id)}">Enviar próximos 30 pendientes</button>
      <button class="miniBtn" data-csub="${esc(c.id)}" ${campaignNoResponse(c)?'':'disabled'}>Crear subcampaña sin respuesta</button>
    </div>
  </article>`).join('');
  document.querySelectorAll('[data-cmembers]').forEach(b=>b.onclick=()=>openCampaignMembers(b.dataset.cmembers,b.dataset.status||''));
  document.querySelectorAll('[data-csend]').forEach(b=>b.onclick=()=>sendCampaignBatch(b.dataset.csend));
  document.querySelectorAll('[data-csub]').forEach(b=>b.onclick=()=>createSubcampaign(b.dataset.csub));
}
async function createCampaign(){
  const ids=[...S.selected],contentSid=$('template').value,name=$('campaign').value.trim(),nextDueDate=$('nextDue').value;
  if(!ids.length)return notice('Seleccioná contactos para crear la campaña.','error');
  if(ids.length>200)return notice('La campaña admite hasta 200 contactos por cohorte.','error');
  if(!contentSid)return notice('Seleccioná una plantilla aprobada.','error');
  const campaignName=name||`Recontacto ${new Date().toLocaleDateString('es-AR')}`;
  if(!confirm(`Crear campaña "${campaignName}" con ${ids.length} contacto(s)?`))return;
  $('createCampaignBtn').disabled=true;
  try{
    const d=await api('/api/due-center/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealIds:ids,name:campaignName,contentSid,nextDueDate})});
    notice(`Campaña creada con ${d.total} contacto(s). Ahora podés enviar los pendientes de a 30.`,'ok');
    S.selected.clear();renderGroups();updateSelection();await loadCampaigns();
  }catch(e){notice(e.message,'error')}finally{$('createCampaignBtn').disabled=false}
}
async function sendCampaignBatch(id){
  if(!confirm('Enviar ahora hasta 30 pendientes de esta campaña?'))return;
  try{
    const d=await api('/api/due-center/campaigns/'+encodeURIComponent(id)+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:30})});
    notice(`Campaña: ${d.sent} enviados · ${d.errors} errores.` ,d.errors?'warn':'ok');
    await loadCampaigns();
  }catch(e){notice(e.message,'error')}
}
async function createSubcampaign(id){
  const parent=S.campaigns.find(x=>x.id===id);if(!parent)return;
  const name=prompt('Nombre de la subcampaña',`${parent.name} · Recontacto ${Number(parent.generation||0)+1}`);
  if(!name)return;
  const contentSid=$('template').value||parent.templateSid;
  const templateName=$('template').selectedOptions?.[0]?.textContent||parent.templateName||'';
  const nextDueDate=$('nextDue').value||parent.nextDueDate;
  try{
    const d=await api('/api/due-center/campaigns/'+encodeURIComponent(id)+'/subcampaign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,contentSid,templateName,nextDueDate})});
    notice(`Subcampaña creada con ${d.total} contacto(s) sin respuesta.`,'ok');await loadCampaigns();
  }catch(e){notice(e.message,'error')}
}
async function openCampaignMembers(id,status){
  $('modalBack').classList.add('open');
  const c=S.campaigns.find(x=>x.id===id);$('modalTitle').textContent=(c?.name||'Campaña')+(status?` · ${status==='SIN_RESPUESTA'?'Sin respuesta':status}`:'');
  $('modalBody').innerHTML='<div class="loading">Cargando miembros...</div>';
  try{
    const p=new URLSearchParams();if(status)p.set('status',status);
    const d=await api('/api/due-center/campaigns/'+encodeURIComponent(id)+'/members?'+p);
    $('modalBody').innerHTML=(d.items||[]).map(x=>`<div class="memberRow"><div><b>${esc(x.contactName||x.dealId)}</b><span>${esc(x.phone||'')} · ${esc(x.owner||'')}</span></div><span class="memberStatus ${String(x.status||'').toLowerCase()}">${esc(x.status||'')}</span><a class="miniBtn" href="/crm?dealId=${encodeURIComponent(x.dealId)}">Abrir trato</a></div>`).join('')||'<div class="empty">Sin contactos en este estado.</div>';
  }catch(e){$('modalBody').innerHTML=`<div class="dueNotice error">${esc(e.message)}</div>`}
}
async function sendSelected(){
  const ids=[...S.selected],sid=$('template').value,nextDue=$('nextDue').value,campaign=$('campaign').value.trim();
  if(!ids.length)return notice('Seleccioná al menos un trato.','error');if(!sid)return notice('Seleccioná una plantilla aprobada.','error');
  if(ids.length>30)return notice('Por seguridad, enviá hasta 30 tratos por tanda.','error');
  const name=$('template').selectedOptions?.[0]?.textContent||sid;
  if(!confirm(`Enviar "${name}" a ${ids.length} trato(s) y mover su próximo vencimiento a ${nextDue}?`))return;
  $('sendBtn').disabled=true;$('sendMsg').textContent='Enviando...';
  try{
    const d=await api('/api/due-center/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealIds:ids,contentSid:sid,nextDueDate:nextDue,campaignName:campaign})});
    $('sendMsg').className=d.errors?'dueNotice warn':'dueNotice ok';$('sendMsg').textContent=`Enviados: ${d.sent} · Errores: ${d.errors}`;
    S.selected.clear();await load();
  }catch(e){$('sendMsg').className='dueNotice error';$('sendMsg').textContent=e.message}
  finally{$('sendBtn').disabled=false}
}
async function openLogs(id){
  $('modalBack').classList.add('open');$('modalBody').innerHTML='<div class="loading">Cargando historial...</div>';
  try{const d=await api('/api/due-center/deals/'+encodeURIComponent(id)+'/logs');$('modalBody').innerHTML=(d.items||[]).map(x=>`<div class="logRow"><b>${esc(x.templateName||x.templateSid||x.type||'Seguimiento')}</b><span>${esc(x.status||'')} · ${esc(x.nextDueDate||'')}</span>${x.error?`<em>${esc(x.error)}</em>`:''}</div>`).join('')||'<div class="empty">Sin historial registrado.</div>'}catch(e){$('modalBody').innerHTML='<div class="dueNotice error">'+esc(e.message)+'</div>'}
}
function closeModal(){$('modalBack').classList.remove('open')}
async function start(){if(!S.token)return location.href='/crm';shell();try{S.meta=await api('/api/due-center/meta');fillMeta();await Promise.all([loadTemplates(),load(),loadCampaigns()])}catch(e){notice(e.message,'error')}}
start();
})();