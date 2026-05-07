'use strict';

const express = require('express');
const router  = express.Router();

const { DAY }                                          = require('../config');
const { pool, getAllowedNames, getUser, upsertUser, getAllMissions, getUserMissions, getAllPolls } = require('../db/pool');
const { isAdmin, getUserFromCookie }                   = require('../middleware/session');
const { escape, page, navBar }                        = require('../views/layout');

// ==================== TIERS ====================

const TIERS = [
  { name: 'Newcomer',  min: 0,   max: 9,   color: '#aaa',    emoji: '🌱' },
  { name: 'Resident',  min: 10,  max: 19,  color: '#60a5fa', emoji: '🏠' },
  { name: 'Regular',   min: 20,  max: 49,  color: '#4ade80', emoji: '⭐' },
  { name: 'Elder',     min: 50,  max: 99,  color: '#fbbf24', emoji: '🔥' },
  { name: 'Legend',    min: 100, max: null, color: '#a78bfa', emoji: '👑' },
];

function getTier(points) {
  for (var i = TIERS.length - 1; i >= 0; i--) {
    if (points >= TIERS[i].min) return i;
  }
  return 0;
}

function progressBar(points) {
  var idx      = getTier(points);
  var tier     = TIERS[idx];
  var nextTier = TIERS[idx + 1];
  if (!nextTier) return '<p style="font-size:12px;color:#a78bfa;margin:8px 0 0">Maximum tier reached! 👑</p>';
  var progress = Math.min(100, Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100));
  return '<div style="margin-top:10px">' +
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:4px">' +
      '<span>' + tier.name + '</span>' +
      '<span>' + (nextTier.min - points) + ' pts to ' + nextTier.name + ' ' + nextTier.emoji + '</span>' +
    '</div>' +
    '<div style="background:rgba(255,255,255,0.08);border-radius:999px;height:6px">' +
      '<div style="background:' + tier.color + ';height:6px;border-radius:999px;width:' + progress + '%"></div>' +
    '</div>' +
  '</div>';
}

