'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

const { ADMIN_URL, VERSION }                              = require('../config');
const {
  getAllUsers, deleteUser, upsertUser, getUser,
  getAllowedNames, addAllowedName, removeAllowedName,
  getAllPolls, getPoll, savePoll, deletePoll, savePastPoll, getPastPolls,
  getAllMissions, getMission, saveMission, deleteMission,
  getUserMissions, completeMission, pool,
}                                                         = require('../db/pool');
const { checkAdminToken, generateCsrf, validateCsrf }    = require('../middleware/auth');
const { setBlockchainVoting, getBlockchainVoting }        = require('./polls');
const { fetchAllowedNames }                               = require('../services/hive');
const { escape, page }                                   = require('../views/layout');
const { DAY }                                            = require('../config');

// ==================== ADMIN PANEL ====================

router.get('/panel', async function(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  const { adminSessions } = require('../middleware/auth');
  if (!token || !adminSessions.has(token)) {
    return res.redirect(ADMIN_URL + '?error=' + encodeURIComponent('Please login first'));
  }
  const msg     = req.query.msg ? decodeURIComponent(req.query.msg) : '';
  const isError = req.query.err === '1';
  const csrf    = generateCsrf();
  const blockchainVoting = getBlockchainVoting();

  try {
    const allUsers     = await getAllUsers();
    const allPolls     = await getAllPolls();
    const allPastPolls = await getPastPolls();
    const allowedNames = await getAllowedNames();
    const allMissions  = await getAllMissions();

    // --- Users table ---
    let userRows = allUsers.length === 0
      ? '<tr><td colspan="4" style="color:#555;text-align:center;padding:16px">No users yet</td></tr>'
      : allUsers.map(function(u) {
          const checkedIn = u.last_visit && Date.now() - u.last_visit < DAY ? 'Yes' : 'No';
          return '<tr>' +
            '<td><strong>' + escape(u.hive_name) + '</strong></td>' +
            '<td>' + (u.points || 0).toFixed(1) + '</td>' +
            '<td>' + checkedIn + '</td>' +
            '<td>' +
              '<form method="POST" action="' + ADMIN_URL + '/reset-checkin" style="display:inline">' +
                '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
                '<input type="hidden" name="key" value="' + escape(u.hive_name) + '"/>' +
                '<button type="submit" class="btn btn-gold btn-sm">Reset CI</button>' +
              '</form> ' +
              '<form method="POST" action="' + ADMIN_URL + '/delete-user" style="display:inline">' +
                '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
                '<input type="hidden" name="key" value="' + escape(u.hive_name) + '"/>' +
                '<button type="submit" class="btn btn-red btn-sm">Delete</button>' +
              '</form>' +
            '</td>' +
          '</tr>';
        }).join('');

    // --- Allowed names tags ---
    let nameTags = '';
    allowedNames.forEach(function(n) {
      nameTags +=
        '<span class="tag">' + escape(n) +
        ' <form method="POST" action="' + ADMIN_URL + '/remove-name" style="display:inline">' +
          '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
          '<input type="hidden" name="name" value="' + escape(n) + '"/>' +
          '<button type="submit" style="background:none;border:none;color:#f87171;cursor:pointer;padding:0;margin-left:4px;font-size:13px">x</button>' +
        '</form></span>';
    });

    // --- Polls table ---
    let pollRows = allPolls.length === 0
      ? '<tr><td colspan="4" style="color:#555;padding:12px;text-align:center">No polls yet</td></tr>'
      : allPolls.map(function(poll) {
          const total       = poll.votes.reduce(function(a, b) { return a + b; }, 0);
          const statusColor = poll.status === 'active' ? '#4ade80' : '#fbbf24';
          return '<tr>' +
            '<td>' + escape(poll.question) + '</td>' +
            '<td style="color:' + statusColor + '">' + poll.status + '</td>' +
            '<td>' + total + '</td>' +
            '<td>' +
              (poll.status === 'active'
                ? '<form method="POST" action="' + ADMIN_URL + '/pause-poll" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-gold btn-sm">Pause</button></form> '
                : '') +
              (poll.status === 'paused'
                ? '<form method="POST" action="' + ADMIN_URL + '/resume-poll" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-green btn-sm">Resume</button></form> '
                : '') +
              '<form method="POST" action="' + ADMIN_URL + '/stop-poll" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-red btn-sm">Stop & Save</button></form>' +
            '</td>' +
          '</tr>';
        }).join('');

    // --- Past polls ---
    let pastPollRows = allPastPolls.length === 0 ? '' :
      allPastPolls.map(function(poll) {
        const total = poll.votes.reduce(function(a, b) { return a + b; }, 0);
        const results = poll.options.map(function(opt, i) {
          const pct = total > 0 ? Math.round((poll.votes[i] / total) * 100) : 0;
          return '<div style="font-size:12px">' + escape(opt) + ': <strong>' + pct + '%</strong></div>';
        }).join('');
        return '<tr><td>' + escape(poll.question) + '</td><td>' + total + '</td><td>' + results + '</td></tr>';
      }).join('');

    // --- Missions table ---
    let missionRows = allMissions.length === 0
      ? '<tr><td colspan="4" style="color:#555;padding:12px;text-align:center">No missions yet</td></tr>'
      : allMissions.map(function(m) {
          return '<tr>' +
            '<td><strong>' + escape(m.title) + '</strong><br><span style="font-size:12px;color:#777">' + escape(m.description) + '</span></td>' +
            '<td style="color:' + (m.status === 'active' ? '#4ade80' : '#f87171') + '">' + m.status + '</td>' +
            '<td>+' + m.reward_amount + ' ' + escape(m.reward_type) + '</td>' +
            '<td>' +
              '<form method="POST" action="' + ADMIN_URL + '/toggle-mission" style="display:inline"><input type="hidden" name="_csrf" value="' + csrf + '"/><input type="hidden" name="mid" value="' + m.id + '"/><button type="submit" class="btn ' + (m.status === 'active' ? 'btn-gold' : 'btn-green') + ' btn-sm">' + (m.status === 'active' ? 'Pause' : 'Activate') + '</button></form> ' +
              '<form method="POST" action="' + ADMIN_URL + '/delete-mission" style="display:inline"><input type="hidden" name="_csrf" value="' + csrf + '"/><input type="hidden" name="mid" value="' + m.id + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form>' +
            '</td>' +
          '</tr>';
        }).join('');

    // --- Award mission to user form options ---
    const userOptions  = allUsers.map(function(u)  { return '<option value="' + escape(u.hive_name)  + '">' + escape(u.hive_name)  + '</option>'; }).join('');
    const missionOptions = allMissions.filter(function(m) { return m.status === 'active'; })
      .map(function(m) { return '<option value="' + m.id + '">' + escape(m.title) + '</option>'; }).join('');

    res.send(page('Admin Panel',
      '<h1>Admin Panel</h1>' +
      '<h2>' + VERSION + '</h2>' +
      (msg ? '<div class="' + (isError ? 'error' : 'success') + '">' + escape(msg) + '</div>' : '') +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Generate QR</h2>' +
      '<form method="GET" action="/qr">' +
        '<select name="event" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:8px">' +
          '<option value="none">No event - standard point only</option>' +
          '<option value="book">Book Club - +1 Book coin</option>' +
          '<option value="games">Board Games - +1 Games coin</option>' +
          '<option value="volunteers">Volunteers - +1 Volunteers coin</option>' +
          '<option value="film">Film Club - +1 Film coin</option>' +
        '</select>' +
        '<button type="submit" class="btn btn-green">Generate QR Code</button>' +
      '</form>' +

      '<hr><h2 style="text-align:left;margin-bottom:8px">Blockchain Voting</h2>' +
      '<p style="text-align:left;color:#aaa;font-size:13px">Currently: <strong style="color:' + (blockchainVoting ? '#4ade80' : '#f87171') + '">' + (blockchainVoting ? 'ON' : 'OFF') + '</strong></p>' +
      '<form method="POST" action="' + ADMIN_URL + '/toggle-blockchain">' +
        '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
        '<button type="submit" class="btn ' + (blockchainVoting ? 'btn-red' : 'btn-green') + '">' + (blockchainVoting ? 'Turn OFF' : 'Turn ON') + '</button>' +
      '</form>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Users (' + allUsers.length + ')</h2>' +
      '<div style="overflow-x:auto"><table><tr><th>Name</th><th>Pts</th><th>Today</th><th>Actions</th></tr>' + userRows + '</table></div>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Allowed Names (' + allowedNames.size + ')</h2>' +
      '<p style="text-align:left;font-size:13px;color:#666">Synced from Hive: every 5 min</p>' +
      '<details style="text-align:left;margin-bottom:12px"><summary style="cursor:pointer;color:#60a5fa;font-size:14px">Show names (' + allowedNames.size + ')</summary><div style="margin-top:8px">' + (nameTags || '<p style="color:#555">No names</p>') + '</div></details>' +
      '<form method="POST" action="' + ADMIN_URL + '/add-name" style="display:flex;gap:8px">' +
        '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
        '<input type="text" name="name" placeholder="Add a name..." required style="flex:1;margin:0"/>' +
        '<button type="submit" class="btn btn-green" style="width:auto;padding:8px 16px;margin:0">Add</button>' +
      '</form>' +
      '<form method="POST" action="' + ADMIN_URL + '/sync-hive" style="margin-top:8px">' +
        '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
        '<button type="submit" class="btn btn-blue">Sync from Hive now</button>' +
      '</form>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Active Polls (' + allPolls.length + '/5)</h2>' +
      '<table><tr><th>Question</th><th>Status</th><th>Votes</th><th>Actions</th></tr>' + pollRows + '</table>' +
      (allPolls.length < 5
        ? '<form method="POST" action="' + ADMIN_URL + '/add-poll" style="margin-top:16px">' +
            '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
            '<input type="text" name="question" placeholder="Poll question..." required style="margin-bottom:8px"/>' +
            '<input type="text" name="opt0" placeholder="Option 1" required style="margin-bottom:6px"/>' +
            '<input type="text" name="opt1" placeholder="Option 2" required style="margin-bottom:6px"/>' +
            '<input type="text" name="opt2" placeholder="Option 3 (optional)" style="margin-bottom:6px"/>' +
            '<input type="text" name="opt3" placeholder="Option 4 (optional)" style="margin-bottom:6px"/>' +
            '<button type="submit" class="btn btn-gold">Add Poll</button>' +
          '</form>'
        : '<p style="color:#f87171;font-size:13px;margin-top:8px">Max 5 polls reached.</p>') +

      (allPastPolls.length > 0
        ? '<hr><h2 style="text-align:left;margin-bottom:12px">Past Polls</h2>' +
          '<table><tr><th>Question</th><th>Total</th><th>Results</th></tr>' + pastPollRows + '</table>'
        : '') +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Missions (' + allMissions.length + ')</h2>' +
      '<table><tr><th>Mission</th><th>Status</th><th>Reward</th><th>Actions</th></tr>' + missionRows + '</table>' +
      '<form method="POST" action="' + ADMIN_URL + '/add-mission" style="margin-top:16px">' +
        '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
        '<input type="text" name="title" placeholder="Mission title..." required style="margin-bottom:6px"/>' +
        '<input type="text" name="description" placeholder="What does the user need to do?" required style="margin-bottom:6px"/>' +
        '<select name="reward_type" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:6px">' +
          '<option value="points">Points</option>' +
          '<option value="book">Book coin</option>' +
          '<option value="games">Games coin</option>' +
          '<option value="volunteers">Volunteers coin</option>' +
          '<option value="film">Film coin</option>' +
        '</select>' +
        '<input type="number" name="reward_amount" placeholder="Reward amount" value="1" min="1" max="100" style="margin-bottom:6px"/>' +
        '<button type="submit" class="btn btn-green">Add Mission</button>' +
      '</form>' +

      (missionOptions
        ? '<hr><h2 style="text-align:left;margin-bottom:8px">Award mission to user</h2>' +
          '<form method="POST" action="' + ADMIN_URL + '/award-mission">' +
            '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
            '<select name="hive_name" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:6px">' + userOptions + '</select>' +
            '<select name="mission_id" style="width:100%;padding:12px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:6px">' + missionOptions + '</select>' +
            '<button type="submit" class="btn btn-gold">Award Mission</button>' +
          '</form>'
        : '') +

      '<hr>' +
      '<a class="link" href="/leaderboard">Leaderboard</a>' +
      '<a class="link" href="/">Home</a>'
    , true));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== ADMIN ACTIONS ====================

function csrfCheck(req, res) {
  if (!validateCsrf(req.body._csrf)) {
    res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Invalid request'));
    return false;
  }
  return true;
}

router.post('/add-name', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const name = (req.body.name || '').trim().toLowerCase().slice(0, 30);
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Invalid name'));
  }
  await addAllowedName(name);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Added: ' + name));
});

router.post('/remove-name', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const name = (req.body.name || '').trim().toLowerCase();
  await removeAllowedName(name);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Removed: ' + name));
});

