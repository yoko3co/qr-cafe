const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const BASE_URL = process.env.BASE_URL || `https://qr-cafe-shh2.onrender.com`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------- STORAGE --------------------
const sessions = new Map();
const users = new Map();
const votes = { a: 0, b: 0, c: 0, d: 0 };
const films = {
  a: 'Szklana Pulapka',
  b: 'Speed',
  c: 'Die Hard',
  d: 'Straznik Teksasu'
};

// -------------------- STYLES --------------------
const style = `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: white;
    }
    .card {
      background: rgba(255,255,255,0.07);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    h1 { font-size: 2.2rem; margin-bottom: 8px; }
    h2 { font-size: 1.4rem; margin-bottom: 16px; color: #e0e0e0; }
    p { color: #aaa; margin-bottom: 20px; line-height: 1.6; }
    input {
      width: 100%;
      padding: 14px 16px;
      font-size: 16px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.1);
      color: white;
      margin-bottom: 12px;
      outline: none;
    }
    input::placeholder { color: #888; }
    input:focus { border-color: rgba(255,255,255,0.5); }
    .btn {
      width: 100%;
      padding: 14px;
      font-size: 17px;
      font-weight: 600;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      margin-top: 4px;
      transition: opacity 0.2s, transform 0.1s;
    }
    .btn:active { transform: scale(0.98); }
    .btn-green { background: #4ade80; color: #052e16; }
    .btn-gold  { background: #fbbf24; color: #1c0a00; }
    .btn:hover { opacity: 0.9; }
    .points-badge {
      display: inline-block;
      background: #fbbf24;
      color: #1c0a00;
      border-radius: 999px;
      padding: 6px 20px;
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .film-btn {
      display: block;
      width: 100%;
      padding: 14px 16px;
      margin-bottom: 10px;
      font-size: 16px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.08);
      color: white;
      cursor: pointer;
      text-align: left;
      transition: background 0.2s;
    }
    .film-btn:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
    .film-btn.voted { background: #4ade80; color: #052e16; font-weight: 700; 
border-color: #4ade80; }
    .film-btn:disabled { opacity: 0.6; cursor: default; }
    .error { color: #f87171; margin-bottom: 12px; font-size: 14px; background: 
rgba(248,113,113,0.1); padding: 10px; border-radius: 8px; }
    .link { color: #60a5fa; text-decoration: none; display: block; margin-top: 14px; 
font-size: 14px; }
    .link:hover { text-decoration: underline; }
    .leaderboard { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .leaderboard th { color: #aaa; font-size: 13px; padding: 8px; border-bottom: 1px 
solid rgba(255,255,255,0.1); }
    .leaderboard td { padding: 10px 8px; border-bottom: 1px solid 
rgba(255,255,255,0.05); font-size: 15px; }
    .leaderboard tr:nth-child(2) td { color: #fbbf24; font-weight: 700; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 
20px 0; }
    .bar-wrap { background: rgba(255,255,255,0.1); border-radius: 999px; height: 
10px; margin-top: 6px; }
    .bar { background: #fbbf24; height: 10px; border-radius: 999px; }
    strong { color: white; }
  </style>
`;

// -------------------- HELPERS --------------------
function userKey(name, pin) {
  return `${name.trim().toLowerCase()}:${pin.trim()}`;
}

// -------------------- HOME --------------------
app.get('/', (req, res) => {
  res.redirect('/generate');
});

// -------------------- QR GENERATOR --------------------
app.get('/generate', async (req, res) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL });

  const checkUrl = `${BASE_URL}/check?session=${sessionId}`;
  const qrDataUrl = await QRCode.toDataURL(checkUrl, { width: 300, margin: 2 });

  res.send(`<html><head>${style}</head><body>
    <div class="card">
      <h1>QR Cafe</h1>
      <h2>Scan to Check In</h2>
      <img src="${qrDataUrl}" 
style="width:260px;height:260px;border-radius:12px;margin:16px 0;" />
      <p style="font-size:13px;color:#666;">Session valid for 1 hour</p>
      <a class="link" href="/generate">New QR code</a>
      <a class="link" href="/leaderboard">Leaderboard</a>
      <a class="link" href="/votes">Film votes</a>
    </div>
  </body></html>`);
});

