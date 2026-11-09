// Indus API: everything Indus Client players share with each other. No dependencies: `node indus-api.js` (Node 18+).
//  - who is online with Indus Client (Indus emblem by their name) and what they wear (shared cosmetics)
//  - which cosmetics each player owns (bought on Discord, or unlocked by linking Discord)
//  - custom skins for offline accounts (only Indus players see them)
//  - friends (Microsoft accounts only) and the Partners list in the launcher
//
// Settings (environment variables):
//   PORT                   port to listen on (default 8787)
//   PUBLIC_URL             the address players reach this server on, e.g. https://api.indusclient.app
//   ADMIN_KEY              secret for /v1/admin/* (giving cosmetics, editing partners)
//   DATA_FILE              where everything is saved (default ./data.json)
//   DISCORD_CLIENT_ID      Discord application (for "Link Discord")
//   DISCORD_CLIENT_SECRET
//   DISCORD_GUILD_ID       your Discord server's id: members get the Discord reward cosmetics
//
// Player endpoints (used by the game):
//   POST /v1/presence      {uuid, name, equipped:{cape,hat,...}}  -> marks the player online
//   POST /v1/lookup        {uuids:[...]}                          -> which of them use Indus + outfit + skin
//   GET  /v1/owned/:uuid                                          -> cosmetics the player owns
//   GET  /v1/skin/:uuid.png                                       -> a player's custom skin
// Launcher endpoints (Authorization: Bearer <token> from /v1/auth/*):
//   POST /v1/auth/challenge                    -> {serverId}
//   POST /v1/auth/microsoft {name, serverId}   -> {token}  (the launcher first joins serverId on Mojang's session server)
//   POST /v1/auth/offline   {name, secret}     -> {token}  (first launcher to claim a name keeps it)
//   GET  /v1/me   POST /v1/me/status {status}
//   PUT  /v1/skin {png (base64), slim}   DELETE /v1/skin
//   GET  /v1/friends   POST /v1/friends/{add|accept|decline|remove} {name|uuid}
//   POST /v1/me/discord -> {url} to open in the browser (Discord sign-in)   GET /v1/discord/callback
//   GET  /v1/partners
// Admin (header x-admin-key):
//   POST /v1/admin/grant|revoke {player, item}    PUT /v1/admin/partners {partners:[...]}    GET /v1/admin/check
//   GET  /v1/health
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const DISCORD = {
  id: process.env.DISCORD_CLIENT_ID || '',
  secret: process.env.DISCORD_CLIENT_SECRET || '',
  guild: process.env.DISCORD_GUILD_ID || '',
  invite: 'https://discord.gg/indusclient',
};
const ONLINE_MS = 3 * 60 * 1000; // online for 3 minutes after the last heartbeat
const SESSION_DAYS = 30;
const MAX_FRIENDS = 200;

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8'));
const ITEMS = new Map(catalog.items.map((i) => [i.id, i]));
const FREE = new Set(catalog.items.filter((i) => i.free).map((i) => i.id));
const DISCORD_REWARDS = catalog.items.filter((i) => i.discord).map((i) => i.id);
const idOf = (slot, name) => `${slot}:${String(name).toLowerCase().replace(/ /g, '_')}`;

// ---------- storage ----------
const EMPTY = () => ({
  owned: {}, // uuid -> [item ids]
  names: {}, // lowercase name -> uuid (last seen)
  premium: {}, // lowercase name -> uuid (verified Microsoft accounts only)
  display: {}, // uuid -> name
  secrets: {}, // offline uuid -> sha256(secret)
  sessions: {}, // sha256(token) -> {uuid, name, premium, exp}
  skins: {}, // uuid -> {hash, slim, png (base64)}
  friends: {}, // uuid -> [uuid]
  requests: {}, // uuid -> [uuid of players who asked]
  discord: {}, // uuid -> {id, name}
  partners: [], // [{name, ip, description, tags, versions, discord, website}]
});
let data = EMPTY();
try { data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, DATA_FILE);
  }, 500);
}

