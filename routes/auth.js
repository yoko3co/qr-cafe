'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

const { BASE_URL, ADMIN_URL }                  = require('../config');
const { getAllowedNames }                       = require('../db/pool');
const { isAdmin, adminSessions }               = require('../middleware/session');
const { escape, page }                         = require('../views/layout');

router.get('/', function(req, res) {
  res.send(page('QR Cafe',
    '<h1>QR Cafe</h1>' +
    '<h2>Witamy w Krolestwie!</h2>' +
    '<div class="info">Chcesz zalozyc konto?<br><strong>Zapytaj w Krolestwie!</strong></div>' +
    '<hr>' +
    '<p style="font-size:11px;color:#555;margin-bottom:12px">By logging in you agree that your participation data is stored solely for community engagement.</p>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/') + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain !== "undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-blue";' +
      'btn.innerText="Login with Hive Keychain";' +
      'btn.onclick=function(){' +
        'window.hive_keychain.requestSignBuffer(null,"qrcafe-login","Posting",function(res){' +
          'if(res.success){' +
            'fetch("/keychain-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:res.data.username})})' +
            '.then(function(r){return r.json();})' +
            '.then(function(d){if(d.ok){window.location.href="/home";}else{alert(d.error||"Error");}});' +
          '} else{alert("Error: "+res.message);}' +
        '});' +
      '};' +
      'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
    '}' +
    '</script>' +
    '<a class="link" href="/leaderboard">View Leaderboard</a>' +
    '<a class="link" href="/polls">View Polls</a>'
  ));
});

router.post('/keychain-auth', async function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!username) return res.json({ ok: false, error: 'No username' });
  const allowedNames = await getAllowedNames();
  if (!allowedNames.has(username) && !isAdmin(username)) {
    return res.json({ ok: false, error: 'Your name is not on the guest list' });
  }
  res.cookie('userToken', username, { httpOnly: true, sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

router.get('/hallmann', function(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  if (token && adminSessions.has(token)) return res.redirect(ADMIN_URL + '/panel');
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Admin Login',
    '<h1>Admin Login</h1>' +
    (error ? '<div class="error">' + escape(error) + '</div>' : '') +
    '<input type="text" id="admin-username" placeholder="Your Hive username"/>' +
    '<button class="btn btn-blue" onclick="adminLogin()">Login with Keychain</button>' +
    '<a href="/" class="btn btn-gray">Home</a>' +
    '<script>' +
    'function adminLogin(){' +
      'var u=document.getElementById("admin-username").value.trim().toLowerCase();' +
      'if(!u) return alert("Enter your Hive username");' +
      'if(typeof window.hive_keychain==="undefined") return alert("Open this page inside Keychain browser.");' +
      'window.hive_keychain.requestSignBuffer(u,"qrcafe-admin-login","Posting",function(res){' +
        'if(res.success){' +
          'fetch("/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:res.data.username})})' +
          '.then(function(r){return r.json();})' +
          '.then(function(d){' +
            'if(d.ok){window.location.href="' + ADMIN_URL + '/panel";}' +
            'else{alert(d.error||"Access denied");}' +
          '});' +
        '} else{alert("Keychain error: "+res.message);}' +
      '});' +
    '}' +
    '</script>'
  ));
});

router.post('/admin-auth', function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!isAdmin(username)) return res.json({ ok: false, error: 'Access denied.' });
  const token = crypto.randomUUID();
  adminSessions.add(token);
  res.cookie('adminToken', token, { httpOnly: true, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

module.exports = router;