/* ============================================================
   BANSHEE SOUND TECH — SHARED AUTH  (bl-auth.js)
   ------------------------------------------------------------
   ONE login for every app. Because all the apps live on the same
   origin (hauntedpubs.co.uk); bl-config.js namespaces storage per venue
   so signing in once works everywhere and lasts until Logout.

   It also fixes the "stuck on Loading…" bug: the PIN fetch now has a
   timeout, falls back to a cached copy, and shows a Retry button
   instead of hanging forever.

   PINS: read live from the Weekly Jobs sheet, Settings tab.
     B1 = Staff PIN        (role: staff)
     B2 = Manager PIN      (role: manager — can do everything staff can, plus manage)

   HOW EACH APP USES IT  (see integration notes):
     load ../bl-config.js then ../bl-auth.js
     BLAuth.init({ appName:'Weekly Jobs', require:'staff', onReady:function(role){ startApp(); } });
     BLAuth.requireManager(function(){ ...manager-only action... });
     Mark manager-only buttons with  data-bl-manager  and call BLAuth.applyRoleVisibility().
   ============================================================ */
(function () {
  // PINs come from bl-config.js via window.BL_CFG.
  const AUTH_KEY     = 'bl_auth_'+((window.BL_CFG&&BL_CFG.venueKey)||'v');        // VENUE-SCOPED {role, ts}
  const PIN_CACHE    = 'bl_pin_cache_'+((window.BL_CFG&&BL_CFG.venueKey)||'v');   // VENUE-SCOPED {staff, manager, ts}
  try{localStorage.removeItem('bl_auth');localStorage.removeItem('bl_pin_cache');}catch(e){}  // wipe legacy shared keys (pre venue-scoping)
  const FETCH_MS     = 7000;             // give up on the sheet after 7s
  const FALLBACK     = { staff: '1234', manager: '1111' };

  let pins = null;            // {staff, manager}
  let opts = {};              // init options
  let entry = '';
  let mode = 'login';         // 'login' | 'manager'
  let onManagerOk = null;

  /* ---------- tiny helpers ---------- */
  function parseCSVLine(line){const o=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c.trim());c='';}else c+=ch;}o.push(c.trim());return o;}
  function clean(s){return (s||'').replace(/^"|"$/g,'').trim();}
  function getAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null');}catch(e){return null;}}
  function setAuth(role){localStorage.setItem(AUTH_KEY,JSON.stringify({role,ts:Date.now()}));}

  /* ---------- PIN loading: timeout + cache ---------- */
  async function fetchPins(){
    var c=window.BL_CFG||{};
    return {staff:(c.staffPin||FALLBACK.staff),manager:(c.managerPin||FALLBACK.manager),master:(c.masterPin||'')};
  }

  /* ---------- styles (self-contained, matches the apps) ---------- */
  function injectStyles(){
    if (document.getElementById('bl-auth-style')) return;
    const css = `
    #bl-auth-overlay{position:fixed;inset:0;z-index:99999;background:#0d0d0f;color:#e8e8ec;
      font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:26px;padding:24px}
    #bl-auth-overlay.hidden{display:none}
    .bla-logo{font-family:'Bebas Neue','DM Sans',sans-serif;font-size:38px;letter-spacing:3px;color:#e8b84b;text-align:center}
    .bla-sub{font-size:12px;color:#6b6b78;letter-spacing:2px;text-transform:uppercase;margin-top:-18px}
    .bla-dots{display:flex;gap:16px}
    .bla-dot{width:16px;height:16px;border-radius:50%;border:2px solid #2a2a30;background:transparent;transition:.15s}
    .bla-dot.filled{background:#e8b84b;border-color:#e8b84b}
    .bla-dot.error{background:#e85d5d;border-color:#e85d5d}
    .bla-msg{font-size:13px;height:18px;text-align:center;color:#6b6b78}
    .bla-msg.err{color:#e85d5d}
    .bla-pad{display:grid;grid-template-columns:repeat(3,72px);gap:12px}
    .bla-key{height:72px;border-radius:12px;border:1px solid #2a2a30;background:#17171a;color:#e8e8ec;
      font-family:'DM Sans',sans-serif;font-size:22px;font-weight:600;cursor:pointer;display:flex;
      align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;user-select:none;transition:.12s}
    .bla-key:active{background:#1f1f24;transform:scale(.94)}
    .bla-key.zero{grid-column:2}
    .bla-key.del{font-size:16px;color:#6b6b78}
    .bla-pad.disabled{opacity:.35;pointer-events:none}
    .bla-retry{padding:11px 22px;border-radius:10px;border:1px solid #e8b84b;background:rgba(232,184,75,.12);
      color:#e8b84b;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer}
    .bla-cancel{padding:9px 18px;border-radius:8px;border:1px solid #2a2a30;background:#1f1f24;color:#e8e8ec;
      font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer}
    .bla-chip{position:fixed;bottom:14px;left:14px;z-index:9000;display:flex;align-items:center;gap:8px;
      background:#1f1f24;border:1px solid #2a2a30;border-radius:20px;padding:5px 6px 5px 12px;
      font-family:'DM Sans',sans-serif;font-size:12px;color:#6b6b78;box-shadow:0 4px 14px rgba(0,0,0,.4)}
    .bla-chip b{color:#e8b84b;font-weight:600}
    .bla-chip.mgr b{color:#a78bfa}
    .bla-logout{border:1px solid #2a2a30;background:#17171a;color:#e8e8ec;border-radius:14px;
      padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
    .bla-logout:hover{border-color:#e85d5d;color:#e85d5d}
    .bla-switch{margin-top:10px;font-size:13px;color:#6b6b78;background:none;border:1px solid #2a2a30;border-radius:10px;padding:9px 16px;cursor:pointer;letter-spacing:1px;font-family:inherit}
    .bla-switch:hover{color:#e8e8ec;border-color:#3a3a42}`;
    const s = document.createElement('style'); s.id = 'bl-auth-style'; s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------- overlay DOM ---------- */
  function buildOverlay(){
    injectStyles();
    let o = document.getElementById('bl-auth-overlay');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'bl-auth-overlay';
    o.innerHTML = `
      <div class="bla-logo" id="bla-logo">🎛️ Banshee Sound Tech</div>
      <div class="bla-sub" id="bla-sub">Staff Sign-In</div>
      <div class="bla-dots">
        <div class="bla-dot" id="bla-d0"></div><div class="bla-dot" id="bla-d1"></div>
        <div class="bla-dot" id="bla-d2"></div><div class="bla-dot" id="bla-d3"></div>
      </div>
      <div class="bla-msg" id="bla-msg">Loading…</div>
      <div class="bla-pad disabled" id="bla-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="bla-key" data-k="${n}">${n}</button>`).join('')}
        <button class="bla-key zero" data-k="0">0</button>
        <button class="bla-key del" data-k="del">⌫</button>
      </div>
      <div id="bla-extra"><button class="bla-switch" id="bla-switch" type="button">⌂ Switch venue ▸</button></div>`;
    document.body.appendChild(o);
    o.querySelectorAll('.bla-key').forEach(b => b.addEventListener('click', () => press(b.dataset.k)));
    var _sw=document.getElementById('bla-switch'); if(_sw) _sw.addEventListener('click', function(){ BLAuth.switchVenue(); });
    document.addEventListener('keydown', physicalKey);
    return o;
  }

  function physicalKey(e){
    const o = document.getElementById('bl-auth-overlay');
    if (!o || o.classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') press(e.key);
    else if (e.key === 'Backspace') press('del');
  }

  function setDots(){
    for (let i=0;i<4;i++){
      const d=document.getElementById('bla-d'+i);
      if(d) d.className='bla-dot'+(i<entry.length?' filled':'');
    }
  }
  function errDots(){ for(let i=0;i<4;i++){const d=document.getElementById('bla-d'+i);if(d)d.className='bla-dot error';} }

  function press(k){
    const pad = document.getElementById('bla-pad');
    if (!pad || pad.classList.contains('disabled')) return;
    if (k==='del'){ entry=entry.slice(0,-1); setDots(); return; }
    if (entry.length>=4) return;
    entry += k; setDots();
    if (entry.length===4) setTimeout(check, 110);
  }

  function check(){
    const v = entry.trim();
    const msg = document.getElementById('bla-msg');
    if (mode==='manager'){
      if (pins && ((v === (pins.manager||'').trim()) || (pins.master && v === (pins.master||'').trim()))){
        setAuth('manager'); entry=''; teardown(); refreshChip();
        const cb=onManagerOk; onManagerOk=null; if(cb) cb(); 
        return;
      }
      reject('Incorrect manager PIN');
      return;
    }
    if (pins && pins.master && v === (pins.master||'').trim()){ setAuth('master'); finishLogin(); return; }
    if (pins && v === (pins.manager||'').trim()){ setAuth('manager'); finishLogin(); return; }
    if (pins && v === (pins.staff||'').trim()){ setAuth('staff'); finishLogin(); return; }
    reject('Incorrect PIN');
  }

  function reject(text){
    errDots();
    const msg=document.getElementById('bla-msg'); msg.textContent=text; msg.className='bla-msg err';
    setTimeout(()=>{ entry=''; setDots(); msg.textContent = mode==='manager'?'Enter manager PIN':'Enter PIN'; msg.className='bla-msg'; },900);
  }

  function finishLogin(){
    entry=''; teardown(); refreshChip();
    if (opts.onReady) opts.onReady(getAuth().role);
  }

  function teardown(){
    const o=document.getElementById('bl-auth-overlay');
    if(o) o.classList.add('hidden');
  }

  function enablePad(label){
    const pad=document.getElementById('bla-pad'); const msg=document.getElementById('bla-msg');
    pad.classList.remove('disabled'); msg.textContent=label; msg.className='bla-msg';
    document.getElementById('bla-extra').innerHTML='';
  }

  function showRetry(){
    const msg=document.getElementById('bla-msg'); msg.textContent='Couldn’t reach the server'; msg.className='bla-msg err';
    document.getElementById('bla-pad').classList.add('disabled');
    document.getElementById('bla-extra').innerHTML='<button class="bla-retry" id="bla-retry">↻ Retry</button>';
    document.getElementById('bla-retry').addEventListener('click', ()=>location.reload());
  }

  /* ---------- public flows ---------- */
  async function startLogin(){
    mode='login'; entry='';
    const o=buildOverlay(); o.classList.remove('hidden');
    document.getElementById('bla-sub').textContent='Staff Sign-In';
    setDots();
    pins = await fetchPins();
    if (!pins){ showRetry(); return; }
    enablePad('Enter PIN');
  }

  async function startManager(reason){
    mode='manager'; entry='';
    const o=buildOverlay(); o.classList.remove('hidden');
    document.getElementById('bla-logo').textContent='🎛️ Manager Access';
    document.getElementById('bla-sub').textContent= reason || 'Manager PIN required';
    setDots();
    document.getElementById('bla-extra').innerHTML='<button class="bla-cancel" id="bla-cancel">Cancel</button>';
    document.getElementById('bla-cancel').addEventListener('click', cancelManager);
    if (!pins) pins = await fetchPins();
    if (!pins){ showRetry(); return; }
    enablePad('Enter manager PIN');
    document.getElementById('bla-extra').innerHTML='<button class="bla-cancel" id="bla-cancel">Cancel</button>';
    document.getElementById('bla-cancel').addEventListener('click', cancelManager);
  }

  function cancelManager(){
    onManagerOk=null;
    const auth=getAuth();
    if (auth){ teardown(); }            // already signed in as staff → just close
    else { /* manager-required app with no session → stay on screen */ }
  }

  /* ---------- chip (role + logout), shown on every app ---------- */
  function refreshChip(){
    const auth=getAuth();
    let chip=document.getElementById('bla-chip');
    if (!auth){ if(chip) chip.remove(); return; }
    injectStyles();
    if (!chip){
      chip=document.createElement('div'); chip.id='bla-chip'; chip.className='bla-chip';
      document.body.appendChild(chip);
    }
    chip.className='bla-chip'+((auth.role==='manager'||auth.role==='master')?' mgr':'');
    chip.innerHTML=`<span>Signed in: <b>${auth.role==='master'?'Master':auth.role==='manager'?'Manager':'Staff'}</b></span>
      <button class="bla-logout" id="bla-logout">Logout</button>`;
    document.getElementById('bla-logout').addEventListener('click', ()=>BLAuth.logout());
    applyRoleVisibility();
  }

  function applyRoleVisibility(){
    const mgr = isManager();
    document.querySelectorAll('[data-bl-manager]').forEach(el=>{
      el.style.display = mgr ? '' : 'none';
    });
  }

  function isMaster(){ const a=getAuth(); return !!a && a.role==='master'; }
  function isManager(){ const a=getAuth(); return !!a && (a.role==='manager'||a.role==='master'); }

  /* ---------- BLAuth API ---------- */
  window.BLAuth = {
    init(o){
      opts = o || {};
      const auth = getAuth();
      buildOverlay();
      if (auth){
        // already signed in somewhere
        if (opts.require==='manager' && auth.role!=='manager'){
          // manager-only app, currently only staff → ask to upgrade
          onManagerOk = () => { if(opts.onReady) opts.onReady('manager'); };
          startManager('This screen is manager-only');
          return;
        }
        teardown(); refreshChip();
        // refresh PINs quietly in the background for next time
        fetchPins().then(p=>{ if(p) pins=p; });
        if (opts.onReady) opts.onReady(auth.role);
        return;
      }
      // not signed in
      if (opts.require==='manager'){
        // go straight to manager prompt; on success, proceed
        onManagerOk = () => { if(opts.onReady) opts.onReady('manager'); };
        startManager('Manager sign-in');
      } else {
        startLogin();
      }
    },
    requireManager(cb, reason){
      if (isManager()){ cb && cb(); return; }
      onManagerOk = cb || null;
      startManager(reason);
    },
    role(){ const a=getAuth(); return a?a.role:null; },
    isManager, isMaster,
    isStaff(){ const a=getAuth(); return !!a && (a.role==='staff'||a.role==='manager'); },
    logout(){ localStorage.removeItem(AUTH_KEY); location.reload(); },
    switchVenue(){ try{localStorage.removeItem(AUTH_KEY);localStorage.removeItem(PIN_CACHE);sessionStorage.clear();}catch(e){} location.href='/'; },
    applyRoleVisibility,
    refreshChip
  };
})();
