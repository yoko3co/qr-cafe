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
    '@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes scaleIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}' +
    '@keyframes fillBar{from{width:0}to{width:var(--w,100%)}}' +
    '@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,0.3)}50%{box-shadow:0 0 0 8px rgba(251,191,36,0)}}' +
    '@keyframes glow{0%,100%{text-shadow:0 0 8px rgba(251,191,36,0.4)}50%{text-shadow:0 0 20px rgba(251,191,36,0.8),0 0 40px rgba(251,191,36,0.2)}}' +
    '@keyframes confettiFall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(80px) rotate(360deg);opacity:0}}' +
    '@keyframes checkIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}' +
    '.fade-up{animation:fadeUp 0.4s ease both}' +
    '.fade-up-1{animation:fadeUp 0.4s ease 0.1s both}' +
    '.fade-up-2{animation:fadeUp 0.4s ease 0.2s both}' +
    '.fade-up-3{animation:fadeUp 0.4s ease 0.3s both}' +
    '.fade-up-4{animation:fadeUp 0.4s ease 0.4s both}' +
    '.fade-up-5{animation:fadeUp 0.4s ease 0.5s both}' +
    '.scale-in{animation:scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both}' +
    '.glow-gold{animation:glow 3s infinite}' +
    '.pulse-gold{animation:pulse 3s infinite}' +
    'body{font-family:Arial,sans-serif;background:#0d0d1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}' +
    '.card{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:20px;padding:40px 32px;max-width:' + (wide ? '700px' : '480px') + ';width:100%;text-align:center;position:relative}' +
    'h1{font-size:2rem;margin:0 0 8px}' +
    'h2{font-size:1.3rem;color:#e0e0e0;margin:0 0 16px}' +
    'p{color:#aaa;margin:0 0 16px;line-height:1.6}' +
    'input[type=text],input[type=password],input[type=number]{width:100%;padding:13px 15px;font-size:15px;border-radius:10px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#fff;margin-bottom:10px;outline:none;box-sizing:border-box;transition:border-color 0.2s}' +
    'input:focus{border-color:rgba(251,191,36,0.5)}' +
    'select{width:100%;padding:12px;font-size:15px;border-radius:10px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#fff;margin-bottom:8px}' +
    '.btn{display:block;width:100%;padding:13px;font-size:16px;font-weight:600;border:none;border-radius:10px;cursor:pointer;margin-top:8px;text-decoration:none;text-align:center;box-sizing:border-box;transition:opacity 0.2s,transform 0.1s}' +
    '.btn:active{transform:scale(0.98)}' +
    '.btn-green{background:#4ade80;color:#052e16}' +
    '.btn-gold{background:#fbbf24;color:#1c0a00}' +
    '.btn-red{background:#f87171;color:#2d0000}' +
    '.btn-blue{background:#60a5fa;color:#0c1a3a}' +
    '.btn-gray{background:rgba(255,255,255,0.08);color:#fff;border:0.5px solid rgba(255,255,255,0.1)}' +
    '.btn-sm{padding:6px 14px;font-size:13px;width:auto;display:inline-block;margin:2px}' +
    '.badge{display:inline-block;background:rgba(251,191,36,0.15);color:#fbbf24;border:0.5px solid rgba(251,191,36,0.3);border-radius:999px;padding:6px 20px;font-weight:700;font-size:16px;margin-bottom:16px}' +
    '.tier-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(251,191,36,0.1);border:0.5px solid rgba(251,191,36,0.3);border-radius:999px;padding:4px 12px;font-size:12px;color:#fbbf24}' +
    '.error{color:#f87171;background:rgba(248,113,113,0.08);border:0.5px solid rgba(248,113,113,0.2);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
    '.success{color:#4ade80;background:rgba(74,222,128,0.08);border:0.5px solid rgba(74,222,128,0.2);padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
    '.info{color:#60a5fa;background:rgba(96,165,250,0.08);border:0.5px solid rgba(96,165,250,0.2);padding:12px;border-radius:8px;margin-bottom:12px;font-size:14px}' +
    'a.link{color:#60a5fa;display:block;margin-top:12px;font-size:14px;text-decoration:none}' +
    'hr{border:none;border-top:0.5px solid rgba(255,255,255,0.08);margin:20px 0}' +
    'strong{color:#fff}' +
    'table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}' +
    'th{color:#555;padding:8px;border-bottom:0.5px solid rgba(255,255,255,0.08);text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}' +
    'td{padding:9px 8px;border-bottom:0.5px solid rgba(255,255,255,0.05);text-align:left}' +
    '.bar-wrap{background:rgba(255,255,255,0.08);border-radius:999px;height:6px;overflow:hidden}' +
    '.bar{height:6px;border-radius:999px;background:linear-gradient(90deg,#fbbf24,#f59e0b);--w:100%;animation:fillBar 1s ease 0.3s both}' +
    '.tag{display:inline-block;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;font-size:13px;margin:3px}' +
    '.nav{display:flex;gap:6px;margin-top:20px;flex-wrap:wrap}' +
    '.nav a{flex:1;min-width:60px;font-size:13px}' +
    '.section-card{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:12px;text-align:left}' +
    '.section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}' +
    '.section-title{font-size:13px;font-weight:600;color:#fff}' +
    '.section-link{font-size:11px;color:#60a5fa;text-decoration:none}' +
    '.row-item{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.05);font-size:13px;color:#aaa}' +
    '.row-item:last-child{border-bottom:none}' +
    '.confetti-dot{position:absolute;width:5px;height:5px;border-radius:50%;animation:confettiFall 1.2s ease forwards}' +
    '</style>' +
    '</head><body><div class="card">' +
    body +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:12px;border-top:0.5px solid rgba(255,255,255,0.07)">' +
      '<a href="/hallmann" style="font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none">admin</a>' +
      '<span style="font-size:10px;color:rgba(255,255,255,0.2)">' + VERSION + ' · <a href="/privacy" style="color:rgba(255,255,255,0.2);text-decoration:none">RODO</a></span>' +
      '<a href="/logout" style="font-size:11px;color:rgba(255,255,255,0.2);text-decoration:none">logout</a>' +
    '</div>' +
    '</div></body></html>';
}

function navBar() {
  return '<div class="nav">' +
    '<a href="/home" class="btn btn-gray">Home</a>' +
    '<a href="/leaderboard" class="btn btn-gray">Leaders</a>' +
    '<a href="/missions" class="btn btn-gold">Missions</a>' +
    '<a href="/polls" class="btn btn-gray">Voting</a>' +
    '<a href="/events" class="btn btn-gray">Events</a>' +
    '<a href="/profile" class="btn btn-gray">Profile</a>' +
    '</div>';
}

module.exports = { escape, page, navBar };