router.post('/sync-hive', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  await fetchAllowedNames();
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Synced from Hive'));
});

router.post('/reset-checkin', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const name = req.body.key;
  const user = await getUser(name);
  if (!user) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('User not found'));
  user.last_visit = 0;
  await upsertUser(name, user);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Check-in reset for ' + name));
});

router.post('/delete-user', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  await deleteUser(req.body.key);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Deleted: ' + req.body.key));
});

router.post('/add-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const count = await pool.query('SELECT COUNT(*) FROM polls');
  if (parseInt(count.rows[0].count) >= 5) {
    return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Max 5 polls reached'));
  }
  const question = (req.body.question || '').trim().slice(0, 200);
  const options  = [req.body.opt0, req.body.opt1, req.body.opt2, req.body.opt3]
    .map(function(o) { return (o || '').trim().slice(0, 100); })
    .filter(function(o) { return o.length > 0; });
  if (!question || options.length < 2) {
    return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Need question and 2+ options'));
  }
  await savePoll(crypto.randomUUID(), { question, options, votes: options.map(function() { return 0; }), status: 'active' });
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll added'));
});

router.post('/pause-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  await pool.query('UPDATE polls SET status=$1 WHERE id=$2', ['paused', req.body.pid]);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll paused'));
});

router.post('/resume-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  await pool.query('UPDATE polls SET status=$1 WHERE id=$2', ['active', req.body.pid]);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll resumed'));
});

