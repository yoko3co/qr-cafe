'use strict';

const express   = require('express');
const router    = express.Router();
const QRCode    = require('qrcode');
const rateLimit = require('express-rate-limit');
const crypto    = require('crypto');

const { BASE_URL, ADMIN_URL, DAY, SESSION_TTL, VERSION } = require('../config');
const { getAllowedNames, getUser, upsertUser }            = require('../db/pool');
const { isAdmin, adminSessions }                         = require('../middleware/session');
const { escape, page, navBar }                          = require('../views/layout');

const limitCheckin = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Too many requests.' });

const sessions = new Map();

router.get('/qr', async function(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  if (!token || !adminSessions.has(token)) return res.redirect(ADMIN_URL);
  const sid   = crypto.randomUUID();
  const event = req.query.event || 'none';
  sessions.set(sid, { expiresAt: Date.now() + SESSION_TTL, event: event });
  const url = BASE_URL + '/check?session=' + sid;
  const qr  = await QRCode.toDataURL(url, { width: 320, margin: 2 });
  res.send(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;font-family:Arial,sans-serif;color:#fff;text-align:center}' +
    'h1{font-size:2rem;margin-bottom:4px}.version{position:fixed;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.2)}' +
    '.back{position:fixed;bottom:12px;left:16px;font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none}</style>' +
    '<script>setTimeout(function(){window.location.reload();},60000);</script>' +
    '</head><body>' +
    '<h1>QR Cafe</h1>' +
    '<p style="color:#aaa;margin-bottom:4px">Scan to check in</p>' +
    (event !== 'none' ? '<p style="color:#fbbf24;font-size:14px;margin-bottom:16px">Event: ' + escape(event.charAt(0).toUpperCase()+event.slice(1)) + '</p>' : '<p style="color:#555;font-size:13px;margin-bottom:16px">Standard check-in</p>') +
    '<img src="' + qr + '" style="width:300px;height:300px;border-radius:16px"/>' +
    '<p style="color:#555;font-size:13px;margin-top:16px">Refreshes every minute</p>' +
    '<span class="version">' + VERSION + '</span>' +
    '<a href="' + ADMIN_URL + '/panel" class="back">back to panel</a>' +
    '</body></html>'
  );
});

router.get('/check', function(req, res) {
  const s = sessions.get(req.query.session);
  if (!s) return res.send(page('Invalid QR', '<h1>Invalid QR Code</h1><p>Please scan a fresh QR code.</p>'));
  if (Date.now() > s.expiresAt) return res.send(page('Expired', '<h1>QR Code Expired</h1><p>Please scan a fresh QR code.</p>'));
  if (!req.cookies || !req.cookies.consent) return res.redirect('/consent?next=' + encodeURIComponent('/check?session=' + req.query.session));
if (!req.cookies || !req.cookies.consent) return res.redirect('/consent?next=' + encodeURIComponent('/check?session=' + req.query.session));  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Check In',
    '<h1>QR Cafe</h1><h2>Check In</h2>' +
    (error ? '<div class="error">' + escape(error) + '</div>' : '') +
    '<p>Sign in with Hive Keychain to check in and earn points.</p>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/check?session=' + req.query.session) + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain!=="undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'window.hive_keychain.requestSignBuffer(null,"qrcafe-checkin-' + req.query.session + '","Posting",function(r){' +
        'if(r.success){window.location.href="/hive-checkin?session=' + req.query.session + '&user="+encodeURIComponent(r.data.username);}' +
        'else{document.getElementById("open-keychain").style.display="block";alert("Error: "+r.message);}' +
      '});' +
    '}' +
    '</script>'
  ));
});

router.get('/hive-checkin', limitCheckin, async function(req, res) {
  const session = req.query.session;
  const name    = (req.query.user || '').trim().toLowerCase();
  const s       = sessions.get(session);
  if (!s || Date.now() > s.expiresAt) {
    return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Session expired'));
  }
  try {
    const names = await getAllowedNames();
    if (!names.has(name) && !isAdmin(name)) {
      return res.redirect('/check?session=' + session + '&error=' + encodeURIComponent('Your name is not on the guest list'));
    }
    let user = await getUser(name);
    if (!user) {
      await upsertUser(name, { points:0, book:0, games:0, volunteers:0, film:0, last_visit:0, events_today:{}, voted:{}, random_presses:0, random_day:0 });
      user = await getUser(name);
    }
const withinWindow = user.last_visit && (Date.now() - user.last_visit < DAY);
    res.cookie('userToken', name, { httpOnly: true, sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000 });
    const eventsToday  = withinWindow ? (user.events_today || {}) : {};
    const eventType    = s.event || 'none';

    if (withinWindow) {
      if (eventType === 'none') {
        const next = new Date(user.last_visit + DAY).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
        return res.send(page('Already Checked In',
          '<h1>Already checked in!</h1>' +
          '<p>Hey <strong>' + escape(user.hive_name) + '</strong>, come back after <strong>' + next + '</strong>.</p>' +
          '<div class="badge">' + (user.points||0).toFixed(1) + ' points</div>' +
          navBar()
        ));
      }
      if (eventsToday[eventType]) {
        return res.send(page('Already earned!',
          '<h1>Already earned!</h1>' +
          '<p>You already got your <strong>' + escape(eventType) + '</strong> coin today.</p>' +
          '<div class="badge">' + (user.points||0).toFixed(1) + ' points</div>' +
          navBar()
        ));
      }
      user.events_today = eventsToday;
      if (eventType==='book')       { user.book       = (user.book||0)+1;       user.events_today.book=true; }
      if (eventType==='games')      { user.games      = (user.games||0)+1;      user.events_today.games=true; }
      if (eventType==='volunteers') { user.volunteers = (user.volunteers||0)+1; user.events_today.volunteers=true; }
      if (eventType==='film')       { user.film       = (user.film||0)+1;       user.events_today.film=true; }
      await upsertUser(name, user);
      return res.send(page('Event coin earned!',
        '<h1>Event coin earned!</h1>' +
        '<h2>' + escape(user.hive_name) + '</h2>' +
        '<p>You earned a <strong>' + escape(eventType.charAt(0).toUpperCase()+eventType.slice(1)) + '</strong> coin!</p>' +
        '<div class="badge">+1 ' + escape(eventType) + ' coin</div>' +
        navBar()
      ));
    }

    user.last_visit   = Date.now();
    user.points       = (user.points||0) + 1;
    user.events_today = {};
    if (eventType==='book')       { user.book       = (user.book||0)+1;       user.events_today.book=true; }
    if (eventType==='games')      { user.games      = (user.games||0)+1;      user.events_today.games=true; }
    if (eventType==='volunteers') { user.volunteers = (user.volunteers||0)+1; user.events_today.volunteers=true; }
    if (eventType==='film')       { user.film       = (user.film||0)+1;       user.events_today.film=true; }
    await upsertUser(name, user);
    res.cookie('userToken', name, { httpOnly: true, sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000 });
    const coinMsg = eventType !== 'none' ? ' +1 ' + eventType.charAt(0).toUpperCase()+eventType.slice(1)+' coin' : '';
    res.send(page('Welcome!',
      '<h1>Witamy w Krolestwie!</h1>' +
      '<h2>Welcome, ' + escape(user.hive_name) + '!</h2>' +
      '<div class="badge">+1 point' + coinMsg + ' - Total: ' + user.points.toFixed(1) + '</div>' +
      navBar()
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

module.exports = router;
