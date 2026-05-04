'use strict';

const express   = require('express');
const router    = express.Router();
const QRCode    = require('qrcode');
const rateLimit = require('express-rate-limit');
const crypto    = require('crypto');

const { BASE_URL, ADMIN_URL, DAY, SESSION_TTL, VERSION } = require('../config');
const { getAllowedNames, getUser, upsertUser }            = require('../db/pool');
const { isAdmin, adminSessions, checkAdminToken }         = require('../middleware/auth');
const { escape, page, navBar }                           = require('../views/layout');

const limitDefault = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Too many requests, slow down.' });

// In-memory QR sessions { sid -> { expiresAt, event } }
const sessions = new Map();

// ==================== QR DISPLAY (admin only) ====================

router.get('/qr', async function(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  if (!token || !adminSessions.has(token)) return res.redirect(ADMIN_URL);
  const sid   = crypto.randomUUID();
  const event = req.query.event || 'none';
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL, event });
  const url = BASE_URL + '/check?session=' + sid;
  const qr  = await QRCode.toDataURL(url, { width: 320, margin: 2 });
  res.send(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;font-family:Arial,sans-serif;color:#fff;text-align:center}' +
    'h1{font-size:2rem;margin-bottom:4px}.event{color:#fbbf24;font-size:14px;margin-bottom:16px}' +
    '.version{position:fixed;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.2)}' +
    '.back{position:fixed;bottom:12px;left:16px;font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none}</style>' +
    '<script>setTimeout(function(){window.location.reload();},60000);</script>' +
    '</head><body>' +
    '<h1>QR Cafe</h1>' +
    '<p style="color:#aaa;margin-bottom:4px">Scan to check in</p>' +
    (event !== 'none' ? '<p class="event">Event: ' + escape(event.charAt(0).toUpperCase() + event.slice(1)) + '</p>' : '<p style="color:#555;font-size:13px">Standard check-in</p>') +
    '<img src="' + qr + '" style="width:300px;height:300px;border-radius:16px"/>' +
    '<p style="color:#555;font-size:13px;margin-top:16px">Refreshes every minute</p>' +
    '<span class="version">' + VERSION + '</span>' +
    '<a href="' + ADMIN_URL + '/panel" class="back">back to panel</a>' +
    '</body></html>'
  );
});

// ==================== CHECK IN PAGE ====================

router.get('/check', function(req, res) {
  const session = req.query.session;
  const s = sessions.get(session);
  if (!s)                       return res.send(page('Invalid QR', '<h1>Invalid QR Code</h1><p>Please scan a fresh QR code.</p>'));
  if (Date.now() > s.expiresAt) return res.send(page('Expired',    '<h1>QR Code Expired</h1><p>Please scan a fresh QR code.</p>'));
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Check In',
    '<h1>QR Cafe</h1>' +
    '<h2>Check In</h2>' +
    (error ? '<div class="error">' + escape(error) + '</div>' : '') +
    '<p>Sign in with Hive Keychain to check in and earn points.</p>' +
    '<input type="text" id="hive-username" placeholder="Your Hive username"/>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/check?session=' + session) + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'document.getElementById("hive-username").style.display="none";' +
      'window.hive_keychain.requestSignBuffer(null,"qrcafe-checkin-' + session + '","Posting",function(res){' +
        'if(res.success){window.location.href="/hive-checkin?session=' + session + '&user="+encodeURIComponent(res.data.username);}' +
        'else{' +
          'document.getElementById("hive-username").style.display="block";' +
          'var btn=document.createElement("button");' +
          'btn.className="btn btn-green";' +
          'btn.innerText="Try again";' +
          'btn.onclick=function(){window.location.reload();};' +
          'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
          'alert("Error: "+res.message);' +
        '}' +
      '});' +
    '}' +
    '</script>'
  ));
});

// ==================== HIVE CHECK-IN HANDLER ====================

router.get('/hive-checkin', limitDefault, async function(req, res) {
  const session = req.query.session;
  const name    = (req.query.user || '').trim().toLowerCase();
  const s       = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) {
    return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  }
  try {
    const allowedNames = await getAllowedNames();
    if (!allowedNames.has(name) && !isAdmin(name)) {
      return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Your name is not on the guest list'));
    }
    let user = await getUser(name);
    if (!user) {
      await upsertUser(name, { points: 0, book: 0, games: 0, volunteers: 0, film: 0, last_visit: 0, voted: {}, random_presses: 0, random_day: 0 });
      user = await getUser(name);
    }

    const withinWindow = user.last_visit && Date.now() - user.last_visit < DAY;
    const eventsToday  = withinWindow ? (user.events_today || {}) : {};
    const eventType    = s.event || 'none';

    if (withinWindow) {
      if (eventType === 'none') {
        const next = new Date(user.last_visit + DAY).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return res.send(page('Already Checked In',
          '<h1>Already checked in!</h1>' +
          '<p>Hey <strong>' + escape(user.hive_name) + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
          '<div class="badge">' + (user.points || 0).toFixed(1) + ' points</div>' +
          navBar()
        ));
      }
      if (eventsToday[eventType]) {
        return res.send(page('Already earned!',
          '<h1>Already earned!</h1>' +
          '<p>You already got your <strong>' + escape(eventType) + '</strong> coin today.</p>' +
          '<div class="badge">' + (user.points || 0).toFixed(1) + ' points</div>' +
          navBar()
        ));
      }
      // Award event coin (within window, different event)
      user.events_today = eventsToday;
      if (eventType === 'book')       { user.book       = (user.book       || 0) + 1; user.events_today.book       = true; }
      if (eventType === 'games')      { user.games      = (user.games      || 0) + 1; user.events_today.games      = true; }
      if (eventType === 'volunteers') { user.volunteers = (user.volunteers || 0) + 1; user.events_today.volunteers = true; }
      if (eventType === 'film')       { user.film       = (user.film       || 0) + 1; user.events_today.film       = true; }
      await upsertUser(name, user);
      return res.send(page('Event coin earned!',
        '<h1>Event coin earned!</h1>' +
        '<h2>' + escape(user.hive_name) + '</h2>' +
        '<p>You earned a <strong>' + escape(eventType.charAt(0).toUpperCase() + eventType.slice(1)) + '</strong> coin!</p>' +
        '<div class="badge">+1 ' + escape(eventType) + ' coin - Total points: ' + (user.points || 0).toFixed(1) + '</div>' +
        navBar()
      ));
    }

    // Fresh check-in
    user.last_visit  = Date.now();
    user.points      = (user.points || 0) + 1;
    user.events_today = {};
    if (eventType === 'book')       { user.book       = (user.book       || 0) + 1; user.events_today.book       = true; }
    if (eventType === 'games')      { user.games      = (user.games      || 0) + 1; user.events_today.games      = true; }
    if (eventType === 'volunteers') { user.volunteers = (user.volunteers || 0) + 1; user.events_today.volunteers = true; }
    if (eventType === 'film')       { user.film       = (user.film       || 0) + 1; user.events_today.film       = true; }
    await upsertUser(name, user);
    res.cookie('userToken', name, { httpOnly: true, sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000 });
    const coinMsg = eventType !== 'none' ? ' +1 ' + eventType.charAt(0).toUpperCase() + eventType.slice(1) + ' coin' : '';
    res.send(page('Welcome!',
      '<h1>Witamy w Krolestwie!</h1>' +
      '<h2>Welcome, ' + escape(user.hive_name) + '!</h2>' +
      '<p>Checked in with Hive Keychain!</p>' +
      '<div class="badge">+1 point' + coinMsg + ' - Total: ' + user.points.toFixed(1) + '</div>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;
