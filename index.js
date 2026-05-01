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

const films = [
  { id: "a", gif: "https://media.giphy.com/media/l0HlQ7LRal8E8J2vS/giphy.gif", title: "Szklana Pulapka" },
  { id: "b", gif: "https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif", title: "Speed" },
  { id: "c", gif: "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif", title: "Die Hard" },
  { id: "d", gif: "https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif", title: "Straznik Teksasu" }
];

const allowedNames = new Set(['marek', 'rafal', 'anna', 'piotr']);

function userKey(name, pin) {
  return name.trim().toLowerCase() + ':' + pin.trim();
}

function isAllowed(name) {
  return allowedNames.has(name.trim().toLowerCase());
}

app.get('/', (req, res) => res.redirect('/generate'));


// ---------------- QR ----------------
app.get('/generate', async (req, res) => {
  const sid = crypto.randomUUID();

  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL });

  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 280 });

  res.send(`
  <body style="background:#0f172a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial">
    <div style="text-align:center">
      <h1>🎬 QR Café</h1>
      <img src="${qr}" style="border-radius:20px;border:2px solid #333"/>
      <p>Scan to enter Krolestwo</p>
      <p style="font-size:12px;color:#888">QR refresh every 60 sec</p>
    </div>
  </body>
  `);
});


// ---------------- LOGIN ----------------
app.get('/check', (req, res) => {
  const session = req.query.session;
  const s = sessions.get(session);

  if (!s) return res.send("Invalid QR");
  if (Date.now() > s.expiresAt) return res.send("Expired QR");

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body{
  margin:0;
  font-family:Arial;
  background:#0f172a;
  color:white;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}
.card{
  background:rgba(255,255,255,0.05);
  padding:30px;
  border-radius:20px;
  width:350px;
  text-align:center;
}
input{
  width:100%;
  padding:12px;
  margin:8px 0;
  border-radius:10px;
  border:0;
}
button{
  width:100%;
  padding:12px;
  background:#22c55e;
  border:0;
  border-radius:10px;
  font-weight:bold;
}
.bottom{
  margin-top:15px;
  font-size:12px;
  color:#aaa;
}
</style>
</head>

<body>
<div class="card">

<h2>👑 Welcome to Krolestwo</h2>

<p style="font-size:13px;color:#bbb">
"To jest Twój Paszport dzięki niemu możesz zbierać punkty, głosować..."
</p>

<form method="POST" action="/check">
  <input type="hidden" name="session" value="${session}" />
  <input name="name" placeholder="Użytkownik" required />
  <input name="pin" placeholder="PIN (cyfry)" required />
  <button>Login</button>
</form>

<div class="bottom">+1 point per check-in</div>

</div>
</body>
</html>
  `);
});


// ---------------- LOGIN POST ----------------
app.post('/check', (req, res) => {
  const { session, name, pin } = req.body;

  const s = sessions.get(session);
  if (!s || Date.now() > s.expiresAt)
    return res.send("Session expired");

  if (!isAllowed(name))
    return res.send("Not allowed");

  const key = userKey(name, pin);

  if (!users.has(key)) {
    users.set(key, {
      name,
      lastVisit: 0,
      points: 0,
      voted: null
    });
  }

  const u = users.get(key);
  u.lastVisit = Date.now();
  u.points += 1;

  res.send(`
    <h2>Welcome ${u.name}</h2>
    <a href="/vote?key=${key}">Go vote 🎬</a>
  `);
});


// ---------------- VOTE UI ----------------
app.get('/vote', (req, res) => {
  const key = req.query.key;
  const u = users.get(key);

  if (!u) return res.send("Check-in first");

  let html = `
  <body style="background:#0f172a;color:white;font-family:Arial;text-align:center;padding:40px">
    <h2>${u.name}</h2>
    <h3>Choose film</h3>
  `;

  if (u.voted) {
    html += `<p>Already voted</p>`;
  } else {
    films.forEach(f => {
      html += `
      <div style="margin:10px auto;width:300px;background:rgba(255,255,255,0.05);padding:10px;border-radius:15px">
        <img src="${f.gif}" style="width:100%;border-radius:10px"/>
        <form method="POST" action="/vote">
          <input name="key" value="${key}" hidden />
          <input name="id" value="${f.id}" hidden />
          <button style="width:100%;margin-top:10px;padding:10px;border-radius:10px">
            ${f.title}
          </button>
        </form>
      </div>`;
    });
  }

  html += `</body>`;
  res.send(html);
});


// ---------------- VOTE POST ----------------
app.post('/vote', (req, res) => {
  const { key, id } = req.body;

  const u = users.get(key);
  if (!u) return res.json({ ok: false });

  if (u.voted) return res.json({ ok: false });

  if (!films.find(f => f.id === id))
    return res.json({ ok: false });

  u.voted = id;
  votes[id]++;

  users.set(key, u);

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Running");
});