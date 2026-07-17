'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');

const { BASE_URL, ADMIN_URL, LEGAL_VERSION }          = require('../config');
const { getAllowedNames }                              = require('../db/pool');
const { isAdmin, adminSessions, createAdminSession }  = require('../middleware/session');
const { escape, page }                               = require('../views/layout');

// ==================== EVENTS PAGE ====================

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

// ==================== PRIVACY PAGE ====================

router.get('/privacy', function(req, res) {
  res.send(page('Privacy / RODO',
    '<h1>Privacy Policy</h1>' +
    '<h2>RODO / GDPR</h2>' +
    '<div style="text-align:left">' +
    '<p style="color:#fbbf24;font-size:13px;font-weight:600">PL - Polityka Prywatnosci</p>' +
    '<p><strong>Administrator danych:</strong> Krolestwo bez Kresu</p>' +
    '<p><strong>Co przechowujemy:</strong> Nazwe uzytkownika Hive, historie aktywnosci (wizyty, punkty, glosy), date ostatniej wizyty.</p>' +
    '<p><strong>Cel:</strong> Wylacznie spolecznosciowy. Dane nie sa udostepniane osobom trzecim ani wykorzystywane komercyjnie.</p>' +
    '<p><strong>Czas przechowywania:</strong> Do usuniecia konta lub zamkniecia projektu.</p>' +
    '<p><strong>Twoje prawa:</strong> Wglad, poprawa, usuniecie danych. Skontaktuj sie przez Instagram lub Facebook.</p>' +
    '<p><strong>Kontakt:</strong> <a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="color:#60a5fa">Instagram</a> | <a href="https://www.facebook.com/herberciarnia" target="_blank" style="color:#60a5fa">Facebook</a></p>' +
    '<hr>' +
    '<p style="color:#fbbf24;font-size:13px;font-weight:600">EN - Privacy Policy</p>' +
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

// ==================== FRONT PAGE (PIN login primary) ====================

router.get('/', function(req, res) {
  const name = req.cookies && req.cookies.userToken;
  if (name) return res.redirect('/home');
  if (!req.cookies || !req.cookies.consent) return res.redirect('/consent?next=' + encodeURIComponent('/'));
  res.send(page('QR Cafe',
    '<h1>QR Cafe</h1>' +
    '<h2>Witamy w Krolestwie!</h2>' +
    '<div id="msg"></div>' +
    '<input type="text" id="uname" placeholder="Username" maxlength="30"/>' +
    '<input type="password" id="pin" placeholder="PIN" maxlength="8"/>' +
    '<button class="btn btn-gold" onclick="doPinLogin()">Login</button>' +
    '<a href="/register" class="link">New here? Create account</a>' +
    '<hr>' +
    '<p style="font-size:12px;color:#666;margin-bottom:8px">Or use Hive Keychain</p>' +
    '<a href="hive://browser?url=' + encodeURIComponent(BASE_URL + '/') + '" class="btn btn-gray" id="open-keychain" style="font-size:13px;padding:10px">Open in Keychain App</a>' +
    '<script>' +
    'function doPinLogin(){' +
      'var u=document.getElementById("uname").value.trim().toLowerCase();' +
      'var p=document.getElementById("pin").value.trim();' +
      'if(!u||!p){document.getElementById("msg").innerHTML="<div class=\\"error\\">Fill both fields</div>";return;}' +
      'fetch("/login-pin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,pin:p})})' +
        '.then(function(x){return x.json();})' +
        '.then(function(d){' +
          'if(d.ok){window.location.href="/home";}' +
          'else{document.getElementById("msg").innerHTML="<div class=\\"error\\">"+d.error+"</div>";}' +
        '});' +
    '}' +
    'if(typeof window.hive_keychain!=="undefined"){' +
      'document.getElementById("open-keychain").style.display="none";' +
      'var btn=document.createElement("button");' +
      'btn.className="btn btn-gray";' +
      'btn.style.fontSize="13px";btn.style.padding="10px";' +
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

// ==================== PIN REGISTER ====================

router.get('/register', function(req, res) {
  res.send(page('Register',
    '<h1>Register</h1>' +
    '<h2>Create account (test)</h2>' +
    '<div id="msg"></div>' +
    '<input type="text" id="uname" placeholder="Username" maxlength="30"/>' +
    '<input type="password" id="pin" placeholder="PIN (4-8 digits)" maxlength="8"/>' +
    '<button class="btn btn-gold" onclick="doRegister()">Register</button>' +
    '<a href="/login-pin" class="link">Already have an account? Login</a>' +
    '<script>' +
    'function doRegister(){' +
      'var u=document.getElementById("uname").value.trim().toLowerCase();' +
      'var p=document.getElementById("pin").value.trim();' +
      'if(!u||!/^[a-z0-9._-]{3,30}$/.test(u)){document.getElementById("msg").innerHTML="<div class=\\"error\\">Username: 3-30 chars, a-z 0-9 . _ -</div>";return;}' +
      'if(!/^[0-9]{4,8}$/.test(p)){document.getElementById("msg").innerHTML="<div class=\\"error\\">PIN must be 4-8 digits</div>";return;}' +
      'fetch("/register-pin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,pin:p})})' +
        '.then(function(x){return x.json();})' +
        '.then(function(d){' +
          'if(d.ok){window.location.href="/home";}' +
          'else{document.getElementById("msg").innerHTML="<div class=\\"error\\">"+d.error+"</div>";}' +
        '});' +
    '}' +
    '</script>'
  ));
});

router.post('/register-pin', async function(req, res) {
  const username = (req.body.username||'').trim().toLowerCase();
  const pin      = (req.body.pin||'').trim();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return res.json({ ok:false, error:'Invalid username' });
  if (!/^[0-9]{4,8}$/.test(pin)) return res.json({ ok:false, error:'Invalid PIN' });
  const { pool } = require('../db/pool');
  const existing = await pool.query('SELECT hive_name, pin_hash FROM users WHERE hive_name=$1', [username]);
  if (existing.rows[0] && existing.rows[0].pin_hash) return res.json({ ok:false, error:'Username taken' });
  const hash = await bcrypt.hash(pin, 10);
  await pool.query(
    'INSERT INTO users (hive_name, pin_hash) VALUES ($1,$2) ON CONFLICT (hive_name) DO UPDATE SET pin_hash=$2',
    [username, hash]
  );
  res.cookie('userToken', username, { httpOnly:true, sameSite:'strict', maxAge:12*60*60*1000 });
  res.json({ ok:true });
});

// ==================== PIN LOGIN ====================

router.get('/login-pin', function(req, res) {
  res.send(page('Login',
    '<h1>Login</h1>' +
    '<h2>Username + PIN</h2>' +
    '<div id="msg"></div>' +
    '<input type="text" id="uname" placeholder="Username" maxlength="30"/>' +
    '<input type="password" id="pin" placeholder="PIN" maxlength="8"/>' +
    '<button class="btn btn-gold" onclick="doLogin()">Login</button>' +
    '<a href="/register" class="link">Need an account? Register</a>' +
    '<a href="/" class="link">Login with Keychain instead</a>' +
    '<script>' +
    'function doLogin(){' +
      'var u=document.getElementById("uname").value.trim().toLowerCase();' +
      'var p=document.getElementById("pin").value.trim();' +
      'if(!u||!p){document.getElementById("msg").innerHTML="<div class=\\"error\\">Fill both fields</div>";return;}' +
      'fetch("/login-pin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,pin:p})})' +
        '.then(function(x){return x.json();})' +
        '.then(function(d){' +
          'if(d.ok){window.location.href="/home";}' +
          'else{document.getElementById("msg").innerHTML="<div class=\\"error\\">"+d.error+"</div>";}' +
        '});' +
    '}' +
    '</script>'
  ));
});

router.post('/login-pin-auth', async function(req, res) {
  const username = (req.body.username||'').trim().toLowerCase();
  const pin      = (req.body.pin||'').trim();
  if (!username || !pin) return res.json({ ok:false, error:'Missing fields' });
  const { pool } = require('../db/pool');
  const r = await pool.query('SELECT pin_hash FROM users WHERE hive_name=$1', [username]);
  if (!r.rows[0] || !r.rows[0].pin_hash) return res.json({ ok:false, error:'Invalid username or PIN' });
  const ok = await bcrypt.compare(pin, r.rows[0].pin_hash);
  if (!ok) return res.json({ ok:false, error:'Invalid username or PIN' });
  res.cookie('userToken', username, { httpOnly:true, sameSite:'strict', maxAge:12*60*60*1000 });
  res.json({ ok:true });
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

router.post('/admin-auth', function(req, res) {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!isAdmin(username)) return res.json({ ok: false, error: 'Access denied.' });
  createAdminSession(res);
  res.json({ ok: true });
});

// ==================== DRINKS ====================

router.get('/drinks', function(req, res) {
  const name = req.cookies && req.cookies.userToken;
  if (!name) return res.redirect('/');
  const { navBar } = require('../views/layout');
  res.send(page('Buy a Drink',
    '<h1>Buy a Drink</h1>' +
    '<h2>Support Krolestwo with RCRT</h2>' +
    '<div class="section-card" style="text-align:left;margin-bottom:16px">' +
      '<div class="row-item"><span>Drink</span><span style="color:#fbbf24;font-weight:700">4 RCRT</span></div>' +
      '<div class="row-item"><span>Token</span><span style="color:#34d399">RCRT</span></div>' +
      '<div class="row-item"><span>Sends to</span><span style="color:#aaa">rcr account</span></div>' +
    '</div>' +
    '<div id="status" style="font-size:13px;color:#aaa;margin-bottom:12px"></div>' +
    '<button class="btn btn-gold" id="buy-btn" onclick="buyDrink()">Buy a drink - 0.001 HIVE</button>' +
    '<div id="confirm" style="display:none;margin-top:16px"><div class="success">Cheers! Show this screen to staff!</div></div>' +
    '<script>' +
    'function buyDrink(){' +
      'if(typeof window.hive_keychain==="undefined"){alert("Open in Keychain browser.");return;}' +
      'document.getElementById("buy-btn").disabled=true;' +
      'document.getElementById("status").innerText="Waiting for Keychain...";' +
      'window.hive_keychain.requestTransfer("' + name + '","rcr","0.001","drink","HIVE",function(r){' +
        'if(r.success){' +
          'document.getElementById("confirm").style.display="block";' +
          'document.getElementById("buy-btn").style.display="none";' +
          'document.getElementById("status").innerText="";' +
        '}else{' +
          'document.getElementById("status").innerText="Error: "+r.message;' +
          'document.getElementById("buy-btn").disabled=false;' +
        '}' +
      '});' +
    '}' +
    '</script>' +
    navBar()
  ));
});

// ==================== LOGOUT ====================

router.get('/logout', function(req, res) {
  res.clearCookie('userToken');
  res.clearCookie('adminToken');
  res.redirect('/');
});

module.exports = router;