router.post('/stop-poll', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  const poll = await getPoll(req.body.pid);
  if (poll) { await savePastPoll(poll); await deletePoll(req.body.pid); }
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll stopped and saved'));
});

router.post('/toggle-blockchain', function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  setBlockchainVoting(!getBlockchainVoting());
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Blockchain voting: ' + (getBlockchainVoting() ? 'ON' : 'OFF')));
});

router.post('/add-mission', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const title         = (req.body.title       || '').trim().slice(0, 100);
  const description   = (req.body.description || '').trim().slice(0, 300);
  const reward_type   = ['points','book','games','volunteers','film'].includes(req.body.reward_type) ? req.body.reward_type : 'points';
  const reward_amount = Math.min(100, Math.max(1, parseInt(req.body.reward_amount) || 1));
  if (!title || !description) {
    return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Title and description required'));
  }
  await saveMission(crypto.randomUUID(), { title, description, reward_type, reward_amount, status: 'active' });
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission added'));
});

router.post('/toggle-mission', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const m = await getMission(req.body.mid);
  if (!m) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Mission not found'));
  m.status = m.status === 'active' ? 'paused' : 'active';
  await saveMission(m.id, m);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission updated'));
});

router.post('/delete-mission', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  await deleteMission(req.body.mid);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission deleted'));
});

router.post('/award-mission', async function(req, res) {
  const token = checkAdminToken(req, res); if (!token) return;
  if (!csrfCheck(req, res)) return;
  const hiveName  = (req.body.hive_name  || '').trim().toLowerCase();
  const missionId = req.body.mission_id;
  const mission   = await getMission(missionId);
  const user      = await getUser(hiveName);
  if (!mission || !user) {
    return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('User or mission not found'));
  }
  await completeMission(hiveName, missionId);
  // Award the reward
  if (mission.reward_type === 'points')      user.points     = (user.points     || 0) + mission.reward_amount;
  if (mission.reward_type === 'book')        user.book       = (user.book       || 0) + mission.reward_amount;
  if (mission.reward_type === 'games')       user.games      = (user.games      || 0) + mission.reward_amount;
  if (mission.reward_type === 'volunteers')  user.volunteers = (user.volunteers || 0) + mission.reward_amount;
  if (mission.reward_type === 'film')        user.film       = (user.film       || 0) + mission.reward_amount;
  await upsertUser(hiveName, user);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission awarded to ' + hiveName));
});

module.exports = router;
