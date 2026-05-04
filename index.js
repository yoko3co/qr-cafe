const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DAY = 12 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const BASE_URL = process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com';
const ADMIN_URL = '/hallmann';
const VERSION = 'Krolestwo.3.0';
const HIVE_ACCOUNT = 'test3333';
const ADMIN_ACCOUNTS = ['hallmann', 'hivedocu', 'test3333'];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(function(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-eval' 'unsafe-inline' wss://hive-auth.arcange.eu https: data:");
  next();
});

// ==================== DATABASE ====================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  try {
    await pool.query(`
     CREATE TABLE IF NOT EXISTS users (
        hive_name TEXT PRIMARY KEY,
        points REAL DEFAULT 0,
        book INTEGER DEFAULT 0,
        games INTEGER DEFAULT 0,
        volunteers INTEGER DEFAULT 0,
        film INTEGER DEFAULT 0,
        last_visit BIGINT DEFAULT 0,
        events_today JSONB DEFAULT '{}',
        voted JSONB DEFAULT '{}',
       events_today JSONB DEFAULT '{}',
        random_presses INTEGER DEFAULT 0,
        random_day INTEGER DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        votes JSONB NOT NULL,
        status TEXT DEFAULT 'active',
        created_at BIGINT DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS past_polls (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        votes JSONB NOT NULL,
        stopped_at BIGINT DEFAULT 0
      );
    `);
await pool.query(`
      CREATE TABLE IF NOT EXISTS allowed_names (
        name TEXT PRIMARY KEY
      );
    `);
    const { allowedNames } = require('./allowedNames');
    for (const name of allowedNames) {
      await pool.query('INSERT INTO allowed_names (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    }
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS events_today JSONB DEFAULT \'{}\'');
    console.log('Database ready, names seeded:', allowedNames.size);
  } catch (e) {
    console.log('DB init error:', e.message, e.stack);
  }
}

initDB();

// ==================== DB HELPERS ====================

async function getUser(hiveName) {
  const r = await pool.query('SELECT * FROM users WHERE hive_name = $1', [hiveName]);
  return r.rows[0] || null;
}

async function upsertUser(hiveName, data) {
  await pool.query(`
    INSERT INTO users (hive_name, points, book, games, volunteers, film, last_visit, events_today, voted, random_presses, random_day)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (hive_name) DO UPDATE SET
      points=$2, book=$3, games=$4, volunteers=$5, film=$6,
      last_visit=$7, events_today=$8, voted=$9, random_presses=$10, random_day=$11
  `, [hiveName, data.points||0, data.book||0, data.games||0, data.volunteers||0, data.film||0,
      data.last_visit||0, JSON.stringify(data.events_today||{}), JSON.stringify(data.voted||{}), data.random_presses||0, data.random_day||0]);
}

async function getAllUsers() {
  const r = await pool.query('SELECT * FROM users ORDER BY points DESC');
  return r.rows;
}

async function getAllPolls() {
  const r = await pool.query('SELECT * FROM polls ORDER BY created_at ASC');
  return r.rows;
}

async function getPoll(pid) {
  const r = await pool.query('SELECT * FROM polls WHERE id = $1', [pid]);
  return r.rows[0] || null;
}

async function savePoll(pid, poll) {
  await pool.query(`
    INSERT INTO polls (id, question, options, votes, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO UPDATE SET
      question=$2, options=$3, votes=$4, status=$5
  `, [pid, poll.question, JSON.stringify(poll.options), JSON.stringify(poll.votes), poll.status, Date.now()]);
}

async function deletePoll(pid) {
  await pool.query('DELETE FROM polls WHERE id = $1', [pid]);
}

async function savePastPoll(poll) {
  await pool.query(
    'INSERT INTO past_polls (question, options, votes, stopped_at) VALUES ($1,$2,$3,$4)',
    [poll.question, JSON.stringify(poll.options), JSON.stringify(poll.votes), Date.now()]
  );
}

async function getPastPolls() {
  const r = await pool.query('SELECT * FROM past_polls ORDER BY stopped_at DESC LIMIT 10');
  return r.rows;
}

async function getAllowedNames() {
  const r = await pool.query('SELECT name FROM allowed_names');
  return new Set(r.rows.map(function(row) { return row.name; }));
}

