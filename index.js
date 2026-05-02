const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const BASE_URL = process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com';
const ADMIN_URL = '/hallmann';
const VERSION = 'Krolestwo.2.0';
const HIVE_ACCOUNT = 'test3333';
const ADMIN_ACCOUNTS = ['hallmann', 'hivedocu', 'sztukahbd'];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(function(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-eval' 'unsafe-inline' wss://hive-auth.arcange.eu https: data:");
  next();
});

// ==================== STORAGE ====================

const sessions = new Map();
const users = new Map();
const adminSessions = new Set();
const polls = new Map();
const pastPolls = [];
const { allowedNames } = require('./allowedNames');


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
      allowedNames.clear();
      meta.allowed_names.forEach(function(n) { allowedNames.add(n.toLowerCase()); });
      ADMIN_ACCOUNTS.forEach(function(a) { allowedNames.add(a); });
      console.log('Names loaded from Hive:', allowedNames.size);
    }
  } catch (e) {
    console.log('Hive fetch failed:', e.message);
  }
}

fetchAllowedNames();
setInterval(fetchAllowedNames, 5 * 60 * 1000);

// ==================== HELPERS ====================

function isAllowed(name) { return allowedNames.has(name.trim().toLowerCase()); }
function isAdmin(name) { return ADMIN_ACCOUNTS.includes((name || '').trim().toLowerCase()); }
function checkAdminToken(req, res) {
  const token = req.query.admin || req.body && req.body.admin;
  if (!token || !adminSessions.has(token)) { res.redirect(ADMIN_URL); return false; }
  return token;
}
function getUserKey(name) { return 'HIVE:' + name.trim().toLowerCase(); }

// ==================== PAGE TEMPLATE ====================

function page(title, body, opts) {
  opts = opts || {};
  const wide = opts.wide || false;
  const noAdmin = opts.noAdmin || false;
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + ' | QR Cafe</title>' +
    '<style>' +
      'body{font-family:Arial,sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
      '.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:' + (wide ? '700px' : '480px') + ';width:100%;text-align:center;position:relative}' +
      '.version{position:absolute;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.2)}' +
      '.admin-link{position:absolute;bottom:12px;left:16px;font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none}' +
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
      '.info{color:#60a5fa;background:rgba(96,165,250,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
      'a.link{color:#60a5fa;display:block;margin-top:12px;font-size:14px;text-decoration:none}' +
      'hr{border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0}' +
      'strong{color:#fff}' +
      'table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}' +
      'th{color:#aaa;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:left}' +
      'td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:left}' +
      '.bar-wrap{background:rgba(255,255,255,0.1);border-radius:999px;height:10px;margin-top:6px}' +
      '.bar{background:#fbbf24;height:10px;border-radius:999px}' +
      '.tag{display:inline-block;background:rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;font-size:13px;margin:3px}' +
      '.nav{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}' +
      '.nav a{flex:1;min-width:80px}' +
    '</style>' +
    '</head><body><div class="card">' +
    body +
    '<div style="margin-top:20px">' +
      '<a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="margin:0 8px;text-decoration:none;font-size:18px">📸</a>' +
      '<a href="https://www.facebook.com/herberciarnia" target="_blank" style="margin:0 8px;text-decoration:none;font-size:18px">📘</a>' +
    '</div>' +
    '<span class="version">' + VERSION + '</span>' +
    (noAdmin ? '' : '<a href="/hallmann" class="admin-link">admin</a>') +
    '</div></body></html>';
}

function navBar(userKey) {
  return '<div class="nav">' +
    '<a href="/home?user=' + encodeURIComponent(userKey) + '" class="btn btn-gray">Home</a>' +
    '<a href="/leaderboard" class="btn btn-gray">Leaderboard</a>' +
    '<a href="/polls?user=' + encodeURIComponent(userKey) + '" class="btn btn-gray">Voting</a>' +
    '<a href="/lottery?user=' + encodeURIComponent(userKey) + '" class="btn btn-gray">Lottery</a>' +
  '</div>';
}

// ==================== HOME (NOT LOGGED IN) ====================

