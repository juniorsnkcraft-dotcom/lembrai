/* Lembra Aí — app de lembretes (Capacitor / Android) */
const CATS = {
  pessoal:{n:'Pessoal',e:'🙂',c:'#7C5CFF'},
  trabalho:{n:'Trabalho',e:'💼',c:'#2F80ED'},
  contas:{n:'Contas',e:'💸',c:'#D99A00'},
  casa:{n:'Casa',e:'🏠',c:'#1F9D74'},
  compras:{n:'Compras',e:'🛒',c:'#E76F51'},
  saude:{n:'Saúde',e:'❤️',c:'#D62839'},
};
const N = window.Native || { isNative:false };
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (s,n) => { const d = parseYmd(s); d.setDate(d.getDate()+n); return ymd(d); };
const today = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return pad(d.getHours())+':'+pad(d.getMinutes()); };
const hm = d => pad(d.getHours())+':'+pad(d.getMinutes());
const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const atDate = it => { const d = parseYmd(it.data); const [h,m] = it.hora.split(':').map(Number); d.setHours(h,m,0,0); return d; };

let items = new Map();
let filter = 'tudo';
let showDone = false;
let fCat = null;
let editing = null;
let eCat = 'pessoal';

/* ================= armazenamento ================= */
const KEY = 'lembra-ai-itens';
async function loadAll(){
  try {
    if (N.Preferences){ const r = await N.Preferences.get({ key: KEY }); return JSON.parse(r.value || '{}') || {}; }
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch { return {}; }
}
let saving = Promise.resolve();
function saveAll(){
  const json = JSON.stringify(Object.fromEntries(items));
  saving = saving.then(async () => {
    try { if (N.Preferences) await N.Preferences.set({ key: KEY, value: json }); else localStorage.setItem(KEY, json); }
    catch { toast('Não consegui salvar 😕'); }
  });
}
function persist(id, obj){
  if (obj) items.set(id, obj); else items.delete(id);
  render(); saveAll(); syncNotifs();
}

/* ================= notificações ================= */
let notifOk = false;
const hashId = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (Math.abs(h) % 2000000000) + 1; };

async function setupNotifs(){
  if (!N.isNative) return;
  const LN = N.LocalNotifications;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    notifOk = p.display === 'granted';
  } catch { notifOk = false; }
  try {
    await LN.createChannel({ id:'lembretes', name:'Lembretes', description:'Avisos dos seus lembretes', importance:5, visibility:1, vibration:true, lights:true, lightColor:'#FF5A1F' });
  } catch {}
  try {
    await LN.registerActionTypes({ types: [{ id:'LEMBRETE', actions: [
      { id:'feito', title:'Feito ✓' },
      { id:'adiar', title:'+10 min' },
    ]}]});
  } catch {}
  LN.addListener('localNotificationActionPerformed', ev => {
    const id = ev && ev.notification && ev.notification.extra && ev.notification.extra.itemId;
    if (!id || !items.has(id)) return;
    if (ev.actionId === 'feito') setDone(id, true);
    else if (ev.actionId === 'adiar') snooze(id);
    else openSheet(id);
  });
  await checkWarnings();
  syncNotifs();
}

async function checkWarnings(){
  if (!N.isNative) return;
  const LN = N.LocalNotifications;
  const w = $('#warn');
  try {
    const p = await LN.checkPermissions();
    notifOk = p.display === 'granted';
  } catch {}
  if (!notifOk){
    $('#warnTxt').textContent = '🔕 Notificações desligadas';
    $('#warnBtn').onclick = async () => {
      try { const p = await LN.requestPermissions(); notifOk = p.display === 'granted'; } catch {}
      if (!notifOk) toast('Ative em Configurações › Apps › Lembra Aí › Notificações');
      checkWarnings(); syncNotifs();
    };
    w.hidden = false; return;
  }
  try {
    const r = await LN.checkExactNotificationSetting();
    if (r && r.exact_alarm && r.exact_alarm !== 'granted'){
      $('#warnTxt').textContent = '⏰ Permita "Alarmes e lembretes" pra avisar na hora certinha';
      $('#warnBtn').onclick = async () => { try { await LN.changeExactNotificationSetting(); } catch {} };
      w.hidden = false; return;
    }
  } catch {}
  w.hidden = true;
}

