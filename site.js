// Fills the built-in mods list (keep in sync with the in-game mod menu).
const MODS = [
  'FPS', 'Coordinates', 'Direction', 'Clock', 'Memory Usage', 'Biome', 'Resource Packs', 'Server Address', 'Ping',
  'Server TPS', 'Day Counter', 'Speed', 'Saturation', 'Armor Status', 'Potion Effects', 'Key Strokes', 'CPS Counter',
  'Active Modules', 'Combo Counter', 'Damage Indicator', 'Durability Warning', 'Reach Display', 'Session Timer',
  'Player Count', 'Full Bright', 'Block Overlay', 'Hitboxes', 'Remove Hurt Shake', 'Hide Boss Bar', 'Time Changer',
  'Custom Crosshair', 'Scoreboard', 'Particle Effect', 'Motion Blur', 'NameTags', 'Zoom', 'Auto Sprint',
  'Toggle Sneak', 'Skins', 'Cosmetics', 'Tab Ping', 'Chat Timestamps', 'Waypoints', 'Auto GG', 'Quick Message',
  'Notifications', 'Kill Sound', 'Kill Streaks', 'Session Stats', 'Hit Marker', 'Low Health Warning', 'Bedwars Moments',
  'Freelook', 'Menu Theme', 'FPS Boost (1.8.9)', 'Hit Delay Fix (1.8.9)',
];
const box = document.getElementById('modChips');
for (const name of MODS) {
  const chip = document.createElement('span');
  chip.textContent = name;
  box.append(chip);
}
// Hide screenshots that aren't there yet
document.querySelectorAll('figure img').forEach((img) => {
  img.addEventListener('error', () => img.closest('figure').remove());
});

// ---------- Cosmetics store ----------
const BUY_URL = 'https://discord.com/channels/1537993539307176047/1569461220040384523';
const SLOTS = [['all', 'All'], ['cape', 'Capes'], ['hat', 'Hats'], ['wings', 'Wings'], ['claws', 'Hands'], ['boots', 'Boots'], ['pet', 'Pets'], ['aura', 'Auras'], ['back', 'Back']];
const CART = '<svg viewBox="0 0 24 24"><path d="M2 3h3l2.5 12h11L21 7H6.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="9" cy="19.5" r="1.7"/><circle cx="17" cy="19.5" r="1.7"/></svg>';
const tabs = document.getElementById('storeTabs');
const grid = document.getElementById('storeGrid');

function renderStore(slot) {
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.slot === slot));
  grid.textContent = '';
  for (const item of (window.INDUS_STORE || []).filter((i) => slot === 'all' || i.slot === slot)) {
    const card = document.createElement('div');
    card.className = 'item';
    const tags = [item.free ? '<span class="free">Free</span>' : item.vip ? '<span class="vip">VIP</span>' : item.discord ? '<span class="free">Discord reward</span>' : item.price ? `<span class="coin">◆ ${item.price.toLocaleString()}</span>` : '<span>Premium</span>', item.animated ? '<span>Animated</span>' : ''].join('');
    card.innerHTML = `
      <div class="item-tags">${tags}</div>
      <div class="item-art"><img src="${item.image}" alt="" loading="lazy" /></div>
      <div class="item-body">
        <b></b><small></small>
        ${item.free ? '<span class="buy owned">Included free</span>' : item.vip ? '<a class="buy" href="#vip">Free with VIP</a>' : item.discord ? '<a class="buy" href="https://discord.gg/indusclient" target="_blank" rel="noopener">Join Discord to unlock</a>' : `<a class="buy" href="${BUY_URL}" target="_blank" rel="noopener">${CART}Buy</a>`}
      </div>`;
    card.querySelector('b').textContent = `${item.name} ${item.slotLabel}`;
    card.querySelector('small').textContent = item.description;
    grid.append(card);
  }
}

