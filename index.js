const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// store sessions in memory
const sessions = new Map();

const SESSION_TIME = 60 * 1000; // 60 seconds

// generate QR
app.get('/generate', async (req, res) => {
  const sessionId = Math.random().toString(36).substring(2, 10);

  sessions.set(sessionId, {
    used: false,
    expiresAt: Date.now() + SESSION_TIME
  });

  const url = `http://localhost:${PORT}/check?session=${sessionId}`;

  const qr = await QRCode.toDataURL(url);

  res.send(`
    <h1>Scan QR</h1>
    <img src="${qr}" />
    <p>${url}</p>
  `);
});

// check scan
app.get('/check', (req, res) => {
  const { session } = req.query;

  const s = sessions.get(session);

  if (!s) return res.send("❌ Invalid session");

  if (Date.now() > s.expiresAt) return res.send("⏰ Expired");

  if (s.used) return res.send("⚠️ Already used");

  s.used = true;

  res.send("✅ Check-in successful");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
