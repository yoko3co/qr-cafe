app.get('/check', (req, res) => {

  const { session, user = "PIN:test" } = req.query;

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

              window.location.href = "window.location.href = "/check?session=" + "${session}" + "&user=" + 
user;
            }
          </script>

        </body>
      </html>
    `);
  }

  // -------------------- INIT USER --------------------
  if (!users.has(user)) {
    users.set(user, {
      lastVisit: 0,
      points: 0
    });
  }

  const data = users.get(user);

  // -------------------- 24H RULE --------------------
  if (data.lastVisit && Date.now() - data.lastVisit < DAY) {
    return res.send("⛔ Już dziś się zarejestrowałeś");
  }

  // -------------------- POINTS --------------------
  let basePoints = 1;
  let bonus = 0;

  if (user.startsWith("HIVE:")) {
    bonus = 0.1;
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
