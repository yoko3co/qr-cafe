const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const BASE_URL = process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com';
const ADMIN_URL = '/hallmann';
const VERSION = 'Krolestwo.1.0';
const HIVE_ACCOUNT = 'test3333';
const ADMIN_ACCOUNTS = ['hallmann', 'hivedocu'];

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

const films = {
  a: 'Szklana Pulapka',
  b: 'Speed',
  c: 'Die Hard',
  d: 'Straznik Teksasu'
};

const allowedNames = require('./allowedNames');

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
      console.log('Names loaded from Hive:', [...allowedNames]);
    } else {
      console.log('No allowed_names in Hive profile, using defaults');
    }
  } catch (e) {
    console.log('Hive fetch failed:', e.message);
  }
}

fetchAllowedNames();
setInterval(fetchAllowedNames, 5 * 60 * 1000);

// ==================== HELPERS ====================

function userKey(name, pin) { return name.trim().toLowerCase() + ':' + pin.trim(); }
function isAllowed(name) { return allowedNames.has(name.trim().toLowerCase()); }
function isAdmin(name) { return ADMIN_ACCOUNTS.includes((name || '').trim().toLowerCase()); }
function isAdminSession(req) {
  const token = req.query.admin || req.cookies && req.cookies.admin;
  return adminSessions.has(token);
}

// ==================== PAGE TEMPLATE ====================

function page(title, body, wide) {
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + ' | QR Cafe</title>' +
    '<style>' +
      'body{font-family:Arial,sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
      '.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:' + (wide ? '700px' : '480px') + ';width:100%;text-align:center;position:relative}' +
      '.version{position:absolute;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.25)}' +
      'h1{font-size:2rem;margin:0 0 8px}' +
      'h2{font-size:1.3rem;color:#e0e0e0;margin:0 0 16px}' +
      'p{color:#aaa;margin:0 0 16px;line-height:1.6}' +
      'input[type=text],input[type=password]{width:100%;padding:13px 15px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:10px;outline:none;box-sizing:border-box}' +
      '.btn{display:block;width:100%;padding:13px;font-size:16px;font-weight:600;border:none;border-radius:10px;cursor:pointer;margin-top:6px;text-decoration:none;text-align:center;box-sizing:border-box}' +
      '.btn-green{background:#4ade80;color:#052e16}' +
      '.btn-gold{background:#fbbf24;color:#1c0a00}' +
      '.btn-red{background:#f87171;color:#2d0000}' +
      '.btn-blue{background:#60a5fa;color:#0c1a3a}' +
      '.btn-gray{background:rgba(255,255,255,0.1);color:#fff}' +
      '.btn-sm{padding:6px 14px;font-size:13px;width:auto;display:inline-block;margin:2px}' +
      '.badge{display:inline-block;background:#fbbf24;color:#1c0a00;border-radius:999px;padding:6px 20px;font-weight:700;font-size:16px;margin-bottom:16px}' +
      '.error{color:#f87171;background:rgba(248,113,113,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
      '.success{color:#4ade80;background:rgba(74,222,128,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
      'a.link{color:#60a5fa;display:block;margin-top:12px;font-size:14px;text-decoration:none}' +
      'hr{border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0}' +
      'strong{color:#fff}' +
      'table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}' +
      'th{color:#aaa;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:left}' +
      'td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:left}' +
      '.bar-wrap{background:rgba(255,255,255,0.1);border-radius:999px;height:10px;margin-top:6px}' +
      '.bar{background:#fbbf24;height:10px;border-radius:999px}' +
      '.tag{display:inline-block;background:rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;font-size:13px;margin:3px}' +
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

// ==================== HOME (USERS) ====================

app.get('/', function(req, res) {
  res.send(page('QR Cafe',
    '<h1>QR Cafe</h1>' +
    '<h2>Witamy w Krolestwie!</h2>' +
    '<a href="/leaderboard" class="btn btn-gold" style="margin-top:8px">Leaderboard</a>' +
    '<a href="/polls" class="btn btn-blue" style="margin-top:8px">Polls & Votes</a>' +
    '<a href="/events" class="btn btn-gray" style="margin-top:8px">Wydarzenia</a>'
  ));
});

// ==================== QR DISPLAY (tablet only, no nav) ====================

app.get('/qr', async function(req, res) {
  const token = req.query.admin;
  if (!adminSessions.has(token)) return res.redirect(ADMIN_URL);
  const sid = crypto.randomUUID();
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL });
  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 2 });
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;font-family:Arial,sans-serif;color:#fff}' +
    'h1{font-size:2rem;margin-bottom:8px}h2{color:#aaa;font-size:1rem;margin-bottom:20px}' +
    '.version{position:fixed;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.2)}</style>' +
    '<script>setTimeout(function(){window.location.reload();},60000);</script>' +
    '</head><body>' +
    '<h1>QR Cafe</h1>' +
    '<h2>Scan to check in</h2>' +
    '<img src="' + qr + '" style="width:300px;height:300px;border-radius:16px"/>' +
    '<p style="color:#555;font-size:13px;margin-top:16px">Refreshes every minute</p>' +
    '<span class="version">' + VERSION + '</span>' +
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
    '<h2>Witamy w Krolestwie!</h2>' +
    '<p>First time? Enter your name and choose a PIN.<br>Returning? Use the same name and PIN.</p>' +
    (error ? '<div class="error">' + error + '</div>' : '') +
    '<form method="POST" action="/check">' +
      '<input type="hidden" name="session" value="' + session + '"/>' +
      '<input type="text" name="name" placeholder="Your name" required maxlength="30" autocomplete="off"/>' +
      '<input type="password" name="pin" placeholder="PIN (4 digits)" required maxlength="6" inputmode="numeric"/>' +
      '<button class="btn btn-green" type="submit">Check In with PIN</button>' +
    '</form>' +
    '<hr>' +
    '<p style="font-size:13px;color:#666">Have Hive Keychain?</p>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/check?session=' + session) + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-blue";' +
      'btn.style.marginTop="6px";' +
      'btn.innerText="Sign in with Keychain";' +
      'btn.onclick=function(){' +
        'window.hive_keychain.requestSignBuffer(null,"qrcafe-checkin-' + session + '","Posting",function(res){' +
          'if(res.success){window.location.href="/hive-checkin?session=' + session + '&user="+encodeURIComponent(res.data.username);}' +
          'else{alert("Error: "+res.message);}' +
        '});' +
      '};' +
      'document.getElementById("open-keychain").parentNode.insertBefore(btn,document.getElementById("open-keychain").nextSibling);' +
    '}' +
    '</script>'
  ));
});