let syncing = Promise.resolve();
function syncNotifs(){ syncing = syncing.then(doSync).catch(() => {}); }
async function doSync(){
  if (!N.isNative || !notifOk) return;
  const LN = N.LocalNotifications;
  const pend = await LN.getPending();
  if (pend.notifications && pend.notifications.length)
    await LN.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
  const now = Date.now(), list = [];
  for (const [id, it] of items){
    if (it.feito || !it.data || !it.hora) continue;
    const at = atDate(it);
    if (at.getTime() <= now + 1500) continue;
    const c = CATS[it.categoria] || CATS.pessoal;
    list.push({
      id: hashId(id),
      title: (it.importante ? '⭐ ' : '⏰ ') + it.titulo,
      body: it.nota || `${c.e} ${c.n} · ${it.hora}`,
      largeBody: it.nota || undefined,
      schedule: { at, allowWhileIdle: true },
      channelId: 'lembretes',
      actionTypeId: 'LEMBRETE',
      extra: { itemId: id },
    });
  }
  list.sort((a,b) => a.schedule.at - b.schedule.at);
  if (list.length) await LN.schedule({ notifications: list.slice(0, 64) });
}

async function testNotif(){
  if (!N.isNative){ toast('A notificação funciona no app instalado'); return; }
  if (!notifOk){ await checkWarnings(); toast('Ative as notificações primeiro'); return; }
  try {
    await N.LocalNotifications.schedule({ notifications: [{
      id: 999999, title: '🔔 Teste do Lembra Aí', body: 'Se você viu isso, as notificações estão funcionando!',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: 'lembretes',
    }]});
    toast('Chega em 5 segundos — pode fechar o app');
  } catch { toast('Não consegui agendar o teste'); }
}

/* ================= entender o texto ================= */
const fold = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const WD = { domingo:0, segunda:1, terca:2, quarta:3, quinta:4, sexta:5, sabado:6 };