async function addAllowedName(name) {
  await pool.query('INSERT INTO allowed_names (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
}

async function removeAllowedName(name) {
  await pool.query('DELETE FROM allowed_names WHERE name = $1', [name]);
}

// ==================== IN-MEMORY (sessions only) ====================

const sessions = new Map();
const adminSessions = new Set();
let blockchainVoting = true;

// ==================== LOTTERY ====================

const randomOutcomes = [
  { msg: "Wygrales 5 rycarow!", rare: true },
  { msg: "Wygrales 100!", rare: true },
  { msg: "Niestety nic... Sprobuj jutro!", rare: false },
  { msg: "Prawie! Ale jednak nie.", rare: false },
  { msg: "Los mowi: dzisiaj nie.", rare: false },
  { msg: "Moze jutro bedzie lepiej!", rare: false },
  { msg: "Puste kieszenie, pelne serce.", rare: false },
  { msg: "Wszechswiat sie zastanawia...", rare: false },
  { msg: "Nie tym razem, przyjacielu.", rare: false },
  { msg: "Sprobuj jeszcze raz jutro!", rare: false }
];

function getRandomOutcome() {
  const rand = Math.random();
  if (rand < 0.05) return randomOutcomes[0];
  if (rand < 0.08) return randomOutcomes[1];
  const others = randomOutcomes.filter(function(o) { return !o.rare; });
  return others[Math.floor(Math.random() * others.length)];
}

// ==================== HIVE SYNC ====================

async function fetchAllowedNames() {
  try {
    const res = await fetch('https://api.hive.blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [[HIVE_ACCOUNT]], id: 1 })
    });
    const data = await res.json();
    const meta = JSON.parse(data.result[0].posting_json_metadata || '{}');
    if (meta.allowed_names && Array.isArray(meta.allowed_names)) {
      await pool.query('DELETE FROM allowed_names');
      for (const n of meta.allowed_names) { await addAllowedName(n.toLowerCase()); }
      for (const a of ADMIN_ACCOUNTS) { await addAllowedName(a); }
      console.log('Names synced from Hive');
    }
  } catch (e) {
    console.log('Hive fetch failed:', e.message);
  }
}

fetchAllowedNames();
setInterval(fetchAllowedNames, 5 * 60 * 1000);

// ==================== HELPERS ====================

function escape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAdmin(name) { return ADMIN_ACCOUNTS.includes((name || '').trim().toLowerCase()); }

function checkAdminToken(req, res) {
  const token = req.query.admin || (req.body && req.body.admin);
  if (!token || !adminSessions.has(token)) { res.redirect(ADMIN_URL); return false; }
  return token;
}

// ==================== PAGE TEMPLATE ====================

function page(title, body, wide) {
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escape(title) + ' | QR Cafe</title>' +
    '<style>' +
      'body{font-family:Arial,sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
      '.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:' + (wide ? '700px' : '480px') + ';width:100%;text-align:center;position:relative}' +
      '.version{position:absolute;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.25)}' +
      'h1{font-size:2rem;margin:0 0 8px}' +
      'h2{font-size:1.3rem;color:#e0e0e0;margin:0 0 16px}' +
      'p{color:#aaa;margin:0 0 16px;line-height:1.6}' +
      'input[type=text],input[type=password]{width:100%;padding:13px 15px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:10px;outline:none;box-sizing:border-box}' +
      '.btn{display:block;width:100%;padding:13px;font-size:16px;font-weight:600;border:none;border-radius:10px;cursor:pointer;margin-top:8px;text-decoration:none;text-align:center;box-sizing:border-box}' +
      '.btn-green{background:#4ade80;color:#052e16}' +
      '.btn-gold{background:#fbbf24;color:#1c0a00}' +
      '.btn-red{background:#f87171;color:#2d0000}' +
      '.btn-blue{background:#60a5fa;color:#0c1a3a}' +
      '.btn-gray{background:rgba(255,255,255,0.1);color:#fff}' +
      '.btn-sm{padding:6px 14px;font-size:13px;width:auto;display:inline-block;margin:2px}' +
      '.badge{display:inline-block;background:#fbbf24;color:#1c0a00;border-radius:999px;padding:6px 20px;font-weight:700;font-size:16px;margin-bottom:16px}' +
      '.error{color:#f87171;background:rgba(248,113,113,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
      '.success{color:#4ade80;background:rgba(74,222,128,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
      '.info{color:#60a5fa;background:rgba(96,165,250,0.1);padding:12px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
      'a.link{color:#60a5fa;display:block;margin-top:12px;font-size:14px;text-decoration:none}' +
      'hr{border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0}' +
      'strong{color:#fff}' +
      'table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}' +
      'th{color:#aaa;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:left}' +
      'td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:left}' +
      '.bar-wrap{background:rgba(255,255,255,0.1);border-radius:999px;height:10px;margin-top:6px}' +
      '.bar{background:#fbbf24;height:10px;border-radius:999px}' +
      '.tag{display:inline-block;background:rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;font-size:13px;margin:3px}' +
      '.nav{display:flex;gap:8px;margin-top:20px;flex-wrap:wrap}' +
      '.nav a{flex:1;min-width:80px}' +
    '</style>' +
    '</head><body><div class="card">' +
    body +
    '<div style="margin-top:20px">' +
      '<a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="margin:0 8px;text-decoration:none;font-size:20px">📸</a>' +
      '<a href="https://www.facebook.com/herberciarnia" target="_blank" style="margin:0 8px;text-decoration:none;font-size:20px">📘</a>' +
    '</div>' +
    '<span class="version">' + VERSION + '</span>' +
    '<a href="/hallmann" style="position:absolute;bottom:12px;left:16px;font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none">admin</a>' +
    '</div></body></html>';
}

function navBar(userKey) {
  return '<div class="nav">' +
    '<a href="/home?user=' + encodeURIComponent(userKey) + '" class="btn btn-gray">Home</a>' +
    '<a href="/leaderboard?user=' + encodeURIComponent(userKey) + '" class="btn btn-gray">Leaderboard</a>' +
    '<a href="/missions" class="btn btn-gray" style="opacity:0.5;pointer-events:none">Missions</a>' +
    '<a href="/polls?user=' + encodeURIComponent(userKey) + '" class="btn btn-gray">Voting</a>' +
    '<a href="/lottery?user=' + encodeURIComponent(userKey) + '" class="btn btn-gold">Lottery</a>' +
  '</div>';
}