app.post('/check', function(req, res) {
  const session = req.body.session;
  const name = (req.body.name || '').trim();
  const pin = (req.body.pin || '').trim();
  const s = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  if (!name || !pin) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Please enter name and PIN'));
  if (!/^\d{4,6}$/.test(pin)) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('PIN must be 4 to 6 digits'));
  if (!isAllowed(name)) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Sorry, your name is not on the guest list'));
  const key = userKey(name, pin);
  for (const [k, v] of users.entries()) {
    if (v.name.toLowerCase() === name.toLowerCase() && k !== key) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Wrong PIN for this name'));
  }
  if (!users.has(key)) users.set(key, { name: name, lastVisit: 0, points: 0, voted: {} });
  const data = users.get(key);
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const next = new Date(data.lastVisit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return res.send(page('Already Checked In',
      '<h1>Already checked in!</h1>' +
      '<p>Hey <strong>' + data.name + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
      '<div class="badge">' + data.points + ' points</div>' +
      '<a href="/polls" class="btn btn-gold" style="margin-top:8px">Go to Polls</a>' +
      '<a class="link" href="/leaderboard">Leaderboard</a>'
    ));
  }
  data.lastVisit = Date.now();
  data.points += 1;
  users.set(key, data);
  res.send(page('Welcome!',
    '<h1>Witamy w Krolestwie!</h1>' +
    '<h2>Welcome, ' + data.name + '!</h2>' +
    '<p>Great to have you here today!</p>' +
    '<div class="badge">+1 point - Total: ' + data.points + '</div>' +
    '<a href="/polls" class="btn btn-gold" style="margin-top:8px">Vote in polls!</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>'
  ));
});

// ==================== HIVE CHECKIN ====================

app.get('/hive-checkin', function(req, res) {
  const session = req.query.session;
  const name = (req.query.user || '').trim().toLowerCase();
  const s = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  if (!isAllowed(name)) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Your name is not on the guest list'));
  const key = 'HIVE:' + name;
  if (!users.has(key)) users.set(key, { name: name, lastVisit: 0, points: 0, voted: {} });
  const data = users.get(key);
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const next = new Date(data.lastVisit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return res.send(page('Already Checked In',
      '<h1>Already checked in!</h1>' +
      '<p>Hey <strong>' + data.name + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
      '<div class="badge">' + data.points + ' points</div>' +
      '<a href="/polls" class="btn btn-gold" style="margin-top:8px">Go to Polls</a>' +
      '<a class="link" href="/leaderboard">Leaderboard</a>'
    ));
  }
  data.lastVisit = Date.now();
  data.points += 1.1;
  users.set(key, data);
  res.send(page('Welcome!',
    '<h1>Witamy w Krolestwie!</h1>' +
    '<h2>Welcome, ' + data.name + '!</h2>' +
    '<p>Checked in with Hive Keychain!</p>' +
    '<div class="badge">+1.1 points (Hive bonus!) - Total: ' + data.points.toFixed(1) + '</div>' +
    '<a href="/polls" class="btn btn-gold" style="margin-top:8px">Vote in polls!</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>'
  ));
});