function parsePT(raw){
  let s = ' ' + raw.normalize('NFC').replace(/\s+/g, ' ').trim() + ' ';
  let data = null, hora = null;
  const T = today();
  const cut = re => {
    const m = fold(s).match(re);
    if (!m) return null;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return m;
  };
  let m;
  // daqui a X minutos/horas
  if ((m = cut(/\s(?:daqui a|daqui|em)\s+(\d{1,3})\s*(min|minutos?|h|horas?)\b/))){
    const d = new Date(Date.now() + (+m[1]) * (m[2].startsWith('h') ? 3600000 : 60000));
    return finish(s, ymd(d), hm(d));
  }
  if ((m = cut(/\s(?:depois de amanha)\b/))) data = addDays(T, 2);
  else if ((m = cut(/\s(?:amanha|amnh)\b/))) data = addDays(T, 1);
  else if ((m = cut(/\s(?:hoje|hj)\b/))) data = T;
  else if ((m = cut(/\s(?:(?:n[ao]|nesta|nessa|esta|essa|proxim[ao]|na proxima|no proximo)\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)?\b/))){
    const diff = (WD[m[1]] - new Date().getDay() + 7) % 7 || 7;
    data = addDays(T, diff);
  }
  else if ((m = cut(/\s(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))){
    let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000;
    const d = new Date(y, +m[2]-1, +m[1]);
    if (!m[3] && ymd(d) < T) d.setFullYear(y + 1);
    data = ymd(d);
  }
  else if ((m = cut(/\s(?:no\s+)?dia\s+(\d{1,2})\b/))){
    const now = new Date(); let d = new Date(now.getFullYear(), now.getMonth(), +m[1]);
    if (ymd(d) < T) d = new Date(now.getFullYear(), now.getMonth() + 1, +m[1]);
    data = ymd(d);
  }
  // hora
  const per = (h, p) => { if (p && (p === 'tarde' || p === 'noite') && h < 12) h += 12; if (p === 'manha' && h === 12) h = 0; return h; };
  if ((m = cut(/\s(?:(?:a|as|ao)\s+)?meio[- ]dia\b/))) hora = '12:00';
  else if ((m = cut(/\s(?:(?:a|as)\s+)?meia[- ]noite\b/))) hora = '00:00';
  else if ((m = cut(/\s(?:(?:a|as|pelas?)\s+)?(\d{1,2})\s*(?:h|:|hs|horas?)\s*(\d{2})?(?:\s*min)?(?:\s+(?:da|de)\s+(manha|tarde|noite))?(?=\W)/))){
    const h = per(+m[1], m[3]); if (h < 24 && (!m[2] || +m[2] < 60)) hora = pad(h) + ':' + (m[2] || '00');
  }
  else if ((m = cut(/\s(?:(?:a|as|pelas?)\s+)?(\d{1,2})\s+(?:da|de)\s+(manha|tarde|noite)\b/))){
    const h = per(+m[1], m[2]); if (h < 24) hora = pad(h) + ':00';
  }
  else if ((m = cut(/\s(?:a|as)\s+(\d{1,2})\b/))){
    const h = +m[1]; if (h < 24) hora = pad(h) + ':00';
  }
  // "de manhã", "à tarde", "à noite": tira do texto e, se não tem hora, usa um horário padrão
  if ((m = cut(/\s(?:a|de|pela|na|hoje a)\s+(manha|tarde|noite)\b/)) && !hora)
    hora = { manha:'09:00', tarde:'15:00', noite:'20:00' }[m[1]];
  if (hora && !data) data = hora > nowHM() ? T : addDays(T, 1);
  return finish(s, data, hora);
}
function finish(s, data, hora){
  let t = s.replace(/\s+/g, ' ').trim();
  // tira conectores soltos no fim/começo
  for (let i = 0; i < 3; i++)
    t = t.replace(/(?:^|\s)(?:de|do|da|no|na|as|às|a|à|pra|para|em|e|,|-)\s*$/i, '').replace(/^(?:e|de|,|-)\s+/i, '').trim();
  t = t.replace(/[\s,;.-]+$/, '');
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return { titulo: t, data, hora, categoria: guessCat(t) };
}
function guessCat(t){
  const f = fold(t);
  if (/\b(pagar|conta|boleto|fatura|pix|aluguel|luz|agua|internet|cartao|imposto|banco|transferir)\b/.test(f)) return 'contas';
  if (/\b(medic[oa]|remedio|consulta|dentista|exame|academia|vacina|farmacia|treino|hospital)\b/.test(f)) return 'saude';
  if (/\b(reuniao|cliente|trabalho|editar|edicao|video|entregar|sebrae|aula|email|e-mail|proposta|projeto|render|exportar)\b/.test(f)) return 'trabalho';
  if (/\b(comprar|mercado|supermercado|feira|padaria|pao|leite|loja)\b/.test(f)) return 'compras';
  if (/\b(limpar|lavar|casa|roupa|lixo|cozinha|consertar|varrer|louca|regar|planta)\b/.test(f)) return 'casa';
  return 'pessoal';
}

/* ================= categorias / filtros ================= */
function buildCats(el, getSel, onPick){
  el.innerHTML = '';
  for (const [k,c] of Object.entries(CATS)){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip cat' + (getSel() === k ? ' on' : '');
    b.style.setProperty('--c', c.c);
    b.textContent = c.e + ' ' + c.n;
    b.onclick = () => onPick(k);
    el.append(b);
  }
}
function pickFCat(c){ fCat = (fCat === c ? null : c); buildCats($('#fCats'), () => fCat, pickFCat); }
function pickECat(c){ eCat = c; buildCats($('#eCats'), () => eCat, pickECat); }

function renderFilters(){
  const el = $('#filters'); el.innerHTML = '';
  const opts = [['tudo','Tudo'],['hoje','📌 Hoje'],['star','⭐ Importantes'], ...Object.entries(CATS).map(([k,c]) => ['cat:'+k, c.e+' '+c.n])];
  for (const [k,l] of opts){
    const b = document.createElement('button');
    b.className = 'chip' + (filter === k ? ' on' : '');
    b.textContent = l;
    b.onclick = () => { filter = k; renderFilters(); render(); };
    el.append(b);
  }
}
function passFilter(it){
  if (filter === 'tudo') return true;
  if (filter === 'hoje'){ const g = groupOf(it); return g === 'atrasado' || g === 'hoje' || (it.feito && it.data === today()); }
  if (filter === 'star') return !!it.importante;
  return 'cat:' + it.categoria === filter;
}

/* ================= lista ================= */
function groupOf(it){
  if (it.feito) return 'feito';
  if (!it.data) return 'semdata';
  const t = today();
  if (it.data < t || (it.data === t && it.hora && it.hora < nowHM())) return 'atrasado';
  if (it.data === t) return 'hoje';
  if (it.data === addDays(t,1)) return 'amanha';
  return 'proximos';
}
const cmp = (a,b) => ((a.data||'9')+(a.hora||'99')).localeCompare((b.data||'9')+(b.hora||'99')) || (b.importante?1:0)-(a.importante?1:0) || (a.criadoEm||0)-(b.criadoEm||0);

function whenLabel(it){
  if (!it.data) return it.hora || '';
  const t = today();
  let d;
  if (it.data === t) d = 'Hoje';
  else if (it.data === addDays(t,1)) d = 'Amanhã';
  else if (it.data === addDays(t,-1)) d = 'Ontem';
  else d = parseYmd(it.data).toLocaleDateString('pt-BR', {weekday:'short', day:'numeric', month:'short'}).replace(/\./g,'');
  return d + (it.hora ? ' · ' + it.hora : '');
}

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function itemEl(it){
  const li = document.createElement('li');
  li.className = 'item' + (it.feito ? ' done' : '');
  const cb = document.createElement('button');
  cb.className = 'check'; cb.innerHTML = CHECK;
  cb.setAttribute('aria-label', it.feito ? 'Desmarcar' : 'Marcar como feito');
  cb.onclick = e => { e.stopPropagation(); unlockAudio(); toggleDone(it.id, li); };
  const body = document.createElement('div'); body.className = 'body';
  const t = document.createElement('div'); t.className = 'title'; t.textContent = it.titulo;
  const meta = document.createElement('div'); meta.className = 'meta';
  const w = whenLabel(it);
  if (w){
    const s = document.createElement('span');
    s.className = 'when' + (groupOf(it) === 'atrasado' ? ' late' : '');
    s.textContent = (it.hora ? '🕐 ' : '📅 ') + w;
    meta.append(s);
  }
  const c = CATS[it.categoria];
  if (c){
    const s = document.createElement('span'); s.className = 'tag'; s.style.setProperty('--c', c.c);
    s.append(document.createElement('i'), document.createTextNode(c.n)); meta.append(s);
  }
  if (it.nota){ const s = document.createElement('span'); s.className = 'note-ico'; s.textContent = '📝'; meta.append(s); }
  body.append(t); if (meta.childNodes.length) body.append(meta);
  li.append(cb, body);
  if (it.importante && !it.feito){ const s = document.createElement('span'); s.className = 'staricon'; s.textContent = '★'; li.append(s); }
  li.onclick = () => openSheet(it.id);
  return li;
}

function render(){
  const list = $('#list'); list.innerHTML = '';
  const all = [...items.entries()].map(([id,v]) => ({ id, ...v }));
  const groups = { atrasado:[], hoje:[], amanha:[], proximos:[], semdata:[], feito:[] };
  all.filter(passFilter).forEach(it => groups[groupOf(it)].push(it));

  const pend = all.filter(it => ['atrasado','hoje'].includes(groupOf(it))).length;
  const late = all.filter(it => groupOf(it) === 'atrasado').length;
  const badge = $('#badge');
  badge.className = 'badge' + (pend ? '' : ' zero');
  badge.textContent = pend ? (late ? `${late} atrasado${late>1?'s':''}` : `${pend} pra hoje`) : 'Tudo em dia ✓';

  const order = [['atrasado','Atrasados'],['hoje','Hoje'],['amanha','Amanhã'],['proximos','Próximos dias'],['semdata','Sem data']];
  let any = false;
  for (const [k,label] of order){
    const arr = groups[k]; if (!arr.length) continue; any = true;
    arr.sort(cmp);
    const sec = document.createElement('section'); sec.className = 'group ' + k;
    const h = document.createElement('h2'); h.textContent = `${label} · ${arr.length}`;
    const ul = document.createElement('ul'); arr.forEach(it => ul.append(itemEl(it)));
    sec.append(h, ul); list.append(sec);
  }
  if (!any){
    const e = document.createElement('div'); e.className = 'empty';
    e.innerHTML = items.size
      ? '<b>🎉</b>Nada pendente aqui. Mandou bem!'
      : '<b>🧠</b>Escreve aí em cima o que você não pode esquecer.<br>Ex.: <i>pagar a luz amanhã às 9h</i>';
    list.append(e);
  }
  const done = groups.feito;
  if (done.length){
    done.sort((a,b) => (b.feitoEm||0)-(a.feitoEm||0));
    const sec = document.createElement('section'); sec.className = 'group feito';
    const h = document.createElement('h2');
    const tog = document.createElement('button'); tog.className = 'linkbtn';
    tog.textContent = (showDone ? '▾ ' : '▸ ') + `Feitos · ${done.length}`;
    tog.onclick = () => { showDone = !showDone; render(); };
    h.append(tog);
    if (showDone){
      const clr = document.createElement('button'); clr.className = 'linkbtn'; clr.textContent = 'Apagar feitos';
      clr.onclick = () => { done.forEach(it => items.delete(it.id)); render(); saveAll(); toast('Feitos apagados'); };
      h.append(clr);
    }
    sec.append(h);
    if (showDone){ const ul = document.createElement('ul'); done.forEach(it => ul.append(itemEl(it))); sec.append(ul); }
    list.append(sec);
  }
}

/* ================= ações ================= */
function setDone(id, val){
  const it = items.get(id); if (!it) return;
  persist(id, { ...it, feito: val, feitoEm: val ? Date.now() : null });
}
function toggleDone(id, li){
  const it = items.get(id); if (!it) return;
  if (!it.feito){
    if (li) li.classList.add('popping');
    setTimeout(() => setDone(id, true), li ? 280 : 0);
    toast('Feito ✓', 'Desfazer', () => setDone(id, false));
  } else setDone(id, false);
}
function snooze(id){
  const it = items.get(id); if (!it) return;
  const d = new Date(Date.now() + 10*60000);
  persist(id, { ...it, data: ymd(d), hora: hm(d) });
  toast('Te lembro de novo em 10 min');
}

function setComposerDay(n){
  const target = addDays(today(), n);
  $('#fDate').value = ($('#fDate').value === target) ? '' : target;
  syncDayChips();
}
function syncDayChips(){
  document.querySelectorAll('[data-day]').forEach(b => b.classList.toggle('on', $('#fDate').value === addDays(today(), +b.dataset.day)));
}

function addFromComposer(){
  unlockAudio();
  const ta = $('#txt');
  const text = ta.value.trim();
  if (!text){ const c = $('#composer'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); ta.focus(); return; }
  let titulo = text, data = $('#fDate').value || null, hora = $('#fTime').value || null, categoria = fCat;
  if ($('#aiOn').checked){
    const p = parsePT(text);
    if (p.titulo) titulo = p.titulo;
    if (!data && !hora){ data = p.data; hora = p.hora; }
    else { data = data || p.data; hora = hora || p.hora; }
    categoria = categoria || p.categoria;
  }
  if (hora && !data) data = hora > nowHM() ? today() : addDays(today(), 1);
  const it = { titulo: titulo.slice(0, 300), data, hora, categoria: categoria || 'pessoal', nota: '', importante: false, feito: false, feitoEm: null, criadoEm: Date.now() };
  ta.value = ''; $('#fDate').value = ''; $('#fTime').value = ''; fCat = null; syncDayChips();
  buildCats($('#fCats'), () => fCat, pickFCat);
  const id = newId(); markSeen(id, it); persist(id, it);
  toast('Anotado ✓' + (it.data ? ' — ' + whenLabel(it) : '') + (it.hora && notifOk ? ' 🔔' : ''));
}

/* ================= edição ================= */
function openSheet(id){
  const it = items.get(id); if (!it) return;
  editing = id; eCat = it.categoria || 'pessoal';
  $('#eTitle').value = it.titulo; $('#eDate').value = it.data || ''; $('#eTime').value = it.hora || '';
  $('#eNote').value = it.nota || ''; $('#eStar').checked = !!it.importante;
  $('#eDel').textContent = 'Excluir'; $('#eDel').dataset.armed = '';
  buildCats($('#eCats'), () => eCat, pickECat);
  $('#scrim').classList.add('open'); $('#sheet').classList.add('open');
}
function closeSheet(){ editing = null; $('#scrim').classList.remove('open'); $('#sheet').classList.remove('open'); }
function sheetValues(){
  const old = items.get(editing) || {};
  const titulo = $('#eTitle').value.trim() || old.titulo;
  const hora = $('#eTime').value || null;
  return { ...old, titulo, data: $('#eDate').value || (hora ? today() : null), hora, categoria: eCat, nota: $('#eNote').value.trim(), importante: $('#eStar').checked };
}

/* ================= alarme com app aberto ================= */
const alerted = new Set();
const keyOf = (id,it) => id + '|' + it.data + '|' + it.hora;
function isDueNow(it){ return !it.feito && it.data && it.hora && (it.data < today() || (it.data === today() && it.hora <= nowHM())); }
function markSeen(id,it){ if (isDueNow(it)) alerted.add(keyOf(id,it)); }
function markAlreadyDue(){ for (const [id,it] of items) markSeen(id,it); }
let alarmId = null;
function tick(){
  for (const [id,it] of items){
    if (isDueNow(it) && !alerted.has(keyOf(id,it))){ alerted.add(keyOf(id,it)); showAlarm(id, it); break; }
  }
  render();
}
function showAlarm(id, it){
  alarmId = id;
  $('#alarmTxt').textContent = it.titulo;
  $('#alarm').classList.remove('show'); void $('#alarm').offsetWidth; $('#alarm').classList.add('show');
  beep();
  try { navigator.vibrate && navigator.vibrate([200,100,200,100,300]); } catch {}
}
function hideAlarm(){ $('#alarm').classList.remove('show'); alarmId = null; }
let actx = null;
function unlockAudio(){ try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {} }
function beep(){
  try {
    if (!actx) return;
    [0, .25, .5].forEach((t,i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1046 : 880;
      g.gain.setValueAtTime(0.0001, actx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + .2);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + .22);
    });
  } catch {}
}

