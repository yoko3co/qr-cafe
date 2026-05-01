const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const BASE_URL = process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com';
const ADMIN_URL = '/hallmann';
const VERSION = 'Krolestwo.0.4';
const HIVE_ACCOUNT = 'test3333';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ==================== STORAGE ====================

const sessions = new Map();
const users = new Map();
const votes = { a: 0, b: 0, c: 0, d: 0 };
const films = {
  a: 'Szklana Pulapka',
  b: 'Speed',
  c: 'Die Hard',
  d: 'Straznik Teksasu'
};

const allowedNames = new Set(['marek', 'rafal', 'anna', 'piotr', 'hallmann']);

// ==================== HIVE SYNC ====================

async function fetchAllowedNames() {
  try {
    const res = await fetch('https://api.hive.blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'condenser_api.get_accounts',
        params: [[HIVE_ACCOUNT]],
        id: 1
      })
    });
    const data = await res.json();
    const meta = JSON.parse(data.result[0].posting_json_metadata || '{}');
    if (meta.allowed_names && Array.isArray(meta.allowed_names)) {
      allowedNames.clear();
      meta.allowed_names.forEach(function(n) { allowedNames.add(n.toLowerCase()); });
      console.log('Names loaded from Hive:', [...allowedNames]);
    } else {
      console.log('No allowed_names in Hive profile, using defaults');
    }
  } catch (e) {
    console.log('Hive fetch failed, using existing names:', e.message);
  }
}

fetchAllowedNames();
setInterval(fetchAllowedNames, 5 * 60 * 1000);

// ==================== HELPERS ====================

function userKey(name, pin) {
  return name.trim().toLowerCase() + ':' + pin.trim();
}

function isAllowed(name) {
  return allowedNames.has(name.trim().toLowerCase());
}

// ==================== PAGE TEMPLATE ====================

function page(title, body) {
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + ' | QR Cafe</title>' +
    '<style>' +
      'body{font-family:Arial,sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
      '.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:480px;width:100%;text-align:center;position:relative}' +
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
  '<a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="margin:0 8px;text-decoration:none;font-size:20px">📸📸📸📸</a>' +
  '<a href="https://www.facebook.com/herberciarnia" target="_blank" style="margin:0 8px;text-decoration:none;font-size:20px">📘📘📘</a>' +
'</div>' +

'<span class="version">' + VERSION + '</span>' +
    '</div></body></html>';
}

// ==================== ROUTES ====================

app.get('/', function(req, res) { res.redirect('/generate'); });

// -------------------- Generate QR --------------------

app.get('/generate', async function(req, res) {
  const sid = crypto.randomUUID();
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL });
  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 280, margin: 2 });
  res.send(page('QR Code',
    '<h1>QR Cafe</h1>' +
    '<h2>Scan to Check In</h2>' +
    '<img src="' + qr + '" style="width:250px;height:250px;border-radius:12px;margin:12px 0"/>' +
    '<p style="font-size:13px;color:#555">Session valid for 1 hour</p>' +
    '<a class="link" href="/generate">New QR code</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<a class="link" href="/votes">Film votes</a>' +
    '<a class="link" href="/events">Wydarzenia</a>' 
  ));
});