// ==================== POLLS ====================

app.get('/polls', function(req, res) {
  let pollHtml = '';
  if (polls.size === 0) {
    pollHtml = '<p style="color:#555">No active polls yet.</p>';
  } else {
    polls.forEach(function(poll, pid) {
      pollHtml += '<div style="text-align:left;margin-bottom:20px;background:rgba(255,255,255,0.05);padding:16px;border-radius:12px">' +
        '<strong>' + poll.question + '</strong><br/><br/>';
      poll.options.forEach(function(opt, i) {
        pollHtml += '<a href="/poll-vote?pid=' + pid + '&opt=' + i + '" class="btn btn-gray" style="margin-bottom:6px;text-align:left">' + opt + '</a>';
      });
      pollHtml += '</div>';
    });
  }
  res.send(page('Polls',
    '<h1>Polls</h1>' +
    '<h2>Have your say!</h2>' +
    pollHtml +
    '<hr>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<a class="link" href="/">Home</a>'
  ));
});

app.get('/poll-vote', function(req, res) {
  const pid = req.query.pid;
  const opt = parseInt(req.query.opt);
  const poll = polls.get(pid);
  if (!poll) return res.redirect('/polls');
  if (isNaN(opt) || opt < 0 || opt >= poll.options.length) return res.redirect('/polls');
  poll.votes[opt] = (poll.votes[opt] || 0) + 1;
  const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
  let bars = '';
  poll.options.forEach(function(opt, i) {
    const count = poll.votes[i] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    bars += '<div style="margin-bottom:14px;text-align:left">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>' + opt + '</span><span style="color:#fbbf24;font-weight:700">' + count + ' (' + pct + '%)</span></div>' +
      '<div class="bar-wrap"><div class="bar" style="width:' + pct + '%"></div></div>' +
    '</div>';
  });
  res.send(page('Voted!',
    '<h1>Thanks for voting!</h1>' +
    '<h2>' + poll.question + '</h2>' +
    bars +
    '<a class="link" href="/polls">Back to polls</a>' +
    '<a class="link" href="/">Home</a>'
  ));
});

// ==================== LEADERBOARD ====================

app.get('/leaderboard', function(req, res) {
  const sorted = Array.from(users.values()).sort(function(a, b) { return b.points - a.points; }).slice(0, 20);
  const medals = ['1st', '2nd', '3rd'];
  let rows = sorted.length === 0 ? '<tr><td colspan="3" style="color:#555;padding:20px;text-align:center">No players yet</td></tr>' : '';
  sorted.forEach(function(u, i) {
    rows += '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i] || i + 1) + '</td><td>' + u.name + '</td><td style="color:#fbbf24;font-weight:700">' + u.points + ' pts</td></tr>';
  });
  res.send(page('Leaderboard',
    '<h1>Leaderboard</h1>' +
    '<h2>Top Players</h2>' +
    '<table><tr><th>#</th><th>Player</th><th>Points</th></tr>' + rows + '</table>' +
    '<a class="link" href="/polls">Polls</a>' +
    '<a class="link" href="/">Home</a>'
  ));
});

// ==================== EVENTS ====================

app.get('/events', function(req, res) {
  res.send(page('Wydarzenia',
    '<h1>Wydarzenia</h1>' +
    '<h2>Upcoming Events</h2>' +
    '<div style="text-align:left">' +
      '<p><strong>1.05 (Friday)</strong><br>17:00 Painting Day<br>20:00 Quiz: Peerel</p>' +
      '<hr>' +
      '<p><strong>2.05 (Saturday)</strong><br>19:00 Board Games & Tea</p>' +
      '<hr>' +
      '<p><strong>4.05 (Monday)</strong><br>18:00 Lets Talk Polish</p>' +
    '</div>' +
    '<a class="link" href="/">Home</a>'
  ));
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
    '<p style="font-size:13px;color:#666">Login with Hive Keychain (hallmann or hivedocu only)</p>' +
    '<input type="text" id="admin-username" placeholder="Your Hive username"/>' +
    '<button class="btn btn-blue" onclick="adminLogin()">Login with Keychain</button>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("admin-username").value = "";' +
    '}' +
    'function adminLogin(){' +
      'var username = document.getElementById("admin-username").value.trim().toLowerCase();' +
      'if(!username) return alert("Enter your Hive username");' +
      'if(typeof window.hive_keychain === "undefined") return alert("Hive Keychain not found. Open this page inside Keychain browser.");' +
      'window.hive_keychain.requestSignBuffer(username,"qrcafe-admin-login","Posting",function(res){' +
        'if(res.success){' +
          'fetch("/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:res.data.username})})' +
          '.then(function(r){return r.json();})' +
          '.then(function(d){' +
            'if(d.ok){window.location.href="' + ADMIN_URL + '/panel?admin="+d.token;}' +
            'else{alert(d.error||"Access denied");}' +
          '});' +
        '} else {alert("Keychain error: "+res.message);}' +
      '});' +
    '}' +
    '</script>'
  ));
});

