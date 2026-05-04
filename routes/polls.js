'use strict';

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');

const { getAllPolls, getPoll, getUser, upsertUser, pool } = require('../db/pool');
const { getUserFromCookie }                               = require('../middleware/auth');
const { escape, page, navBar }                           = require('../views/layout');

const limitVote = rateLimit({ windowMs: 60 * 1000, max: 5, message: 'Too many vote attempts.' });

// In-memory toggle (admin can switch on/off without restart)
let blockchainVoting = true;
function getBlockchainVoting()      { return blockchainVoting; }
function setBlockchainVoting(value) { blockchainVoting = value; }

// ==================== POLLS PAGE ====================

router.get('/polls', async function(req, res) {
  const name = getUserFromCookie(req);
  try {
    let user      = name ? await getUser(name) : null;
    const isGuest = !user;
    const allPolls = await getAllPolls();
    let pollHtml   = '';

    if (allPolls.length === 0) {
      pollHtml = '<div class="info">No active polls right now.</div>';
    } else {
      for (const poll of allPolls) {
        if (poll.status === 'stopped') continue;
        const voted   = user && user.voted && user.voted[poll.id];
        const options = poll.options;
        const votes   = poll.votes;
        pollHtml += '<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;margin-bottom:16px;text-align:left">' +
          '<strong>' + escape(poll.question) + '</strong>';

        if (poll.status === 'paused') {
          pollHtml += '<p style="color:#f87171;font-size:13px;margin-top:8px">This poll is paused.</p>';
        } else if (isGuest) {
          pollHtml += '<p style="color:#aaa;font-size:13px;margin-top:8px">Login to vote.</p>';
          options.forEach(function(opt) {
            pollHtml += '<div class="btn btn-gray" style="margin-top:6px;opacity:0.5;text-align:left">' + escape(opt) + '</div>';
          });
        } else if (voted) {
          pollHtml += '<p style="color:#4ade80;font-size:13px;margin-top:8px">Voted: <strong>' + escape(options[voted.optIndex]) + '</strong></p>';
          const total = votes.reduce(function(a, b) { return a + b; }, 0);
          options.forEach(function(opt, i) {
            const pct = total > 0 ? Math.round((votes[i] / total) * 100) : 0;
            pollHtml += '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between"><span style="font-size:13px">' + escape(opt) + '</span><span style="color:#fbbf24;font-size:13px">' + pct + '%</span></div><div class="bar-wrap"><div class="bar" style="width:' + pct + '%"></div></div></div>';
          });
        } else {
          options.forEach(function(opt, i) {
            if (blockchainVoting) {
              pollHtml += '<button onclick="chainVote(\'' + poll.id + '\',' + i + ',this.innerText)" class="btn btn-gray" style="margin-top:6px;text-align:left">' + escape(opt) + '</button>';
            } else {
              pollHtml += '<a href="/poll-vote?pid=' + poll.id + '&opt=' + i + '" class="btn btn-gray" style="margin-top:6px;text-align:left">' + escape(opt) + '</a>';
            }
          });
        }
        pollHtml += '</div>';
      }
    }

    const chainScript = blockchainVoting && !isGuest
      ? '<script>' +
        'function chainVote(pid,opt,optText){' +
          'if(!confirm("Your vote for \\""+optText+"\\" will be recorded on Hive blockchain. Continue?")) return;' +
          'if(typeof window.hive_keychain==="undefined") return alert("Open in Keychain browser to vote on blockchain.");' +
          'var user="' + escape(name || '') + '";' +
          'var json=JSON.stringify({app:"qr-cafe",action:"vote",poll:pid,choice:opt,optionText:optText});' +
          'window.hive_keychain.requestCustomJson(user,"qr-cafe-vote","Posting","[]",json,"QR Cafe Vote",function(res){' +
            'if(res.success){window.location.href="/poll-vote?pid="+pid+"&opt="+opt;}' +
            'else{alert("Error: "+res.message);}' +
          '});' +
        '}' +
        '</script>'
      : '';

    res.send(page('Voting',
      '<h1>Voting</h1>' +
      pollHtml +
      chainScript +
      (isGuest ? '<a class="link" href="/">Login to vote</a>' : navBar())
    ));
  } catch (e) {
    res.send(page('Error', '<h1>Error</h1><p>' + escape(e.message) + '</p>'));
  }
});

// ==================== VOTE HANDLER ====================

router.get('/poll-vote', limitVote, async function(req, res) {
  const pid  = req.query.pid;
  const opt  = parseInt(req.query.opt);
  const name = getUserFromCookie(req);
  if (!name) return res.redirect('/');
  try {
    const poll = await getPoll(pid);
    const user = await getUser(name);
    if (!poll || !user)                                return res.redirect('/polls');
    if (poll.status !== 'active')                      return res.redirect('/polls');
    if (user.voted && user.voted[pid])                 return res.redirect('/polls');
    if (isNaN(opt) || opt < 0 || opt >= poll.options.length) return res.redirect('/polls');
    poll.votes[opt]++;
    if (!user.voted) user.voted = {};
    user.voted[pid] = { optIndex: opt };
    await pool.query('UPDATE polls SET votes=$1 WHERE id=$2', [JSON.stringify(poll.votes), pid]);
    await upsertUser(name, user);
    res.redirect('/polls');
  } catch (e) {
    res.redirect('/polls');
  }
});

module.exports = { router, getBlockchainVoting, setBlockchainVoting };