// -------------------- Check In GET --------------------

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
'<p style="font-size:13px;color:#666">Have a Hive account?</p>' +
'<input type="text" id="hive-username" placeholder="Your Hive username" style="margin-bottom:8px"/>' +
'<button class="btn btn-blue" onclick="hasLogin()">Login with Hive Keychain</button>' +
'<div id="has-status" style="margin-top:10px;font-size:13px;color:#aaa"></div>' +
'<a id="keychain-link" href="#" style="display:none;margin-top:8px" class="btn btn-gold">Open Keychain App</a>' +
'<a class="link" href="/leaderboard">Leaderboard</a>' +
'<a class="link" href="/events">Wydarzenia</a>' +
'<script src="https://unpkg.com/hive-auth-wrapper@2.1.2/dist/hive-auth-wrapper.js"></script>' +
'<script>' +
'var APP_META = {name:"QR Cafe",description:"Community check-in app",icon:undefined};' +
'var auth = {username:undefined,token:undefined,expire:undefined,key:undefined};' +
'function hasLogin(){' +
  'var username = document.getElementById("hive-username").value.trim().toLowerCase();' +
  'if(!username) return alert("Please enter your Hive username");' +
  'auth.username = username;' +
  'document.getElementById("has-status").innerText = "Connecting to Hive... Open Keychain app and approve.";' +
  'var challenge = {key_type:"posting",challenge:JSON.stringify({app:"qr-cafe",session:"' + session + '",ts:Date.now()})};' +
  'HAS.authenticate(auth, APP_META, challenge, function(evt){' + 
  'console.log("HAS event:", JSON.stringify(evt));' +
    'document.getElementById("has-status").innerText = "Waiting for Keychain approval...";' +
    'if(evt.deeplink){' +
  'document.getElementById("has-status").innerText = "Tap below to open Keychain app";' +
  'document.getElementById("keychain-link").href = evt.deeplink;' +
  'document.getElementById("keychain-link").style.display = "block";' +
'}'  +
  '})' +
  '.then(function(res){' +
    'document.getElementById("has-status").innerText = "Approved! Checking in...";' +
    'window.location.href = "/hive-checkin?session=' + session + '&user=" + encodeURIComponent(username) + "&token=" + encodeURIComponent(res.token);' +
  '})' +
  '.catch(function(err){' +
    'document.getElementById("has-status").innerText = "Error: " + err.message;' +
  '});' +
'}' +
'</script>'
  ));
});

// -------------------- Check In POST --------------------

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
  if (!users.has(key)) users.set(key, { name: name, lastVisit: 0, points: 0, voted: null });
  const data = users.get(key);
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const next = new Date(data.lastVisit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return res.send(page('Already Checked In',
      '<h1>Already checked in!</h1>' +
      '<p>Hey <strong>' + data.name + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
      '<div class="badge">' + data.points + ' points</div>' +
      '<a href="/vote?key=' + encodeURIComponent(key) + '" class="btn btn-gold" style="margin-top:8px">Vote for a film!</a>' +
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
    '<a href="/vote?key=' + encodeURIComponent(key) + '" class="btn btn-gold" style="margin-top:8px">Vote for tonight\'s film!</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>'
  ));
});

// -------------------- Vote GET --------------------

app.get('/vote', function(req, res) {
  const key = req.query.key;
  const data = users.get(key);
  if (!data) return res.send(page('Vote', '<h1>Check in first!</h1><p>Please scan the QR code to check in.</p>'));
  const alreadyVoted = data.voted;
  let btns = '';
  for (const id in films) {
    const isVoted = alreadyVoted === id;
    btns += '<button style="display:block;width:100%;padding:13px 15px;margin-bottom:10px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);text-align:left;cursor:pointer;background:' + (isVoted ? '#4ade80' : 'rgba(255,255,255,0.08)') + ';color:' + (isVoted ? '#052e16' : '#fff') + ';" ' + (alreadyVoted ? 'disabled' : 'onclick="vote(\'' + id + '\')"') + '>' + (isVoted ? 'Voted: ' : '') + films[id] + '</button>';
  }
  res.send(page('Vote',
    '<h1>Film of the night</h1>' +
    '<h2>' + (alreadyVoted ? 'You voted!' : 'Which film tonight?') + '</h2>' +
    '<p>' + (alreadyVoted ? 'You voted for <strong>' + films[alreadyVoted] + '</strong>. Thank you!' : 'Hey <strong>' + data.name + '</strong>! Pick your favourite:') + '</p>' +
    btns +
    '<a class="link" href="/votes">See vote results</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<script>function vote(id){fetch("/vote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"' + key + '",id:id})}).then(function(r){return r.json();}).then(function(d){if(d.ok)window.location.reload();else alert(d.error||"Error");});}</script>'
  ));
});

