const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;

const BASE_URL = process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com';
const ADMIN_URL = '/admin/hallmann';
const VERSION = 'v1.3';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessions = new Map();
const users = new Map();

const votes = { a: 0, b: 0, c: 0, d: 0 };

const films = [
  { id: "a", title: "Szklana Pulapka" },
  { id: "b", title: "Speed" },
  { id: "c", title: "Die Hard" },
  { id: "d", title: "Straznik Teksasu" }
];

const allowedNames = new Set(['marek', 'rafal', 'anna', 'piotr']);

async function fetchAllowedNames() {
  console.log("🔄 Hive fetch running...");

  try {
    const res = await fetch("https://api.hive.blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "condenser_api.get_account_history",
        params: ["test3333", -1, 50],
        id: 1
      })
    });

    const data = await res.json();
    const history = data.result || [];

    let found = null;

    for (let i = history.length - 1; i >= 0; i--) {
      const op = history[i][1].op;

      if (op[0] === "custom_json") {
        const json = JSON.parse(op[1].json);

        if (json.allowed_names) {
          found = json.allowed_names;
          break;
        }
      }
    }

    if (found && Array.isArray(found)) {
      allowedNames.clear();
      found.forEach(n => allowedNames.add(n.toLowerCase()));
      console.log("✅ Names loaded from Hive:", [...allowedNames]);
    }

  } catch (e) {
    console.log("❌ Hive fetch failed:", e.message);
  }
}

fetchAllowedNames();
setInterval(fetchAllowedNames, 60 * 1000);

function userKey(name, pin) {
  return name.trim().toLowerCase() + ':' + pin.trim();
}

function isAllowed(name) {
  return allowedNames.has(name.trim().toLowerCase());
}

app.get('/', (req, res) => res.redirect('/generate'));

app.get('/generate', async (req, res) => {
  const sid = crypto.randomUUID();

  sessions.set(sid, {
    expiresAt: Date.now() + SESSION_TTL
  });

  const url = BASE_URL + '/check?session=' + sid;
  const qr = await QRCode.toDataURL(url, { width: 280, margin: 2 });

  res.send(`<h1>QR</h1><img src="${qr}"/>`);
});

app.get('/check', (req, res) => {
  const session = req.query.session;
  const s = sessions.get(session);

  if (!s) return res.send("Invalid QR");
  if (Date.now() > s.expiresAt) return res.send("Expired QR");

  res.send(`<form method="POST">
    <input name="session" value="${session}" hidden />
    <input name="name" />
    <input name="pin" />
    <button>Check</button>
  </form>`);
});

app.post('/check', (req, res) => {
  const session = req.body.session;
  const name = (req.body.name || '').trim();
  const pin = (req.body.pin || '').trim();

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

  res.send(`Welcome ${u.name} <a href="/vote?key=${key}">Vote</a>`);
});

app.get('/vote', (req, res) => {
  const key = req.query.key;
  const data = users.get(key);

  if (!data) return res.send("Check-in first");

  let html = `<h1>${data.name}</h1>`;

  if (data.voted) {
    html += `<p>Already voted</p>`;
  } else {
    films.forEach(f => {
      html += `<form method="POST">
        <input name="key" value="${key}" hidden />
        <input name="id" value="${f.id}" hidden />
        <button>${f.title}</button>
      </form>`;
    });
  }

  res.send(html);
});

app.post('/vote', (req, res) => {
  const { key, id } = req.body;

  const u = users.get(key);
  if (!u) return res.json({ ok: false });

  if (u.voted) return res.json({ ok: false, error: "Already voted" });

  if (!films.find(f => f.id === id))
    return res.json({ ok: false, error: "Invalid film" });

  u.voted = id;
  votes[id]++;

  users.set(key, u);

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Running " + VERSION);
});