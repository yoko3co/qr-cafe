'use strict';

const express = require('express');
const router  = express.Router();

const { BASE_URL, ADMIN_URL, LEGAL_VERSION }          = require('../config');
const { getAllowedNames }                              = require('../db/pool');
const { isAdmin, adminSessions, createAdminSession }  = require('../middleware/session');
const { escape, page }                               = require('../views/layout');

// ==================== PRIVACY PAGE ====================

router.get('/events', function(req, res) {
  res.send(page('Events',
    '<h1>Events</h1>' +
    '<h2>Upcoming at Krolestwo</h2>' +
    '<div style="margin:-20px -32px 0;position:relative">' +
      '<iframe src="https://lu.ma/embed/calendar/cal-EubuBUyhB1cAGeA/events" ' +
        'style="width:100%;height:600px;border:none;border-radius:0 0 20px 20px;" ' +
        'allowfullscreen ' +
        'aria-hidden="false" ' +
        'tabindex="0">' +
      '</iframe>' +
      '<div style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;border-radius:0 0 20px 20px"></div>' +
    '</div>' +
    '<div class="info" style="margin-top:16px;font-size:13px">To register for events visit <a href="https://lu.ma/kbk.events" target="_blank" style="color:#fbbf24">lu.ma/kbk.events</a></div>'
  ));
});

router.get('/privacy', function(req, res) {
  res.send(page('Privacy / RODO',
    '<h1>Privacy Policy</h1>' +
    '<h2>RODO / GDPR</h2>' +
    '<div style="text-align:left">' +
    '<p style="color:#fbbf24;font-size:13px;font-weight:600">PL — Polityka Prywatnosci</p>' +
    '<p><strong>Administrator danych:</strong> Krolestwo bez Kresu</p>' +
    '<p><strong>Co przechowujemy:</strong> Nazwe uzytkownika Hive, historie aktywnosci (wizyty, punkty, glosy), date ostatniej wizyty.</p>' +
    '<p><strong>Cel:</strong> Wylacznie spolecznosciowy. Dane nie sa udostepniane osobom trzecim ani wykorzystywane komercyjnie.</p>' +
    '<p><strong>Czas przechowywania:</strong> Do usuniecia konta lub zamkniecia projektu.</p>' +
    '<p><strong>Twoje prawa:</strong> Wglad, poprawa, usuniecie danych. Skontaktuj sie przez Instagram lub Facebook.</p>' +
    '<p><strong>Kontakt:</strong> <a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="color:#60a5fa">Instagram</a> | <a href="https://www.facebook.com/herberciarnia" target="_blank" style="color:#60a5fa">Facebook</a></p>' +
    '<hr>' +
    '<p style="color:#fbbf24;font-size:13px;font-weight:600">EN — Privacy Policy</p>' +
    '<p><strong>Data controller:</strong> Krolestwo bez Kresu</p>' +
    '<p><strong>What we store:</strong> Hive username, activity history (visits, points, votes), last visit date.</p>' +
    '<p><strong>Purpose:</strong> Community use only. Data is never shared with third parties or used commercially.</p>' +
    '<p><strong>Retention:</strong> Until account deletion or project closure.</p>' +
    '<p><strong>Your rights:</strong> Access, correct and delete your data. Contact us via Instagram or Facebook.</p>' +
    '<p><strong>Contact:</strong> <a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="color:#60a5fa">Instagram</a> | <a href="https://www.facebook.com/herberciarnia" target="_blank" style="color:#60a5fa">Facebook</a></p>' +
    '</div>' +
    '<a href="/" class="btn btn-gray" style="margin-top:8px">Back</a>'
  ));
});

// ==================== CONSENT PAGE ====================

router.get('/consent', function(req, res) {
  const next = req.query.next || '/';
  res.send(page('RODO / GDPR',
    '<h1>Krolestwo</h1>' +
    '<h2>Zgoda / Consent</h2>' +
    '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;text-align:left;margin-bottom:16px">' +
      '<p style="font-size:14px;color:#fff;margin-bottom:8px"><strong>PL:</strong> Zgadzam sie na przetwarzanie moich danych osobowych (nazwa Hive, historia aktywnosci) przez Krolestwo wylacznie w celach spolecznosciowych, zgodnie z RODO. Dane nie sa udostepniane osobom trzecim.</p>' +
      '<p style="font-size:13px;color:#aaa;margin-bottom:0"><strong>EN:</strong> I agree to the processing of my personal data (Hive username, activity history) by Krolestwo for community purposes only, in accordance with GDPR. Data is not shared with third parties.</p>' +
    '</div>' +
    '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:13px;color:#aaa;margin-bottom:16px;text-align:left">' +
      '<input type="checkbox" id="consent-check" style="margin-top:3px;width:auto;flex-shrink:0"/>' +
      '<span>Rozumiem i zgadzam sie / I understand and agree</span>' +
    '</label>' +
    '<button class="btn btn-gold" onclick="accept()">Continue</button>' +
    '<script>' +
    'function accept(){' +
      'if(!document.getElementById("consent-check").checked)return alert("Please tick the box to continue.");' +
      'document.cookie="consent=1;path=/;max-age=31536000";' +
      'window.location.href=decodeURIComponent("' + encodeURIComponent(next) + '");' +
    '}' +
    '</script>'
  ));
});

