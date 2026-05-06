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
      '<a href="/profile" class="btn btn-gray" style="margin-bottom:8px">View my profile</a>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

router.get('/profile', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const user         = await getUser(name);
    if (!user) return res.redirect('/home');
    const { getAllMissions, getUserMissions, getAllPolls } = require('../db/pool');
    const allMissions  = await getAllMissions();
    const userMissions = await getUserMissions(name);
    const allPolls     = await getAllPolls();
    const doneIds      = new Set(userMissions.map(function(m) { return m.mission_id; }));

    // missions section
    const activeMissions = allMissions.filter(function(m) { return m.status === 'active'; });
    let missionsHtml = activeMissions.length === 0
      ? '<p style="color:#555;font-size:13px">No missions yet.</p>'
      : activeMissions.map(function(m) {
          const done = doneIds.has(m.id);
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<span style="font-size:13px;color:' + (done?'#4ade80':'#aaa') + '">' + escape(m.title) + '</span>' +
            '<span style="font-size:12px;color:' + (done?'#4ade80':'#555') + '">' + (done?'Done':'Pending') + '</span>' +
          '</div>';
        }).join('');

    // polls section
    const votedPolls = allPolls.filter(function(p) { return user.voted && user.voted[p.id]; });
    let pollsHtml = votedPolls.length === 0
      ? '<p style="color:#555;font-size:13px">No votes yet.</p>'
      : votedPolls.map(function(p) {
          const optIndex = user.voted[p.id].optIndex;
          return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<div style="font-size:13px;color:#aaa">' + escape(p.question) + '</div>' +
            '<div style="font-size:12px;color:#fbbf24;margin-top:3px">Voted: ' + escape(p.options[optIndex]) + '</div>' +
          '</div>';
        }).join('');

    const lastVisit = user.last_visit
      ? new Date(user.last_visit).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : 'Never';

    res.send(page('My Profile',
      '<h1>My Profile</h1>' +
      '<h2>' + escape(user.hive_name) + '</h2>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:12px">' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#fbbf24">' + (user.points||0).toFixed(1) + '</div><div style="font-size:12px;color:#666">Points</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#60a5fa">' + (user.book||0) + '</div><div style="font-size:12px;color:#666">Book</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#4ade80">' + (user.games||0) + '</div><div style="font-size:12px;color:#666">Games</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#f87171">' + (user.volunteers||0) + '</div><div style="font-size:12px;color:#666">Volunteers</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#a78bfa">' + (user.film||0) + '</div><div style="font-size:12px;color:#666">Film</div></div>' +
        '</div>' +
        '<p style="font-size:12px;color:#555;margin:12px 0 0;text-align:center">Last visit: ' + lastVisit + '</p>' +
      '</div>' +

      '<h2 style="text-align:left;font-size:15px;margin-bottom:8px">Missions</h2>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:left">' +
        missionsHtml +
      '</div>' +

      '<h2 style="text-align:left;font-size:15px;margin-bottom:8px">My Votes</h2>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:left">' +
        pollsHtml +
      '</div>' +

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