app.post('/admin-auth', function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!isAdmin(username)) return res.json({ ok: false, error: 'Access denied. Not an admin account.' });
  const token = crypto.randomUUID();
  adminSessions.add(token);
  res.json({ ok: true, token: token });
});

// ==================== ADMIN PANEL ====================

app.get(ADMIN_URL + '/panel', function(req, res) {
  const token = req.query.admin;
  if (!token || !adminSessions.has(token)) return res.redirect(ADMIN_URL + '?error=' + encodeURIComponent('Please login first'));
  const msg = req.query.msg ? decodeURIComponent(req.query.msg) : '';
  const isError = req.query.err === '1';

  let userRows = '';
  if (users.size === 0) {
    userRows = '<tr><td colspan="5" style="color:#555;text-align:center;padding:16px">No users yet</td></tr>';
  } else {
    const sorted = Array.from(users.entries()).sort(function(a, b) { return b[1].points - a[1].points; });
    sorted.forEach(function(entry) {
      const key = entry[0];
      const u = entry[1];
      const checkedIn = u.lastVisit && Date.now() - u.lastVisit < DAY ? 'Yes' : 'No';
      userRows += '<tr>' +
        '<td><strong>' + u.name + '</strong></td>' +
        '<td>' + u.points + '</td>' +
        '<td>' + checkedIn + '</td>' +
        '<td>' +
          '<form method="POST" action="' + ADMIN_URL + '/reset-pin?admin=' + token + '" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><input type="text" name="newpin" placeholder="PIN" style="width:60px;padding:4px;font-size:12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-right:4px"/><button type="submit" class="btn btn-blue btn-sm">Reset PIN</button></form> ' +
          '<form method="POST" action="' + ADMIN_URL + '/reset-checkin?admin=' + token + '" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><button type="submit" class="btn btn-gold btn-sm">Reset CI</button></form> ' +
          '<form method="POST" action="' + ADMIN_URL + '/delete-user?admin=' + token + '" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form>' +
        '</td>' +
      '</tr>';
    });
  }

  let nameTags = '';
  allowedNames.forEach(function(n) {
    nameTags += '<span class="tag">' + n + ' <a href="' + ADMIN_URL + '/remove-name?name=' + encodeURIComponent(n) + '&admin=' + token + '" style="color:#f87171;text-decoration:none;margin-left:4px">x</a></span>';
  });

  let pollRows = '';
  polls.forEach(function(poll, pid) {
    const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
    pollRows += '<tr><td>' + poll.question + '</td><td>' + total + ' votes</td>' +
      '<td><form method="POST" action="' + ADMIN_URL + '/delete-poll?admin=' + token + '" style="display:inline"><input type="hidden" name="pid" value="' + pid + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form></td></tr>';
  });

  res.send(page('Admin Panel',
    '<h1>Admin Panel</h1>' +
    '<h2>' + VERSION + '</h2>' +
    (msg ? '<div class="' + (isError ? 'error' : 'success') + '">' + msg + '</div>' : '') +

    '<hr>' +
    '<a href="/qr?admin=' + token + '" class="btn btn-green">Generate QR Code</a>' +

    '<hr>' +
    '<h2 style="text-align:left;margin-bottom:12px">Users (' + users.size + ')</h2>' +
    '<div style="overflow-x:auto"><table><tr><th>Name</th><th>Pts</th><th>Today</th><th>Actions</th></tr>' + userRows + '</table></div>' +

    '<hr>' +
    '<h2 style="text-align:left;margin-bottom:12px">Allowed Names (' + allowedNames.size + ')</h2>' +
    '<p style="text-align:left;font-size:13px;color:#666">Synced from Hive: ' + HIVE_ACCOUNT + ' every 5 min</p>' +
    '<details style="text-align:left;margin-bottom:12px"><summary style="cursor:pointer;color:#60a5fa;font-size:14px">Show allowed names (' + allowedNames.size + ')</summary><div style="margin-top:8px">' + (nameTags || '<p style="color:#555">No names yet</p>') + '</div></details>' +
    '<form method="POST" action="' + ADMIN_URL + '/add-name?admin=' + token + '" style="display:flex;gap:8px">' +
      '<input type="text" name="name" placeholder="Add a name..." required style="flex:1;margin:0"/>' +
      '<button type="submit" class="btn btn-green" style="width:auto;padding:8px 16px;margin:0">Add</button>' +
    '</form>' +
    '<form method="POST" action="' + ADMIN_URL + '/sync-hive?admin=' + token + '" style="margin-top:8px">' +
      '<button type="submit" class="btn btn-blue">Sync from Hive now</button>' +
    '</form>' +

    '<hr>' +
    '<h2 style="text-align:left;margin-bottom:12px">Polls (' + polls.size + '/5)</h2>' +
    '<table><tr><th>Question</th><th>Votes</th><th>Action</th></tr>' + (pollRows || '<tr><td colspan="3" style="color:#555;padding:12px;text-align:center">No polls yet</td></tr>') + '</table>' +
    (polls.size < 5 ?
      '<form method="POST" action="' + ADMIN_URL + '/add-poll?admin=' + token + '" style="margin-top:12px">' +
        '<input type="text" name="question" placeholder="Poll question..." required style="margin-bottom:8px"/>' +
        '<input type="text" name="opt0" placeholder="Option 1" required style="margin-bottom:6px"/>' +
        '<input type="text" name="opt1" placeholder="Option 2" required style="margin-bottom:6px"/>' +
        '<input type="text" name="opt2" placeholder="Option 3 (optional)" style="margin-bottom:6px"/>' +
        '<input type="text" name="opt3" placeholder="Option 4 (optional)" style="margin-bottom:6px"/>' +
        '<button type="submit" class="btn btn-gold">Add Poll</button>' +
      '</form>'
      : '<p style="color:#f87171;font-size:13px">Max 5 polls reached. Delete one to add more.</p>') +

    '<hr>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<a class="link" href="/">Home</a>'
  , true));
});