// ==================== HOME ====================

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

    const points  = user.points || 0;
    const tierIdx = getTier(points);
    const tier    = TIERS[tierIdx];

    // Who checked in today (Tier 2+)
    let checkinSection = '';
    if (tierIdx >= 1) {
      const today    = Date.now() - DAY;
      const r        = await pool.query('SELECT hive_name, last_visit FROM users WHERE last_visit > $1 ORDER BY last_visit DESC LIMIT 10', [today]);
      const checkins = r.rows;
      const checkinRows = checkins.length === 0
        ? '<p style="color:#555;font-size:13px;margin:0">No check-ins yet today.</p>'
        : checkins.map(function(u) {
            const time = new Date(u.last_visit).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
            return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
              '<div style="width:26px;height:26px;border-radius:50%;background:rgba(96,165,250,0.15);display:flex;align-items:center;justify-content:center;font-size:11px;color:#60a5fa;flex-shrink:0">' + escape(u.hive_name.charAt(0).toUpperCase()) + '</div>' +
              '<span style="font-size:13px;color:#aaa">' + escape(u.hive_name) + '</span>' +
              '<span style="margin-left:auto;font-size:11px;color:#555">' + time + '</span>' +
            '</div>';
          }).join('');
      checkinSection =
        '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
            '<span style="font-size:13px;font-weight:600;color:#fff">👥 Who\'s here today</span>' +
            '<span style="font-size:11px;color:#60a5fa">' + checkins.length + ' members</span>' +
          '</div>' +
          checkinRows +
        '</div>';
    } else {
      checkinSection =
        '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left;opacity:0.5">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-size:13px;font-weight:600;color:#fff">👥 Who\'s here today</span>' +
            '<span style="font-size:11px;color:#fbbf24">🔒 Resident</span>' +
          '</div>' +
          '<p style="font-size:12px;color:#555;margin:8px 0 0">Reach 10 points to unlock</p>' +
        '</div>';
    }

    // Active missions preview
    const allMissions  = await getAllMissions();
    const userMissions = await getUserMissions(name);
    const doneIds      = new Set(userMissions.map(function(m) { return m.mission_id; }));
    const active       = allMissions.filter(function(m) { return m.status === 'active'; });
    const pendingMissions = active.filter(function(m) { return !doneIds.has(m.id); });
    let missionsHtml = pendingMissions.length === 0
      ? '<p style="color:#4ade80;font-size:13px;margin:0">All missions completed! 🎉</p>'
      : pendingMissions.slice(0, 2).map(function(m) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<span style="font-size:13px;color:#aaa">' + escape(m.title) + '</span>' +
            '<span style="font-size:11px;color:#fbbf24">+' + m.reward_amount + ' ' + m.reward_type + '</span>' +
          '</div>';
        }).join('');

    // Active polls preview
    const allPolls    = await getAllPolls();
    const activePolls = allPolls.filter(function(p) { return p.status === 'active'; });
    const unvotedPolls = activePolls.filter(function(p) { return !user.voted || !user.voted[p.id]; });
    let pollsHtml = unvotedPolls.length === 0
      ? '<p style="color:#4ade80;font-size:13px;margin:0">All polls voted! 🗳️</p>'
      : unvotedPolls.slice(0, 2).map(function(p) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<span style="font-size:13px;color:#aaa">' + escape(p.question) + '</span>' +
            '<a href="/polls" style="font-size:11px;color:#60a5fa;text-decoration:none;white-space:nowrap;margin-left:8px">Vote</a>' +
          '</div>';
        }).join('');

    // Coming soon tiers
    const comingSoon = TIERS.slice(tierIdx + 1).map(function(t) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);opacity:0.4">' +
        '<span style="font-size:18px">' + t.emoji + '</span>' +
        '<div><div style="font-size:13px;color:#aaa">' + t.name + ' — ' + t.min + '+ pts</div>' +
        '<div style="font-size:11px;color:#555">Coming soon</div></div>' +
        '<span style="margin-left:auto;font-size:11px;color:#555">🔒</span>' +
      '</div>';
    }).join('');

    res.send(page('Home',
      // Hero — compact, community feel
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
          '<div style="text-align:left">' +
            '<div style="font-size:12px;color:#666;margin-bottom:2px">Welcome back</div>' +
            '<div style="font-size:18px;font-weight:700;color:' + tier.color + '">' + tier.emoji + ' ' + escape(user.hive_name) + '</div>' +
            '<div style="font-size:12px;color:#666;margin-top:2px">' + tier.name + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:32px;font-weight:700;color:#fbbf24">' + points.toFixed(1) + '</div>' +
            '<div style="font-size:11px;color:#666">points</div>' +
          '</div>' +
        '</div>' +
        progressBar(points) +
      '</div>' +

      checkinSection +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">🎯 Open Missions</span>' +
          '<a href="/missions" style="font-size:11px;color:#60a5fa;text-decoration:none">See all</a>' +
        '</div>' +
        missionsHtml +
      '</div>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">🗳️ Active Polls</span>' +
          '<a href="/polls" style="font-size:11px;color:#60a5fa;text-decoration:none">Vote</a>' +
        '</div>' +
        pollsHtml +
      '</div>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">📅 Events</span>' +
          '<a href="/events" style="font-size:11px;color:#60a5fa;text-decoration:none">See all →</a>' +
        '</div>' +
        '<p style="font-size:12px;color:#555;margin:6px 0 0">Upcoming at Krolestwo bez Kresu</p>' +
      '</div>' +

      (comingSoon ? '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="margin-bottom:10px"><span style="font-size:13px;font-weight:600;color:#fff">🔓 Unlock next</span></div>' +
        comingSoon +
      '</div>' : '') +

      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== LEADERBOARD ====================

router.get('/leaderboard', async function(req, res) {
  const validTypes = ['points','book','games','volunteers','film','rcr_balance'];
  const type = validTypes.includes(req.query.type) ? req.query.type : 'points';
  try {
    const r     = await pool.query('SELECT * FROM users ORDER BY ' + type + ' DESC LIMIT 20');
    const users = r.rows;
    const medals = ['1st','2nd','3rd'];
    const rows = users.length === 0
      ? '<tr><td colspan="3" style="color:#555;padding:20px;text-align:center">No players yet</td></tr>'
      : users.map(function(u, i) {
          const tierIdx = getTier(u.points || 0);
          const tier    = TIERS[tierIdx];
          return '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i]||i+1) + '</td>' +
            '<td>' + tier.emoji + ' ' + escape(u.hive_name) + '</td>' +
            '<td style="color:#fbbf24;font-weight:700">' + (u[type]||0) + '</td></tr>';
        }).join('');
    const tabLabels = { points:'Points', book:'Book', games:'Games', volunteers:'Volunteers', film:'Film', rcr_balance:'RCR' };
    const tabs = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      validTypes.map(function(t) {
        return '<a href="/leaderboard?type=' + t + '" class="btn ' + (type===t?'btn-gold':'btn-gray') + ' btn-sm">' + tabLabels[t] + '</a>';
      }).join('') + '</div>';
    res.send(page('Leaderboard',
      '<h1>Leaderboard</h1>' + tabs +
      '<table><tr><th>#</th><th>Player</th><th>' + tabLabels[type] + '</th></tr>' + rows + '</table>' +
      '<a class="link" href="/home">Back</a>'
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== PROFILE ====================

router.get('/profile', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const user = await getUser(name);
    if (!user) return res.redirect('/home');
    const allMissions  = await getAllMissions();
    const userMissions = await getUserMissions(name);
    const allPolls     = await getAllPolls();
    const doneIds      = new Set(userMissions.map(function(m) { return m.mission_id; }));
    const points       = user.points || 0;
    const tierIdx      = getTier(points);
    const tier         = TIERS[tierIdx];
    const rcr          = user.rcr_balance || 0;

    const activeMissions = allMissions.filter(function(m) { return m.status === 'active'; });
    const missionsHtml = activeMissions.length === 0
      ? '<p style="color:#555;font-size:13px">No missions yet.</p>'
      : activeMissions.map(function(m) {
          const done = doneIds.has(m.id);
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<span style="font-size:13px;color:' + (done?'#4ade80':'#aaa') + '">' + (done?'✓ ':'') + escape(m.title) + '</span>' +
            '<span style="font-size:12px;color:' + (done?'#4ade80':'#555') + '">' + (done?'Done':'Pending') + '</span>' +
          '</div>';
        }).join('');

    const votedPolls = allPolls.filter(function(p) { return user.voted && user.voted[p.id]; });
    const pollsHtml = votedPolls.length === 0
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

    const nextTier = TIERS[tierIdx + 1];
    const progress = nextTier ? Math.min(100, Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100)) : 100;

    res.send(page('My Profile',
      // Identity card header
      '<div style="background:linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03));border-radius:16px;padding:20px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1)">' +
        '<div style="font-size:36px;margin-bottom:8px">' + tier.emoji + '</div>' +
        '<div style="font-size:20px;font-weight:700;color:' + tier.color + ';margin-bottom:2px">' + escape(user.hive_name) + '</div>' +
        '<div style="font-size:13px;color:#666;margin-bottom:16px">' + tier.name + ' · Last visit: ' + lastVisit + '</div>' +
        // Stats grid
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
          '<div style="background:rgba(251,191,36,0.1);border-radius:10px;padding:10px;text-align:center">' +
            '<div style="font-size:22px;font-weight:700;color:#fbbf24">' + points.toFixed(1) + '</div>' +
            '<div style="font-size:10px;color:#666">Points</div>' +
          '</div>' +
          '<div style="background:rgba(96,165,250,0.1);border-radius:10px;padding:10px;text-align:center">' +
            '<div style="font-size:22px;font-weight:700;color:#60a5fa">' + rcr.toLocaleString() + '</div>' +
            '<div style="font-size:10px;color:#666">RCR</div>' +
          '</div>' +
          '<div style="background:rgba(74,222,128,0.1);border-radius:10px;padding:10px;text-align:center">' +
            '<div style="font-size:22px;font-weight:700;color:#4ade80">' + doneIds.size + '/' + activeMissions.length + '</div>' +
            '<div style="font-size:10px;color:#666">Missions</div>' +
          '</div>' +
        '</div>' +
        // Coins row
        '<div style="display:flex;justify-content:space-around;padding:12px 0;border-top:1px solid rgba(255,255,255,0.07);border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:12px">' +
          '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#60a5fa">' + (user.book||0) + '</div><div style="font-size:10px;color:#555">Book</div></div>' +
          '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#4ade80">' + (user.games||0) + '</div><div style="font-size:10px;color:#555">Games</div></div>' +
          '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#f87171">' + (user.volunteers||0) + '</div><div style="font-size:10px;color:#555">Volunteers</div></div>' +
          '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#a78bfa">' + (user.film||0) + '</div><div style="font-size:10px;color:#555">Film</div></div>' +
        '</div>' +
        // Tier progress
        (nextTier
          ? '<div><div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:4px"><span>' + tier.name + '</span><span>' + (nextTier.min - points) + ' pts to ' + nextTier.name + '</span></div>' +
            '<div style="background:rgba(255,255,255,0.08);border-radius:999px;height:6px"><div style="background:' + tier.color + ';height:6px;border-radius:999px;width:' + progress + '%"></div></div></div>'
          : '<div style="font-size:12px;color:#a78bfa">Maximum tier reached! 👑</div>') +
      '</div>' +

      '<h2 style="text-align:left;font-size:14px;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Missions</h2>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:left">' + missionsHtml + '</div>' +

      '<h2 style="text-align:left;font-size:14px;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">My Votes</h2>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:left">' + pollsHtml + '</div>' +

      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;