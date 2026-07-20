'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        hive_name       TEXT PRIMARY KEY,
        points          REAL DEFAULT 0,
        book            INTEGER DEFAULT 0,
        games           INTEGER DEFAULT 0,
        volunteers      INTEGER DEFAULT 0,
        film            INTEGER DEFAULT 0,
        last_visit      BIGINT DEFAULT 0,
        events_today    JSONB DEFAULT '{}',
        voted           JSONB DEFAULT '{}',
        random_presses  INTEGER DEFAULT 0,
        random_day      INTEGER DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS polls (
        id         TEXT PRIMARY KEY,
        question   TEXT NOT NULL,
        options    JSONB NOT NULL,
        votes      JSONB NOT NULL,
        status     TEXT DEFAULT 'active',
        blockchain BOOLEAN DEFAULT false,
        created_at BIGINT DEFAULT 0
      );
    `);
    await pool.query('ALTER TABLE polls ADD COLUMN IF NOT EXISTS blockchain BOOLEAN DEFAULT false');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS past_polls (
        id         SERIAL PRIMARY KEY,
        question   TEXT NOT NULL,
        options    JSONB NOT NULL,
        votes      JSONB NOT NULL,
        stopped_at BIGINT DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowed_names (
        name TEXT PRIMARY KEY
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS missions (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        description   TEXT NOT NULL,
        reward_type   TEXT NOT NULL,
        reward_amount INTEGER DEFAULT 1,
        status        TEXT DEFAULT 'active',
        created_at    BIGINT DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_missions (
        hive_name    TEXT NOT NULL,
        mission_id   TEXT NOT NULL,
        completed_at BIGINT DEFAULT 0,
        PRIMARY KEY (hive_name, mission_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pin_requests (
        username    TEXT PRIMARY KEY,
        email       TEXT DEFAULT NULL,
        full_name   TEXT DEFAULT NULL,
        created_at  BIGINT DEFAULT 0
      );
    `);

    // Column migrations (safe to run every start)
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS events_today JSONB DEFAULT \'{}\'');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_version TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS rcr_balance INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT NULL');
   await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE pin_requests ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL');
    await pool.query('ALTER TABLE pin_requests ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT NULL');
    await pool.query('UPDATE polls SET blockchain=false WHERE blockchain=true');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS rcr_pending INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE spend_queue ADD COLUMN IF NOT EXISTS settle_ref TEXT DEFAULT NULL');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS balance_snapshot (
        hive_name    TEXT PRIMARY KEY,
        rcr_balance  INTEGER DEFAULT 0,
        rcr_pending  INTEGER DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drink_items (
        id     SERIAL PRIMARY KEY,
        name   TEXT NOT NULL,
        price  INTEGER NOT NULL,
        active BOOLEAN DEFAULT true
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spend_queue (
        id         SERIAL PRIMARY KEY,
        username   TEXT NOT NULL,
        item_name  TEXT NOT NULL,
        amount     INTEGER NOT NULL,
        created_at BIGINT DEFAULT 0
      );
    `);

    await seedRCR();

    const { allowedNames } = require('../allowedNames');
    for (const name of allowedNames) {
      await pool.query('INSERT INTO allowed_names (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    }
    console.log('DB ready, names seeded:', allowedNames.size);
  } catch (e) {
    console.log('DB init error:', e.message);
  }
}

async function seedRCR() {
  try {
    const { RCR_SEED } = require('../rcr');
    for (const name of Object.keys(RCR_SEED)) {
      await pool.query(
        'INSERT INTO users (hive_name, rcr_balance) VALUES ($1, $2) ON CONFLICT (hive_name) DO UPDATE SET rcr_balance=$2 WHERE users.rcr_balance=0',
        [name, RCR_SEED[name]]
      );
    }
    console.log('RCR seed done');
  } catch (e) {
    console.log('RCR seed error:', e.message);
  }
}

async function getUser(name) {
  const r = await pool.query('SELECT * FROM users WHERE hive_name = $1', [name]);
  return r.rows[0] || null;
}

async function upsertUser(name, data) {
  await pool.query(`
    INSERT INTO users (hive_name,points,book,games,volunteers,film,last_visit,events_today,voted,random_presses,random_day)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (hive_name) DO UPDATE SET
      points=$2,book=$3,games=$4,volunteers=$5,film=$6,
      last_visit=$7,events_today=$8,voted=$9,random_presses=$10,random_day=$11
  `, [name, data.points||0, data.book||0, data.games||0, data.volunteers||0, data.film||0,
      data.last_visit||0, JSON.stringify(data.events_today||{}), JSON.stringify(data.voted||{}),
      data.random_presses||0, data.random_day||0]);
}

async function getAllUsers() {
  const r = await pool.query('SELECT * FROM users ORDER BY points DESC');
  return r.rows;
}

async function deleteUser(name) {
  await pool.query('DELETE FROM users WHERE hive_name = $1', [name]);
}

async function getAllowedNames() {
  const r = await pool.query('SELECT name FROM allowed_names');
  return new Set(r.rows.map(function(row) { return row.name; }));
}

async function addAllowedName(name) {
  await pool.query('INSERT INTO allowed_names (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
}

async function removeAllowedName(name) {
  await pool.query('DELETE FROM allowed_names WHERE name = $1', [name]);
}

async function getAllPolls() {
  const r = await pool.query('SELECT * FROM polls ORDER BY created_at ASC');
  return r.rows;
}

async function getPoll(pid) {
  const r = await pool.query('SELECT * FROM polls WHERE id = $1', [pid]);
  return r.rows[0] || null;
}

async function savePoll(pid, poll) {
  await pool.query(`
    INSERT INTO polls (id,question,options,votes,status,blockchain,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO UPDATE SET question=$2,options=$3,votes=$4,status=$5,blockchain=$6
  `, [pid, poll.question, JSON.stringify(poll.options), JSON.stringify(poll.votes), poll.status, poll.blockchain||false, Date.now()]);
}

async function deletePoll(pid) {
  await pool.query('DELETE FROM polls WHERE id = $1', [pid]);
}

async function savePastPoll(poll) {
  await pool.query(
    'INSERT INTO past_polls (question,options,votes,stopped_at) VALUES ($1,$2,$3,$4)',
    [poll.question, JSON.stringify(poll.options), JSON.stringify(poll.votes), Date.now()]
  );
}

async function getPastPolls() {
  const r = await pool.query('SELECT * FROM past_polls ORDER BY stopped_at DESC LIMIT 10');
  return r.rows;
}

async function getAllMissions() {
  const r = await pool.query('SELECT * FROM missions ORDER BY created_at ASC');
  return r.rows;
}

async function getMission(mid) {
  const r = await pool.query('SELECT * FROM missions WHERE id = $1', [mid]);
  return r.rows[0] || null;
}

async function saveMission(mid, m) {
  await pool.query(`
    INSERT INTO missions (id,title,description,reward_type,reward_amount,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO UPDATE SET title=$2,description=$3,reward_type=$4,reward_amount=$5,status=$6
  `, [mid, m.title, m.description, m.reward_type, m.reward_amount, m.status, Date.now()]);
}

async function deleteMission(mid) {
  await pool.query('DELETE FROM missions WHERE id = $1', [mid]);
}

async function getUserMissions(name) {
  const r = await pool.query('SELECT * FROM user_missions WHERE hive_name = $1', [name]);
  return r.rows;
}

async function completeMission(name, mid) {
  await pool.query(
    'INSERT INTO user_missions (hive_name,mission_id,completed_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [name, mid, Date.now()]
  );
}

// ==================== PIN / EMAIL ====================

async function addPinRequest(username, email, fullName) {
  await pool.query(
    'INSERT INTO pin_requests (username, email, full_name, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO UPDATE SET email=$2, full_name=$3',
    [username, email||null, fullName||null, Date.now()]
  );
}

async function getPinRequests() {
  const r = await pool.query('SELECT * FROM pin_requests ORDER BY created_at ASC');
  return r.rows;
}

async function deletePinRequest(username) {
  await pool.query('DELETE FROM pin_requests WHERE username=$1', [username]);
}

async function setUserPin(username, hash, email, fullName) {
  await pool.query(
    'INSERT INTO users (hive_name, pin_hash, email, full_name) VALUES ($1,$2,$3,$4) ON CONFLICT (hive_name) DO UPDATE SET pin_hash=$2, email=COALESCE($3,users.email), full_name=COALESCE($4,users.full_name)',
    [username, hash, email||null, fullName||null]
  );
}

async function getUserByEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE email=$1 AND pin_hash IS NOT NULL LIMIT 1', [email]);
  return r.rows[0] || null;
}

async function getDrinkItems(activeOnly) {
  const q = activeOnly ? 'SELECT * FROM drink_items WHERE active=true ORDER BY price ASC' : 'SELECT * FROM drink_items ORDER BY price ASC';
  const r = await pool.query(q);
  return r.rows;
}

async function addDrinkItem(name, price) {
  await pool.query('INSERT INTO drink_items (name, price, active) VALUES ($1,$2,true)', [name, price]);
}

async function deleteDrinkItem(id) {
  await pool.query('DELETE FROM drink_items WHERE id=$1', [id]);
}

async function toggleDrinkItem(id) {
  await pool.query('UPDATE drink_items SET active = NOT active WHERE id=$1', [id]);
}

async function queueSpend(username, itemName, amount) {
  await pool.query('INSERT INTO spend_queue (username, item_name, amount, created_at) VALUES ($1,$2,$3,$4)', [username, itemName, amount, Date.now()]);
  await pool.query('UPDATE users SET rcr_pending = COALESCE(rcr_pending,0) + $1 WHERE hive_name=$2', [amount, username]);
}

async function getSpendQueue() {
  const r = await pool.query('SELECT * FROM spend_queue ORDER BY created_at ASC');
  return r.rows;
}

async function rejectSpend(id) {
  const r = await pool.query('SELECT username, amount FROM spend_queue WHERE id=$1', [id]);
  if (r.rows[0]) {
    await pool.query('UPDATE users SET rcr_pending = GREATEST(0, COALESCE(rcr_pending,0) - $1) WHERE hive_name=$2', [r.rows[0].amount, r.rows[0].username]);
    await pool.query('DELETE FROM spend_queue WHERE id=$1', [id]);
  }
}

async function clearSpendQueue() {
  await pool.query('DELETE FROM spend_queue');
  await pool.query('UPDATE users SET rcr_pending = 0');
}

async function generateSettlement() {
  const ref = 'ref' + Date.now();
  await pool.query('UPDATE spend_queue SET settle_ref=$1 WHERE settle_ref IS NULL', [ref]);
  const r = await pool.query('SELECT * FROM spend_queue WHERE settle_ref=$1 ORDER BY username ASC', [ref]);
  return { ref: ref, rows: r.rows };
}

async function getSettlement(ref) {
  const r = await pool.query('SELECT * FROM spend_queue WHERE settle_ref=$1 ORDER BY username ASC', [ref]);
  return r.rows;
}

async function confirmSettlement(ref) {
  const r = await pool.query('SELECT username, SUM(amount) AS total FROM spend_queue WHERE settle_ref=$1 GROUP BY username', [ref]);
  for (const row of r.rows) {
    const total = parseInt(row.total);
    await pool.query('UPDATE users SET rcr_balance = GREATEST(0, COALESCE(rcr_balance,0) - $1), rcr_pending = GREATEST(0, COALESCE(rcr_pending,0) - $1) WHERE hive_name=$2', [total, row.username]);
  }
  await pool.query('DELETE FROM spend_queue WHERE settle_ref=$1', [ref]);
  return r.rows;
}

async function getOpenSettlement() {
  const r = await pool.query('SELECT settle_ref FROM spend_queue WHERE settle_ref IS NOT NULL LIMIT 1');
  return r.rows[0] ? r.rows[0].settle_ref : null;
}

async function saveSnapshot() {
  await pool.query('DELETE FROM balance_snapshot');
  await pool.query('INSERT INTO balance_snapshot (hive_name, rcr_balance, rcr_pending) SELECT hive_name, COALESCE(rcr_balance,0), COALESCE(rcr_pending,0) FROM users');
}

async function restoreSnapshot() {
  await pool.query('UPDATE users u SET rcr_balance = s.rcr_balance, rcr_pending = s.rcr_pending FROM balance_snapshot s WHERE u.hive_name = s.hive_name');
  await pool.query('DELETE FROM spend_queue');
}

async function hasSnapshot() {
  const r = await pool.query('SELECT COUNT(*) FROM balance_snapshot');
  return parseInt(r.rows[0].count) > 0;
}

async function simulateSettlement(ref) {
  // Apply the same effect the batch memo would have, locally, without posting
  const r = await pool.query('SELECT username, SUM(amount) AS total FROM spend_queue WHERE settle_ref=$1 GROUP BY username', [ref]);
  for (const row of r.rows) {
    const total = parseInt(row.total);
    await pool.query('UPDATE users SET rcr_balance = GREATEST(0, COALESCE(rcr_balance,0) - $1), rcr_pending = GREATEST(0, COALESCE(rcr_pending,0) - $1) WHERE hive_name=$2', [total, row.username]);
  }
  await pool.query('DELETE FROM spend_queue WHERE settle_ref=$1', [ref]);
  return r.rows;
}

async function markPosted(ref) {
  // Real mode: memo posted to Hive, sync will update balances. Just clear pending queue.
  await pool.query('DELETE FROM spend_queue WHERE settle_ref=$1', [ref]);
}

async function getSyncPaused() {
  const r = await pool.query('SELECT value FROM settings WHERE key=$1', ['sync_paused']);
  return r.rows[0] && r.rows[0].value === '1';
}

async function setSyncPaused(paused) {
  await pool.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', ['sync_paused', paused ? '1' : '0']);
}

module.exports = {
  pool, initDB, seedRCR, 
  getUser, upsertUser, getAllUsers, deleteUser,
  getAllowedNames, addAllowedName, removeAllowedName,
  getAllPolls, getPoll, savePoll, deletePoll, savePastPoll, getPastPolls,
  getAllMissions, getMission, saveMission, deleteMission, getUserMissions, completeMission,
  addPinRequest, getPinRequests, deletePinRequest, setUserPin, getUserByEmail,
  getDrinkItems, addDrinkItem, deleteDrinkItem, toggleDrinkItem, queueSpend, getSpendQueue, rejectSpend, clearSpendQueue, generateSettlement, getSettlement, confirmSettlement, getOpenSettlement, 
  saveSnapshot, restoreSnapshot, hasSnapshot, simulateSettlement, markPosted, getSyncPaused, setSyncPaused,
};