// ==================== ADMIN ACTIONS ====================

function checkAdminToken(req, res) {
  const token = req.query.admin;
  if (!token || !adminSessions.has(token)) { res.redirect(ADMIN_URL); return false; }
  return token;
}

app.post(ADMIN_URL + '/add-name', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const name = (req.body.name || '').trim().toLowerCase();
  if (!name) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Name cannot be empty'));
  allowedNames.add(name);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Added: ' + name));
});

app.get(ADMIN_URL + '/remove-name', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const name = (req.query.name || '').trim().toLowerCase();
  allowedNames.delete(name);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Removed: ' + name));
});

app.post(ADMIN_URL + '/sync-hive', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  await fetchAllowedNames();
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Synced from Hive'));
});

app.post(ADMIN_URL + '/reset-pin', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const oldKey = req.body.key;
  const newPin = (req.body.newpin || '').trim();
  if (!/^\d{4,6}$/.test(newPin)) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('PIN must be 4-6 digits'));
  const data = users.get(oldKey);
  if (!data) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('User not found'));
  users.delete(oldKey);
  users.set(userKey(data.name, newPin), data);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('PIN reset for ' + data.name));
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

app.post(ADMIN_URL + '/add-poll', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (polls.size >= 5) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Max 5 polls reached'));
  const question = (req.body.question || '').trim();
  const options = [req.body.opt0, req.body.opt1, req.body.opt2, req.body.opt3]
    .map(function(o) { return (o || '').trim(); })
    .filter(function(o) { return o.length > 0; });
  if (!question || options.length < 2) return res.redirect(ADMIN_URL + '/panel?admin=' + token + '&err=1&msg=' + encodeURIComponent('Need a question and at least 2 options'));
  const pid = crypto.randomUUID();
  polls.set(pid, { question: question, options: options, votes: options.map(function() { return 0; }) });
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll added'));
});

app.post(ADMIN_URL + '/delete-poll', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  polls.delete(req.body.pid);
  res.redirect(ADMIN_URL + '/panel?admin=' + token + '&msg=' + encodeURIComponent('Poll deleted'));
});

// ==================== START ====================

app.listen(PORT, function() {
  console.log('QR Cafe ' + VERSION + ' running at ' + BASE_URL);
  console.log('Admin: ' + BASE_URL + ADMIN_URL);
});
