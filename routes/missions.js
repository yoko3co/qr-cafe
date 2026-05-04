'use strict';

const express = require('express');
const router  = express.Router();

const { getAllMissions, getUserMissions } = require('../db/pool');
const { getUserFromCookie }              = require('../middleware/session');
const { escape, page, navBar }           = require('../views/layout');

// ==================== MISSIONS PAGE ====================

router.get('/missions', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const allMissions  = await getAllMissions();
    const userMissions = await getUserMissions(name);
    const completedIds = new Set(userMissions.map(function(m) { return m.mission_id; }));
    const active       = allMissions.filter(function(m) { return m.status === 'active'; });

    let missionHtml = '';
    if (active.length === 0) {
      missionHtml = '<div class="info">No missions available right now. Check back soon!</div>';
    } else {
      active.forEach(function(m) {
        const done = completedIds.has(m.id);
        missionHtml +=
          '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:12px;text-align:left;border:1px solid ' + (done ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<strong>' + escape(m.title) + '</strong>' +
            '<span style="font-size:12px;background:' + (done ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)') + ';color:' + (done ? '#4ade80' : '#fbbf24') + ';padding:3px 10px;border-radius:999px">' + (done ? 'Completed' : '+' + m.reward_amount + ' ' + m.reward_type) + '</span>' +
          '</div>' +
          '<p style="font-size:13px;color:#aaa;margin:0">' + escape(m.description) + '</p>' +
          (done ? '' : '<p style="font-size:12px;color:#555;margin:8px 0 0">Ask staff to mark this complete.</p>') +
          '</div>';
      });
    }

    res.send(page('Missions',
      '<h1>Missions</h1>' +
      '<h2>Complete tasks, earn rewards</h2>' +
      missionHtml +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;