// ==================== LOGIN PAGE ====================

router.get('/', function(req, res) {
  const name = req.cookies && req.cookies.userToken;
  if (name) return res.redirect('/home');
  if (!req.cookies || !req.cookies.consent) return res.redirect('/consent?next=' + encodeURIComponent('/'));
  res.send(page('QR Cafe',
    '<h1>QR Cafe</h1>' +
    '<h2>Witamy w Krolestwie!</h2>' +
    '<div class="info">Chcesz zalozyc konto?<br><strong>Zapytaj w Krolestwie!</strong></div>' +
    '<hr>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/') + '" class="btn btn-blue" id="open-keychain">Open in Keychain App</a>' +
    '<script>' +
    'if(typeof window.hive_keychain!=="undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-blue";' +
      'btn.innerText="Login with Hive Keychain";' +
      'btn.onclick=function(){' +
        'window.hive_keychain.requestSignBuffer(null,"qrcafe-login","Posting",function(r){' +
          'if(r.success){' +
            'fetch("/keychain-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:r.data.username,consent:true})})' +
            '.then(function(x){return x.json();})' +
            '.then(function(d){if(d.ok){window.location.href="/home";}else{alert(d.error||"Error");}});' +
          '}else{alert("Error: "+r.message);}' +
        '});' +
      '};' +
      'document.getElementById("open-keychain").insertAdjacentElement("afterend",btn);' +
    '}' +
    '</script>' +
    '<a class="link" href="/leaderboard">View Leaderboard</a>' +
    '<a class="link" href="/polls">View Polls</a>'
  ));
});

// ==================== KEYCHAIN AUTH ====================

router.post('/keychain-auth', async function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!username) return res.json({ ok: false, error: 'No username' });
  if (!req.body.consent) return res.json({ ok: false, error: 'Please agree to the terms to continue' });
  const names = await getAllowedNames();
  if (!names.has(username) && !isAdmin(username)) {
    return res.json({ ok: false, error: 'Your name is not on the guest list' });
  }
  const { pool } = require('../db/pool');
  await pool.query('UPDATE users SET legal_version=$1 WHERE hive_name=$2', [LEGAL_VERSION, username]).catch(function(){});
  res.cookie('userToken', username, { httpOnly: true, sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

// ==================== ADMIN LOGIN ====================

router.get('/hallmann', function(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  if (token && adminSessions.has(token)) return res.redirect(ADMIN_URL + '/panel');
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(page('Admin Login',
    '<h1>Admin Login</h1>' +
    '<h2>QR Cafe</h2>' +
    (error ? '<div class="error">' + escape(error) + '</div>' : '') +
    '<input type="text" id="uname" placeholder="Your Hive username"/>' +
    '<button class="btn btn-blue" onclick="doLogin()">Login with Keychain</button>' +
    '<a href="/" class="btn btn-gray">Home</a>' +
    '<script>' +
    'function doLogin(){' +
      'var u=document.getElementById("uname").value.trim().toLowerCase();' +
      'if(!u)return alert("Enter your Hive username");' +
      'if(typeof window.hive_keychain==="undefined")return alert("Open this page inside Keychain browser.");' +
      'window.hive_keychain.requestSignBuffer(u,"qrcafe-admin-login","Posting",function(r){' +
        'if(r.success){' +
          'fetch("/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:r.data.username})})' +
          '.then(function(x){return x.json();})' +
          '.then(function(d){' +
            'if(d.ok){window.location.href="' + ADMIN_URL + '/panel";}' +
            'else{alert(d.error||"Access denied");}' +
          '});' +
        '}else{alert("Keychain error: "+r.message);}' +
      '});' +
    '}' +
    '</script>'
  ));
});



router.get('/logout', function(req, res) {
  res.clearCookie('userToken');
  res.clearCookie('adminToken');
  res.redirect('/');
});

router.post('/admin-auth', function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!isAdmin(username)) return res.json({ ok: false, error: 'Access denied.' });
  createAdminSession(res);
  res.json({ ok: true });
});

module.exports = router;