'use strict';

const { VERSION } = require('../config');

function escape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title, body, wide) {
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escape(title) + ' | QR Cafe</title>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
    '.card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:40px 32px;max-width:' + (wide ? '700px' : '480px') + ';width:100%;text-align:center;position:relative}' +
    '.version{position:absolute;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.25)}' +
    'h1{font-size:2rem;margin:0 0 8px}' +
    'h2{font-size:1.3rem;color:#e0e0e0;margin:0 0 16px}' +
    'p{color:#aaa;margin:0 0 16px;line-height:1.6}' +
    'input[type=text],input[type=password],input[type=number]{width:100%;padding:13px 15px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:10px;outline:none;box-sizing:border-box}' +
    'select{width:100%;padding:12px;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:#fff;margin-bottom:8px}' +
    '.btn{display:block;width:100%;padding:13px;font-size:16px;font-weight:600;border:none;border-radius:10px;cursor:pointer;margin-top:8px;text-decoration:none;text-align:center;box-sizing:border-box}' +
    '.btn-green{background:#4ade80;color:#052e16}' +
    '.btn-gold{background:#fbbf24;color:#1c0a00}' +
    '.btn-red{background:#f87171;color:#2d0000}' +
    '.btn-blue{background:#60a5fa;color:#0c1a3a}' +
    '.btn-gray{background:rgba(255,255,255,0.1);color:#fff}' +
    '.btn-sm{padding:6px 14px;font-size:13px;width:auto;display:inline-block;margin:2px}' +
    '.badge{display:inline-block;background:#fbbf24;color:#1c0a00;border-radius:999px;padding:6px 20px;font-weight:700;font-size:16px;margin-bottom:16px}' +
    '.error{color:#f87171;background:rgba(248,113,113,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
    '.success{color:#4ade80;background:rgba(74,222,128,0.1);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
    '.info{color:#60a5fa;background:rgba(96,165,250,0.1);padding:12px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
    'a.link{color:#60a5fa;display:block;margin-top:12px;font-size:14px;text-decoration:none}' +
    'hr{border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0}' +
    'strong{color:#fff}' +
    'table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}' +
    'th{color:#aaa;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:left}' +
    'td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:left}' +
    '.bar-wrap{background:rgba(255,255,255,0.1);border-radius:999px;height:10px;margin-top:6px}' +
    '.bar{background:#fbbf24;height:10px;border-radius:999px}' +
    '.tag{display:inline-block;background:rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;font-size:13px;margin:3px}' +
    '.nav{display:flex;gap:8px;margin-top:20px;flex-wrap:wrap}' +
    '.nav a{flex:1;min-width:80px}' +
    '</style>' +
    '</head><body><div class="card">' +
    body +
    '<div style="margin-top:20px">' +
    '<a href="https://www.instagram.com/krolestwo.bez.kresu/" target="_blank" style="margin:0 8px;text-decoration:none;font-size:20px">📸</a>' +
    '<a href="https://www.facebook.com/herberciarnia" target="_blank" style="margin:0 8px;text-decoration:none;font-size:20px">📘</a>' +
    '</div>' +
'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07)">' +
      '<a href="/hallmann" style="font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none">admin</a>' +
      '<span style="font-size:10px;color:rgba(255,255,255,0.2)">' + VERSION + ' · <a href="/privacy" style="color:rgba(255,255,255,0.2);text-decoration:none">RODO</a></span>' +
      '<span style="font-size:10px;color:rgba(255,255,255,0.2)">Ask at Krolestwo</span>' +
    '</div>' }

function navBar() {
  return '<div class="nav">' +
    '<a href="/home" class="btn btn-gray">Home</a>' +
    '<a href="/leaderboard" class="btn btn-gray">Leaders</a>' +
    '<a href="/missions" class="btn btn-gold">Missions</a>' +
    '<a href="/polls" class="btn btn-gray">Voting</a>' +
    '<a href="/profile" class="btn btn-gray">Profile</a>' +
    '</div>';
}

module.exports = { escape, page, navBar };
