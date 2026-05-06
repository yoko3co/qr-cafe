'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

const { ADMIN_URL, VERSION, DAY }                                       = require('../config');
const {
  pool, getAllUsers, deleteUser, getUser, upsertUser,
  getAllowedNames, addAllowedName, removeAllowedName,
  getAllPolls, getPoll, savePoll, deletePoll, savePastPoll, getPastPolls,
  getAllMissions, getMission, saveMission, deleteMission,
  getUserMissions, completeMission,
}                                                                       = require('../db/pool');
const { checkAdminSession, generateCsrf, validateCsrf }                = require('../middleware/session');
const { fetchAllowedNames }                                             = require('../services/hive');
const { escape, page }                                                 = require('../views/layout');
// blockchain voting is now per-poll

function csrfOk(req, res) {
  if (!validateCsrf(req.body._csrf)) {
    res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Invalid request'));
    return false;
  }
  return true;
}

router.get('/export-csv', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  try {
    const users = await getAllUsers();
    const lines = ['name,points,book,games,volunteers,film,legal_version,last_visit'];
    users.forEach(function(u) {
      const lastVisit = u.last_visit ? new Date(u.last_visit).toISOString() : 'never';
      lines.push([
        u.hive_name, u.points||0, u.book||0, u.games||0,
        u.volunteers||0, u.film||0, u.legal_version||'none', lastVisit
      ].join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="krolestwo-users-' + new Date().toISOString().slice(0,10) + '.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

router.get('/export-csv', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  try {
    const users = await getAllUsers();
    const lines = ['name,points,book,games,volunteers,film,legal_version,last_visit'];
    users.forEach(function(u) {
      const lastVisit = u.last_visit ? new Date(u.last_visit).toISOString() : 'never';
      lines.push([
        u.hive_name, u.points||0, u.book||0, u.games||0,
        u.volunteers||0, u.film||0, u.legal_version||'none', lastVisit
      ].join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="krolestwo-users-' + new Date().toISOString().slice(0,10) + '.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

router.get('/panel', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  const msg     = req.query.msg ? decodeURIComponent(req.query.msg) : '';
  const isError = req.query.err === '1';
  const csrf    = generateCsrf();
  

  try {
    const allUsers     = await getAllUsers();
    const allPolls     = await getAllPolls();
    const allPastPolls = await getPastPolls();
    const allowedNames = await getAllowedNames();
    const allMissions  = await getAllMissions();

    const userRows = allUsers.length === 0
      ? '<tr><td colspan="4" style="color:#555;text-align:center;padding:16px">No users yet</td></tr>'
      : allUsers.map(function(u) {
          const checkedIn = u.last_visit && Date.now() - u.last_visit < DAY ? 'Yes' : 'No';
          return '<tr>' +
            '<td><strong>' + escape(u.hive_name) + '</strong></td>' +
            '<td>' + (u.points||0).toFixed(1) + '</td>' +
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
            '</td></tr>';
        }).join('');

    let nameTags = '';
    allowedNames.forEach(function(n) {
      nameTags += '<span class="tag">' + escape(n) +
        ' <form method="POST" action="' + ADMIN_URL + '/remove-name" style="display:inline">' +
          '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
          '<input type="hidden" name="name" value="' + escape(n) + '"/>' +
          '<button type="submit" style="background:none;border:none;color:#f87171;cursor:pointer;padding:0;margin-left:4px;font-size:13px">x</button>' +
        '</form></span>';
    });

    const pollRows = allPolls.length === 0
      ? '<tr><td colspan="4" style="color:#555;padding:12px;text-align:center">No polls yet</td></tr>'
      : allPolls.map(function(poll) {
          const total = poll.votes.reduce(function(a, b) { return a+b; }, 0);
          return '<tr>' +
            '<td>' + escape(poll.question) + '</td>' +
            '<td style="color:' + (poll.status==='active'?'#4ade80':'#fbbf24') + '">' + poll.status + '</td>' +
            '<td>' + total + '</td>' +
            '<td>' +
              (poll.status==='active' ? '<form method="POST" action="' + ADMIN_URL + '/pause-poll" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-gold btn-sm">Pause</button></form> ' : '') +
              (poll.status==='paused' ? '<form method="POST" action="' + ADMIN_URL + '/resume-poll" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-green btn-sm">Resume</button></form> ' : '') +
              '<form method="POST" action="' + ADMIN_URL + '/stop-poll" style="display:inline"><input type="hidden" name="pid" value="' + poll.id + '"/><button type="submit" class="btn btn-red btn-sm">Stop</button></form>' +
            '</td></tr>';
        }).join('');

    const pastRows = allPastPolls.map(function(poll) {
      const total   = poll.votes.reduce(function(a, b) { return a+b; }, 0);
      const results = poll.options.map(function(opt, i) {
        const pct = total > 0 ? Math.round((poll.votes[i]/total)*100) : 0;
        return '<div style="font-size:12px">' + escape(opt) + ': <strong>' + pct + '%</strong></div>';
      }).join('');
      return '<tr><td>' + escape(poll.question) + '</td><td>' + total + '</td><td>' + results + '</td></tr>';
    }).join('');

    const missionRows = allMissions.length === 0
      ? '<tr><td colspan="4" style="color:#555;padding:12px;text-align:center">No missions yet</td></tr>'
      : allMissions.map(function(m) {
          return '<tr>' +
            '<td><strong>' + escape(m.title) + '</strong><br><span style="font-size:12px;color:#777">' + escape(m.description) + '</span></td>' +
            '<td style="color:' + (m.status==='active'?'#4ade80':'#f87171') + '">' + m.status + '</td>' +
            '<td>+' + m.reward_amount + ' ' + escape(m.reward_type) + '</td>' +
            '<td>' +
              '<form method="POST" action="' + ADMIN_URL + '/toggle-mission" style="display:inline"><input type="hidden" name="_csrf" value="' + csrf + '"/><input type="hidden" name="mid" value="' + m.id + '"/><button type="submit" class="btn ' + (m.status==='active'?'btn-gold':'btn-green') + ' btn-sm">' + (m.status==='active'?'Pause':'Activate') + '</button></form> ' +
              '<form method="POST" action="' + ADMIN_URL + '/delete-mission" style="display:inline"><input type="hidden" name="_csrf" value="' + csrf + '"/><input type="hidden" name="mid" value="' + m.id + '"/><button type="submit" class="btn btn-red btn-sm">Delete</button></form>' +
            '</td></tr>';
        }).join('');

    const userOptions    = allUsers.map(function(u) { return '<option value="' + escape(u.hive_name) + '">' + escape(u.hive_name) + '</option>'; }).join('');
    const missionOptions = allMissions.filter(function(m) { return m.status==='active'; })
      .map(function(m) { return '<option value="' + m.id + '">' + escape(m.title) + '</option>'; }).join('');

    res.send(page('Admin Panel',
      '<h1>Admin Panel</h1><h2>' + VERSION + '</h2>' +
      (msg ? '<div class="' + (isError?'error':'success') + '">' + escape(msg) + '</div>' : '') +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Generate Check-in QR</h2>' +
      '<form method="GET" action="/qr">' +
        '<select name="event">' +
          '<option value="none">Standard check-in (+1 point)</option>' +
          '<option value="book">Book Club (+1 Book coin)</option>' +
          '<option value="games">Board Games (+1 Games coin)</option>' +
          '<option value="volunteers">Volunteers (+1 Volunteers coin)</option>' +
          '<option value="film">Film Club (+1 Film coin)</option>' +
        '</select>' +
        '<button type="submit" class="btn btn-green">Generate QR Code</button>' +
      '</form>' +

      

      '<hr><h2 style="text-align:left;margin-bottom:12px">Users (' + allUsers.length + ')</h2>' +
      '<div style="overflow-x:auto"><table><tr><th>Name</th><th>Pts</th><th>Today</th><th>Actions</th></tr>' + userRows + '</table></div>' +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Allowed Names (' + allowedNames.size + ')</h2>' +
      '<p style="text-align:left;font-size:13px;color:#666">Auto-synced from Hive every 5 min</p>' +
      '<details style="text-align:left;margin-bottom:12px"><summary style="cursor:pointer;color:#60a5fa;font-size:14px">Show names (' + allowedNames.size + ')</summary><div style="margin-top:8px">' + (nameTags||'<p style="color:#555">No names</p>') + '</div></details>' +
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
        ? '<form id="poll-form" method="POST" action="' + ADMIN_URL + '/add-poll" style="margin-top:16px">' +
            '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
            '<input type="hidden" name="blockchain" id="blockchain-val" value="0"/>' +
            '<input type="text" name="question" id="poll-question" placeholder="Poll question..." required style="margin-bottom:8px"/>' +
            '<input type="text" name="opt0" id="poll-opt0" placeholder="Option 1" required style="margin-bottom:6px"/>' +
            '<input type="text" name="opt1" id="poll-opt1" placeholder="Option 2" required style="margin-bottom:6px"/>' +
            '<input type="text" name="opt2" id="poll-opt2" placeholder="Option 3 (optional)" style="margin-bottom:6px"/>' +
            '<input type="text" name="opt3" id="poll-opt3" placeholder="Option 4 (optional)" style="margin-bottom:6px"/>' +
            '<label style="display:flex;gap:10px;align-items:center;margin-bottom:12px;cursor:pointer;font-size:13px;color:#aaa;text-align:left">' +
              '<input type="checkbox" id="blockchain-check" style="width:auto"/>' +
              '<span>Post to Hive blockchain (test3333)</span>' +
            '</label>' +
            '<button type="button" class="btn btn-gold" onclick="submitPoll()">Add Poll</button>' +
          '</form>' +
          '<script>' +
          'function submitPoll(){' +
            'var q=document.getElementById("poll-question").value.trim();' +
            'var o0=document.getElementById("poll-opt0").value.trim();' +
            'var o1=document.getElementById("poll-opt1").value.trim();' +
            'if(!q||!o0||!o1)return alert("Question and at least 2 options required.");' +
            'var useChain=document.getElementById("blockchain-check").checked;' +
            'if(!useChain){document.getElementById("poll-form").submit();return;}' +
            'if(typeof window.hive_keychain==="undefined")return alert("Open admin panel in Keychain browser to post on blockchain.");' +
            'var options=[o0,o1,document.getElementById("poll-opt2").value.trim(),document.getElementById("poll-opt3").value.trim()].filter(function(o){return o.length>0;});' +
            'var json=JSON.stringify({app:"qr-cafe",action:"create_poll",question:q,options:options,created:Date.now()});' +
'setTimeout(function(){' +
'setTimeout(function(){' +
              'window.hive_keychain.requestCustomJson("test3333","qr-cafe-poll","Posting","[]",json,"QR Cafe Poll",function(r){' +
                'if(r.success){' +
                  'document.getElementById("blockchain-val").value="1";' +
                  'document.getElementById("poll-form").submit();' +
                '}else{alert("Hive error: "+r.message);}' +
              '});' +
            '},500);' +
          '}' +
          '</script>'
      : '<p style="color:#f87171;font-size:13px;margin-top:8px">Max 5 polls reached.</p>') +
      (allPastPolls.length > 0
        ? '<hr><h2 style="text-align:left;margin-bottom:12px">Past Polls</h2>' +
          '<table><tr><th>Question</th><th>Total</th><th>Results</th></tr>' + pastRows + '</table>'
        : '') +

      '<hr><h2 style="text-align:left;margin-bottom:12px">Missions (' + allMissions.length + ')</h2>' +
      '<table><tr><th>Mission</th><th>Status</th><th>Reward</th><th>Actions</th></tr>' + missionRows + '</table>' +
      '<form method="POST" action="' + ADMIN_URL + '/add-mission" style="margin-top:16px">' +
        '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
        '<input type="text" name="title" placeholder="Mission title..." required style="margin-bottom:6px"/>' +
        '<input type="text" name="description" placeholder="What does the user need to do?" required style="margin-bottom:6px"/>' +
        '<select name="reward_type" style="margin-bottom:6px">' +
          '<option value="points">Points</option>' +
          '<option value="book">Book coin</option>' +
          '<option value="games">Games coin</option>' +
          '<option value="volunteers">Volunteers coin</option>' +
          '<option value="film">Film coin</option>' +
        '</select>' +
        '<input type="number" name="reward_amount" placeholder="Amount" value="1" min="1" max="100" style="margin-bottom:6px"/>' +
        '<button type="submit" class="btn btn-green">Add Mission</button>' +
      '</form>' +

      (missionOptions
        ? '<hr><h2 style="text-align:left;margin-bottom:8px">Award mission manually</h2>' +
          '<form method="POST" action="' + ADMIN_URL + '/award-mission">' +
            '<input type="hidden" name="_csrf" value="' + csrf + '"/>' +
            '<select name="hive_name" style="margin-bottom:6px">' + userOptions + '</select>' +
            '<select name="mission_id" style="margin-bottom:6px">' + missionOptions + '</select>' +
            '<button type="submit" class="btn btn-gold">Award Mission</button>' +
          '</form>'
        : '') +

      '<hr>' +
      '<a href="' + ADMIN_URL + '/export-csv" class="btn btn-blue" style="margin-bottom:8px">Download users CSV</a>' +
      '<a class="link" href="/leaderboard">Leaderboard</a>' +
      '<a class="link" href="/">Home</a>'
    , true));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

router.post('/add-name', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  const name = (req.body.name||'').trim().toLowerCase().slice(0,30);
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Invalid name'));
  await addAllowedName(name);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Added: ' + name));
});

router.post('/remove-name', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  await removeAllowedName((req.body.name||'').trim().toLowerCase());
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Removed: ' + req.body.name));
});

router.post('/sync-hive', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  await fetchAllowedNames();
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Synced from Hive'));
});

router.post('/reset-checkin', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  const user = await getUser(req.body.key);
  if (!user) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('User not found'));
  user.last_visit = 0;
  await upsertUser(req.body.key, user);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Check-in reset for ' + req.body.key));
});

router.post('/delete-user', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  await deleteUser(req.body.key);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Deleted: ' + req.body.key));
});

router.post('/add-poll', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  const count = await pool.query('SELECT COUNT(*) FROM polls');
  if (parseInt(count.rows[0].count) >= 5) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Max 5 polls'));
  const question = (req.body.question||'').trim().slice(0,200);
  const options  = [req.body.opt0,req.body.opt1,req.body.opt2,req.body.opt3]
    .map(function(o){return (o||'').trim().slice(0,100);}).filter(function(o){return o.length>0;});
  if (!question||options.length<2) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Need question and 2+ options'));
const useBlockchain = req.body.blockchain === '1';
  await savePoll(crypto.randomUUID(), { question:question, options:options, votes:options.map(function(){return 0;}), status:'active', blockchain:useBlockchain });
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll added'));
});

router.post('/pause-poll', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  await pool.query('UPDATE polls SET status=$1 WHERE id=$2', ['paused', req.body.pid]);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll paused'));
});

router.post('/resume-poll', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  await pool.query('UPDATE polls SET status=$1 WHERE id=$2', ['active', req.body.pid]);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll resumed'));
});

router.post('/stop-poll', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  const poll = await getPoll(req.body.pid);
  if (poll) { await savePastPoll(poll); await deletePoll(req.body.pid); }
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Poll stopped and saved'));
});


router.post('/add-mission', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  const title       = (req.body.title||'').trim().slice(0,100);
  const description = (req.body.description||'').trim().slice(0,300);
  const rewardType  = ['points','book','games','volunteers','film'].includes(req.body.reward_type) ? req.body.reward_type : 'points';
  const rewardAmt   = Math.min(100, Math.max(1, parseInt(req.body.reward_amount)||1));
  if (!title||!description) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Title and description required'));
  await saveMission(crypto.randomUUID(), { title:title, description:description, reward_type:rewardType, reward_amount:rewardAmt, status:'active' });
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission added'));
});

