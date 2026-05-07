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

function tierBar(points) {
  var idx      = getTier(points);
  var tier     = TIERS[idx];
  var nextTier = TIERS[idx + 1];
  var html     = '<div style="margin:16px 0">';

  TIERS.forEach(function(t, i) {
    var active  = i === idx;
    var unlocked = i <= idx;
    var future  = i > idx;
    html += '<div style="display:inline-block;text-align:center;width:19%;margin:0 0.4%">' +
      '<div style="font-size:16px;opacity:' + (future ? '0.3' : '1') + '">' + t.emoji + '</div>' +
      '<div style="font-size:9px;color:' + (active ? t.color : (future ? '#444' : '#666')) + ';font-weight:' + (active ? '700' : '400') + ';margin-top:2px">' + t.name + '</div>' +
      '<div style="font-size:8px;color:#444;margin-top:1px">' + t.min + '+ pts</div>' +
      (active ? '<div style="width:6px;height:6px;border-radius:50%;background:' + t.color + ';margin:3px auto 0"></div>' : '') +
    '</div>';
  });

  if (nextTier) {
    var progress = Math.min(100, Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100));
    html += '<div style="margin-top:10px">' +
      '<div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:4px">' +
        '<span>' + tier.name + '</span>' +
        '<span>' + (nextTier.min - points) + ' pts to ' + nextTier.name + '</span>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.08);border-radius:999px;height:6px">' +
        '<div style="background:' + tier.color + ';height:6px;border-radius:999px;width:' + progress + '%"></div>' +
      '</div>' +
    '</div>';
  } else {
    html += '<div style="margin-top:8px;font-size:11px;color:#a78bfa">Maximum tier reached!</div>';
  }

  html += '</div>';
  return html;
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

    const points   = user.points || 0;
    const tierIdx  = getTier(points);
    const tier     = TIERS[tierIdx];

    // Tier 2+ — who checked in today
    let checkinSection = '';
    if (tierIdx >= 1) {
      const today = Date.now() - DAY;
      const r     = await pool.query('SELECT hive_name, last_visit FROM users WHERE last_visit > $1 ORDER BY last_visit DESC LIMIT 10', [today]);
      const checkins = r.rows;
      const checkinRows = checkins.length === 0
        ? '<p style="color:#555;font-size:13px">No check-ins yet today.</p>'
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
            '<span style="font-size:13px;font-weight:600;color:#fff">Who checked in today</span>' +
            '<span style="font-size:11px;color:#60a5fa">' + checkins.length + ' members</span>' +
          '</div>' +
          checkinRows +
        '</div>';
    } else {
      checkinSection =
        '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left;opacity:0.5">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-size:13px;font-weight:600;color:#fff">Who checked in today</span>' +
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
    let missionsHtml   = '';
    if (active.length === 0) {
      missionsHtml = '<p style="color:#555;font-size:13px">No active missions right now.</p>';
    } else {
      missionsHtml = active.slice(0, 3).map(function(m) {
        const done = doneIds.has(m.id);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
          '<span style="font-size:13px;color:' + (done ? '#4ade80' : '#aaa') + '">' + (done ? '✓ ' : '') + escape(m.title) + '</span>' +
          '<span style="font-size:11px;color:' + (done ? '#4ade80' : '#fbbf24') + '">' + (done ? 'Done' : '+' + m.reward_amount + ' ' + m.reward_type) + '</span>' +
        '</div>';
      }).join('');
    }

    // Active polls preview
    const allPolls  = await getAllPolls();
    const activePolls = allPolls.filter(function(p) { return p.status === 'active'; });
    let pollsHtml = '';
    if (activePolls.length === 0) {
      pollsHtml = '<p style="color:#555;font-size:13px">No active polls right now.</p>';
    } else {
      pollsHtml = activePolls.slice(0, 2).map(function(p) {
        const voted = user.voted && user.voted[p.id];
        return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
          '<div style="font-size:13px;color:#aaa">' + escape(p.question) + '</div>' +
          (voted ? '<div style="font-size:11px;color:#4ade80;margin-top:2px">Voted</div>' : '<div style="font-size:11px;color:#60a5fa;margin-top:2px">Tap to vote</div>') +
        '</div>';
      }).join('');
    }

    // Coming soon tiers
    const comingSoon = TIERS.slice(2).map(function(t, i) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);opacity:0.4">' +
        '<span style="font-size:18px">' + t.emoji + '</span>' +
        '<div>' +
          '<div style="font-size:13px;color:#aaa">' + t.name + ' — ' + t.min + '+ points</div>' +
          '<div style="font-size:11px;color:#555">Coming soon</div>' +
        '</div>' +
        '<span style="margin-left:auto;font-size:11px;color:#555">🔒</span>' +
      '</div>';
    }).join('');

    res.send(page('Home',
      '<h1 style="font-size:1.5rem;margin-bottom:2px">Witamy w Krolestwie!</h1>' +
      '<h2 style="font-size:1rem;color:#888;margin-bottom:16px">Hey, <strong style="color:' + tier.color + '">' + escape(user.hive_name) + '</strong></h2>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px">' +
          '<span style="font-size:20px">' + tier.emoji + '</span>' +
          '<span style="font-size:18px;font-weight:700;color:' + tier.color + '">' + tier.name + '</span>' +
        '</div>' +
        '<div style="font-size:36px;font-weight:700;color:#fbbf24;margin:8px 0 4px">' + points.toFixed(1) + '</div>' +
        '<div style="font-size:12px;color:#666;margin-bottom:12px">points</div>' +
        '<div style="display:flex;justify-content:center;gap:16px;margin-bottom:12px">' +
          '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#60a5fa">' + (user.book||0) + '</div><div style="font-size:10px;color:#666">Book</div></div>' +
          '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#4ade80">' + (user.games||0) + '</div><div style="font-size:10px;color:#666">Games</div></div>' +
          '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#f87171">' + (user.volunteers||0) + '</div><div style="font-size:10px;color:#666">Volunteers</div></div>' +
          '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#a78bfa">' + (user.film||0) + '</div><div style="font-size:10px;color:#666">Film</div></div>' +
        '</div>' +
        tierBar(points) +
      '</div>' +

      checkinSection +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">Active Missions</span>' +
          '<a href="/missions" style="font-size:11px;color:#60a5fa;text-decoration:none">See all</a>' +
        '</div>' +
        missionsHtml +
      '</div>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">Active Polls</span>' +
          '<a href="/polls" style="font-size:11px;color:#60a5fa;text-decoration:none">Vote</a>' +
        '</div>' +
        pollsHtml +
      '</div>' +

      (tierIdx === 0
        ? '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
            '<div style="font-size:13px;font-weight:600;color:#fbbf24;margin-bottom:6px">🔓 Reach 10 points to unlock</div>' +
            '<div style="font-size:12px;color:#aaa;margin-bottom:4px">✓ Who checked in today</div>' +
            '<div style="font-size:11px;color:#555;margin-top:8px">Keep checking in and earning coins to level up!</div>' +
          '</div>'
        : '') +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">📅 Upcoming Events</span>' +
          '<a href="/events" style="font-size:11px;color:#60a5fa;text-decoration:none">See all</a>' +
        '</div>' +
        '<p style="font-size:13px;color:#aaa;margin:0 0 10px">Check out what\'s happening at Krolestwo bez Kresu.</p>' +
        '<a href="https://lu.ma/kbk.events" class="btn btn-gold" style="font-size:13px;padding:8px">View Events on Luma</a>' +
      '</div>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
        '<div style="margin-bottom:10px">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">Upcoming Tiers</span>' +
        '</div>' +
        comingSoon +
      '</div>' +
    

      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== LEADERBOARD ====================

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
          const tierIdx = getTier(u.points || 0);
          const tier    = TIERS[tierIdx];
          return '<tr><td style="color:#fbbf24;font-weight:700">' + (medals[i]||i+1) + '</td>' +
            '<td>' + tier.emoji + ' ' + escape(u.hive_name) + '</td>' +
            '<td style="color:#fbbf24;font-weight:700">' + (u[type]||0) + '</td></tr>';
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

    const activeMissions = allMissions.filter(function(m) { return m.status === 'active'; });
    const missionsHtml = activeMissions.length === 0
      ? '<p style="color:#555;font-size:13px">No missions yet.</p>'
      : activeMissions.map(function(m) {
          const done = doneIds.has(m.id);
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<span style="font-size:13px;color:' + (done?'#4ade80':'#aaa') + '">' + escape(m.title) + '</span>' +
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

    const rcr = user.rcr_balance || 0;
    const lastVisit = user.last_visit
      ? new Date(user.last_visit).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : 'Never';

    res.send(page('My Profile',
      '<h1>My Profile</h1>' +
      '<div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-bottom:16px">' +
        '<span style="font-size:24px">' + tier.emoji + '</span>' +
        '<h2 style="margin:0;color:' + tier.color + '">' + escape(user.hive_name) + '</h2>' +
      '</div>' +
      '<div style="display:inline-block;background:rgba(255,255,255,0.07);border-radius:999px;padding:4px 16px;font-size:13px;color:' + tier.color + ';margin-bottom:16px">' + tier.name + '</div>' +

      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:12px">' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#fbbf24">' + points.toFixed(1) + '</div><div style="font-size:12px;color:#666">Points</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#60a5fa">' + (user.book||0) + '</div><div style="font-size:12px;color:#666">Book</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#4ade80">' + (user.games||0) + '</div><div style="font-size:12px;color:#666">Games</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#f87171">' + (user.volunteers||0) + '</div><div style="font-size:12px;color:#666">Volunteers</div></div>' +
          '<div style="text-align:center"><div style="font-size:24px;font-weight:700;color:#a78bfa">' + (user.film||0) + '</div><div style="font-size:12px;color:#666">Film</div></div>' +
        '</div>' +
        '<p style="font-size:12px;color:#555;margin:12px 0 0;text-align:center">Last visit: ' + lastVisit + '</p>' +
      '</div>' +

'<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;font-weight:600;color:#fff">RCR Balance</span>' +
          '<span style="font-size:11px;color:#555">Krolestwo community coin</span>' +
        '</div>' +
        '<div style="font-size:28px;font-weight:700;color:#fbbf24;margin-top:8px">' + rcr.toLocaleString() + ' <span style="font-size:14px;color:#888">RCR</span></div>' +
      '</div>' +
      '<h2 style="text-align:left;font-size:15px;margin-bottom:8px">Missions</h2>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:left">' + missionsHtml + '</div>' +

      '<h2 style="text-align:left;font-size:15px;margin-bottom:8px">My Votes</h2>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:left">' + pollsHtml + '</div>' +

      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;