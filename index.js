const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- STORAGE --------------------
const sessions = new Map();
const users = new Map(); 
// user_id → { lastVisit, points }

const SESSION_TIME = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const BASE_URL = "https://qr-cafe-shh2.onrender.com";

// -------------------- HOME --------------------
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body 
style="font-family:Arial;text-align:center;background:#111;color:white;padding-top:100px;">
        <h1>WITAMY W KRÓLESTWIE 👑</h1>
        <a href="/generate" style="color:white;padding:10px 
20px;background:#444;border-radius:10px;text-decoration:none;">
          GENERUJ QR
        </a>
      </body>
    </html>
  `);
});

// -------------------- GENERATE QR --------------------
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
      <body 
style="font-family:Arial;text-align:center;background:#111;color:white;padding-top:80px;">
        <h1>WITAMY W KRÓLESTWIE 👑</h1>
        <img src="${qr}" 
style="width:260px;background:white;padding:10px;border-radius:15px;" />
        <p>${url}</p>
      </body>
    </html>
  `);
});

// -------------------- CHECK-IN + GAMIFICATION --------------------
app.get('/check', (req, res) => {if (!user) {
  return res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding-top:50px;">
        <h2>PIN LOGIN</h2>

        <input id="pin" placeholder="Enter PIN" />

        <button onclick="go()">Login</button>

        <script>
          function go() {
            const pin = document.getElementById('pin').value;

            if (!pin) return alert("Enter PIN");

            const user = "PIN:" + pin;

            localStorage.setItem("user_id", user);

            window.location.href = "/check?session=${session}&user=" + 
user;
          }
        </script>
      </body>
    </html>
  `);
}
  const { session, user } = req.query;

  const s = sessions.get(session);

  if (!s) return res.send("❌ Invalid session");
  if (Date.now() > s.expiresAt) return res.send("⏰ Expired session");

  // -------------------- STEP 1: USER IDENTIFICATION --------------------
  if (!user) {
    return res.send(`
      <script>
        let user = localStorage.getItem("user_id");

        if (!user) {
          // default = PIN/guest identity
          user = "PIN:" + Math.random().toString(36).substring(2, 8);
          localStorage.setItem("user_id", user);
        }

        // NOTE: later Hive will set user = "HIVE:username"
        window.location.href = "/check?session=${session}&user=" + user;
      </script>
    `);
  }

  // -------------------- STEP 2: INIT USER --------------------
  if (!users.has(user)) {
    users.set(user, {
      lastVisit: 0,
      points: 0
    });
  }

  const data = users.get(user);

  // -------------------- STEP 3: 24H RULE --------------------
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    return res.send("⛔ Już dziś się zarejestrowałeś");
  }

  // -------------------- STEP 4: POINTS SYSTEM --------------------

  let basePoints = 1;

  // Hive bonus system (future-ready)
  let bonus = 0;

  if (user.startsWith("HIVE:")) {
    bonus = 1; // ⭐ bonus for Hive auth
  }

  const total = basePoints + bonus;

  data.lastVisit = Date.now();
  data.points += total;

  users.set(user, data);

  // -------------------- RESPONSE --------------------
  res.send(`
    <h1>✅ WITAMY W KRÓLESTWIE 👑</h1>
    <p>+${total} points</p>
    <p>Total points: ${data.points}</p>
  `);
});

// -------------------- START --------------------
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
