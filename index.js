'use strict';

const express      = require('express');
const cookieParser = require('cookie-parser');

const { PORT, ADMIN_URL }      = require('./config');
const { initDB }               = require('./db/pool');
const { startHiveSync }        = require('./services/hive');

const authRoutes    = require('./routes/auth');
const checkinRoutes = require('./routes/checkin');
const userRoutes    = require('./routes/user');
const pollRoutes = require('./routes/polls').router;
const missionRoutes = require('./routes/missions');
const adminRoutes   = require('./routes/admin');

const app = express();

// ==================== MIDDLEWARE ====================

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(function(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-eval' 'unsafe-inline' wss://hive-auth.arcange.eu https: data:"
  );
  next();
});

// ==================== ROUTES ====================

app.use('/',              authRoutes);
app.use('/',              checkinRoutes);
app.use('/',              userRoutes);
app.use('/',              pollRoutes);
app.use('/',              missionRoutes);
app.use(ADMIN_URL,        adminRoutes);

// ==================== START ====================

initDB();
startHiveSync();

app.listen(PORT, function() {
  const { VERSION, BASE_URL } = require('./config');
  console.log('QR Cafe ' + VERSION + ' running at ' + BASE_URL);
  console.log('Admin: ' + BASE_URL + ADMIN_URL);
});