const online = new Map(); // uuid -> { name, equipped, seen }        (in game)
const launcherOnline = new Map(); // uuid -> { status, seen }          (in the launcher)
const challenges = new Map(); // serverId -> created
const discordStates = new Map(); // state -> { uuid, created }

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const dashed = (u) => {
  const h = String(u).toLowerCase().replace(/-/g, '');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const owns = (uuid, id) => FREE.has(id) || (data.owned[uuid] || []).includes(id);
const isOnline = (uuid) => {
  const now = Date.now();
  const g = online.get(uuid), l = launcherOnline.get(uuid);
  if (g && now - g.seen < ONLINE_MS) return 'In game';
  if (l && now - l.seen < ONLINE_MS) return l.status || 'In the launcher';
  return null;
};

/** Same UUID that offline-mode servers give this name. */
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  return dashed(md5.toString('hex'));
}

/** Only keep cosmetics the player really owns (so nobody can show off items they didn't buy). */
function cleanOutfit(uuid, equipped) {
  const out = {};
  if (!equipped || typeof equipped !== 'object') return out;
  for (const [slot, name] of Object.entries(equipped)) {
    const id = idOf(slot, name);
    if (ITEMS.has(id) && owns(uuid, id)) out[slot] = ITEMS.get(id).name;
  }
  return out;
}

function grant(uuid, ids) {
  const list = new Set(data.owned[uuid] || []);
  for (const id of ids) list.add(id);
  data.owned[uuid] = [...list];
  save();
}