for (const [slot, label] of SLOTS) {
  const b = document.createElement('button');
  b.dataset.slot = slot;
  b.textContent = label;
  b.addEventListener('click', () => renderStore(slot));
  tabs.append(b);
}
renderStore('all');


// ---------- menu: slide-in drawer ----------
(() => {
  const drawer = document.getElementById('drawer'), shade = document.getElementById('drawerShade');
  const open = (on) => { drawer.classList.toggle('open', on); shade.classList.toggle('open', on); drawer.setAttribute('aria-hidden', String(!on)); document.body.style.overflow = on ? 'hidden' : ''; };
  document.getElementById('menuBtn').addEventListener('click', () => open(!drawer.classList.contains('open')));
  document.getElementById('drawerClose').addEventListener('click', () => open(false));
  shade.addEventListener('click', () => open(false));
  drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => open(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
})();

// ---------- hero: floating pixel cubes ----------
(() => {
  const c = document.getElementById('heroFx');
  if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = c.getContext('2d');
  let cubes = [], w = 0, h = 0;
  const size = () => { w = c.width = c.offsetWidth; h = c.height = c.offsetHeight; cubes = Array.from({ length: Math.round(w / 28) }, () => ({ x: Math.random() * w, y: Math.random() * h, s: 3 + Math.random() * 7, v: 0.15 + Math.random() * 0.5, a: 0.08 + Math.random() * 0.3 })); };
  size();
  addEventListener('resize', size);
  const tick = () => {
    g.clearRect(0, 0, w, h);
    for (const q of cubes) {
      q.y -= q.v;
      if (q.y < -10) { q.y = h + 10; q.x = Math.random() * w; }
      g.fillStyle = `rgba(255,255,255,${q.a})`;
      g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
    }
    requestAnimationFrame(tick);
  };
  tick();
})();

// ---------- sections slide in, numbers count up ----------
(() => {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      e.target.querySelectorAll('[data-count]').forEach((el) => {
        const to = Number(el.dataset.count), t0 = performance.now();
        const step = (t) => { const k = Math.min(1, (t - t0) / 1200); el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
      io.unobserve(e.target);
    }
  }, { threshold: 0.2 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
})();

// ---------- 3D tilt on cards ----------
document.querySelectorAll('.tile, .feat, .soc-card').forEach((el) => {
  el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
  });
  el.addEventListener('mouseleave', () => (el.style.transform = ''));
});

// ---------- spin wheel demo ----------
(() => {
  const prizes = ['5 coins', '10 coins', '50 XP', '20 coins', '100 XP', '40 coins', '100 coins', 'Mystery box'];
  const wheel = document.getElementById('demoWheel');
  if (!wheel) return;
  wheel.style.background = `conic-gradient(${prizes.map((_, i) => `${i === 7 ? '#3a2e0a' : i % 2 ? '#2b2b2b' : '#1c1c1c'} ${i * 45}deg ${(i + 1) * 45}deg`).join(',')})`;
  prizes.forEach((p, i) => {
    const s = document.createElement('span');
    const a = i * 45 + 22.5;
    s.textContent = p;
    s.style.transform = `rotate(${a - 90}deg) translateX(70px)${a > 180 ? ' rotate(180deg)' : ''}`;
    wheel.appendChild(s);
  });
  let turn = 0;
  document.getElementById('demoSpin').addEventListener('click', () => {
    const i = Math.floor(Math.random() * prizes.length);
    turn += 360 * 5 + ((360 - (i * 45 + 22.5) - (turn % 360)) + 360) % 360;
    wheel.style.transform = `rotate(${turn}deg)`;
    document.getElementById('demoResult').textContent = '';
    setTimeout(() => (document.getElementById('demoResult').textContent = `You won ${prizes[i]}! Get Indus Client to spin for real every day.`), 4200);
  });
})();

// ---------- back to top ----------
(() => {
  const b = document.getElementById('toTop');
  addEventListener('scroll', () => b.classList.toggle('show', scrollY > 900), { passive: true });
  b.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
})();


// ================= Account, orders and tickets (talks to the Indus server) =================
(() => {
  const $ = (q) => document.querySelector(q);
  const params = new URLSearchParams(location.search);
  const onPages = location.hostname.endsWith('github.io');
  const API = params.get('api') || (location.protocol === 'http:' ? 'http://legacy-1.mantranodes.fun:19153' : '/api');
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
  let token = get('indus-web-token', '');
  let me = null;
  const say = (el, text, ok) => { el.textContent = text; el.className = 'form-msg ' + (ok ? 'ok' : 'err'); };
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const pagesNote = 'Sign-in, orders and tickets work on indusclient.com. Open www.indusclient.com, use the launcher, or ask on Discord.';

  async function call(path, opts = {}) {
    if (onPages && !params.get('api')) throw new Error(pagesNote);
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) };
    let r;
    try { r = await fetch(API + path, { ...opts, headers }); } catch { throw new Error('Can’t reach the Indus server right now. Try again in a minute.'); }
    let body = {};
    try { body = await r.json(); } catch { throw new Error('Can’t reach the Indus server right now. Try again in a minute.'); }
    if (r.status === 401 && token) { token = ''; put('indus-web-token', ''); showAccount(); }
    if (!r.ok) throw new Error(body.error || 'Something went wrong.');
    return body;
  }

  // ---------- sign in ----------
  const itemId = (i) => `${i.slot}:${i.name.toLowerCase().replace(/ /g, '_')}`;
  async function showAccount() {
    const out = $('#acctOut'), inn = $('#acctIn');
    if (!token) { out.hidden = false; inn.hidden = true; $('#signinBtn').textContent = 'Sign in'; me = null; window.INDUS_ME = null; refreshStore(); return; }
    try { me = await call('/v1/me'); } catch (e) { if (!token) return; say($('#loginMsg'), e.message); return; }
    window.INDUS_ME = me;
    out.hidden = true; inn.hidden = false;
    $('#signinBtn').textContent = me.name;
    $('#meName').textContent = me.name;
    $('#meSub').textContent = `${me.premium ? 'Microsoft' : 'Offline'} account · Level ${me.level || 1}${me.vip ? ' · VIP' : ''}${me.owner ? ' · Owner' : ''}`;
    $('#meCoins').textContent = (me.coins || 0).toLocaleString();
    $('#meHead').src = `https://mc-heads.net/avatar/${encodeURIComponent(me.name)}/64`;
    fillOrderForm();
    loadOrders();
    refreshStore();
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#loginCode').value.trim();
    if (!/^[A-Za-z0-9]{3}-?[A-Za-z0-9]{3}$/.test(code)) return say($('#loginMsg'), 'The code looks like ABC-123. Get it from the launcher.');
    say($('#loginMsg'), 'Signing in…', true);
    try {
      const r = await call('/v1/weblogin', { method: 'POST', body: JSON.stringify({ code }) });
      token = r.token; put('indus-web-token', token);
      say($('#loginMsg'), '', true);
      showAccount();
    } catch (err) { say($('#loginMsg'), err.message); }
  });
  $('#logoutBtn').addEventListener('click', async () => {
    try { await call('/v1/logout', { method: 'POST', body: '{}' }); } catch { /* signed out anyway */ }
    token = ''; put('indus-web-token', ''); showAccount();
  });

  // ---------- coins in the store ----------
  function refreshStore() {
    document.querySelectorAll('.store-grid .item').forEach((card) => {
      const name = card.querySelector('b')?.textContent || '';
      const item = (window.INDUS_STORE || []).find((i) => `${i.name} ${i.slotLabel}`.trim() === name.trim());
      if (!item) return;
      card.querySelector('.coin-buy')?.remove();
      if (!me || !item.price || item.vip) return;
      const id = itemId(item);
      const owned = (me.owned || []).includes(id);
      const btn = document.createElement('button');
      btn.className = 'buy coin-buy';
      btn.textContent = owned ? 'Owned' : `◆ ${item.price.toLocaleString()} coins`;
      btn.disabled = owned;
      btn.addEventListener('click', async () => {
        if (!confirm(`Buy ${item.name} ${item.slotLabel} for ${item.price.toLocaleString()} coins?`)) return;
        try {
          const r = await call('/v1/shop/buy', { method: 'POST', body: JSON.stringify({ item: id }) });
          me.coins = r.coins; me.owned = r.owned;
          $('#meCoins').textContent = r.coins.toLocaleString();
          refreshStore();
          alert('Done! It is in your wardrobe now.');
        } catch (err) { alert(err.message); }
      });
      card.querySelector('.item-body')?.appendChild(btn);
    });
  }
  new MutationObserver(() => { if (me) refreshStore(); }).observe(document.getElementById('storeGrid'), { childList: true });

  // ---------- orders ----------
  let config = null;
  async function fillOrderForm() {
    if (!config) { try { config = await call('/v1/client-config'); } catch { config = { coinPacks: [], payMethods: ['PayPal', 'Other'] }; } }
    $('#orderPack').replaceChildren(...(config.coinPacks || []).map((p) => new Option(p.label, p.id)));
    $('#orderMethod').replaceChildren(...(config.payMethods || []).map((m) => new Option(m, m)));
    const items = (window.INDUS_STORE || []).filter((i) => !i.free && !i.discord && !i.vip && !(me.owned || []).includes(itemId(i)));
    $('#orderItem').replaceChildren(...items.map((i) => new Option(`${i.name} ${i.slotLabel}`.trim(), itemId(i))));
  }
  $('#orderKind').addEventListener('change', (e) => {
    $('#packRow').hidden = e.target.value !== 'coins';
    $('#itemRow').hidden = e.target.value !== 'item';
  });
  $('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const r = await call('/v1/orders', { method: 'POST', body: JSON.stringify(f) });
      say($('#orderMsg'), `Order ${r.order.id} placed! We’ll message you at ${r.order.contact}.`, true);
      e.target.reset(); $('#packRow').hidden = false; $('#itemRow').hidden = true;
      loadOrders();
    } catch (err) { say($('#orderMsg'), err.message); }
  });
  async function loadOrders() {
    const box = $('#myOrders');
    try {
      const { orders } = await call('/v1/orders');
      if (!orders.length) { box.innerHTML = '<p class="small">No orders yet.</p>'; return; }
      box.replaceChildren(...orders.map((o) => {
        const row = document.createElement('div');
        row.className = 'row';
        const what = o.kind === 'coins' ? `${o.coins.toLocaleString()} coins` : o.kind === 'vip' ? '30 days of VIP' : ((window.INDUS_STORE || []).find((i) => itemId(i) === o.item)?.name || o.item);
        row.innerHTML = '<div><b></b><small></small></div><span class="pill"></span>';
        row.querySelector('b').textContent = what;
        row.querySelector('small').textContent = `${o.id} · ${o.method} · ${when(o.created)}`;
        row.querySelector('.pill').textContent = o.status === 'done' ? 'Delivered' : o.status === 'cancelled' ? 'Cancelled' : 'Waiting for payment';
        row.querySelector('.pill').classList.add(o.status);
        return row;
      }));
    } catch (err) { box.textContent = err.message; }
  }

  // ---------- tickets ----------
  const codes = () => get('indus-tickets', []);
  $('#ticketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, msg = $('#ticketMsg');
    const f = Object.fromEntries(new FormData(form));
    if (f.subject.trim().length < 3) return say(msg, 'Write a short title for your ticket.');
    if (f.message.trim().length < 10) return say(msg, 'Tell us a little more (at least 10 characters).');
    say(msg, 'Sending…', true);
    try {
      const r = await call('/v1/tickets', { method: 'POST', body: JSON.stringify(f) });
      put('indus-tickets', [r.code, ...codes()].slice(0, 20));
      form.reset();
      say(msg, `Ticket sent! Your ticket code is ${r.code}. Save it to see replies on another device.`, true);
      listTickets();
      openTicket(r.code);
    } catch (err) { say(msg, err.message); }
  });
  async function listTickets() {
    const box = $('#myTickets');
    box.textContent = '';
    const seen = new Set();
    const rows = [];
    if (me) { try { for (const t of (await call('/v1/tickets')).tickets) { seen.add(t.id); rows.push([t, t.id]); } } catch { /* fine */ } }
    for (const code of codes()) {
      const id = code.split('-')[0];
      if (seen.has(id)) continue;
      try { const { ticket } = await call(`/v1/tickets/${id}?secret=${encodeURIComponent(code.split('-')[1] || '')}`); rows.push([ticket, code]); } catch { /* gone */ }
    }
    if (!rows.length) { box.innerHTML = '<p class="small">No tickets yet. Sign in to see the ones you opened in the launcher, or paste a ticket code.</p>'; return; }
    for (const [t, code] of rows) {
      const b = document.createElement('button');
      b.className = 'row';
      b.innerHTML = '<div><b></b><small></small></div><span class="pill"></span>';
      b.querySelector('b').textContent = t.subject;
      b.querySelector('small').textContent = `${t.id} · ${t.category} · ${when(t.updated)}`;
      b.querySelector('.pill').textContent = t.status;
      b.querySelector('.pill').classList.add(t.status);
      b.addEventListener('click', () => openTicket(code));
      box.append(b);
    }
  }
  async function openTicket(code) {
    const [id, secret = ''] = code.split('-');
    const th = $('#thread');
    th.hidden = false;
    th.textContent = 'Loading…';
    try {
      const { ticket } = await call(`/v1/tickets/${encodeURIComponent(id)}${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`);
      draw(ticket, id, secret);
    } catch (err) { th.textContent = err.message; }
  }
  function draw(t, id, secret) {
    const th = $('#thread');
    th.textContent = '';
    const head = document.createElement('div');
    head.className = 'thread-head';
    head.innerHTML = '<b></b><span class="pill"></span>';
    head.querySelector('b').textContent = `${t.subject} (${t.id})`;
    head.querySelector('.pill').textContent = t.status;
    head.querySelector('.pill').classList.add(t.status);
    th.append(head);
    for (const m of t.messages) {
      const d = document.createElement('div');
      d.className = 'msg ' + m.from;
      d.innerHTML = '<small></small><span></span>';
      d.querySelector('small').textContent = `${m.from === 'staff' ? 'Indus team' : 'You'} · ${when(m.at)}`;
      d.querySelector('span').textContent = m.text;
      th.append(d);
    }
    const f = document.createElement('form');
    f.className = 'reply';
    f.innerHTML = '<textarea maxlength="2000" placeholder="Write a reply…"></textarea><div><button class="btn white-btn">Send reply</button> <button type="button" class="link-btn">My problem is solved</button></div>';
    const q = secret ? `?secret=${encodeURIComponent(secret)}` : '';
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = f.querySelector('textarea').value.trim();
      if (!text) return;
      try { draw((await call(`/v1/tickets/${id}/reply${q}`, { method: 'POST', body: JSON.stringify({ text }) })).ticket, id, secret); } catch (err) { alert(err.message); }
    });
    f.querySelector('.link-btn').addEventListener('click', async () => {
      try { draw((await call(`/v1/tickets/${id}/close${q}`, { method: 'POST', body: '{}' })).ticket, id, secret); } catch (err) { alert(err.message); }
    });
    th.append(f);
  }
  $('#codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#codeInput').value.trim();
    if (!/^T[A-Z0-9]{5}-[0-9a-f]{10}$/i.test(code)) return alert('That doesn’t look like a ticket code (like TAB12C-1f2e3d4c5b).');
    if (!codes().includes(code)) put('indus-tickets', [code, ...codes()].slice(0, 20));
    openTicket(code);
    listTickets();
  });

  showAccount().then(listTickets);
})();
