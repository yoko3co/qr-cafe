'use strict';

const crypto = require('crypto');

module.exports = {
  PORT:           process.env.PORT || 3000,
  BASE_URL:       process.env.BASE_URL || 'https://qr-cafe-shh2.onrender.com',
  ADMIN_URL:      '/hallmann',
  VERSION:        'Krolestwo.4.1',
  HIVE_ACCOUNT:   'test3333',
  ADMIN_ACCOUNTS: ['hallmann', 'hivedocu', 'test3333'],
  CSRF_SECRET:    process.env.CSRF_SECRET || crypto.randomUUID(),
  DAY:            12 * 60 * 60 * 1000,
  SESSION_TTL:    60 * 60 * 1000,
  MISSION_QR_TTL: 10 * 60 * 1000,
};