// ---------- http helpers ----------
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function page(res, code, title, text, button) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Indus Client</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:16px/1.5 system-ui,Segoe UI,sans-serif}
.c{max-width:420px;padding:40px 32px;border:1px solid #262626;border-radius:16px;background:#0a0a0a;text-align:center}
h1{margin:0 0 8px;font-size:24px}p{color:#a3a3a3;margin:0 0 22px}a{display:inline-block;background:#fff;color:#000;padding:10px 20px;border-radius:10px;font-weight:700;text-decoration:none}</style>
<div class="c"><h1>${esc(title)}</h1><p>${esc(text)}</p>${button ? `<a href="${esc(button.url)}">${esc(button.label)}</a>` : ''}</div>`);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > limit) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
  });
}

// simple rate limit: 240 requests per minute per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60_000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  return h.n > 240;
}

function resolvePlayer(p) {
  if (!p) return null;
  if (UUID_RE.test(p)) return dashed(p);
  return data.names[String(p).toLowerCase()] || null;
}

function newSession(uuid, name, premium) {
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions[sha(token)] = { uuid, name, premium, exp: Date.now() + SESSION_DAYS * 864e5 };
  data.names[name.toLowerCase()] = uuid;
  data.display[uuid] = name;
  if (premium) data.premium[name.toLowerCase()] = uuid;
  save();
  return token;
}

function auth(req) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const s = data.sessions[sha(m[1])];
  if (!s || s.exp < Date.now()) return null;
  return s;
}

/** Reads the width and height from a PNG header. */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function friendView(uuid) {
  const status = isOnline(uuid);
  const equipped = online.get(uuid)?.equipped || {};
  return { uuid, name: data.display[uuid] || 'Player', online: !!status, status: status || 'Offline', equipped };
}

const list = (map, k) => (map[k] = map[k] || []);
const without = (arr, v) => arr.filter((x) => x !== v);

// ---------- Discord ----------
async function discordCallback(url, res) {
  const st = discordStates.get(url.searchParams.get('state') || '');
  const code = url.searchParams.get('code');
  if (!st || !code) return page(res, 400, 'Link expired', 'Open "Link Discord" in Indus Client again.');
  discordStates.delete(url.searchParams.get('state'));
  const redirect = `${PUBLIC_URL}/v1/discord/callback`;
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DISCORD.id, client_secret: DISCORD.secret, grant_type: 'authorization_code', code, redirect_uri: redirect }),
  });
  if (!tokenRes.ok) return page(res, 400, 'Could not link', 'Discord did not accept the login. Please try again.');
  const { access_token } = await tokenRes.json();
  const h = { Authorization: `Bearer ${access_token}` };
  const me = await (await fetch('https://discord.com/api/users/@me', { headers: h })).json();
  if (!me?.id) return page(res, 400, 'Could not link', 'Discord did not send your account. Please try again.');
  const taken = Object.entries(data.discord).find(([u, d]) => d.id === me.id && u !== st.uuid);
  if (taken) return page(res, 409, 'Already linked', `This Discord account is already linked to ${data.display[taken[0]] || 'another player'}.`);
  data.discord[st.uuid] = { id: me.id, name: me.global_name || me.username };
  save();
  const member = DISCORD.guild ? await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD.guild}/member`, { headers: h }) : null;
  if (!member || !member.ok) {
    return page(res, 200, 'Almost there!', 'Your Discord is linked. Join the Indus Discord, then press "Check again" in Indus Client to unlock the Indus cape.', { url: DISCORD.invite, label: 'Join the Discord' });
  }
  data.discord[st.uuid].member = true;
  grant(st.uuid, DISCORD_REWARDS);
  page(res, 200, 'Discord linked!', 'The Indus cape is unlocked. Go back to Indus Client and wear it in your Wardrobe.');
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' });
      return res.end();
    }
    if (limited(ip)) return send(res, 429, { error: 'slow down' });
    const p = url.pathname;
    const now = Date.now();

    if (req.method === 'GET' && p === '/v1/health') {
      return send(res, 200, { ok: true, online: [...online.values()].filter((u) => now - u.seen < ONLINE_MS).length, discord: !!DISCORD.id });
    }

    // ----- game -----
    if (req.method === 'POST' && p === '/v1/presence') {
      const b = await readBody(req);
      if (!UUID_RE.test(b.uuid || '')) return send(res, 400, { error: 'bad uuid' });
      const uuid = dashed(b.uuid);
      const name = String(b.name || '').slice(0, 16);
      if (NAME_RE.test(name)) { data.names[name.toLowerCase()] = uuid; data.display[uuid] = name; }
      online.set(uuid, { name, equipped: cleanOutfit(uuid, b.equipped), seen: now });
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/v1/lookup') {
      const b = await readBody(req);
      const users = {};
      for (const raw of (Array.isArray(b.uuids) ? b.uuids : []).slice(0, 200)) {
        if (!UUID_RE.test(String(raw))) continue;
        const uuid = dashed(raw);
        const u = online.get(uuid);
        if (!u || now - u.seen >= ONLINE_MS) continue;
        const skin = data.skins[uuid];
        users[uuid] = { name: u.name, equipped: u.equipped, ...(skin ? { skin: skin.hash, slim: !!skin.slim } : {}) };
      }
      return send(res, 200, { users });
    }

    const owned = p.match(/^\/v1\/owned\/([0-9a-fA-F-]{32,36})$/);
    if (req.method === 'GET' && owned) {
      const uuid = dashed(owned[1]);
      return send(res, 200, { owned: [...new Set([...FREE, ...(data.owned[uuid] || [])])] });
    }

    const skinGet = p.match(/^\/v1\/skin\/([0-9a-fA-F-]{32,36})\.png$/);
    if (req.method === 'GET' && skinGet) {
      const s = data.skins[dashed(skinGet[1])];
      if (!s) return send(res, 404, { error: 'no skin' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', ETag: s.hash });
      return res.end(Buffer.from(s.png, 'base64'));
    }

    if (req.method === 'GET' && p === '/v1/partners') return send(res, 200, { partners: data.partners });

    // ----- launcher sign-in -----
    if (req.method === 'POST' && p === '/v1/auth/challenge') {
      const serverId = crypto.randomBytes(16).toString('hex');
      challenges.set(serverId, now);
      return send(res, 200, { serverId });
    }

    if (req.method === 'POST' && p === '/v1/auth/microsoft') {
      const b = await readBody(req);
      const name = String(b.name || ''), serverId = String(b.serverId || '');
      if (!NAME_RE.test(name) || !challenges.has(serverId)) return send(res, 400, { error: 'bad request' });
      challenges.delete(serverId);
      const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${serverId}`);
      if (r.status !== 200) return send(res, 403, { error: 'Could not verify your Microsoft account. Try again.' });
      const prof = await r.json();
      return send(res, 200, { token: newSession(dashed(prof.id), prof.name, true) });
    }

    if (req.method === 'POST' && p === '/v1/auth/offline') {
      const b = await readBody(req);
      const name = String(b.name || ''), secret = String(b.secret || '');
      if (!NAME_RE.test(name) || secret.length < 32) return send(res, 400, { error: 'bad request' });
      const uuid = offlineUuid(name);
      const known = data.secrets[uuid];
      if (known && known !== sha(secret)) return send(res, 403, { error: `The name ${name} is already used by another Indus player.` });
      if (!known) data.secrets[uuid] = sha(secret);
      return send(res, 200, { token: newSession(uuid, name, false) });
    }

    // ----- Discord link (opened in the browser) -----
    if (req.method === 'GET' && p === '/v1/discord/start') {
      if (!DISCORD.id) return page(res, 503, 'Not ready yet', 'Discord linking is not set up yet. Please try again later.');
      const state = url.searchParams.get('code') || '';
      const s = discordStates.get(state);
      if (!s || s.started || now - s.created > 600_000) return page(res, 401, 'Link expired', 'Press "Link Discord" in Indus Client again.');
      s.started = true;
      const q = new URLSearchParams({ client_id: DISCORD.id, response_type: 'code', scope: 'identify guilds.members.read', state, prompt: 'none', redirect_uri: `${PUBLIC_URL}/v1/discord/callback` });
      res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${q}` });
      return res.end();
    }
    if (req.method === 'GET' && p === '/v1/discord/callback') return await discordCallback(url, res);

    // ----- admin -----
    if (p.startsWith('/v1/admin/')) {
      if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) return send(res, 403, { error: 'Wrong admin key' });
      if (req.method === 'GET' && p === '/v1/admin/check') return send(res, 200, { ok: true });
      if (req.method === 'PUT' && p === '/v1/admin/partners') {
        const b = await readBody(req);
        if (!Array.isArray(b.partners)) return send(res, 400, { error: 'partners must be a list' });
        const str = (v, n) => String(v || '').trim().slice(0, n);
        data.partners = b.partners.slice(0, 50).map((x) => ({
          name: str(x.name, 40), ip: str(x.ip, 80).toLowerCase(), description: str(x.description, 200),
          tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => str(t, 20)).filter(Boolean).slice(0, 5),
          versions: str(x.versions, 30), discord: /^https:\/\//.test(x.discord || '') ? str(x.discord, 200) : '',
          website: /^https:\/\//.test(x.website || '') ? str(x.website, 200) : '',
        })).filter((x) => x.name && /^[a-z0-9.-]+(:\d{1,5})?$/.test(x.ip));
        save();
        return send(res, 200, { partners: data.partners });
      }
      if (req.method === 'POST' && (p === '/v1/admin/grant' || p === '/v1/admin/revoke')) {
        const b = await readBody(req);
        const uuid = resolvePlayer(b.player);
        if (!uuid) return send(res, 404, { error: 'unknown player (they must open Indus Client once, or use their UUID)' });
        const set = new Set(data.owned[uuid] || []);
        const items = b.item === 'all' ? [...ITEMS.keys()] : [b.item];
        for (const id of items) {
          if (!ITEMS.has(id)) return send(res, 400, { error: `unknown item ${id}` });
          if (p.endsWith('grant')) set.add(id); else set.delete(id);
        }
        data.owned[uuid] = [...set];
        save();
        return send(res, 200, { ok: true, uuid, owned: data.owned[uuid] });
      }
      return send(res, 404, { error: 'not found' });
    }

    // ----- signed-in launcher -----
    const me = auth(req);
    if (!me) return send(res, 401, { error: 'Please sign in again' });

    if (req.method === 'GET' && p === '/v1/me') {
      const d = data.discord[me.uuid];
      const skin = data.skins[me.uuid];
      return send(res, 200, {
        uuid: me.uuid, name: me.name, premium: me.premium,
        owned: [...new Set([...FREE, ...(data.owned[me.uuid] || [])])],
        discord: d ? { linked: true, name: d.name, member: !!d.member } : { linked: false, available: !!DISCORD.id },
        skin: skin ? { hash: skin.hash, slim: !!skin.slim } : null,
        requests: (data.requests[me.uuid] || []).length,
      });
    }

    if (req.method === 'POST' && p === '/v1/me/discord') {
      if (!DISCORD.id) return send(res, 503, { error: 'Discord linking is not set up yet.' });
      const code = crypto.randomBytes(16).toString('hex'); // one-time code, so the sign-in token never goes in a URL
      discordStates.set(code, { uuid: me.uuid, created: now });
      return send(res, 200, { url: `${PUBLIC_URL}/v1/discord/start?code=${code}` });
    }

    if (req.method === 'POST' && p === '/v1/me/status') {
      const b = await readBody(req);
      launcherOnline.set(me.uuid, { status: String(b.status || 'In the launcher').slice(0, 60), seen: now });
      return send(res, 200, { ok: true });
    }

    if (p === '/v1/skin' && req.method === 'PUT') {
      const b = await readBody(req, 128 * 1024);
      const png = Buffer.from(String(b.png || ''), 'base64');
      const size = pngSize(png);
      if (!size || size.w !== 64 || (size.h !== 64 && size.h !== 32) || png.length > 64 * 1024) {
        return send(res, 400, { error: 'Skins must be 64×64 (or 64×32) PNG files.' });
      }
      const hash = sha(png.toString('base64') + (b.slim ? 's' : 'w')).slice(0, 16);
      data.skins[me.uuid] = { hash, slim: !!b.slim, png: png.toString('base64') };
      save();
      return send(res, 200, { hash, slim: !!b.slim });
    }
    if (p === '/v1/skin' && req.method === 'DELETE') {
      delete data.skins[me.uuid];
      save();
      return send(res, 200, { ok: true });
    }

    // ----- friends (Microsoft accounts only) -----
    if (p.startsWith('/v1/friends')) {
      if (!me.premium) return send(res, 403, { error: 'Friends are for Microsoft (premium) accounts.' });
      const mine = list(data.friends, me.uuid);
      if (req.method === 'GET' && p === '/v1/friends') {
        const outgoing = Object.entries(data.requests).filter(([, from]) => from.includes(me.uuid)).map(([to]) => friendView(to));
        return send(res, 200, {
          friends: mine.map(friendView).sort((a, b) => b.online - a.online || a.name.localeCompare(b.name)),
          incoming: (data.requests[me.uuid] || []).map(friendView),
          outgoing,
        });
      }
      const b = await readBody(req);
      if (req.method === 'POST' && p === '/v1/friends/add') {
        const name = String(b.name || '').trim().toLowerCase();
        const target = data.premium[name];
        if (!target) return send(res, 404, { error: 'No Indus Client player with that name. They need to open Indus Client with a Microsoft account first.' });
        if (target === me.uuid) return send(res, 400, { error: "That's you!" });
        if (mine.includes(target)) return send(res, 400, { error: 'You are already friends.' });
        if (mine.length >= MAX_FRIENDS) return send(res, 400, { error: `You can have up to ${MAX_FRIENDS} friends.` });
        // they already asked you: become friends right away
        if ((data.requests[me.uuid] || []).includes(target)) {
          data.requests[me.uuid] = without(data.requests[me.uuid], target);
          mine.push(target);
          list(data.friends, target).push(me.uuid);
          save();
          return send(res, 200, { ok: true, friends: true });
        }
        const theirs = list(data.requests, target);
        if (!theirs.includes(me.uuid)) theirs.push(me.uuid);
        save();
        return send(res, 200, { ok: true, sent: true });
      }
      const other = UUID_RE.test(b.uuid || '') ? dashed(b.uuid) : null;
      if (!other) return send(res, 400, { error: 'bad uuid' });
      if (req.method === 'POST' && p === '/v1/friends/accept') {
        if (!(data.requests[me.uuid] || []).includes(other)) return send(res, 404, { error: 'No request from that player.' });
        data.requests[me.uuid] = without(data.requests[me.uuid], other);
        if (!mine.includes(other)) mine.push(other);
        const theirs = list(data.friends, other);
        if (!theirs.includes(me.uuid)) theirs.push(me.uuid);
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/v1/friends/decline') {
        data.requests[me.uuid] = without(data.requests[me.uuid] || [], other);
        data.requests[other] = without(data.requests[other] || [], me.uuid); // also cancels your own request
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/v1/friends/remove') {
        data.friends[me.uuid] = without(mine, other);
        data.friends[other] = without(data.friends[other] || [], me.uuid);
        save();
        return send(res, 200, { ok: true });
      }
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: 'bad request' });
  }
});

// forget old sign-in challenges, Discord states and rate-limit counters
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of challenges) if (now - t > 120_000) challenges.delete(k);
  for (const [k, s] of discordStates) if (now - s.created > 600_000) discordStates.delete(k);
  for (const [k, h] of hits) if (now - h.t > 120_000) hits.delete(k);
  for (const [k, s] of Object.entries(data.sessions)) if (s.exp < now) delete data.sessions[k];
}, 60_000).unref();

server.listen(PORT, () => console.log(`Indus API listening on port ${PORT}`));
