const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

const sessions = new Map();
const SESSION_TIME = 60 * 1000;

const BASE_URL = "https://qr-cafe-shh2.onrender.com";

// HOME PAGE
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          body {
            display:flex;
            flex-direction:column;
            justify-content:center;
            align-items:center;
            height:100vh;
            font-family: Arial;
            background:#111;
            color:white;
          }
          h1 {
            margin-bottom:30px;
          }
          a {
            color:white;
            padding:10px 20px;
            background:#444;
            border-radius:10px;
            text-decoration:none;
          }
        </style>
      </head>
      <body>
        <h1>WITAMY W KRÓLESTWIE 👑</h1>
        <a href="/generate">GENERUJ QR</a>
      </body>
    </html>
  `);
});

// GENERATE QR
app.get('/generate', async (req, res) => {
  const sessionId = Math.random().toString(36).substring(2, 10);

  sessions.set(sessionId, {
    used: false,
    expiresAt: Date.now() + SESSION_TIME
  });

  const url = `${BASE_URL}/check?session=${sessionId}`;

  const qr = await QRCode.toDataURL(url);

  res.send(`
    <html>
      <head>
        <style>
          body {
            display:flex;
            flex-direction:column;
            justify-content:center;
            align-items:center;
            height:100vh;
            font-family: Arial;
            background:#111;
            color:white;
          }
          img {
            width:250px;
            height:250px;
            margin-top:20px;
          }
        </style>
      </head>
      <body>
        <h1>WITAMY W KRÓLESTWIE 👑</h1>
        <img src="${qr}" />
        <p>${url}</p>
      </body>
    </html>
  `);
});

// CHECK
app.get('/check', (req, res) => {
  const { session } = req.query;

  const s = sessions.get(session);

  if (!s) return res.send("❌ Invalid session");

  if (Date.now() > s.expiresAt) return res.send("⏰ Expired");

  if (s.used) return res.send("⚠️ Already used");

  s.used = true;

  res.send("✅ WITAMY W KRÓLESTWIE - CHECK-IN OK 👑");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
