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
    if (true) {
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

      (true
        ? '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
              '<span style="font-size:13px;font-weight:600;color:#fff">🎶 Music</span>' +
              '<a href="/music" style="font-size:11px;color:#60a5fa;text-decoration:none">Open →</a>' +
            '</div>' +
            '<p style="font-size:12px;color:#555;margin:6px 0 0">Songs &amp; lyrics for the event</p>' +
          '</div>'
        : '') +

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
    const { getRCRTBalance } = require('../services/hive');
    const rcrt         = await getRCRTBalance(name);

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
          '<div style="background:rgba(52,211,153,0.1);border-radius:10px;padding:10px;text-align:center">' +
            '<div style="font-size:22px;font-weight:700;color:#34d399">' + rcrt.toFixed(2) + '</div>' +
            '<div style="font-size:10px;color:#666">RCRT</div>' +
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

// ==================== MUSIC ====================

const SONGS = [
  {
    artist: 'Elektryczne Gitary',
    title: 'Jestem z miasta',
    lyrics: `Jestem z miasta, jestem z miasta
Jestem z miasta, to widać
Jestem z miasta, to słychać
Jestem z miasta, to widać słychać i czuć (jeszcze raz)

W cieniu sufitów, w świetle przewodów
W objęciach biurek w krokach obchodów
Rodzą się rzeczy jasne i ciemne
Ja nie rozróżniam ich, nie ufam, więc...

Ref. Jestem z miasta...

W rytmie zachodów, w słowach kamieni
W spojrzeniu ptaków, w mowie przestrzeni
Rodzi się spokój - mówią, po jednym roku
Leczą się myśli, mnie to nie bierze

Ref. Jestem z miasta...

W świetle przewodów, w cieniu sufitów
W wietrze oddechów, w błocie napisów
Rodzą się szajby małe i biedne
Karmię się nimi i karmić się będę

Ref. Jestem z miasta...`
  },
  {
    artist: 'Elektryczne Gitary',
    title: 'Włosy',
    lyrics: `Włosy masz długie jak noc
Oczy jak gwiazdy co świecą
Włosy masz długie jak noc
I uśmiech co serce porywa

Idę za tobą przez miasto
Przez ulice i place
Idę za tobą przez miasto
Choć wiem że to na nic

Włosy masz długie jak noc
Włosy masz długie jak noc`
  },
  {
    artist: 'Elektryczne Gitary',
    title: 'Człowiek z liściem na głowie',
    lyrics: `Szedł sobie człowiek przez las
Wsiadł do autobusu człowiek z liściem na głowie
Nikt go nie poratuje nikt mu nic nie powie
Tylko się każdy gapi
Tylko się każdy gapi i nic

Siedzi w autobusie człowiek z liściem na głowie
O liściu w swych rzadkich włosach
Nieprędko się dowie
Tylko się w okno gapi
Tylko sie w okno gapi i nic

Uważaj to nie chmury
To pałac kultury
Liście lecą z drzew
Liście lecą z drzew

I tak siedzi w autobusie człowiek z liściem na głowie
Nikt go nie poratuje nikt mu nic nie powie
Tylko się każdy gapi
Tylko się każdy gapi i nic

Wsiadł drugi podobny
Nad człowiekiem się zlitował
Tamten się pogłaskał w główkę liścia sobie schował
Bo ja mówi jestem z lasu
Bo ja mówi jestem z lasu i już

Uważaj to nie chmury
To pałac kultury
Liście lecą z drzew
Liście lecą z drzew

Uważaj to nie chmury
To pałac kultury
Liście lecą z drzew
Liście lecą z drzew`
  },
  {
    artist: 'Elektryczne Gitary',
    title: 'Dzieci',
    lyrics: `Dzieci bawią się na podwórku
Dzieci wesoło wybiegły ze szkoły
Zapaliły papierosy, wyciągnęły flaszki
Chodnik zapluły, ludzi przepędziły
Siedzą na ławeczkach i ryczą do siebie

Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej
Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej

Tony papieru, tomy analiz
Genialne myśli, tłumy na sali
Godziny modlitw, lata nauki
Przysięgi, plany, podpisy, druki

Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej
Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej

Wzorce, przykłady, szlachetne zabiegi
Łańcuchy dłoni, zwarte szeregi
Warstwy tradycji, wieki kultury
Tydzień dobroci, ręce do góry

Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej
Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej

Dzieci wesoło wybiegły ze szkoły
Zapaliły papierosy, wyciągnęły flaszki
Chodnik zapluły, ludzi przepędziły
Siedzą na ławeczkach i ryczą do siebie

Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej
Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej

Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej
Wszyscy mamy źle w głowach, że żyjemy
Hej, hej, la, la, la, la, hej, hej, hej, hej`
  },
  {
    artist: 'Urszula',
    title: 'Na sen',
    lyrics: `Zamknij oczy i zaśnij
1. Na sen
Nigdy już nie wezmę nic
Ja to wiem
Odejść łatwiej jest niż żyć
I na morzu naszych wspólnych lat
Liczę wyspy pełne smutnych dat
Aksamitne rafy
Gdy byliśmy tak szczęśliwi
Widzę nasze drzewa
Które wygiął czas
Ja znam
Naszą miłość pełną burz
Czasem tnie
W obie strony tak jak nóż
I głęboko rani ciebie mnie
Razem ciężko żyć - osobno źle
Chyba zawsze już
Tak będziemy pogmatwani
Wspólny adres nasze dzieci sny
Więc pomóż mi odnaleźć tamte dni

Ref: Pomóż mi odnaleźć
Nasze najpiękniejsze dni
Zaczaruj moje serce
Zostaw mnie bez tchu raz jeszcze
Pomóż mi kochać
Wyryj w moim sercu siebie
Zrób to przecież wiesz
To nie boli mnie.

2. Dziwne
Jak mi mało trzeba snu
Słyszę znów
Mego życia słaby puls
Miłość jest jak deszcz
Który spływa po mnie aż do stóp
Sama obok siebie
Jestem znowu tu

Ref: Pomóż mi odnaleźć
Nasze najpiękniejsze dni
Zaczaruj moje serce
Zostaw mnie bez tchu raz jeszcze
Pomóż mi kochać
Wyryj w moim sercu siebie
Zrób to przecież wiesz
To nie boli mnie.

3. Na sen
Lubię dotyk twoich rąk
Boję się
Kiedy w snach odchodzisz stąd
Dokąd płyniesz
Proszę powiedz mi
O czym śpiewasz
Gdy nie słyszy nikt
Nie uciekaj już
Przed marzeniem co oślepia nas
Przecież ja od dawna widzę tylko mrok
Nigdy już nie wezmę nic na sen
Boję się swoich ciemnych cichych miejsc`
  },
  {
    artist: 'Wilki',
    title: 'Baśka',
    lyrics: `Baśka, Baśka, gdzie ty jesteś
Baśka miała fajny biust,
Ania – styl, a Zośka – coś, co lubię.
Ela całowała cudnie,
Nawet tuż po swoim ślubie.
Z Kaśką można było konie kraść,
Chociaż wiem,
Że chciała przeżyć ze mną swój pierwszy raz.
Magda – zło, Jolka mnie
Zagłaskałaby na śmierć,
A Agnieszka zdradzała mnie.

Piękne jak okręt
Pod pełnymi żaglami,
Jak konie w galopie,
Jak niebo nad nami.

Karolina – w Hollywood,
Z Aśką nigdy nie było tak samo.
Ewelina zimna jak lód,
Więc na noc umówiłem się z Alą.
Wszystko mógłbym Izie dać,
Tak jak Oli,
Ale one wcale nie chciały brać.
Małgorzata – jeden grzech,
Aż onieśmielała mnie,
A Monika była okej.

Piękne jak okręt
Pod pełnymi żaglami,
Jak konie w galopie,
Jak niebo nad nami. (x2)
`
  },
  {
    artist: 'Krzysztof Krawczyk',
    title: 'Bo jesteś ty',
    lyrics: `Bo jesteś ty, bo jesteś ty
Na zewnątrz mgła, tylko ziąb i deszcz
A dla mnie świat w ciepłym świetle świec
Powietrze ma elektryczny smak
Chciałbym tak trwać nawet tysiąc lat

Bo jesteś Ty
Znów przy mnie budzisz się
Bo jesteś Ty
I wciąż czuję, że...
Bo jesteś Ty
Cóż więcej mógłbym chcieć?
Bo jesteś tu
I proszę zostań już

Ja chciałbym tak zawsze biec pod wiatr
Nie liczyć dni, ciągle zmieniać twarz
Sprawić by czas wciąż omijał mnie
Wszystko to już dziś nie liczy się

Bo jesteś Ty
Zaczynasz ze mną dzień
Bo jesteś wciąż
Gdy zaczyna się noc
Już wszystko mam
Cóż więcej mógłbym chcieć?
Bo jesteś tu
I zawsze tu bądź

Bo jesteś Ty
Znów przy mnie budzisz się
Bo jesteś Ty
I wciąż czuję, że...
Bo jesteś Ty
Cóż więcej mógłbym chcieć?
Bo jesteś tu
I proszę zostań już

Bo jesteś Ty...`
  },
  {
    artist: 'Krzysztof Krawczyk',
    title: 'Trudno tak',
    lyrics: `Trudno tak żyć bez ciebie
(Bartosiewicz:)
Trudno tak
Razem być nam ze sobą
Bez siebie nie jest lżej

(Krawczyk;)
Ulice odbijają szary smutek nieba
W sercu czuję chłód samotnej nocy
Zapach czarnej kawy
Filiżanki ciepło
Jak przystań, gdy wokół
Burzy się szaleństwo

Zasłonięte okna
Cieniste podwórza
Tych cichych dramatów
Sceny niezliczone
Gdy sił mi brak
Śnię o słonecznych czasach
Tych wspólnie z tobą spędzonych

(Bartosiewicz:)
Trudno tak
Razem być nam ze sobą
Bez siebie nie jest lżej

Lecz trzeba nam
Trzeba dbać o tę miłość
Nie wolno stracić jej
Nam nie wolno stracić jej

W twoim śnie jestem gwiazdą
Ze starego romansu
Twe łzy niczym kołdra
Na moim nagim ciele
Smak kawy cię budzi
A minuty wciąż płyną
Myśli ciążą bardziej
Niż wczorajsze wino

(Krawczyk i Bartosiewicz:)
Zasłonięte okna
Cieniste podwórza
Tych cichych dramatów
Sceny nie zliczone
Gdy sił mi brak
Śnię o słonecznych czasach
Tych wspólnie z tobą spędzonych

Trudno tak
Razem być nam ze sobą
Bez siebie nie jest lżej

Lecz trzeba nam
Trzeba dbać o tę miłość
Nie wolno stracić jej
Nam nie wolno stracić jej

(Bartosiewicz:)
Nie wolno stracić jej
(Krawczyk:)
Nie wolno stracić jej
(Bartosiewicz:)
Nie wolno stracić jej
(Krawczyk:)
Nam nie wolno stracić jej

(Bartosiewicz i Krawczyk:)
O, trudno tak
Razem być nam ze sobą
Bez siebie nie jest lżej

Lecz trzeba nam
Trzeba dbać o tę miłość
Nie wolno stracić jej
Nam nie wolno stracić jej

Nam nie wolno stracić jej
Nam nie wolno stracić jej
Choć trudno tak
Nam nie wolno stracić jej

Trudno razem być
Trudno razem być
Trudno razem być

(Krawczyk:)
Trudno tak razem być`
  },
  {
    artist: 'Varius Manx',
    title: 'Zamigotał świat',
    lyrics: `Zamigotał świat
Powiedz ile jeszcze spadnie gwiazd
Zanim odgadniemy noc
Ile serc uniesie stary świat
Zanim się obróci w proch
Powiedz jakich trzeba użyć słów
By powstrzymać ludzkie łzy
Ile jeszcze trzeba odkryć prawd
By prawdziwie zacząć żyć

Refren:
Zamigotał świat tysiącem barw
Tysiąc nowych pytań przywiał wiatr
Słońce świeci nocą księżyc za dnia
Coraz więcej ludzi coraz mniej nas
Ocal mnie nim utracę wiarę w sens

Powiedz jak ochronić dobre sny
Przed jaskrawym światłem dnia
Jaką siłę trzeba w sobie mieć
Żeby odbić się od dna
Powiedz jak pokonać w sobie gniew
I lepszym się stać
Dokąd iść gdy nie ma dokąd pójść
I skąd nadzieję brać

Refren:
Zamigotał świat tysiącem barw
Tysiąc nowych pytań przywiał wiatr
Słońce świeci nocą księżyc za dnia
Coraz więcej ludzi coraz mniej nas
Ocal mnie nim utracę wiarę w sens`
  },
  {
    artist: 'Hey',
    title: 'Teksański',
    lyrics: `Teksański, teksański
Herbata stygnie, zapada mrok
A pod piórem ciągle nic

Obowiązek obowiązkiem jest
Piosenka musi posiadać tekst
Gdyby chociaż mucha zjawiła się
Mogłabym ją zabić
A później to opisać

W moich słowach słoma czai się
Nie znaczą nic
Jeśli szukasz sensu, prawdy w nich
Zawiedziesz się

A może zmienić zasady gry?
Chcesz usłyszeć słowa
To sam je sobie wymyśl

Nabij diabła, chmurę śmierci weź
Pomoże Ci
Wnet twe myśli w słowa zmienią się
Wyśpiewasz je sam

Nabij diabła, chmurę śmierci weź
Pomoże Ci
Wnet twe myśli w słowa zmienią się
Wyśpiewasz je sam

Wyśpiewasz, wyśpiewasz je sam

Wyśpiewasz, wyśpiewasz je sam`
  },
  {
    artist: 'Marek Grechuta',
    title: 'Dni których nie znamy',
    lyrics: `Są takie dni których nie znamy
Tyle było dni, do utraty sił,
Do utraty tchu, tyle było chwil,
Gdy żałujesz tych, z których nie masz nic,
Jedno warto znać, jedno tylko wiedz:

Że ważne są tylko te dni, których jeszcze nie znamy,
Ważnych jest kilka tych chwil, tych, na które czekamy,
Ważne są tylko te dni, których jeszcze nie znamy,
Ważnych jest kilka tych chwil, tych na które czekamy.

Pewien znany ktoś, kto miał dom i sad,
Zgubił nagle sens i w złe kręgi wpadł,
Choć majątek prysł, on nie stoczył się,
Wytłumaczyć umiał sobie wtedy właśnie, że...

Że, ważne są tylko te dni, których jeszcze nie znamy,
Ważnych jest kilka tych chwil, tych na które czekamy,
Ważne są tylko te dni, których jeszcze nie znamy,
Ważnych jest kilka tych chwil, tych na które czekamy

Jak rozpoznać ludzi, których już nie znamy?
Jak pozbierać myśli z tych nieposkładanych?
Jak oddzielić nagle rozum swój od serca?
Jak usłyszeć siebie, w takim szumnym scherz'u (czyt.skercu)

Jak rozpoznać ludzi, których już nie znamy?
Jak pozbierać myśli z tych nieposkładanych?
Jak odnaleźć nagle radość i nadzieję?
Odpowiedzi szukaj, czasu jest niewiele.

Ważne są tylko te dni, których jeszcze nie znamy,
Ważnych jest kilka tych chwil, tych na które czekamy,
Ważne są tylko te dni, których jeszcze nie znamy,
Ważnych jest kilka tych chwil, na które czekamy.

Na na na na na na na na na...`
  },
  {
    artist: 'Strachy na Lachy',
    title: 'Piła tango',
    lyrics: `W Pile tańczyło się tango
Oto historia z kantem
Co podwójne ma dno
Gdyby napisał ją Dante
To nie tak by to szło

Grzesiek Kubiak, czyli Kuba rządził naszą podstawówką
Po lekcjach na boisku ganiał za mną z cegłówką
W Pile było jak w Chile, każdy miał czerwone ryło
Mniej lub bardziej to pamiętasz – spytaj jak to było
W czasach gdy nad Piłą jeszcze latały samoloty
Wojewoda Śliwiński kazał pomalować płoty
Potem wszystkie płoty w Pile miały kolor zieleni
Rogaczem na wieżowcu Piła witała jeleni

Statek Piła Tango
Czarna bandera
To tylko Piła Tango
Tańczysz to teraz
Płynie statek Piła Tango
Czarna Bandera
Ukłoń się świrom
Żyj, nie umieraj

Gruby jak armata Szczepan błąkał się po kuli ziemskiej
Trafił do Ameryki prosto z Legii Cudzoziemskiej
Baca w Londynie z buchami się sąsiedzi
Lżej się tam halucynuje, nikt go tam nie śledzi
Karawan z Holandii, on przyjechał tutaj wreszcie
Są już Kula, Czarny Dusioł – słychać strzały na mieście
Znam jednak takie miejsca, gdzie jest lepiej chodzić z nożem
Całe Górne i Podlasie – wszyscy są za Kolejorzem
(Hej Kolejorz!)

Statek Piła Tango
Czarna bandera
To tylko Piła Tango
Tańczysz to teraz
Płynie statek Piła Tango
Czarna Bandera
Ukłoń się świrom
Żyj, nie umieraj

Andrzej Kozak, Mandaryn? Znana postać medialna
Tyci przy nim jest kosmos, gaśnie gwiazda polarna
Jest tu Siwy, który w rękach niebezpieczne ma narzędzie
A kiedy Siwy tańczy – znaczy mordobicie będzie
U Budzików pod tytułem chleją nawet z gór szkieły
Zbigu śpi przy stoliku, ma nieczynny przełyk
Lecz spokojnie panowie, według mej najlepszej wiedzy
Najszersze gardła tu to mają z INRI koledzy
(Polej, polej!)

Statek Piła Tango
Czarna bandera
To tylko Piła Tango
Tańczysz to teraz
Płynie statek Piła Tango
Czarna Bandera
Ukłoń się świrom
Żyj, nie umieraj

Nad rzeką, latem ferajna na grilla się zasadza
Auta z Niemiec? Sam wiem kto je tu sprowadza
Żaden spleen i cud, na ulicach nie śpią złotówki
W Pile Święta jest Rodzina i święte są żarówki
Nic nie szkodzi, że z wieczora miasto dławi się w fetorach
Ważne, że jest żużel i kiełbasy senatora!
Fajne z Wincentego Pola idą w świat dziewczyny
Po pokładzie jeździ Jojo bicyklem z Ukrainy

Statek Piła Tango
Czarna bandera
To tylko Piła Tango
Tańczysz to teraz
Płynie statek Piła Tango
Czarna Bandera
Ukłoń się świrom
Żyj, nie umieraj

Oto historia z kantem
Co podwójne ma dno
Gdyby napisał ją Dante
To nie tak by to szło
(By szło, by szło)
`
  },
  {
    artist: 'Dżem',
    title: 'Wehikuł czasu',
    lyrics: `Wsiadam do wehikułu czasu
Pamiętam dobrze ideał swój
Marzeniami żyłem jak król
Siódma rano to dla mnie noc
Pracować nie chciałem, włóczyłem się

Za to do puszki zamykano mnie
Za to zwykle zamykano mnie
Po knajpach grywałem za piwko i chleb
Na szyciu bluesa tak mijał mi dzień

Tylko nocą do klubu "Puls"
Jam-session do rana, tam królował blues
To już minęło, ten klimat, ten luz
Wspaniali ludzie nie powrócą
Nie powrócą już!

Lecz we mnie zostało coś z tamtych lat
Mój mały, intymny, muzyczny świat
Gdy tak wspominam ten miniony czas
Wiem jedno, że to nie poszło w las

Dużo bym dał, by przeżyć to znów
Wehikuł czasu to byłby cud!
Mam jeszcze wiarę, odmieni się los
Znów kwiatek do lufy wetknie im ktoś

Tylko nocą do klubu "Puls"
Jam-session do rana, tam królował blues
To już minęło, te czasy, ten luz
Wspaniali ludzie nie powrócą
Nie powrócą już! Oh

Tylko nocą do klubu "Puls"
Jam-session do rana, tam królował blues
To już minęło, te czasy, ten luz
Wspaniali ludzie nie powrócą
Nie powrócą już! Nie! Yeah!`
  },
  {
    artist: 'Dżem',
    title: 'Whiskey',
    lyrics: `Whiskey, whiskey
Mówią o mnie w mieście: "Co z niego za typ?
Wciąż chodzi pijany, pewno nie wie co to wstyd.
Brudny, niedomytek, w stajni ciągle śpi!
Czego szuka w naszym mieście?
Idź do diabła" - mówią ludzie pełni cnót.

Chciałem kiedyś zmądrzeć, po ich stronie być,
Spać w czystej pościeli, świeże mleko pić.
Naprawdę chciałem zmądrzeć i po ich stronie być.
Pomyślałem więc o żonie, aby stać się jednym z nich,
Stać się jednym z nich, stać się jednym z nich...

Już miałem na oku hacjendę, wspaniałą, mówię wam,
Lecz nie chciała tam zamieszkać żadna z pięknych dam.
Wszystkie śmiały się, wołając, wołając za mną wciąż:
"Bardzo ładny Frak masz, Billy,
Ale kiepski byłby z Ciebie mąż, kiepski byłby z Ciebie mąż".
Ouuu, yeah, yeah, yeah.

Kiepski byłby mąż.
Yeah.

Whisky, moja żono, jednak Tyś najlepszą z dam.
Już mnie nie opuścisz, nie, nie będę sam.
Mówią: whisky to nie wszystko, można bez niej żyć,
Lecz nie wiedzą o tym,
Że najgorzej w życiu to,
To samotnym być, to samotnym być

O nie!
Lecz nie wiedzą o tym, że
Najgorzej w życiu to,
To samotnym być.
Nie, o nie!
Nie chcę już samotnym być, nie!
O nie!
Nie chcę już, nie chcę już samotnym być, nie!
Nie chcę już, nie chcę już samotnym być, nie!
Nie! `
  },
  {
    artist: 'Lzy',
    title: 'Agnieszka',
    lyrics: `Agnieszka, Agnieszka
Było ciepłe lato, choć czasem padało
Dużo wina się piło i mało się spało
Tak zaczęła się wakacyjna przygoda
On był jeszcze młody i ona była młoda

Zakochani przy świetle księżyca nocami
Chodzili długimi leśnymi ścieżkami
Tak mijały tygodnie, lecz rozstania nadszedł czas
Zawsze mówił jedno zdanie: "Moje śliczne Ty kochanie"

Ostatniego dnia tych pamiętnych wakacji
Kochali się namiętnie w męskiej ubikacji
I przysięgli przed Bogiem miłość wzajemną
Że za rok się spotkają i na zawsze ze sobą już będą

Tęsknił za nią i pisał do niej listy miłosne
W samotności przeżył jesień, zimę, wiosnę
Nie wytrzymał do wakacji, postanowił ją odwiedzić
Bo nie dostał już dawno od niej żadnej odpowiedzi

Gdy przyjechał do jej domu po dość długiej podróży
Cieszył się, że ją zobaczy - w końcu tyle dla niej znaczył
Lecz, gdy ona go ujrzała szybko się schowała
Drzwi mu matka otworzyła i tak mu powiedziała:

Agnieszka już dawno tutaj nie mieszka
O nie, nie, nie
Agnieszka już dawno tutaj nie mieszka
Agnieszka już dawno tutaj nie mieszka
O nie, o nie, nie, nie
Agnieszka już dawno tutaj nie mieszka

Rozczarował się, bo takie są zawody miłosne
Cierpiał całą jesień, zimę, no i wiosnę
A gdy przeszło mu zupełnie pojechał na wakacje
W tamto miejsce, by zobaczyć tę pamiętną ubikację

Tak się stało, że przypadkiem ona też tam była
Ucieszyła się ogromnie, gdy go tylko zobaczyła
Zapytała się, czy w sercu jego jest jeszcze Agnieszka
Odpowiedział jednym zdaniem: "Moje śliczne Ty kochanie"

Agnieszka już dawno tutaj nie mieszka
O nie, nie, nie
Agnieszka już dawno tutaj nie mieszka
Agnieszka już dawno tutaj nie mieszka
O nie, o nie, nie, nie
Agnieszka już dawno tutaj nie mieszka
`
  },
  {
    artist: 'Kwiat Jabloni',
    title: 'Dziś pójdę późno spać',
    lyrics: `Dziś pójdę późno spać
Dziś późno pójdę spać
Gdy wszyscy będą w łóżkach
Otwarte oczy mam
A głowa pełna i pusta
I nie wiem, o czym myśleć mam
Żeby mi się przyśnił taki świat
W którym się nie boję spać
W którym się nie boję spać

Już na mnie idzie tłum
I depcze wszystko po drodze
Nie mogę uciec mu
On też przed sobą nie może
Gwiazd już nie widać, no bo jak?
Kiedy łuna z ziemi bije tak
Jak gdyby chciała zalać świat
Jak gdyby chciała zalać świat

Ref.: (x2)
Choć nie chcę budzić się
Nie umiem spać
Świat dziwny jest jak sen
A sen jak świat

Nie mogę ruszyć w przód
Nogi sklejone taśmami
Zaczynam spadać w dół
Spadam do góry nogami
Myślę sobie - zaraz obudzę się
Lecz im bardziej spadam,
tym bardziej widzę, że
To wszystko chyba nie jest sen
To wszystko chyba nie jest sen

Ref.: (x4)
Choć nie chcę budzić się
Nie umiem spać
Świat dziwny jest jak sen
A sen jak świat
`
  },
  {
    artist: 'Sanah',
    title: 'Ale jazz',
    lyrics: `Ale jazz, ale jazz
Kawka na wynos dzisiaj towarzyszy mi
To cappuccino niesłodzone - będę fit
Szekspirowski sznyt całe noce mi się śnił
Gdzie Romeo był?

Codziennie narzekałam - gdzie ten happy end?
Me vibrato chciało dalej się wznieść
Ja nie pytam już i wiem, o co chodzi mu
A w mej głowie luz


Oo, ale jazz!
Hardkorowo pada deszcz
Tak na maksa wieje też
Ja łagodnie uśmiechnięta
Błyska gdzieś
Na mej dłoni czuję dreszcz
Moje oczy błyszczą też
Ja łagodnie uśmiechnięta

Oh-oh-oh-oh-oh-oh
Hardkorowo pada deszcz
Ja łagodnie uśmiechnięta


Jeszcze nie przyszła, a o ósmej miała być
Widzę na Insta - kawkę woli sama pić
Ale ze mnie dzban, teraz szansę ma
Inny kolo, inny kolo


Oo, ale jazz!
Hardkorowo pada deszcz
Tak na maksa wieje też
Ja łagodnie uśmiechnięta
Błyska gdzieś
Na mej dłoni czuję dreszcz
Moje oczy błyszczą też
Ja łagodnie uśmiechnięta

Oh-oh-oh-oh-oh-oh
Hardkorowo pada deszcz
Ja łagodnie uśmiechnięta


Oo, ale blues!
Nie mam siły się tak czuć
Dziś poznałem co to chłód
A Ty chodzisz uśmiechnięta

Błyska gdzieś
Na mej dłoni czuję dreszcz
Moje oczy błyszczą też
Ja łagodnie uśmiechnięta

Czy Ty, Ty, Ty, Ty nie lubisz mnie już?

Hardkorowo pada deszcz
Ja łagodnie uśmiechnięta`
  },
  {
    artist: 'Enej',
    title: 'Kamień z napisem love',
    lyrics: `Znalazłem kamień z napisem love
Dałem ci kamień z wielkim LOVE
No, bo kwiaty szybko schną
Jedyne, co ci mogłem dać
To kamień z napisem LOVE

Ja dałem ci kamień z wielkim LOVE
No, bo kwiaty szybko schną
Jedyne, co ci mogłem dać
To kamień z napisem LOVE

W jubilerskim dziale
Wszystko drogie tam
Kupiłbym korale jedne, może dwa
I pokochałabyś, i uwielbiałabyś
Lecz na szyi dalej będzie nic

Dałem ci kamień z wielkim LOVE
No, bo kwiaty szybko schną
Jedyne, co ci mogłem dać
To kamień z napisem LOVE

Ja dałem ci kamień z wielkim LOVE
No, bo kwiaty szybko schną
Jedyne, co ci mogłem dać
To kamień z napisem LOVE

Mam już parę złotych
Zbieram drugą noc
Dałbym tobie kwiatów nawet cały kosz
I tak kochałabyś, i pogłaskałabyś
Potem z głodu łokcie będę gryźć

Dałem ci kamień z wielkim LOVE
No, bo kwiaty szybko schną
Jedyne, co ci mogłem dać
To kamień z napisem LOVE

Ja dałem ci kamień z wielkim LOVE
No, bo kwiaty szybko schną
Jedyne, co ci mogłem dać
To kamień z napisem LOVE

Ale ta historia ma też happy end
Bo ten zwykły kamień, okazało się
Że on ze złota był
To chyba mi się śni
Jedno wyjście pozostało mi
(Sorry mała)

Zabrałem ci kamień z wielkim LOVE
Teraz mam milionów sto
A tobie dam, co chciałaś mieć
Te kwiaty za złotych pięć 4x`
  }
];

router.get('/music', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const user = await getUser(name);
    if (!user) return res.redirect('/home');
    const tierIdx = getTier(user.points || 0);
    if (!name) return res.redirect('/');

    const songList = SONGS.map(function(s, i) {
      return '<a href="/music/' + i + '" style="display:block;text-decoration:none;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.15s" onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'none\'">' +
        '<div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:2px">' + escape(s.title) + '</div>' +
        '<div style="font-size:12px;color:#888">' + escape(s.artist) + '</div>' +
      '</a>';
    }).join('');

    // Group by artist for display
    var currentArtist = '';
    var groupedList = SONGS.map(function(s, i) {
      var artistHeader = '';
      if (s.artist !== currentArtist) {
        currentArtist = s.artist;
        artistHeader = '<div style="font-size:11px;color:#60a5fa;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:14px 14px 6px;margin-top:4px">' + escape(s.artist) + '</div>';
      }
      return artistHeader +
        '<a href="/music/' + i + '" style="display:block;text-decoration:none;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s" onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseout="this.style.background=\'none\'">' +
          '<div style="font-size:14px;color:#eee">🎵 ' + escape(s.title) + '</div>' +
        '</a>';
    }).join('');

    res.send(page('Music',
      '<h1>🎶 Music</h1>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;margin-bottom:16px;text-align:left">' +
        groupedList +
      '</div>' +
      '<a class="link" href="/home">Back</a>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

router.get('/music/:id', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const user = await getUser(name);
    if (!user) return res.redirect('/home');
    const tierIdx = getTier(user.points || 0);
    if (!name) return res.redirect('/');

    const id   = parseInt(req.params.id, 10);
    const song = SONGS[id];
    if (!song) return res.redirect('/music');

    const prev = id > 0 ? '<a href="/music/' + (id - 1) + '" class="btn btn-gray btn-sm">← Prev</a>' : '';
    const next = id < SONGS.length - 1 ? '<a href="/music/' + (id + 1) + '" class="btn btn-gray btn-sm">Next →</a>' : '';

    res.send(page(song.title,
      '<div style="margin-bottom:8px">' +
        '<a href="/music" style="font-size:12px;color:#60a5fa;text-decoration:none">← Back to list</a>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:16px;text-align:left">' +
        '<div style="font-size:11px;color:#60a5fa;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">' + escape(song.artist) + '</div>' +
        '<div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:20px">🎵 ' + escape(song.title) + '</div>' +
        '<pre style="font-family:inherit;font-size:14px;color:#ccc;line-height:1.8;white-space:pre-wrap;margin:0">' + escape(song.lyrics) + '</pre>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:space-between;margin-bottom:16px">' +
        (prev || '<span></span>') + (next || '<span></span>') +
      '</div>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;