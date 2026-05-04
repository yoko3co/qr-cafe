'use strict';

const Tokens  = require('csrf');
const { CSRF_SECRET, ADMIN_URL, ADMIN_ACCOUNTS } = require('../config');

const csrfTokens = new Tokens();

// ==================== CSRF ====================

function generateCsrf() {
  return csrfTokens.create(CSRF_SECRET);
}

function validateCsrf(token) {
  return csrfTokens.verify(CSRF_SECRET, token || '');
}

// ==================== SESSION ====================

// In-memory admin sessions (UUID tokens)
const adminSessions = new Set();

function isAdmin(name) {
  return ADMIN_ACCOUNTS.includes((name || '').trim().toLowerCase());
}

function getUserFromCookie(req) {
  return req.cookies && req.cookies.userToken ? req.cookies.userToken : null;
}

function checkAdminToken(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  if (!token || !adminSessions.has(token)) {
    res.redirect(ADMIN_URL);
    return false;
  }
  return token;
}

function requireUser(req, res) {
  const name = getUserFromCookie(req);
  if (!name) { res.redirect('/'); return false; }
  return name;
}

module.exports = {
  generateCsrf,
  validateCsrf,
  adminSessions,
  isAdmin,
  getUserFromCookie,
  checkAdminToken,
  requireUser,
};
module.exports = router;
