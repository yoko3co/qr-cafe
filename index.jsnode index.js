const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

const sessions = new Map();
const users = new Map();

const SESSION_TIME = 60 * 1000;
const COOLDOWN_24H = 24 * 60 * 60 * 1000;

app.get('/generate', async (req, res) => {
  const sessionId = uuidv4();

  sessions.set(sessionId, {
    expiresAt: Date.now() + SESSION_TIME,
    used: false
  });

  const url = 
`http://localhost:${PORT}/check?session=${sessionId}&user=testUser`;

  const qr = await QRCode.toDataURL(url);

  res.send(`<img src="${qr}"/><p>${url}</p>`);
});

app.get('/check', (req, res) => {
  const { session, user } = req.query;

  const s = sessions.get(session);
  if (!s) return res.send("Invalid session");

  if (Date.now() > s.expiresAt) return res.send("Expired");

  if (s.used) return res.send("Already used");

  const u = users.get(user);

  if (u && Date.now() - u.last < COOLDOWN_24H) {
    return res.send("Blocked 24h");
  }

  s.used = true;
  users.set(user, { last: Date.now() });

  res.send("OK check-in");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
})
