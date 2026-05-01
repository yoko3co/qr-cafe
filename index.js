app.get('/check', (req, res) => {
  const { session, user } = req.query;
  const s = sessions.get(session);

  if (!s) return res.send("❌ Invalid session");
  if (Date.now() > s.expiresAt) return res.send("⏰ Expired session");

  // -------------------- PIN LOGIN --------------------
  if (!user) {
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
              const url = new URL(window.location.href);
              const session = url.searchParams.get("session");
              window.location.href = "/check?session=" + session + "&user=" + 
encodeURIComponent(user);
            }
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
    return res.send("⛔ Już dziś się zarejestrowałeś");
  }

  // -------------------- POINTS --------------------
  let basePoints = 1;
  let bonus = user.startsWith("HIVE:") ? 0.1 : 0;
  const total = basePoints + bonus;

  data.lastVisit = Date.now();
  data.points += total;
  users.set(user, data);

  // -------------------- RESPONSE --------------------
  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding-top:50px;">
        <h1>✅ WITAMY W KRÓLESTWIE 👑</h1>
        <p>+${total} points earned</p>
        <p>Total points: ${data.points}</p>
      </body>
    </html>
  `);
});