// -------------------- CHECK IN (GET) --------------------
app.get('/check', (req, res) => {
  const { session } = req.query;
  const s = sessions.get(session);

  if (!s) return res.send(`<html><head>${style}</head><body>
    <div class="card"><h1>X</h1><h2>Invalid QR Code</h2>
    <p>This QR code is not valid. Please scan a fresh one.</p></div>
  </body></html>`);

  if (Date.now() > s.expiresAt) return res.send(`<html><head>${style}</head><body>
    <div class="card"><h1>!</h1><h2>QR Code Expired</h2>
    <p>This code has expired. Please scan a fresh QR code.</p></div>
  </body></html>`);

  const error = req.query.error ? decodeURIComponent(req.query.error) : '';

  res.send(`<html><head>${style}</head><body>
    <div class="card">
      <h1>QR Cafe</h1>
      <h2>Witamy w Krolestwie!</h2>
      <p>First time? Enter your name and choose a PIN.<br/>Returning? Use the same 
name and PIN.</p>
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/check">
        <input type="hidden" name="session" value="${session}" />
        <input type="text" name="name" placeholder="Your name (e.g. Marek)" required 
maxlength="30" autocomplete="off" />
        <input type="password" name="pin" placeholder="PIN (4 digits)" required 
maxlength="6" inputmode="numeric" />
        <button class="btn btn-green" type="submit">Check In!</button>
      </form>
      <a class="link" href="/leaderboard">Leaderboard</a>
    </div>
  </body></html>`);
});

// -------------------- CHECK IN (POST) --------------------
app.post('/check', (req, res) => {
  const { session, name, pin } = req.body;
  const s = sessions.get(session);

  if (!s || Date.now() > s.expiresAt) {
    return 
res.redirect(`/check?session=${session}&error=${encodeURIComponent('Session expired, 
please scan again')}`);
  }

  const trimName = (name || '').trim();
  const trimPin = (pin || '').trim();

  if (!trimName || !trimPin) {
    return res.redirect(`/check?session=${session}&error=${encodeURIComponent('Please 
enter your name and PIN')}`);
  }
  if (!/^\d{4,6}$/.test(trimPin)) {
    return res.redirect(`/check?session=${session}&error=${encodeURIComponent('PIN 
must be 4-6 digits')}`);
  }

  const key = userKey(trimName, trimPin);

  // Check if name exists with a different PIN
  for (const [k, v] of users.entries()) {
    if (v.name.toLowerCase() === trimName.toLowerCase() && k !== key) {
      return 
res.redirect(`/check?session=${session}&error=${encodeURIComponent('Wrong PIN for 
this name')}`);
    }
  }

  // Register if new
  if (!users.has(key)) {
    users.set(key, { name: trimName, lastVisit: 0, points: 0, voted: null });
  }

  const data = users.get(key);

  // Already checked in today
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const nextTime = new Date(data.lastVisit + DAY).toLocaleTimeString('en-GB', { 
hour: '2-digit', minute: '2-digit' });
    return res.send(`<html><head>${style}</head><body>
      <div class="card">
        <h1>!</h1>
        <h2>Already checked in today!</h2>
        <p>Hey <strong>${data.name}</strong>, you already checked in today.<br/>Come 
back after <strong>${nextTime}</strong>.</p>
        <div class="points-badge">${data.points} points</div>
        <a href="/vote?key=${encodeURIComponent(key)}">
          <button class="btn btn-gold">Vote for a film!</button>
        </a>
        <a class="link" href="/leaderboard">Leaderboard</a>
      </div>
    </body></html>`);
  }

  // Award points
  data.lastVisit = Date.now();
  data.points += 1;
  users.set(key, data);

  res.send(`<html><head>${style}</head><body>
    <div class="card">
      <h1>Witamy w Krolestwie!</h1>
      <h2>Welcome ${data.name}!</h2>
      <p>Great to have you here! 🎉</p>
      <div class="points-badge">+1 point · Total: ${data.points}</div>
      <p>Vote for tonight's film:</p>
      <a href="/vote?key=${encodeURIComponent(key)}">
        <button class="btn btn-gold">Vote for a film!</button>
      </a>
      <a class="link" href="/leaderboard">Leaderboard</a>
    </div>
  </body></html>`);
});