// ==================== HOME (NOT LOGGED IN) ====================

app.get('/', function(req, res) {
  res.send(page('QR Cafe',
    '<h1>QR Cafe</h1>' +
    '<h2>Witamy w Krolestwie!</h2>' +
    '<div class="info">Chcesz zalozyc konto?<br><strong>Zapytaj w Krolestwie!</strong></div>' +
    '<hr>' +
    '<p style="font-size:11px;color:#555;margin-bottom:12px">By logging in you agree that your participation data is stored solely for community engagement and will never be shared or used commercially.</p>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/') + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-blue";' +
      'btn.innerText="Login with Hive Keychain";' +
      'btn.onclick=function(){' +
        'window.hive_keychain.requestSignBuffer(null,"qrcafe-login","Posting",function(res){' +
          'if(res.success){window.location.href="/home?user=HIVE:"+encodeURIComponent(res.data.username);}' +
          'else{alert("Error: "+res.message);}' +
        '});' +
      '};' +
      'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
    '}' +
    '</script>' +
    '<a class="link" href="/leaderboard">View Leaderboard</a>' +
    '<a class="link" href="/polls?user=guest">View Polls</a>'
  ));
});

// ==================== HOME (LOGGED IN) ====================

app.get('/home', async function(req, res) {
  const key = req.query.user;
  const name = key ? key.replace('HIVE:', '') : null;
  if (!name) return res.redirect('/');
  try {
    const allowedNames = await getAllowedNames();
    if (!allowedNames.has(name.toLowerCase()) && !isAdmin(name)) {
      return res.send(page('Access Denied', '<h1>Access Denied</h1><p>Your account is not on the guest list. Zapytaj w Krolestwie!</p><a class="link" href="/">Back</a>'));
    }
    let user = await getUser(name);
    if (!user) {
      await upsertUser(name, { points: 0, book: 0, games: 0, volunteers: 0, film: 0, last_visit: 0, voted: {}, random_presses: 0, random_day: 0 });
      user = await getUser(name);
    }
    res.send(page('Home',
      '<h1>Witamy w Krolestwie!</h1>' +
      '<h2>Hey, <strong>' + escape(user.hive_name) + '</strong>!</h2>' +
      '<div class="badge">' + (user.points || 0).toFixed(1) + ' points</div>' +
      '<p style="font-size:13px;color:#666">Book: ' + (user.book || 0) + ' | Games: ' + (user.games || 0) + ' | Volunteers: ' + (user.volunteers || 0) + ' | Film: ' + (user.film || 0) + '</p>' +
      navBar(key)
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== QR DISPLAY ====================

app.get('/qr', async function(req, res) {
  const token = req.query.admin;
  if (!adminSessions.has(token)) return res.redirect(ADMIN_URL);
  const sid = crypto.randomUUID();
  const event = req.query.event || 'none';
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL, event: event });
  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 2 });
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;font-family:Arial,sans-serif;color:#fff;text-align:center}' +
    'h1{font-size:2rem;margin-bottom:4px}.event{color:#fbbf24;font-size:14px;margin-bottom:16px}' +
    '.version{position:fixed;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.2)}' +
    '.back{position:fixed;bottom:12px;left:16px;font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none}</style>' +
    '<script>setTimeout(function(){window.location.reload();},60000);</script>' +
    '</head><body>' +
    '<h1>QR Cafe</h1>' +
    '<p style="color:#aaa;margin-bottom:4px">Scan to check in</p>' +
    (event !== 'none' ? '<p class="event">Event: ' + escape(event.charAt(0).toUpperCase() + event.slice(1)) + '</p>' : '<p style="color:#555;font-size:13px">Standard check-in</p>') +
    '<img src="' + qr + '" style="width:300px;height:300px;border-radius:16px"/>' +
    '<p style="color:#555;font-size:13px;margin-top:16px">Refreshes every minute</p>' +
    '<span class="version">' + VERSION + '</span>' +
    '<a href="' + ADMIN_URL + '/panel?admin=' + token + '" class="back">back to panel</a>' +
    '</body></html>');
});

// ==================== CHECK IN ====================

app.get('/check', function(req, res) {
  const session = req.query.session;
  const s = sessions.get(session);
  if (!s) return res.send(page('Invalid QR', '<h1>Invalid QR Code</h1><p>Please scan a fresh QR code.</p>'));
  if (Date.now() > s.expiresAt) return res.send(page('Expired', '<h1>QR Code Expired</h1><p>Please scan a fresh QR code.</p>'));
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Check In',
    '<h1>QR Cafe</h1>' +
    '<h2>Check In</h2>' +
    (error ? '<div class="error">' + escape(error) + '</div>' : '') +
    '<p>Sign in with Hive Keychain to check in and earn points.</p>' +
    '<input type="text" id="hive-username" placeholder="Your Hive username"/>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/check?session=' + session) + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'document.getElementById("hive-username").style.display="none";' +
      'window.hive_keychain.requestSignBuffer(null,"qrcafe-checkin-' + session + '","Posting",function(res){' +
        'if(res.success){window.location.href="/hive-checkin?session=' + session + '&user="+encodeURIComponent(res.data.username);}' +
        'else{' +
          'document.getElementById("hive-username").style.display="block";' +
          'var btn=document.createElement("button");' +
          'btn.className="btn btn-green";' +
          'btn.innerText="Try again";' +
          'btn.onclick=function(){window.location.reload();};' +
          'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
          'alert("Error: "+res.message);' +
        '}' +
      '});' +
    '}' +
    '</script>'
  ));
});

