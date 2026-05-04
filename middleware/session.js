'use strict';

const crypto = require('crypto');
const Tokens = require('csrf');
const { CSRF_SECRET, ADMIN_URL, ADMIN_ACCOUNTS } = require('../config');

const csrfTokens = new Tokens();
const adminSessions = new Set();

function generateCsrf() {
  return csrfTokens.create(CSRF_SECRET);
}

function validateCsrf(token) {
  return csrfTokens.verify(CSRF_SECRET, token || '');
}

function isAdmin(name) {
  return ADMIN_ACCOUNTS.includes((name || '').trim().toLowerCase());
}

function getUserFromCookie(req) {
  return (req.cookies && req.cookies.userToken) ? req.cookies.userToken : null;
}

function checkAdminSession(req, res) {
  const token = req.cookies && req.cookies.adminToken;
  if (!token || !adminSessions.has(token)) {
    res.redirect(ADMIN_URL);
    return false;
  }
  return true;
}

function createAdminSession(res) {
  const token = crypto.randomUUID();
  adminSessions.add(token);
  res.cookie('adminToken', token, { httpOnly: true, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 });
}

module.exports = {
  generateCsrf, validateCsrf,
  adminSessions, isAdmin,
  getUserFromCookie, checkAdminSession, createAdminSession,
};