router.post('/toggle-mission', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  const m = await getMission(req.body.mid);
  if (!m) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('Mission not found'));
  m.status = m.status==='active' ? 'paused' : 'active';
  await saveMission(m.id, m);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission updated'));
});

router.post('/delete-mission', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  await deleteMission(req.body.mid);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission deleted'));
});

router.post('/award-mission', async function(req, res) {
  if (!checkAdminSession(req, res)) return;
  if (!csrfOk(req, res)) return;
  const mission = await getMission(req.body.mission_id);
  const user    = await getUser(req.body.hive_name);
  if (!mission||!user) return res.redirect(ADMIN_URL + '/panel?err=1&msg=' + encodeURIComponent('User or mission not found'));
  await completeMission(req.body.hive_name, req.body.mission_id);
  if (mission.reward_type==='points')     user.points     = (user.points||0)     + mission.reward_amount;
  if (mission.reward_type==='book')       user.book       = (user.book||0)       + mission.reward_amount;
  if (mission.reward_type==='games')      user.games      = (user.games||0)      + mission.reward_amount;
  if (mission.reward_type==='volunteers') user.volunteers = (user.volunteers||0) + mission.reward_amount;
  if (mission.reward_type==='film')       user.film       = (user.film||0)       + mission.reward_amount;
  await upsertUser(req.body.hive_name, user);
  res.redirect(ADMIN_URL + '/panel?msg=' + encodeURIComponent('Mission awarded to ' + req.body.hive_name));
});

module.exports = router;
