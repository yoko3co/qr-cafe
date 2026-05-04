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
        created_at BIGINT DEFAULT 0
      );
    `);
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
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS events_today JSONB DEFAULT \'{}\'');
    const { allowedNames } = require('../allowedNames');
    for (const name of allowedNames) {
      await pool.query('INSERT INTO allowed_names (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    }
    console.log('DB ready, names seeded:', allowedNames.size);
  } catch (e) {
    console.log('DB init error:', e.message);
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
    INSERT INTO polls (id,question,options,votes,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO UPDATE SET question=$2,options=$3,votes=$4,status=$5
  `, [pid, poll.question, JSON.stringify(poll.options), JSON.stringify(poll.votes), poll.status, Date.now()]);
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

module.exports = {
  pool, initDB,
  getUser, upsertUser, getAllUsers, deleteUser,
  getAllowedNames, addAllowedName, removeAllowedName,
  getAllPolls, getPoll, savePoll, deletePoll, savePastPoll, getPastPolls,
  getAllMissions, getMission, saveMission, deleteMission, getUserMissions, completeMission,
};