// -------------------- Vote POST --------------------

app.post('/vote', function(req, res) {
  const key = req.body.key;
  const id = req.body.id;
  const data = users.get(key);
  if (!data) return res.json({ ok: false, error: 'User not found' });
  if (data.voted) return res.json({ ok: false, error: 'Already voted!' });
  if (!films[id]) return res.json({ ok: false, error: 'Invalid choice' });
  data.voted = id;
  votes[id]++;
  users.set(key, data);
  res.json({ ok: true });
});

// -------------------- Vote Results --------------------

app.get('/votes', function(req, res) {
  const total = Object.values(votes).reduce(function(a, b) { return a + b; }, 0);
  let bars = '';
  for (const id in films) {
    const count = votes[id];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    bars += '<div style="margin-bottom:18px;text-align:left"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>' + films[id] + '</span><span style="color:#fbbf24;font-weight:700">' + count + ' votes (' + pct + '%)</span></div><div class="bar-wrap"><div class="bar" style="width:' + pct + '%"></div></div></div>';
  }
  res.send(page('Vote Results',
    '<h1>Vote Results</h1>' +
    '<h2>Film of the night</h2>' +
    '<p>' + total + ' total votes</p>' +
    '<hr>' + bars + '<hr>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>' +
    '<a class="link" href="/generate">QR Generator</a>' +
    '<a class="link" href="/events">Wydarzenia</a>' 
  ));
});

// -------------------- Leaderboard --------------------

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
    '<a class="link" href="/votes">Vote results</a>' +
    '<a class="link" href="/generate">QR Generator</a>'
  ));
});

// ==================== Additional Buttons ====================

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

    '<a class="link" href="/generate">QR Generator</a>' +
    '<a class="link" href="/leaderboard">Leaderboard</a>'
  ));
});
// ==================== ADMIN PANEL ====================

app.get(ADMIN_URL, function(req, res) {
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
      userRows += '<tr><td><strong>' + u.name + '</strong></td><td>' + u.points + '</td><td>' + checkedIn + '</td><td>' + (u.voted ? films[u.voted] : 'No') + '</td><td>' +
        '<form method="POST" action="' + ADMIN_URL + '/reset-pin" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><input type="text" name="newpin" placeholder="PIN" style="width:60px;padding:4px;font-size:12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-right:4px"/><button type="submit" class="btn btn-blue btn-sm">Reset PIN</button></form> ' +
        '<form method="POST" action="' + ADMIN_URL + '/reset-checkin" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><button type="submit" class="btn btn-gold btn-sm">Reset CI</button></form> ' +
        '<form method="POST" action="' + ADMIN_URL + '/delete-user" style="display:inline"><input type="hidden" name="key" value="' + key + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form>' +
        '</td></tr>';
    });
  }
  let nameTags = '';
  allowedNames.forEach(function(n) {
    nameTags += '<span class="tag">' + n + ' <a href="' + ADMIN_URL + '/remove-name?name=' + encodeURIComponent(n) + '" style="color:#f87171;text-decoration:none;margin-left:4px">x</a></span>';
  });
  res.send(page('Admin Panel',
    '<h1>Admin Panel</h1>' +
    '<h2>QR Cafe ' + VERSION + '</h2>' +
    (msg ? '<div class="' + (isError ? 'error' : 'success') + '">' + msg + '</div>' : '') +
    '<hr><h2 style="text-align:left;margin-bottom:12px">Users (' + users.size + ')</h2>' +
    '<div style="overflow-x:auto"><table><tr><th>Name</th><th>Pts</th><th>Today</th><th>Voted</th><th>Actions</th></tr>' + userRows + '</table></div>' +
    '<hr><h2 style="text-align:left;margin-bottom:12px">Allowed Names (' + allowedNames.size + ')</h2>' +
    '<p style="text-align:left;font-size:13px;color:#666">Synced from Hive account: ' + HIVE_ACCOUNT + ' every 5 min</p>' +
    '<div style="text-align:left;margin-bottom:12px">' + (nameTags || '<p style="color:#555">No names yet</p>') + '</div>' +
    '<form method="POST" action="' + ADMIN_URL + '/add-name" style="display:flex;gap:8px">' +
      '<input type="text" name="name" placeholder="Add a name..." required style="flex:1;margin:0"/>' +
      '<button type="submit" class="btn btn-green" style="width:auto;padding:8px 16px;margin:0">Add</button>' +
    '</form>' +
    '<form method="POST" action="' + ADMIN_URL + '/sync-hive" style="margin-top:8px">' +
      '<button type="submit" class="btn btn-blue">Sync from Hive now</button>' +
    '</form>' +
    '<hr><h2 style="text-align:left;margin-bottom:8px">Votes</h2>' +
    '<p style="text-align:left">Szklana Pulapka: ' + votes.a + ' | Speed: ' + votes.b + ' | Die Hard: ' + votes.c + ' | Straznik Teksasu: ' + votes.d + '</p>' +
    '<form method="POST" action="' + ADMIN_URL + '/reset-votes"><button type="submit" class="btn btn-red">Reset All Votes</button></form>' +
    '<hr><a class="link" href="/generate">QR Generator</a><a class="link" href="/leaderboard">Leaderboard</a>'
  ));
});