app.get('/', function(req, res) {
  res.send(page('QR Cafe',
    '<h1>QR Cafe</h1>' +
    '<h2>Witamy w Krolestwie!</h2>' +
    '<div class="info">Chcesz zalozyc konto?<br><strong>Zapytaj w Krolestwie!</strong></div>' +
    '<hr>' +
    '<p style="font-size:13px;color:#666">Login with your Hive account</p>' +
    '<input type="text" id="hive-username" placeholder="Your Hive username"/>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/keychain-login') + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-blue";' +
      'btn.innerText="Login with Hive Keychain";' +
      'btn.onclick=function(){' +
        'var u=document.getElementById("hive-username").value.trim().toLowerCase();' +
        'if(!u) return alert("Enter your Hive username");' +
        'window.hive_keychain.requestSignBuffer(u,"qrcafe-login","Posting",function(res){' +
          'if(res.success){window.location.href="/keychain-login?user="+encodeURIComponent(res.data.username);}' +
          'else{alert("Error: "+res.message);}' +
        '});' +
      '};' +
      'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
    '}' +
    '</script>'
  ));
});

// ==================== KEYCHAIN LOGIN ====================

app.get('/keychain-login', function(req, res) {
  const name = (req.query.user || '').trim().toLowerCase();
  if (!name) return res.redirect('/');
  const key = getUserKey(name);
  if (!users.has(key)) users.set(key, { name: name, points: 0, lastVisit: 0, voted: {}, randomPresses: 0, randomDay: 0 });
  res.redirect('/home?user=' + encodeURIComponent(key));
});

// ==================== HOME (LOGGED IN) ====================

app.get('/home', function(req, res) {
  const key = req.query.user;
  const data = users.get(key);
  if (!data) return res.redirect('/');
  res.send(page('Home',
    '<h1>Witamy w Krolestwie!</h1>' +
    '<h2>Hey, <strong>' + data.name + '</strong>!</h2>' +
    '<div class="badge">' + data.points.toFixed(1) + ' points</div>' +
    navBar(key)
  ));
});

// ==================== CHECK IN (QR SCAN) ====================

app.get('/check', function(req, res) {
  const session = req.query.session;
  const s = sessions.get(session);
  if (!s) return res.send(page('Invalid QR', '<h1>Invalid QR Code</h1><p>Please scan a fresh QR code.</p>'));
  if (Date.now() > s.expiresAt) return res.send(page('Expired', '<h1>QR Code Expired</h1><p>Please scan a fresh QR code.</p>'));
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Check In',
    '<h1>QR Cafe</h1>' +
    '<h2>Check In</h2>' +
    (error ? '<div class="error">' + error + '</div>' : '') +
    '<p>Login with Hive Keychain to check in and earn points.</p>' +
    '<input type="text" id="hive-username" placeholder="Your Hive username"/>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/check?session=' + session) + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-green";' +
      'btn.innerText="Sign In with Keychain";' +
      'btn.onclick=function(){' +
        'var u=document.getElementById("hive-username").value.trim().toLowerCase();' +
        'if(!u) return alert("Enter your Hive username");' +
        'window.hive_keychain.requestSignBuffer(u,"qrcafe-checkin-' + session + '","Posting",function(res){' +
          'if(res.success){window.location.href="/hive-checkin?session=' + session + '&user="+encodeURIComponent(res.data.username);}' +
          'else{alert("Error: "+res.message);}' +
        '});' +
      '};' +
      'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
    '}' +
    '</script>'
  ));
});

app.get('/hive-checkin', function(req, res) {
  const session = req.query.session;
  const name = (req.query.user || '').trim().toLowerCase();
  const s = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  const key = getUserKey(name);
  if (!users.has(key)) users.set(key, { name: name, points: 0, lastVisit: 0, voted: {}, randomPresses: 0, randomDay: 0 });
  const data = users.get(key);
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const next = new Date(data.lastVisit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return res.send(page('Already Checked In',
      '<h1>Already checked in!</h1>' +
      '<p>Hey <strong>' + data.name + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
      '<div class="badge">' + data.points.toFixed(1) + ' points</div>' +
      navBar(key)
    ));
  }
  data.lastVisit = Date.now();
  data.points += 1;
  users.set(key, data);
  res.send(page('Welcome!',
    '<h1>Witamy w Krolestwie!</h1>' +
    '<h2>Welcome, ' + data.name + '!</h2>' +
    '<p>Checked in with Hive Keychain!</p>' +
    '<div class="badge">+1 point - Total: ' + data.points.toFixed(1) + '</div>' +
    navBar(key)
  ));
});

