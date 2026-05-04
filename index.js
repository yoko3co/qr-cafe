'use strict';

const express      = require('express');
const cookieParser = require('cookie-parser');
const { PORT, ADMIN_URL } = require('./config');
const { initDB }          = require('./db/pool');
const { startHiveSync }   = require('./services/hive');

const app = express();

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(function(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-eval' 'unsafe-inline' wss://hive-auth.arcange.eu https: data:");
  next();
});

app.use('/',       require('./routes/auth'));
app.use('/',       require('./routes/checkin'));
app.use('/',       require('./routes/user'));
app.use('/',       require('./routes/polls').router);
app.use('/',       require('./routes/missions'));
app.use(ADMIN_URL, require('./routes/admin'));

initDB();
startHiveSync();

app.listen(PORT, function() {
  const { VERSION, BASE_URL } = require('./config');
  console.log('QR Cafe ' + VERSION + ' running at ' + BASE_URL);
});
