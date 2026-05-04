'use strict';

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');

const { DAY }                          = require('../config');
const { getUser, upsertUser, pool }    = require('../db/pool');
const { getAllowedNames }              = require('../db/pool');
const { isAdmin, getUserFromCookie }   = require('../middleware/auth');
const { escape, page, navBar }         = require('../views/layout');

const limitLottery = rateLimit({ windowMs: 60 * 1000, max: 5, message: 'Too many lottery attempts.' });

// ==================== LOTTERY OUTCOMES ====================

const randomOutcomes = [
  { msg: 'Wygrales 5 rycarow!',           rare: true  },
  { msg: 'Wygrales 100!',                  rare: true  },
  { msg: 'Niestety nic... Sprobuj jutro!', rare: false },
  { msg: 'Prawie! Ale jednak nie.',        rare: false },
  { msg: 'Los mowi: dzisiaj nie.',         rare: false },
  { msg: 'Moze jutro bedzie lepiej!',      rare: false },
  { msg: 'Puste kieszenie, pelne serce.',  rare: false },
  { msg: 'Wszechswiat sie zastanawia...', rare: false },
  { msg: 'Nie tym razem, przyjacielu.',   rare: false },
  { msg: 'Sprobuj jeszcze raz jutro!',    rare: false },
];

function getRandomOutcome() {
  const rand = Math.random();
  if (rand < 0.05) return randomOutcomes[0];
  if (rand < 0.08) return randomOutcomes[1];
  const others = randomOutcomes.filter(function(o) { return !o.rare; });
  return others[Math.floor(Math.random() * others.length)];
}

// ==================== HOME ====================

router.get('/home', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const allowedNames = await getAllowedNames();
    if (!allowedNames.has(name.toLowerCase()) && !isAdmin(name)) {
      return res.send(page('Access Denied', '<h1>Access Denied</h1><p>Your account is not on the guest list. Zapytaj w Krolestwie!</p><a class="link" href="/">Back</a>'));
    }
    let user = await getUser(name);
    if (!user) {
      await upsertUser(name, { points: 0, book: 0, games: 0, volunteers: 0, film: 0, last_visit: 0, voted: {}, random_presses: 0, random_day: 0 });
      user = await getUser(name);
    }
    res.send(page('Home',
      '<h1>Witamy w Krolestwie!</h1>' +
      '<h2>Hey, <strong>' + escape(user.hive_name) + '</strong>!</h2>' +
      '<div class="badge">' + (user.points || 0).toFixed(1) + ' points</div>' +
      '<p style="font-size:13px;color:#666">Book: ' + (user.book || 0) + ' | Games: ' + (user.games || 0) + ' | Volunteers: ' + (user.volunteers || 0) + ' | Film: ' + (user.film || 0) + '</p>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== LEADERBOARD ====================

router.get('/leaderboard', async function(req, res) {
  const type       = req.query.type || 'points';
  const validTypes = ['points', 'book', 'games', 'volunteers', 'film'];
  const safeType   = validTypes.includes(type) ? type : 'points';
  try {
    const col    = safeType;
    const r      = await pool.query('SELECT * FROM users ORDER BY ' + col + ' DESC LIMIT 20');
    const users  = r.rows;
    const medals = ['1st', '2nd', '3rd'];
    let rows = users.length === 0
      ? '<tr><td colspan="3" style="color:#555;padding:20px;text-align:center">No players yet</td></tr>'
      : '';
    users.forEach(function(u, i) {
      rows += '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i] || i + 1) + '</td><td>' + escape(u.hive_name) + '</td><td style="color:#fbbf24;font-weight:700">' + (u[col] || 0) + '</td></tr>';
    });
    const tabs = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      ['points', 'book', 'games', 'volunteers', 'film'].map(function(t) {
        return '<a href="/leaderboard?type=' + t + '" class="btn ' + (safeType === t ? 'btn-gold' : 'btn-gray') + ' btn-sm">' + t.charAt(0).toUpperCase() + t.slice(1) + '</a>';
      }).join('') +
    '</div>';
    res.send(page('Leaderboard',
      '<h1>Leaderboard</h1>' +
      tabs +
      '<table><tr><th>#</th><th>Player</th><th>' + safeType.charAt(0).toUpperCase() + safeType.slice(1) + '</th></tr>' + rows + '</table>' +
      '<a class="link" href="/home">Back</a>'
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== LOTTERY ====================

router.get('/lottery', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const user = await getUser(name);
    if (!user) return res.redirect('/');
    const today      = Math.floor(Date.now() / DAY);
    if (user.random_day !== today) { user.random_presses = 0; user.random_day = today; }
    const pressesLeft = 3 - (user.random_presses || 0);
    res.send(page('Lottery',
      '<h1>Lottery</h1>' +
      '<h2>Try your luck!</h2>' +
      '<p style="color:#aaa">' + pressesLeft + ' press' + (pressesLeft !== 1 ? 'es' : '') + ' remaining today</p>' +
      '<div id="result" style="font-size:22px;font-weight:700;color:#fbbf24;min-height:36px;margin-bottom:16px"></div>' +
      (pressesLeft > 0
        ? '<button class="btn btn-gold" id="spin-btn" onclick="spin()">Try your luck!</button>'
        : '<div class="info">Come back tomorrow for more presses!</div>') +
      navBar() +
      '<script>' +
      'function spin(){' +
        'document.getElementById("spin-btn").disabled=true;' +
        'fetch("/lottery-spin")' +
        '.then(function(r){return r.json();})' +
        '.then(function(d){' +
          'document.getElementById("result").innerText=d.msg;' +
          'if(d.pressesLeft>0){document.getElementById("spin-btn").disabled=false;}' +
          'else{document.getElementById("spin-btn").outerHTML="<div class=\'info\'>No more presses today!</div>";}' +
        '});' +
      '}' +
      '</script>'
    ));
  } catch (e) {
    res.redirect('/');
  }
});

router.get('/lottery-spin', limitLottery, async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.json({ ok: false, msg: 'Not logged in' });
  try {
    const user = await getUser(name);
    if (!user) return res.json({ ok: false, msg: 'User not found' });
    const today = Math.floor(Date.now() / DAY);
    if (user.random_day !== today) { user.random_presses = 0; user.random_day = today; }
    if ((user.random_presses || 0) >= 3) return res.json({ ok: false, msg: 'No more presses today!' });
    user.random_presses = (user.random_presses || 0) + 1;
    await upsertUser(name, user);
    const outcome = getRandomOutcome();
    res.json({ ok: true, msg: outcome.msg, pressesLeft: 3 - user.random_presses });
  } catch (e) {
    res.json({ ok: false, msg: 'Error' });
  }
});

module.exports = router;