// ==================== LEADERBOARD ====================

app.get('/leaderboard', function(req, res) {
  const sorted = Array.from(users.values()).sort(function(a, b) { return b.points - a.points; }).slice(0, 20);
  const medals = ['1st', '2nd', '3rd'];
  let rows = sorted.length === 0 ? '<tr><td colspan="3" style="color:#555;padding:20px;text-align:center">No players yet</td></tr>' : '';
  sorted.forEach(function(u, i) {
    rows += '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i] || i + 1) + '</td><td>' + u.name + '</td><td style="color:#fbbf24;font-weight:700">' + u.points.toFixed(1) + ' pts</td></tr>';
  });
  res.send(page('Leaderboard',
    '<h1>Leaderboard</h1>' +
    '<h2>Top Players</h2>' +
    '<table><tr><th>#</th><th>Player</th><th>Points</th></tr>' + rows + '</table>' +
    '<a class="link" href="/">Home</a>'
  ));
});

// ==================== POLLS ====================

app.get('/polls', function(req, res) {
  const key = req.query.user;
  const data = users.get(key);
  if (!data) return res.redirect('/');
  let pollHtml = '';
  if (polls.size === 0) {
    pollHtml = '<div class="info">No active polls right now.</div>';
  } else {
    polls.forEach(function(poll, pid) {
      if (poll.status === 'stopped') return;
      const voted = data.voted && data.voted[pid];
      pollHtml += '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">' +
        '<strong>' + poll.question + '</strong>';
      if (poll.status === 'paused') {
        pollHtml += '<p style="color:#f87171;font-size:13px;margin-top:8px">This poll is paused.</p>';
      } else if (voted) {
        pollHtml += '<p style="color:#4ade80;font-size:13px;margin-top:8px">You voted for: <strong>' + poll.options[voted.optIndex] + '</strong></p>';
        poll.options.forEach(function(opt, i) {
          const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
          const pct = total > 0 ? Math.round((poll.votes[i] / total) * 100) : 0;
          pollHtml += '<div style="margin-top:8px;text-align:left"><div style="display:flex;justify-content:space-between"><span style="font-size:13px">' + opt + '</span><span style="color:#fbbf24;font-size:13px">' + pct + '%</span></div><div class="bar-wrap"><div class="bar" style="width:' + pct + '%"></div></div></div>';
        });
      } else {
        poll.options.forEach(function(opt, i) {
          pollHtml += '<a href="/poll-vote?pid=' + pid + '&opt=' + i + '&user=' + encodeURIComponent(key) + '" class="btn btn-gray" style="margin-top:6px;text-align:left">' + opt + '</a>';
        });
      }
      pollHtml += '</div>';
    });
  }
  res.send(page('Voting',
    '<h1>Voting</h1>' +
    pollHtml +
    navBar(key)
  ));
});

app.get('/poll-vote', function(req, res) {
  const pid = req.query.pid;
  const opt = parseInt(req.query.opt);
  const key = req.query.user;
  const poll = polls.get(pid);
  const data = users.get(key);
  if (!poll || !data) return res.redirect('/');
  if (poll.status !== 'active') return res.redirect('/polls?user=' + encodeURIComponent(key));
  if (data.voted && data.voted[pid]) return res.redirect('/polls?user=' + encodeURIComponent(key));
  if (isNaN(opt) || opt < 0 || opt >= poll.options.length) return res.redirect('/polls?user=' + encodeURIComponent(key));
  poll.votes[opt]++;
  if (!data.voted) data.voted = {};
  data.voted[pid] = { optIndex: opt };
  users.set(key, data);
  res.redirect('/polls?user=' + encodeURIComponent(key));
});

// ==================== LOTTERY ====================