// -------------------- VOTE (GET) --------------------
app.get('/vote', (req, res) => {
  const { key } = req.query;
  const data = users.get(key);

  if (!data) return res.send(`<html><head>${style}</head><body>
    <div class="card"><h1>!</h1><h2>Check in first!</h2>
    <p>Please scan the QR code to check in first.</p></div>
  </body></html>`);

  const alreadyVoted = data.voted;

  const filmButtons = Object.entries(films).map(([id, title]) => {
    const isVoted = alreadyVoted === id;
    return `<button class="film-btn ${isVoted ? 'voted' : ''}"
      ${alreadyVoted ? 'disabled' : `onclick="vote('${id}')"`}>
      ${isVoted ? '✓ ' : ''}${title}
    </button>`;
  }).join('');

  res.send(`<html><head>${style}</head><body>
    <div class="card">
      <h1>Film of the night</h1>
      <h2>${alreadyVoted ? 'You voted!' : 'Which film tonight?'}</h2>
      <p>${alreadyVoted
        ? `You voted for <strong>${films[alreadyVoted]}</strong>. Thank you!`
        : `Hey <strong>${data.name}</strong>! Pick your favourite:`
      }</p>
      ${filmButtons}
      <a class="link" href="/votes">See vote results</a>
      <a class="link" href="/leaderboard">Leaderboard</a>
    </div>
    <script>
      function vote(id) {
        fetch('/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: "${key}", id: id })
        }).then(r => r.json()).then(d => {
          if (d.ok) window.location.reload();
          else alert(d.error || 'Error voting');
        });
      }
    </script>
  </body></html>`);
});

// -------------------- VOTE (POST) --------------------
app.post('/vote', (req, res) => {
  const { key, id } = req.body;
  const data = users.get(key);

  if (!data) return res.json({ ok: false, error: 'User not found' });
  if (data.voted) return res.json({ ok: false, error: 'Already voted!' });
  if (!films[id]) return res.json({ ok: false, error: 'Invalid choice' });

  data.voted = id;
  votes[id]++;
  users.set(key, data);
  res.json({ ok: true });
});

// -------------------- VOTE RESULTS --------------------
app.get('/votes', (req, res) => {
  const total = Object.values(votes).reduce((a, b) => a + b, 0);

  const bars = Object.entries(films).map(([id, title]) => {
    const count = votes[id];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div style="margin-bottom:18px;text-align:left;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>${title}</span>
          <span style="color:#fbbf24;font-weight:700;">${count} votes 
(${pct}%)</span>
        </div>
        <div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');

  res.send(`<html><head>${style}</head><body>
    <div class="card">
      <h1>Vote Results</h1>
      <h2>Film of the night</h2>
      <p>${total} total votes</p>
      <hr class="divider"/>
      ${bars}
      <hr class="divider"/>
      <a class="link" href="/leaderboard">Leaderboard</a>
      <a class="link" href="/generate">QR Generator</a>
    </div>
  </body></html>`);
});

// -------------------- LEADERBOARD --------------------
app.get('/leaderboard', (req, res) => {
  const sorted = [...users.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, 20);

  const medals = ['1st', '2nd', '3rd'];
  const rows = sorted.length === 0
    ? '<tr><td colspan="3" style="color:#666;padding:20px;">No players yet</td></tr>'
    : sorted.map((u, i) => `
        <tr>
          <td>${medals[i] || i + 1}</td>
          <td style="text-align:left;">${u.name}</td>
          <td>${u.points} pts</td>
        </tr>`).join('');

  res.send(`<html><head>${style}</head><body>
    <div class="card">
      <h1>Leaderboard</h1>
      <h2>Top Players</h2>
      <table class="leaderboard">
        <tr><th>#</th><th style="text-align:left;">Player</th><th>Points</th></tr>
        ${rows}
      </table>
      <hr class="divider"/>
      <a class="link" href="/votes">Vote results</a>
      <a class="link" href="/generate">QR Generator</a>
    </div>
  </body></html>`);
});

// -------------------- START --------------------
app.listen(PORT, () => {
  console.log(`QR Cafe running at ${BASE_URL}`);
  console.log(`Generate QR: ${BASE_URL}/generate`);
  console.log(`Leaderboard: ${BASE_URL}/leaderboard`);
  console.log(`Votes: ${BASE_URL}/votes`);
});
