const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const BASE_URL = process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com';
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const sessions = new Map();
const users = new Map();
const votes = { a: 0, b: 0, c: 0, d: 0 };
const films = { a: 'Szklana Pulapka', b: 'Speed', c: 'Die Hard', d: 'Straznik Teksasu' };
function userKey(n, p) { return n.trim().toLowerCase() + ':' + p.trim(); }
app.get('/', function(req, res) { res.redirect('/generate'); });
app.get('/generate', async function(req, res) {
  const sid = crypto.randomUUID();
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL });
  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}h2{color:#e0e0e0;margin-bottom:16px}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}</style></head><body><div class="card"><h1>QR Cafe</h1><h2>Scan to Check In</h2><img src="' + qr + '" style="width:260px;height:260px;border-radius:12px;margin:16px 0"/><p style="color:#666;font-size:13px">Session valid for 1 hour</p><a href="/generate">New QR code</a><a href="/leaderboard">Leaderboard</a><a href="/votes">Film votes</a></div></body></html>');
});
app.get('/check', function(req, res) {
  const session = req.query.session;
  const s = sessions.get(session);
  if (!s) return res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial;background:#1a1a2e;color:white;text-align:center;padding-top:50px"><h1>Invalid QR Code</h1><p>Please scan a fresh one.</p></body></html>');
  if (Date.now() > s.expiresAt) return res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial;background:#1a1a2e;color:white;text-align:center;padding-top:50px"><h1>QR Expired</h1><p>Please scan a fresh one.</p></body></html>');
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}h2{color:#e0e0e0;margin-bottom:16px}p{color:#aaa;margin-bottom:20px}input{width:100%;padding:14px;font-size:16px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:white;margin-bottom:12px;outline:none;box-sizing:border-box}.btn{width:100%;padding:14px;font-size:17px;font-weight:600;border:none;border-radius:10px;cursor:pointer;background:#4ade80;color:#052e16}.error{color:#f87171;background:rgba(248,113,113,0.1);padding:10px;border-radius:8px;margin-bottom:12px}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}</style></head><body><div class="card"><h1>QR Cafe</h1><h2>Witamy w Krolestwie!</h2><p>First time? Enter name and PIN.<br/>Returning? Use same name and PIN.</p>' + (error ? '<div class="error">' + error + '</div>' : '') + '<form method="POST" action="/check"><input type="hidden" name="session" value="' + session + '"/><input type="text" name="name" placeholder="Your name" required maxlength="30" autocomplete="off"/><input type="password" name="pin" placeholder="PIN (4 digits)" required maxlength="6" inputmode="numeric"/><button class="btn" type="submit">Check In!</button></form><a href="/leaderboard">Leaderboard</a></div></body></html>');
});
app.post('/check', function(req, res) {
  const session = req.body.session;
  const name = (req.body.name || '').trim();
  const pin = (req.body.pin || '').trim();
  const s = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  if (!name || !pin) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Please enter name and PIN'));
  if (!/^\d{4,6}$/.test(pin)) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('PIN must be 4-6 digits'));
  const key = userKey(name, pin);
  for (const [k, v] of users.entries()) {
    if (v.name.toLowerCase() === name.toLowerCase() && k !== key) return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Wrong PIN for this name'));
  }
  if (!users.has(key)) users.set(key, { name: name, lastVisit: 0, points: 0, voted: null });
  const data = users.get(key);
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const next = new Date(data.lastVisit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}p{color:#aaa;margin-bottom:20px}.badge{display:inline-block;background:#fbbf24;color:#1c0a00;border-radius:999px;padding:6px 20px;font-weight:700;margin-bottom:20px}.btn{width:100%;padding:14px;font-size:17px;font-weight:600;border:none;border-radius:10px;cursor:pointer;background:#fbbf24;color:#1c0a00}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}strong{color:white}</style></head><body><div class="card"><h1>Already checked in!</h1><p>Hey <strong>' + data.name + '</strong>, come back after <strong>' + next + '</strong>.</p><div class="badge">' + data.points + ' points</div><a href="/vote?key=' + encodeURIComponent(key) + '"><button class="btn">Vote for a film!</button></a><a href="/leaderboard">Leaderboard</a></div></body></html>');
  }
  data.lastVisit = Date.now();
  data.points += 1;
  users.set(key, data);
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}h2{color:#e0e0e0;margin-bottom:16px}p{color:#aaa;margin-bottom:20px}.badge{display:inline-block;background:#fbbf24;color:#1c0a00;border-radius:999px;padding:6px 20px;font-weight:700;margin-bottom:20px}.btn{width:100%;padding:14px;font-size:17px;font-weight:600;border:none;border-radius:10px;cursor:pointer;background:#fbbf24;color:#1c0a00}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}strong{color:white}</style></head><body><div class="card"><h1>Witamy w Krolestwie!</h1><h2>Welcome ' + data.name + '!</h2><p>Great to have you here!</p><div class="badge">+1 point - Total: ' + data.points + '</div><a href="/vote?key=' + encodeURIComponent(key) + '"><button class="btn">Vote for a film!</button></a><a href="/leaderboard">Leaderboard</a></div></body></html>');
});
app.get('/vote', function(req, res) {
  const key = req.query.key;
  const data = users.get(key);
  if (!data) return res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial;background:#1a1a2e;color:white;text-align:center;padding-top:50px"><h1>Check in first!</h1></body></html>');
  const alreadyVoted = data.voted;
  let btns = '';
  for (const id in films) {
    const isVoted = alreadyVoted === id;
    btns += '<button style="display:block;width:100%;padding:14px;margin-bottom:10px;font-size:16px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:' + (isVoted ? '#4ade80' : 'rgba(255,255,255,0.08)') + ';color:' + (isVoted ? '#052e16' : 'white') + ';cursor:pointer;text-align:left;" ' + (alreadyVoted ? 'disabled' : 'onclick="vote(\'' + id + '\')"') + '>' + (isVoted ? 'Voted: ' : '') + films[id] + '</button>';
  }
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}h2{color:#e0e0e0;margin-bottom:16px}p{color:#aaa;margin-bottom:20px}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}strong{color:white}</style></head><body><div class="card"><h1>Film of the night</h1><h2>' + (alreadyVoted ? 'You voted!' : 'Pick your favourite') + '</h2><p>' + (alreadyVoted ? 'You voted for <strong>' + films[alreadyVoted] + '</strong>. Thank you!' : 'Hey <strong>' + data.name + '</strong>! Which film tonight?') + '</p>' + btns + '<a href="/votes">See vote results</a><a href="/leaderboard">Leaderboard</a></div><script>function vote(id){fetch("/vote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"' + key + '",id:id})}).then(r=>r.json()).then(d=>{if(d.ok)window.location.reload();else alert(d.error||"Error");});}</script></body></html>');
});
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
app.get('/votes', function(req, res) {
  const total = Object.values(votes).reduce(function(a, b) { return a + b; }, 0);
  let bars = '';
  for (const id in films) {
    const count = votes[id];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    bars += '<div style="margin-bottom:18px;text-align:left"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>' + films[id] + '</span><span style="color:#fbbf24;font-weight:700">' + count + ' votes (' + pct + '%)</span></div><div style="background:rgba(255,255,255,0.1);border-radius:999px;height:10px"><div style="background:#fbbf24;width:' + pct + '%;height:10px;border-radius:999px"></div></div></div>';
  }
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}h2{color:#e0e0e0;margin-bottom:16px}p{color:#aaa;margin-bottom:20px}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}</style></head><body><div class="card"><h1>Vote Results</h1><h2>Film of the night</h2><p>' + total + ' total votes</p>' + bars + '<a href="/leaderboard">Leaderboard</a><a href="/generate">QR Generator</a></div></body></html>');
});
app.get('/leaderboard', function(req, res) {
  const sorted = Array.from(users.values()).sort(function(a, b) { return b.points - a.points; }).slice(0, 20);
  const medals = ['1st', '2nd', '3rd'];
  let rows = sorted.length === 0 ? '<tr><td colspan="3" style="color:#666;padding:20px">No players yet</td></tr>' : '';
  sorted.forEach(function(u, i) { rows += '<tr><td>' + (medals[i] || i + 1) + '</td><td style="text-align:left">' + u.name + '</td><td>' + u.points + ' pts</td></tr>'; });
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center}h1{font-size:2rem;margin-bottom:8px}h2{color:#e0e0e0;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:16px}th{color:#aaa;font-size:13px;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1)}td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:15px}a{color:#60a5fa;display:block;margin-top:14px;font-size:14px}</style></head><body><div class="card"><h1>Leaderboard</h1><h2>Top Players</h2><table><tr><th>#</th><th style="text-align:left">Player</th><th>Points</th></tr>' + rows + '</table><a href="/votes">Vote results</a><a href="/generate">QR Generator</a></div></body></html>');
});
app.listen(PORT, function() { console.log('QR Cafe running at ' + BASE_URL); });