const lotteryOutcomes = [
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

app.get('/lottery', function(req, res) {
  const key = req.query.user;
  const data = users.get(key);
  if (!data) return res.redirect('/');
  const today = Math.floor(Date.now() / DAY);
  if (data.randomDay !== today) { data.randomPresses = 0; data.randomDay = today; }
  const pressesLeft = 3 - (data.randomPresses || 0);
  res.send(page('Lottery',
    '<h1>Lottery</h1>' +
    '<h2>Try your luck!</h2>' +
    '<p>' + pressesLeft + ' press' + (pressesLeft !== 1 ? 'es' : '') + ' remaining today</p>' +
    '<div id="result" style="font-size:20px;font-weight:700;color:#fbbf24;min-height:32px;margin-bottom:16px"></div>' +
    (pressesLeft > 0 ?
      '<button class="btn btn-gold" onclick="spin()">Try your luck!</button>' :
      '<div class="info">Come back tomorrow for more!</div>') +
    navBar(key) +
    '<script>' +
    'function spin(){' +
      'fetch("/lottery-spin?user=' + encodeURIComponent(key) + '")' +
      '.then(function(r){return r.json();})' +
      '.then(function(d){' +
        'document.getElementById("result").innerText = d.msg;' +
        'if(d.pressesLeft === 0) document.querySelector(".btn-gold") && (document.querySelector(".btn-gold").disabled=true);' +
        'if(!d.ok) document.querySelector(".btn-gold") && document.querySelector(".btn-gold").remove();' +
      '});' +
    '}' +
    '</script>'
  ));
});

app.get('/lottery-spin', function(req, res) {
  const key = req.query.user;
  const data = users.get(key);
  if (!data) return res.json({ ok: false, msg: 'Not logged in' });
  const today = Math.floor(Date.now() / DAY);
  if (data.randomDay !== today) { data.randomPresses = 0; data.randomDay = today; }
  if ((data.randomPresses || 0) >= 3) return res.json({ ok: false, msg: 'No more presses today!' });
  data.randomPresses = (data.randomPresses || 0) + 1;
  users.set(key, data);
  const rand = Math.random();
  let outcome;
  if (rand < 0.05) outcome = lotteryOutcomes[0];
  else if (rand < 0.08) outcome = lotteryOutcomes[1];
  else {
    const others = lotteryOutcomes.filter(function(o) { return !o.rare; });
    outcome = others[Math.floor(Math.random() * others.length)];
  }
  res.json({ ok: true, msg: outcome.msg, pressesLeft: 3 - data.randomPresses });
});

// ==================== ADMIN LOGIN ====================

app.get(ADMIN_URL, function(req, res) {
  const token = req.query.admin;
  if (token && adminSessions.has(token)) return res.redirect(ADMIN_URL + '/panel?admin=' + token);
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Admin Login',
    '<h1>Admin Login</h1>' +
    '<h2>QR Cafe</h2>' +
    (error ? '<div class="error">' + error + '</div>' : '') +
    '<p style="font-size:13px;color:#666">Keychain login — hallmann or hivedocu only</p>' +
    '<input type="text" id="admin-username" placeholder="Your Hive username"/>' +
    '<button class="btn btn-blue" onclick="adminLogin()">Login with Keychain</button>' +
    '<a href="/" class="btn btn-gray">Home</a>' +
    '<script>' +
    'function adminLogin(){' +
      'var u=document.getElementById("admin-username").value.trim().toLowerCase();' +
      'if(!u) return alert("Enter your Hive username");' +
      'if(typeof window.hive_keychain==="undefined") return alert("Open this page inside Keychain browser");' +
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
  , { noAdmin: true }));
});

app.post('/admin-auth', function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!isAdmin(username)) return res.json({ ok: false, error: 'Access denied.' });
  const token = crypto.randomUUID();
  adminSessions.add(token);
  res.json({ ok: true, token: token });
});

// ==================== ADMIN PANEL ====================