app.post(ADMIN_URL + '/add-name', function(req, res) {
  const name = (req.body.name || '').trim().toLowerCase();
  if (!name) return res.redirect(ADMIN_URL + '?err=1&msg=' + encodeURIComponent('Name cannot be empty'));
  allowedNames.add(name);
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('Added: ' + name));
});

app.get(ADMIN_URL + '/remove-name', function(req, res) {
  const name = (req.query.name || '').trim().toLowerCase();
  allowedNames.delete(name);
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('Removed: ' + name));
});

app.post(ADMIN_URL + '/sync-hive', async function(req, res) {
  await fetchAllowedNames();
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('Synced from Hive'));
});

app.post(ADMIN_URL + '/reset-pin', function(req, res) {
  const oldKey = req.body.key;
  const newPin = (req.body.newpin || '').trim();
  if (!/^\d{4,6}$/.test(newPin)) return res.redirect(ADMIN_URL + '?err=1&msg=' + encodeURIComponent('PIN must be 4-6 digits'));
  const data = users.get(oldKey);
  if (!data) return res.redirect(ADMIN_URL + '?err=1&msg=' + encodeURIComponent('User not found'));
  users.delete(oldKey);
  const newKey = userKey(data.name, newPin);
  users.set(newKey, data);
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('PIN reset for ' + data.name));
});

app.post(ADMIN_URL + '/reset-checkin', function(req, res) {
  const key = req.body.key;
  const data = users.get(key);
  if (!data) return res.redirect(ADMIN_URL + '?err=1&msg=' + encodeURIComponent('User not found'));
  data.lastVisit = 0;
  users.set(key, data);
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('Check-in reset for ' + data.name));
});

app.post(ADMIN_URL + '/delete-user', function(req, res) {
  const key = req.body.key;
  const data = users.get(key);
  const name = data ? data.name : key;
  users.delete(key);
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('Deleted: ' + name));
});

app.post(ADMIN_URL + '/reset-votes', function(req, res) {
  votes.a = 0; votes.b = 0; votes.c = 0; votes.d = 0;
  users.forEach(function(u) { u.voted = null; });
  res.redirect(ADMIN_URL + '?msg=' + encodeURIComponent('All votes reset'));
});

// ==================== START ====================

app.listen(PORT, function() {
  console.log('QR Cafe ' + VERSION + ' running at ' + BASE_URL);
  console.log('Admin: ' + BASE_URL + ADMIN_URL);
});