/* ================= toast ================= */
let toastT = null;
function toast(msg, action, fn){
  $('#toastTxt').textContent = msg;
  const b = $('#toastBtn');
  if (action){ b.hidden = false; b.textContent = action; b.onclick = () => { fn(); $('#toast').classList.remove('show'); }; }
  else b.hidden = true;
  $('#toast').classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => $('#toast').classList.remove('show'), action ? 4000 : 2600);
}

/* ================= ligações ================= */
$('#btnAdd').onclick = addFromComposer;
$('#txt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); addFromComposer(); } });
document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => setComposerDay(+b.dataset.day));
$('#fDate').addEventListener('change', syncDayChips);
$('#aiOn').addEventListener('change', e => { try { localStorage.setItem('lembra-ai-ia', e.target.checked ? '1' : '0'); } catch {} });
$('#scrim').onclick = closeSheet;
$('#eSave').onclick = () => { if (!editing) return; const id = editing, v = sheetValues(); closeSheet(); markSeen(id, v); persist(id, v); toast('Salvo ✓'); };
$('#eDel').onclick = () => {
  const b = $('#eDel');
  if (!b.dataset.armed){ b.dataset.armed = '1'; b.textContent = 'Tem certeza?'; return; }
  const id = editing, old = items.get(id); closeSheet();
  persist(id, null);
  toast('Apagado', 'Desfazer', () => persist(id, old));
};
$('#alarmDone').onclick = () => { const id = alarmId; hideAlarm(); if (id) setDone(id, true); };
$('#alarmSnooze').onclick = () => { const id = alarmId; hideAlarm(); if (id) snooze(id); };
$('#alarmClose').onclick = hideAlarm;
$('#btnTest').onclick = testNotif;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

async function init(){
  $('#todayLbl').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  try { if (localStorage.getItem('lembra-ai-ia') === '0') $('#aiOn').checked = false; } catch {}
  buildCats($('#fCats'), () => fCat, pickFCat);
  renderFilters();
  items = new Map(Object.entries(await loadAll()));
  markAlreadyDue();
  render();
  setInterval(tick, 15000);
  if (N.App){
    N.App.addListener('backButton', () => { if (editing) closeSheet(); else N.App.minimizeApp(); });
    N.App.addListener('appStateChange', s => { if (s.isActive){ render(); checkWarnings(); } });
  }
  setupNotifs();
}
init();