app.get(ADMIN_URL + '/panel', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const msg = req.query.msg ? decodeURIComponent(req.query.msg) : '';
  const isError = req.query.err === '1';
  const a = '?admin=' + token;

  let userRows = '';
  if (users.size === 0) {
    userRows = '<tr><td colspan="4" style="color:#555;text-align:center;padding:16px">No users yet</td></tr>';
  } else {
    const sorted = Array.from(users.entries()).sort(function(a, b) { return b[1].points - a[1].points; });
    sorted.forEach(function(entry) {
      const key = entry[0];
      const u = entry[1];
      const checkedIn = u.lastVisit && Date.now() - u.lastVisit < DAY ? 'Yes' : 'No';
      userRows += '<tr>' +
        '<td><strong>' + u.name + '</strong></td>' +
        '<td>' + u.points.toFixed(1) + '</td>' +
        '<td>' + checkedIn + '</td>' +
        '<td>' +
          '<form method="POST" action="' + ADMIN_URL + '/reset-checkin' + a + '" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><button type="submit" class="btn btn-gold btn-sm">Reset CI</button></form> ' +
          '<form method="POST" action="' + ADMIN_URL + '/delete-user' + a + '" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form>' +
        '</td>' +
      '</tr>';
    });
  }

  let pollRows = '';
  polls.forEach(function(poll, pid) {
    const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
    const statusColor = poll.status === 'active' ? '#4ade80' : poll.status === 'paused' ? '#fbbf24' : '#f87171';
    pollRows += '<tr>' +
      '<td>' + poll.question + '</td>' +
      '<td style="color:' + statusColor + '">' + poll.status + '</td>' +
      '<td>' + total + '</td>' +
      '<td>' +
        (poll.status === 'active' ?
          '<form method="POST" action="' + ADMIN_URL + '/pause-poll' + a + '" style="display:inline"><input type="hidden" name="pid" value="' + pid + '"/><button type="submit" class="btn btn-gold btn-sm">Pause</button></form> ' : '') +
        (poll.status === 'paused' ?
          '<form method="POST" action="' + ADMIN_URL + '/resume-poll' + a + '" style="display:inline"><input type="hidden" name="pid" value="' + pid + '"/><button type="submit" class="btn btn-green btn-sm">Resume</button></form> ' : '') +
        (poll.status !== 'stopped' ?
          '<form method="POST" action="' + ADMIN_URL + '/stop-poll' + a + '" style="display:inline"><input type="hidden" name="pid" value="' + pid + '"/><button type="submit" class="btn btn-red btn-sm">Stop</button></form>' : 'Stopped') +
      '</td>' +
    '</tr>';
  });

  let pastPollRows = '';
  pastPolls.forEach(function(poll) {
    const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
    pastPollRows += '<tr><td>' + poll.question + '</td><td>' + total + ' votes</td><td>';
    poll.options.forEach(function(opt, i) {
      const pct = total > 0 ? Math.round((poll.votes[i] / total) * 100) : 0;
      pastPollRows += opt + ': ' + pct + '% ';
    });
    pastPollRows += '</td></tr>';
  });

  res.send(page('Admin Panel',
    '<h1>Admin Panel</h1>' +
    '<h2>' + VERSION + '</h2>' +
    (msg ? '<div class="' + (isError ? 'error' : 'success') + '">' + msg + '</div>' : '') +

    '<hr>' +
    '<a href="/qr' + a + '" class="btn btn-green">Generate QR Code</a>' +

    '<hr>' +
    '<h2 style="text-align:left;margin-bottom:12px">Users (' + users.size + ')</h2>' +
    '<div style="overflow-x:auto"><table><tr><th>Name</th><th>Pts</th><th>Today</th><th>Actions</th></tr>' + userRows + '</table></div>' +

    '<hr>' +
    '<h2 style="text-align:left;margin-bottom:12px">Active Polls (' + polls.size + '/5)</h2>' +
    '<table><tr><th>Question</th><th>Status</th><th>Votes</th><th>Actions</th></tr>' + (pollRows || '<tr><td colspan="4" style="color:#555;padding:12px;text-align:center">No polls yet</td></tr>') + '</table>' +
    (polls.size < 5 ?
      '<form method="POST" action="' + ADMIN_URL + '/add-poll' + a + '" style="margin-top:16px">' +
        '<input type="text" name="question" placeholder="Poll question..." required style="margin-bottom:8px"/>' +
        '<input type="text" name="opt0" placeholder="Option 1" required style="margin-bottom:6px"/>' +
        '<input type="text" name="opt1" placeholder="Option 2" required style="margin-bottom:6px"/>' +
        '<input type="text" name="opt2" placeholder="Option 3 (optional)" style="margin-bottom:6px"/>' +
        '<input type="text" name="opt3" placeholder="Option 4 (optional)" style="margin-bottom:6px"/>' +
        '<button type="submit" class="btn btn-gold">Add Poll</button>' +
      '</form>'
      : '<p style="color:#f87171;font-size:13px">Max 5 polls reached.</p>') +

    (pastPolls.length > 0 ?
      '<hr><h2 style="text-align:left;margin-bottom:12px">Past Polls</h2>' +
      '<table><tr><th>Question</th><th>Total</th><th>Results</th></tr>' + pastPollRows + '</table>'
      : '') +

    '<hr>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<a class="link" href="/">Home</a>'
  , { wide: true, noAdmin: true }));
});

