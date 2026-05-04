'use strict';

const express = require('express');
const router  = express.Router();

const { pool }                     = require('../db/pool');
const { getAllowedNames, getUser, upsertUser } = require('../db/pool');
const { isAdmin, getUserFromCookie }           = require('../middleware/session');
const { escape, page, navBar }                = require('../views/layout');

router.get('/home', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const names = await getAllowedNames();
    if (!names.has(name.toLowerCase()) && !isAdmin(name)) {
      return res.send(page('Access Denied',
        '<h1>Access Denied</h1><p>Your account is not on the guest list.</p><a class="link" href="/">Back</a>'
      ));
    }
    let user = await getUser(name);
    if (!user) {
      await upsertUser(name, { points:0, book:0, games:0, volunteers:0, film:0, last_visit:0, events_today:{}, voted:{}, random_presses:0, random_day:0 });
      user = await getUser(name);
    }
    res.send(page('Home',
      '<h1>Witamy w Krolestwie!</h1>' +
      '<h2>Hey, <strong>' + escape(user.hive_name) + '</strong>!</h2>' +
      '<div class="badge">' + (user.points||0).toFixed(1) + ' points</div>' +
      '<p style="font-size:13px;color:#666">Book: ' + (user.book||0) + ' | Games: ' + (user.games||0) + ' | Volunteers: ' + (user.volunteers||0) + ' | Film: ' + (user.film||0) + '</p>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

router.get('/leaderboard', async function(req, res) {
  const validTypes = ['points','book','games','volunteers','film'];
  const type = validTypes.includes(req.query.type) ? req.query.type : 'points';
  try {
    const r     = await pool.query('SELECT * FROM users ORDER BY ' + type + ' DESC LIMIT 20');
    const users = r.rows;
    const medals = ['1st','2nd','3rd'];
    const rows = users.length === 0
      ? '<tr><td colspan="3" style="color:#555;padding:20px;text-align:center">No players yet</td></tr>'
      : users.map(function(u, i) {
          return '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i]||i+1) + '</td><td>' + escape(u.hive_name) + '</td><td style="color:#fbbf24;font-weight:700">' + (u[type]||0) + '</td></tr>';
        }).join('');
    const tabs = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      validTypes.map(function(t) {
        return '<a href="/leaderboard?type=' + t + '" class="btn ' + (type===t?'btn-gold':'btn-gray') + ' btn-sm">' + t.charAt(0).toUpperCase()+t.slice(1) + '</a>';
      }).join('') + '</div>';
    res.send(page('Leaderboard',
      '<h1>Leaderboard</h1>' + tabs +
      '<table><tr><th>#</th><th>Player</th><th>' + type.charAt(0).toUpperCase()+type.slice(1) + '</th></tr>' + rows + '</table>' +
      '<a class="link" href="/home">Back</a>'
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;
