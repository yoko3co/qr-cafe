const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- CONFIG --------------------
const DAY = 24 * 60 * 60 * 1000; // 24 hours in ms
const SESSION_TTL = 10 * 60 * 1000; // session valid for 10 minutes
const BASE_URL = process.env.BASE_URL || `BASE_URL = 
https://qr-cafe-shh2.onrender.com`;

// -------------------- STORAGE --------------------
const sessions = new Map(); // session_id -> { expiresAt }
const users = new Map();    // user_id -> { lastVisit, points }

// -------------------- GENERATE QR --------------------
// Visit /generate to create a fresh QR code
app.get('/generate', async (req, res) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    expiresAt: Date.now() + SESSION_TTL
  });

  const checkUrl = `${BASE_URL}/check?session=${sessionId}`;
  const qrDataUrl = await QRCode.toDataURL(checkUrl);

  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding-top:50px;">
        <h2>Scan this QR code to check in</h2>
        <img src="${qrDataUrl}" style="width:300px;height:300px;" />
        <p style="font-size:12px;color:#999;">Session expires in 10 minutes</p>
        <p><a href="/generate">Generate new QR</a></p>
        <p><a href="/leaderboard">View Leaderboard</a></p>
      </body>
    </html>
  `);
});

// -------------------- CHECK IN --------------------
app.get('/check', (req, res) => {
  const { session, user } = req.query;
  const s = sessions.get(session);

  if (!s) return res.send(`
    <html><body style="font-family:Arial;text-align:center;padding-top:50px;">
      <h2>❌ Invalid session</h2>
      <p>This QR code is not valid. Please scan a fresh one.</p>
    </body></html>
  `);

  if (Date.now() > s.expiresAt) return res.send(`
    <html><body style="font-family:Arial;text-align:center;padding-top:50px;">
      <h2>⏰ Session expired</h2>
      <p>This QR code has expired. Please scan a fresh one.</p>
    </body></html>
  `);

  // -------------------- PIN LOGIN --------------------
  if (!user) {
    return res.send(`
      <html>
        <body 
style="font-family:Arial;text-align:center;padding-top:50px;max-width:400px;margin:auto;">
          <h2>📍 QR Café Check-in</h2>
          <p style="color:#666;">Enter your PIN to check in and earn points</p>
          <input id="pin" type="number" placeholder="Enter your PIN" 
            
style="padding:12px;font-size:18px;width:200px;text-align:center;border:2px solid 
#ccc;border-radius:8px;" />
          <br/><br/>
          <button onclick="go()" 
            style="padding:12px 
32px;font-size:18px;background:#4CAF50;color:white;border:none;border-radius:8px;cursor:pointer;">
            Check In ✅
          </button>
          <script>
            function go() {
              const pin = document.getElementById('pin').value.trim();
              if (!pin) return alert("Please enter your PIN");
              const user = "PIN:" + pin;
              localStorage.setItem("user_id", user);
              const url = new URL(window.location.href);
              const session = url.searchParams.get("session");
              window.location.href = "/check?session=" + session + "&user=" + 
encodeURIComponent(user);
            }

            // Allow pressing Enter to submit
            document.getElementById('pin').addEventListener('keydown', function(e) {
              if (e.key === 'Enter') go();
            });
          </script>
        </body>
      </html>
    `);
  }

  // -------------------- INIT USER --------------------
  if (!users.has(user)) {
    users.set(user, { lastVisit: 0, points: 0 });
  }

  const data = users.get(user);

  // -------------------- 24H RULE --------------------
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    const nextCheckin = new Date(data.lastVisit + DAY).toLocaleTimeString();
    return res.send(`
      <html>
        <body style="font-family:Arial;text-align:center;padding-top:50px;">
          <h2>⛔ Already checked in today</h2>
          <p>Już dziś się zarejestrowałeś!</p>
          <p>Come back after <strong>${nextCheckin}</strong></p>
          <p>Your total points: <strong>${data.points}</strong></p>
          <p><a href="/leaderboard">View Leaderboard</a></p>
        </body>
      </html>
    `);
  }

  // -------------------- POINTS --------------------
  const basePoints = 1;
  const bonus = user.startsWith("HIVE:") ? 0.1 : 0;
  const total = basePoints + bonus;

  data.lastVisit = Date.now();
  data.points += total;
  users.set(user, data);

  // -------------------- SUCCESS --------------------
  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding-top:50px;">
        <h1>✅ WITAMY W KRÓLESTWIE 👑</h1>
        <p style="font-size:24px;">+${total} point${total !== 1 ? 's' : ''} 
earned!</p>
        <p>Total points: <strong>${data.points}</strong></p>
        <p><a href="/leaderboard">View Leaderboard</a></p>
      </body>
    </html>
  `);
});

// -------------------- LEADERBOARD --------------------
app.get('/leaderboard', (req, res) => {
  const sorted = [...users.entries()]
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 10);

  const rows = sorted.length === 0
    ? '<tr><td colspan="3" style="color:#999;">No check-ins yet</td></tr>'
    : sorted.map(([id, data], i) => `
        <tr>
          <td style="padding:8px;">${i + 1}</td>
          <td style="padding:8px;">${id}</td>
          <td style="padding:8px;font-weight:bold;">${data.points}</td>
        </tr>
      `).join('');

  res.send(`
    <html>
      <body 
style="font-family:Arial;text-align:center;padding-top:50px;max-width:500px;margin:auto;">
        <h2>🏆 Leaderboard</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;">
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;">#</th>
            <th style="padding:8px;">User</th>
            <th style="padding:8px;">Points</th>
          </tr>
          ${rows}
        </table>
        <br/>
        <a href="/generate">Back to QR Generator</a>
      </body>
    </html>
  `);
});

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`✅ QR Café running at ${BASE_URL}`);
  console.log(`📍 Generate QR: ${BASE_URL}/generate`);
  console.log(`🏆 Leaderboard: ${BASE_URL}/leaderboard`);
});