// ==================== ADMIN ACTIONS ====================

app.get('/qr', async function(req, res) {
  const token = req.query.admin;
  if (!token || !adminSessions.has(token)) return res.redirect(ADMIN_URL);
  const sid = crypto.randomUUID();
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL });
  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 2 });
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;font-family:Arial,sans-serif;color:#fff;text-align:center}' +
    'h1{font-size:2rem;margin-bottom:4px}p{color:#555;font-size:13px;margin-top:12px}' +
    '.version{position:fixed;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.2)}' +
    '.back{position:fixed;bottom:12px;left:16px;font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none}</style>' +
    '<script>setTimeout(function(){window.location.reload();},60000);</script>' +
    '</head><body>' +
    '<h1>QR Cafe</h1>' +
    '<h2 style="color:#aaa;font-size:1rem;margin-bottom:20px">Scan to check in</h2>' +
    '<img src="' + qr + '" style="width:300px;height:300px;border-radius:16px"/>' +
    '<p>Refreshes every minute</p>' +
    '<span class="version">' + VERSION + '</span>' +
    '<a href="' + ADMIN_URL + '/panel?admin=' + token + '" class="back">back to panel</a>' +
    '</body></html>');
});

app.post(ADMIN_URL + '/add-poll', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (polls.size >= 5) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Max 5 polls'));
  const question = (req.body.question || '').trim();
  const options = [req.body.opt0, req.body.opt1, req.body.opt2, req.body.opt3]
    .map(function(o) { return (o || '').trim(); })
    .filter(function(o) { return o.length > 0; });
  if (!question || options.length < 2) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Need question and 2+ options'));
  const pid = crypto.randomUUID();
  polls.set(pid, { question: question, options: options, votes: options.map(function() { return 0; }), status: 'active' });
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll added'));
});

app.post(ADMIN_URL + '/pause-poll', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const poll = polls.get(req.body.pid);
  if (poll) poll.status = 'paused';
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll paused'));
});

app.post(ADMIN_URL + '/resume-poll', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const poll = polls.get(req.body.pid);
  if (poll) poll.status = 'active';
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll resumed'));
});

app.post(ADMIN_URL + '/stop-poll', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const pid = req.body.pid;
  const poll = polls.get(pid);
  if (poll) {
    pastPolls.unshift({ question: poll.question, options: poll.options, votes: poll.votes });
    if (pastPolls.length > 10) pastPolls.pop();
    polls.delete(pid);
  }
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll stopped and saved'));
});

app.post(ADMIN_URL + '/reset-checkin', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const key = req.body.key;
  const data = users.get(key);
  if (!data) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('User not found'));
  data.lastVisit = 0;
  users.set(key, data);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Check-in reset for ' + data.name));
});

app.post(ADMIN_URL + '/delete-user', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const key = req.body.key;
  const data = users.get(key);
  const name = data ? data.name : key;
  users.delete(key);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Deleted: ' + name));
});

// ==================== START ====================

app.listen(PORT, function() {
  console.log('QR Cafe ' + VERSION + ' running at ' + BASE_URL);
  console.log('Admin: ' + BASE_URL + ADMIN_URL);
});
