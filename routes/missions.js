'use strict';

const express   = require('express');
const router    = express.Router();
const QRCode    = require('qrcode');

const { BASE_URL, MISSION_QR_TTL }                                             = require('../config');
const { getAllMissions, getUserMissions, getMission, completeMission, getUser, upsertUser } = require('../db/pool');
const { getUserFromCookie }                                                    = require('../middleware/session');
const { escape, page, navBar }                                                = require('../views/layout');

router.get('/missions', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const allMissions  = await getAllMissions();
    const userMissions = await getUserMissions(name);
    const doneIds      = new Set(userMissions.map(function(m) { return m.mission_id; }));
    const active       = allMissions.filter(function(m) { return m.status === 'active'; });
    const doneCount    = active.filter(function(m) { return doneIds.has(m.id); }).length;

    let html = '';
    if (active.length === 0) {
      html = '<div class="info">No missions available right now. Check back soon!</div>';
    } else {
      active.forEach(function(m) {
        const done = doneIds.has(m.id);
        html +=
          '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:12px;text-align:left;border:1px solid ' + (done ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
            '<strong style="font-size:15px">' + escape(m.title) + '</strong>' +
            '<span style="font-size:12px;background:' + (done ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)') + ';color:' + (done ? '#4ade80' : '#fbbf24') + ';padding:3px 10px;border-radius:999px;white-space:nowrap;margin-left:8px">' + (done ? 'Completed' : '+' + m.reward_amount + ' ' + m.reward_type) + '</span>' +
          '</div>' +
          '<p style="font-size:13px;color:#aaa;margin:0 0 10px">' + escape(m.description) + '</p>' +
          (done
            ? '<span style="font-size:12px;color:#4ade80">Mission complete!</span>'
            : '<a href="/missions/generate?mid=' + m.id + '" style="display:inline-block;background:#fbbf24;color:#1c0a00;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">Generate QR</a>'
          ) +
          '</div>';
      });
    }

    res.send(page('Missions',
      '<h1>Missions</h1>' +
      '<p style="color:#aaa;font-size:13px">' + doneCount + ' / ' + active.length + ' completed</p>' +
      html +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

router.get('/missions/generate', async function(req, res) {
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  const mid = req.query.mid;
  try {
    const mission = await getMission(mid);
    if (!mission || mission.status !== 'active') return res.redirect('/missions');
    const done = await getUserMissions(name);
    if (done.find(function(c) { return c.mission_id === mid; })) return res.redirect('/missions');
    const payload = Buffer.from(JSON.stringify({ user: name, mid: mid, ts: Date.now() })).toString('base64url');
    const url = BASE_URL + '/missions/confirm?token=' + payload;
    const qr  = await QRCode.toDataURL(url, { width: 280, margin: 2 });
    res.send(page('Mission QR',
      '<h1>Show this to staff</h1>' +
      '<img src="' + qr + '" style="width:220px;height:220px;border-radius:12px;background:#fff;padding:8px;margin:12px auto;display:block"/>' +
      '<p style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px">' + escape(mission.title) + '</p>' +
      '<p style="color:#fbbf24;font-size:14px;margin-bottom:4px">+' + mission.reward_amount + ' ' + escape(mission.reward_type) + '</p>' +
      '<p style="color:#555;font-size:11px;margin-bottom:16px">Valid for 10 minutes — staff scans this on admin device</p>' +
      '<div class="info">Ask a staff member to scan this QR with the admin device to confirm your mission.</div>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

router.get('/missions/confirm', async function(req, res) {
  const { adminSessions } = require('../middleware/session');
  const token = req.cookies && req.cookies.adminToken;
  if (!token || !adminSessions.has(token)) {
    return res.send(page('Admin only',
      '<h1>Admin only</h1>' +
      '<p>This page can only be opened by an admin device.</p>' +
      '<a href="/hallmann" class="btn btn-blue">Admin Login</a>'
    ));
  }
  try {
    const raw     = Buffer.from(req.query.token || '', 'base64url').toString();
    const payload = JSON.parse(raw);
    if (Date.now() - payload.ts > MISSION_QR_TTL) {
      return res.send(page('QR Expired', '<h1>QR Expired</h1><p>This mission QR has expired. Ask the user to generate a new one.</p>'));
    }
    const mission = await getMission(payload.mid);
    if (!mission) return res.send(page('Error', '<h1>Mission not found</h1>'));
    const done = await getUserMissions(payload.user);
    if (done.find(function(c) { return c.mission_id === payload.mid; })) {
      return res.send(page('Already done', '<h1>Already completed</h1><p><strong>' + escape(payload.user) + '</strong> already completed this mission.</p>'));
    }
    const user = await getUser(payload.user);
    if (!user) return res.send(page('Error', '<h1>User not found</h1>'));
    await completeMission(payload.user, payload.mid);
    if (mission.reward_type==='points')     user.points     = (user.points||0)     + mission.reward_amount;
    if (mission.reward_type==='book')       user.book       = (user.book||0)       + mission.reward_amount;
    if (mission.reward_type==='games')      user.games      = (user.games||0)      + mission.reward_amount;
    if (mission.reward_type==='volunteers') user.volunteers = (user.volunteers||0) + mission.reward_amount;
    if (mission.reward_type==='film')       user.film       = (user.film||0)       + mission.reward_amount;
    await upsertUser(payload.user, user);
    res.send(page('Mission Complete!',
      '<h1>Mission Complete!</h1>' +
      '<p>Confirmed for <strong>' + escape(payload.user) + '</strong></p>' +
      '<div class="badge">+' + mission.reward_amount + ' ' + escape(mission.reward_type) + ' awarded!</div>' +
      '<p style="color:#aaa;font-size:13px">' + escape(mission.title) + '</p>' +
      '<a href="/hallmann/panel" class="btn btn-green" style="margin-top:16px">Back to panel</a>'
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;