app.get('/hive-checkin', async function(req, res) {
  const session = req.query.session;
  const name = (req.query.user || '').trim().toLowerCase();
  const s = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  try {
    const allowedNames = await getAllowedNames();
    if (!allowedNames.has(name) && !isAdmin(name)) {
      return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Your name is not on the guest list'));
    }
    let user = await getUser(name);
    if (!user) {
      await upsertUser(name, { points: 0, book: 0, games: 0, volunteers: 0, film: 0, last_visit: 0, voted: {}, random_presses: 0, random_day: 0 });
      user = await getUser(name);
    }
    const withinWindow = user.last_visit && Date.now() - user.last_visit < DAY;
    const eventsToday = withinWindow ? (user.events_today || {}) : {};
    const eventType = s.event || 'none';

    if (withinWindow) {
      if (eventType === 'none') {
        const next = new Date(user.last_visit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return res.send(page('Already Checked In',
          '<h1>Already checked in!</h1>' +
          '<p>Hey <strong>' + escape(user.hive_name) + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
          '<div class="badge">' + (user.points || 0).toFixed(1) + ' points</div>' +
          navBar('HIVE:' + name)
        ));
      }
      if (eventsToday[eventType]) {
        return res.send(page('Already earned!',
          '<h1>Already earned!</h1>' +
          '<p>You already got your <strong>' + escape(eventType) + '</strong> coin today.</p>' +
          '<div class="badge">' + (user.points || 0).toFixed(1) + ' points</div>' +
          navBar('HIVE:' + name)
        ));
      }
      eventsToday[eventType] = true;
      if (eventType === 'book') user.book = (user.book || 0) + 1;
      if (eventType === 'games') user.games = (user.games || 0) + 1;
      if (eventType === 'volunteers') user.volunteers = (user.volunteers || 0) + 1;
      if (eventType === 'film') user.film = (user.film || 0) + 1;
      user.events_today = eventsToday;
      await upsertUser(name, user);
      return res.send(page('Event coin earned!',
        '<h1>Event coin earned!</h1>' +
        '<h2>' + escape(user.hive_name) + '</h2>' +
        '<p>You earned a <strong>' + escape(eventType.charAt(0).toUpperCase() + eventType.slice(1)) + '</strong> coin!</p>' +
        '<div class="badge">+1 ' + escape(eventType) + ' coin - Total points: ' + (user.points || 0).toFixed(1) + '</div>' +
        navBar('HIVE:' + name)
      ));
    }

    user.last_visit = Date.now();
    user.points = (user.points || 0) + 1;
    user.events_today = {};
    if (eventType === 'book') { user.book = (user.book || 0) + 1; user.events_today.book = true; }
    if (eventType === 'games') { user.games = (user.games || 0) + 1; user.events_today.games = true; }
    if (eventType === 'volunteers') { user.volunteers = (user.volunteers || 0) + 1; user.events_today.volunteers = true; }
    if (eventType === 'film') { user.film = (user.film || 0) + 1; user.events_today.film = true; }
    await upsertUser(name, user);
    const coinMsg = eventType !== 'none' ? ' +1 ' + eventType.charAt(0).toUpperCase() + eventType.slice(1) + ' coin' : '';
    res.send(page('Welcome!',
      '<h1>Witamy w Krolestwie!</h1>' +
      '<h2>Welcome, ' + escape(user.hive_name) + '!</h2>' +
      '<p>Checked in with Hive Keychain!</p>' +
      '<div class="badge">+1 point' + coinMsg + ' - Total: ' + user.points.toFixed(1) + '</div>' +
      navBar('HIVE:' + name)
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== LEADERBOARD ====================

app.get('/leaderboard', async function(req, res) {
  const type = req.query.type || 'points';
  const validTypes = ['points', 'book', 'games', 'volunteers', 'film'];
  const safeType = validTypes.includes(type) ? type : 'points';
  try {
    const col = safeType === 'points' ? 'points' : safeType;
    const r = await pool.query('SELECT * FROM users ORDER BY ' + col + ' DESC LIMIT 20');
    const users = r.rows;
    const medals = ['1st', '2nd', '3rd'];
    let rows = users.length === 0 ? '<tr><td colspan="3" style="color:#555;padding:20px;text-align:center">No players yet</td></tr>' : '';
    users.forEach(function(u, i) {
      rows += '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i] || i + 1) + '</td><td>' + escape(u.hive_name) + '</td><td style="color:#fbbf24;font-weight:700">' + (u[col] || 0) + '</td></tr>';
    });
    const tabs = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      ['points', 'book', 'games', 'volunteers', 'film'].map(function(t) {
        return '<a href="/leaderboard?type=' + t + '" class="btn ' + (safeType === t ? 'btn-gold' : 'btn-gray') + ' btn-sm">' + t.charAt(0).toUpperCase() + t.slice(1) + '</a>';
      }).join('') +
    '</div>';
    res.send(page('Leaderboard',
      '<h1>Leaderboard</h1>' +
      tabs +
      '<table><tr><th>#</th><th>Player</th><th>' + safeType.charAt(0).toUpperCase() + safeType.slice(1) + '</th></tr>' + rows + '</table>' +
     '<a class="link" href="' + (req.query.user ? '/home?user=' + encodeURIComponent(req.query.user) : '/') + '">Back</a>'
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== POLLS ====================

app.get('/polls', async function(req, res) {
  const key = req.query.user;
  const name = key && key !== 'guest' ? key.replace('HIVE:', '') : null;
  try {
    let user = name ? await getUser(name) : null;
    const isGuest = !user;
    const allPolls = await getAllPolls();
    let pollHtml = '';
    if (allPolls.length === 0) {
      pollHtml = '<div class="info">No active polls right now.</div>';
    } else {
      for (const poll of allPolls) {
        if (poll.status === 'stopped') continue;
        const voted = user && user.voted && user.voted[poll.id];
        const options = poll.options;
        const votes = poll.votes;
        pollHtml += '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">' +
          '<strong>' + escape(poll.question) + '</strong>';
        if (poll.status === 'paused') {
          pollHtml += '<p style="color:#f87171;font-size:13px;margin-top:8px">This poll is paused.</p>';
        } else if (isGuest) {
          pollHtml += '<p style="color:#aaa;font-size:13px;margin-top:8px">Login to vote.</p>';
          options.forEach(function(opt) {
            pollHtml += '<div class="btn btn-gray" style="margin-top:6px;opacity:0.5;text-align:left">' + escape(opt) + '</div>';
          });
        } else if (voted) {
          pollHtml += '<p style="color:#4ade80;font-size:13px;margin-top:8px">Voted: <strong>' + escape(options[voted.optIndex]) + '</strong></p>';
          const total = votes.reduce(function(a, b) { return a + b; }, 0);
          options.forEach(function(opt, i) {
            const pct = total > 0 ? Math.round((votes[i] / total) * 100) : 0;
            pollHtml += '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between"><span style="font-size:13px">' + escape(opt) + '</span><span style="color:#fbbf24;font-size:13px">' + pct + '%</span></div><div class="bar-wrap"><div class="bar" style="width:' + pct + '%"></div></div></div>';
          });
        } else {
          options.forEach(function(opt, i) {
            if (blockchainVoting) {
              pollHtml += '<button onclick="chainVote(\'' + poll.id + '\',' + i + ',this.innerText)" class="btn btn-gray" style="margin-top:6px;text-align:left">' + escape(opt) + '</button>';
            } else {
              pollHtml += '<a href="/poll-vote?pid=' + poll.id + '&opt=' + i + '&user=' + encodeURIComponent(key) + '" class="btn btn-gray" style="margin-top:6px;text-align:left">' + escape(opt) + '</a>';
            }
          });
        }
        pollHtml += '</div>';
      }
    }
    const chainScript = blockchainVoting && !isGuest ?
      '<script>' +
      'function chainVote(pid,opt,optText){' +
        'if(!confirm("Your vote for \\""+optText+"\\" will be recorded on Hive blockchain. Continue?")) return;' +
        'if(typeof window.hive_keychain==="undefined") return alert("Open in Keychain browser to vote on blockchain.");' +
        'var user="' + escape(name || '') + '";' +
        'var json=JSON.stringify({app:"qr-cafe",action:"vote",poll:pid,choice:opt,optionText:optText});' +
        'window.hive_keychain.requestCustomJson(user,"qr-cafe-vote","Posting","[]",json,"QR Cafe Vote",function(res){' +
          'if(res.success){window.location.href="/poll-vote?pid="+pid+"&opt="+opt+"&user=' + encodeURIComponent(key || '') + '";}' +
          'else{alert("Error: "+res.message);}' +
        '});' +
      '}' +
      '</script>' : '';
    res.send(page('Voting',
      '<h1>Voting</h1>' +
      pollHtml +
      chainScript +
      (isGuest ? '<a class="link" href="/">Login to vote</a>' : navBar(key))
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

app.get('/poll-vote', async function(req, res) {
  const pid = req.query.pid;
  const opt = parseInt(req.query.opt);
  const key = req.query.user;
  const name = key ? key.replace('HIVE:', '') : null;
  if (!name) return res.redirect('/');
  try {
    const poll = await getPoll(pid);
    const user = await getUser(name);
    if (!poll || !user) return res.redirect('/polls?user=' + encodeURIComponent(key || 'guest'));
    if (poll.status !== 'active') return res.redirect('/polls?user=' + encodeURIComponent(key));
    if (user.voted && user.voted[pid]) return res.redirect('/polls?user=' + encodeURIComponent(key));
    if (isNaN(opt) || opt < 0 || opt >= poll.options.length) return res.redirect('/polls?user=' + encodeURIComponent(key));
    poll.votes[opt]++;
    if (!user.voted) user.voted = {};
    user.voted[pid] = { optIndex: opt };
    await pool.query('UPDATE polls SET votes=$1 WHERE id=$2', [JSON.stringify(poll.votes), pid]);
    await upsertUser(name, user);
    res.redirect('/polls?user=' + encodeURIComponent(key));
  } catch (e) {
    res.redirect('/polls?user=' + encodeURIComponent(key || 'guest'));
  }
});

// ==================== LOTTERY ====================

app.get('/lottery', async function(req, res) {
  const key = req.query.user;
  const name = key ? key.replace('HIVE:', '') : null;
  if (!name) return res.redirect('/');
  try {
    const user = await getUser(name);
    if (!user) return res.redirect('/');
    const today = Math.floor(Date.now() / DAY);
    if (user.random_day !== today) { user.random_presses = 0; user.random_day = today; }
    const pressesLeft = 3 - (user.random_presses || 0);
    res.send(page('Lottery',
      '<h1>Lottery</h1>' +
      '<h2>Try your luck!</h2>' +
      '<p style="color:#aaa">' + pressesLeft + ' press' + (pressesLeft !== 1 ? 'es' : '') + ' remaining today</p>' +
      '<div id="result" style="font-size:22px;font-weight:700;color:#fbbf24;min-height:36px;margin-bottom:16px"></div>' +
      (pressesLeft > 0 ?
        '<button class="btn btn-gold" id="spin-btn" onclick="spin()">Try your luck!</button>' :
        '<div class="info">Come back tomorrow for more presses!</div>') +
      navBar(key) +
      '<script>' +
      'function spin(){' +
        'document.getElementById("spin-btn").disabled=true;' +
        'fetch("/lottery-spin?user=' + encodeURIComponent(key) + '")' +
        '.then(function(r){return r.json();})' +
        '.then(function(d){' +
          'document.getElementById("result").innerText=d.msg;' +
          'if(d.pressesLeft>0){document.getElementById("spin-btn").disabled=false;}' +
          'else{document.getElementById("spin-btn").outerHTML="<div class=\'info\'>No more presses today!</div>";}' +
        '});' +
      '}' +
      '</script>'
    ));
  } catch (e) {
    res.redirect('/');
  }
});

app.get('/lottery-spin', async function(req, res) {
  const key = req.query.user;
  const name = key ? key.replace('HIVE:', '') : null;
  if (!name) return res.json({ ok: false, msg: 'Not logged in' });
  try {
    const user = await getUser(name);
    if (!user) return res.json({ ok: false, msg: 'User not found' });
    const today = Math.floor(Date.now() / DAY);
    if (user.random_day !== today) { user.random_presses = 0; user.random_day = today; }
    if ((user.random_presses || 0) >= 3) return res.json({ ok: false, msg: 'No more presses today!' });
    user.random_presses = (user.random_presses || 0) + 1;
    await upsertUser(name, user);
    const outcome = getRandomOutcome();
    res.json({ ok: true, msg: outcome.msg, pressesLeft: 3 - user.random_presses });
  } catch (e) {
    res.json({ ok: false, msg: 'Error' });
  }
});

// ==================== ADMIN LOGIN ====================

app.get(ADMIN_URL, function(req, res) {
  const token = req.query.admin;
  if (token && adminSessions.has(token)) return res.redirect(ADMIN_URL + '/panel?admin=' + token);
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Admin Login',
    '<h1>Admin Login</h1>' +
    '<h2>QR Cafe</h2>' +
    (error ? '<div class="error">' + escape(error) + '</div>' : '') +
    '<p style="font-size:13px;color:#666">Keychain login - hallmann or hivedocu only</p>' +
    '<input type="text" id="admin-username" placeholder="Your Hive username"/>' +
    '<button class="btn btn-blue" onclick="adminLogin()">Login with Keychain</button>' +
    '<a href="/" class="btn btn-gray">Home</a>' +
    '<script>' +
    'function adminLogin(){' +
      'var u=document.getElementById("admin-username").value.trim().toLowerCase();' +
      'if(!u) return alert("Enter your Hive username");' +
      'if(typeof window.hive_keychain==="undefined") return alert("Open this page inside Keychain browser.");' +
      'window.hive_keychain.requestSignBuffer(u,"qrcafe-admin-login","Posting",function(res){' +
        'if(res.success){' +
          'fetch("/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:res.data.username})})' +
          '.then(function(r){return r.json();})' +
          '.then(function(d){' +
            'if(d.ok){window.location.href="' + ADMIN_URL + '/panel?admin="+d.token;}' +
            'else{alert(d.error||"Access denied");}' +
          '});' +
        '} else{alert("Keychain error: "+res.message);}' +
      '});' +
    '}' +
    '</script>'
  ));
});

app.post('/admin-auth', function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!isAdmin(username)) return res.json({ ok: false, error: 'Access denied.' });
  const token = crypto.randomUUID();
  adminSessions.add(token);
  res.json({ ok: true, token: token });
});

// ==================== ADMIN PANEL ====================

app.get(ADMIN_URL + '/panel', async function(req, res) {
  const token = req.query.admin;
  if (!token || !adminSessions.has(token)) return res.redirect(ADMIN_URL + '?error=' + encodeURIComponent('Please login first'));
  const msg = req.query.msg ? decodeURIComponent(req.query.msg) : '';
  const isError = req.query.err === '1';
  const a = '?admin=' + token;
  try {
    const allUsers = await getAllUsers();
    const allPolls = await getAllPolls();
    const allPastPolls = await getPastPolls();
    const allowedNames = await getAllowedNames();

    let userRows = allUsers.length === 0 ?
      '<tr><td colspan="4" style="color:#555;text-align:center;padding:16px">No users yet</td></tr>' :
      allUsers.map(function(u) {
        const checkedIn = u.last_visit && Date.now() - u.last_visit < DAY ? 'Yes' : 'No';
        return '<tr>' +
          '<td><strong>' + escape(u.hive_name) + '</strong></td>' +
          '<td>' + (u.points || 0).toFixed(1) + '</td>' +
          '<td>' + checkedIn + '</td>' +
          '<td>' +
            '<form method="POST" action="' + ADMIN_URL + '/reset-checkin' + a + '" style="display:inline"><input type="hidden" name="key" value="' + escape(u.hive_name) + '"/><button type="submit" class="btn btn-gold btn-sm">Reset CI</button></form> ' +
            '<form method="POST" action="' + ADMIN_URL + '/delete-user' + a + '" style="display:inline"><input type="hidden" name="key" value="' + escape(u.hive_name) + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form>' +
          '</td>' +
        '</tr>';
      }).join('');

    let nameTags = '';
    allowedNames.forEach(function(n) {
      nameTags += '<span class="tag">' + escape(n) + ' <a href="' + ADMIN_URL + '/remove-name?name=' + encodeURIComponent(n) + '&admin=' + token + '" style="color:#f87171;text-decoration:none;margin-left:4px">x</a></span>';
    });

    let pollRows = allPolls.length === 0 ?
      '<tr><td colspan="4" style="color:#555;padding:12px;text-align:center">No polls yet</td></tr>' :
      allPolls.map(function(poll) {
        const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
        const statusColor = poll.status === 'active' ? '#4ade80' : '#fbbf24';
        return '<tr>' +
          '<td>' + escape(poll.question) + '</td>' +
          '<td style="color:' + statusColor + '">' + poll.status + '</td>' +
          '<td>' + total + '</td>' +
          '<td>' +
            (poll.status === 'active' ? '<form method="POST" action="' + ADMIN_URL + '/pause-poll' + a + '" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-gold btn-sm">Pause</button></form> ' : '') +
            (poll.status === 'paused' ? '<form method="POST" action="' + ADMIN_URL + '/resume-poll' + a + '" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-green btn-sm">Resume</button></form> ' : '') +
            '<form method="POST" action="' + ADMIN_URL + '/stop-poll' + a + '" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-red btn-sm">Stop & Save</button></form>' +
          '</td>' +
        '</tr>';
      }).join('');

    let pastPollRows = allPastPolls.length === 0 ? '' :
      allPastPolls.map(function(poll) {
        const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
        let results = poll.options.map(function(opt, i) {
          const pct = total > 0 ? Math.round((poll.votes[i] / total) * 100) : 0;
          return '<div style="font-size:12px">' + escape(opt) + ': <strong>' + pct + '%</strong></div>';
        }).join('');
        return '<tr><td>' + escape(poll.question) + '</td><td>' + total + '</td><td>' + results + '</td></tr>';
      }).join('');

    res.send(page('Admin Panel',
      '<h1>Admin Panel</h1>' +
      '<h2>' + VERSION + '</h2>' +
      (msg ? '<div class="' + (isError ? 'error' : 'success') + '">' + escape(msg) + '</div>' : '') +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Generate QR</h2>' +
      '<form method="GET" action="/qr">' +
        '<input type="hidden" name="admin" value="' + token + '"/>' +
        '<select name="event" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:8px">' +
          '<option value="none">No event - standard point only</option>' +
          '<option value="book">Book Club - +1 Book coin</option>' +
          '<option value="games">Board Games - +1 Games coin</option>' +
          '<option value="volunteers">Volunteers - +1 Volunteers coin</option>' +
          '<option value="film">Film Club - +1 Film coin</option>' +
        '</select>' +
        '<button type="submit" class="btn btn-green">Generate QR Code</button>' +
      '</form>' +

      '<hr><h2 style="text-align:left;margin-bottom:8px">Blockchain Voting</h2>' +
      '<p style="text-align:left;color:#aaa;font-size:13px">Currently: <strong style="color:' + (blockchainVoting ? '#4ade80' : '#f87171') + '">' + (blockchainVoting ? 'ON - votes on Hive chain' : 'OFF - votes stored locally') + '</strong></p>' +
      '<form method="POST" action="' + ADMIN_URL + '/toggle-blockchain' + a + '">' +
        '<button type="submit" class="btn ' + (blockchainVoting ? 'btn-red' : 'btn-green') + '">' + (blockchainVoting ? 'Turn OFF' : 'Turn ON') + '</button>' +
      '</form>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Users (' + allUsers.length + ')</h2>' +
      '<div style="overflow-x:auto"><table><tr><th>Name</th><th>Pts</th><th>Today</th><th>Actions</th></tr>' + userRows + '</table></div>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Allowed Names (' + allowedNames.size + ')</h2>' +
      '<p style="text-align:left;font-size:13px;color:#666">Synced from Hive: ' + HIVE_ACCOUNT + ' every 5 min</p>' +
      '<details style="text-align:left;margin-bottom:12px"><summary style="cursor:pointer;color:#60a5fa;font-size:14px">Show names (' + allowedNames.size + ')</summary><div style="margin-top:8px">' + (nameTags || '<p style="color:#555">No names</p>') + '</div></details>' +
      '<form method="POST" action="' + ADMIN_URL + '/add-name' + a + '" style="display:flex;gap:8px">' +
        '<input type="text" name="name" placeholder="Add a name..." required style="flex:1;margin:0"/>' +
        '<button type="submit" class="btn btn-green" style="width:auto;padding:8px 16px;margin:0">Add</button>' +
      '</form>' +
      '<form method="POST" action="' + ADMIN_URL + '/sync-hive' + a + '" style="margin-top:8px">' +
        '<button type="submit" class="btn btn-blue">Sync from Hive now</button>' +
      '</form>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Active Polls (' + allPolls.length + '/5)</h2>' +
      '<table><tr><th>Question</th><th>Status</th><th>Votes</th><th>Actions</th></tr>' + pollRows + '</table>' +
      (allPolls.length < 5 ?
        '<form method="POST" action="' + ADMIN_URL + '/add-poll' + a + '" style="margin-top:16px">' +
          '<input type="text" name="question" placeholder="Poll question..." required style="margin-bottom:8px"/>' +
          '<input type="text" name="opt0" placeholder="Option 1" required style="margin-bottom:6px"/>' +
          '<input type="text" name="opt1" placeholder="Option 2" required style="margin-bottom:6px"/>' +
          '<input type="text" name="opt2" placeholder="Option 3 (optional)" style="margin-bottom:6px"/>' +
          '<input type="text" name="opt3" placeholder="Option 4 (optional)" style="margin-bottom:6px"/>' +
          '<button type="submit" class="btn btn-gold">Add Poll</button>' +
        '</form>'
        : '<p style="color:#f87171;font-size:13px;margin-top:8px">Max 5 polls reached.</p>') +

      (allPastPolls.length > 0 ?
        '<hr><h2 style="text-align:left;margin-bottom:12px">Past Polls</h2>' +
        '<table><tr><th>Question</th><th>Total</th><th>Results</th></tr>' + pastPollRows + '</table>'
        : '') +

      '<hr>' +
      '<a class="link" href="/leaderboard">Leaderboard</a>' +
      '<a class="link" href="/">Home</a>'
    , true));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== ADMIN ACTIONS ====================

app.post(ADMIN_URL + '/add-name', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const name = (req.body.name || '').trim().toLowerCase();
  if (!name) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Name cannot be empty'));
  await addAllowedName(name);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Added: ' + name));
});

app.get(ADMIN_URL + '/remove-name', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const name = (req.query.name || '').trim().toLowerCase();
  await removeAllowedName(name);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Removed: ' + name));
});

app.post(ADMIN_URL + '/sync-hive', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  await fetchAllowedNames();
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Synced from Hive'));
});

app.post(ADMIN_URL + '/reset-checkin', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const name = req.body.key;
  const user = await getUser(name);
  if (!user) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('User not found'));
  user.last_visit = 0;
  await upsertUser(name, user);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Check-in reset for ' + name));
});

app.post(ADMIN_URL + '/delete-user', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const name = req.body.key;
  await pool.query('DELETE FROM users WHERE hive_name = $1', [name]);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Deleted: ' + name));
});

app.post(ADMIN_URL + '/add-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const count = await pool.query('SELECT COUNT(*) FROM polls');
  if (parseInt(count.rows[0].count) >= 5) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Max 5 polls reached'));
  const question = (req.body.question || '').trim();
  const options = [req.body.opt0, req.body.opt1, req.body.opt2, req.body.opt3]
    .map(function(o) { return (o || '').trim(); })
    .filter(function(o) { return o.length > 0; });
  if (!question || options.length < 2) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Need question and 2+ options'));
  const pid = crypto.randomUUID();
  await savePoll(pid, { question: question, options: options, votes: options.map(function() { return 0; }), status: 'active' });
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll added'));
});

app.post(ADMIN_URL + '/pause-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  await pool.query('UPDATE polls SET status=$1 WHERE id=$2', ['paused', req.body.pid]);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll paused'));
});

app.post(ADMIN_URL + '/resume-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  await pool.query('UPDATE polls SET status=$1 WHERE id=$2', ['active', req.body.pid]);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll resumed'));
});

app.post(ADMIN_URL + '/stop-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const poll = await getPoll(req.body.pid);
  if (poll) {
    await savePastPoll(poll);
    await deletePoll(req.body.pid);
  }
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll stopped and saved'));
});

app.post(ADMIN_URL + '/toggle-blockchain', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  blockchainVoting = !blockchainVoting;
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Blockchain voting: ' + (blockchainVoting ? 'ON' : 'OFF')));
});

// ==================== START ====================

app.listen(PORT, function() {
  console.log('QR Cafe ' + VERSION + ' running at ' + BASE_URL);
  console.log('Admin: ' + BASE_URL + ADMIN_URL);
});