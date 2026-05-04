'use strict';

const crypto = require('crypto');

module.exports = {
  PORT:            process.env.PORT || 3000,
  BASE_URL:        process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com',
  ADMIN_URL:       '/hallmann',
  VERSION:         'Krolestwo.4.0',
  HIVE_ACCOUNT:    'test3333',
  ADMIN_ACCOUNTS:  ['hallmann', 'hivedocu', 'test3333'],
  CSRF_SECRET:     process.env.CSRF_SECRET || crypto.randomUUID(),

  // 12 hours — check-in reset window
  DAY:             12 * 60 * 60 * 1000,
  // 1 hour — QR session TTL
  SESSION_TTL:     60 * 60 * 1000,
};
