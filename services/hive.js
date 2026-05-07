'use strict';

const { HIVE_ACCOUNT, ADMIN_ACCOUNTS } = require('../config');
const { pool, addAllowedName } = require('../db/pool');

async function fetchAllowedNames() {
  try {
    const res = await fetch('https://api.hive.blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'condenser_api.get_accounts',
        params: [[HIVE_ACCOUNT]], id: 1,
      }),
    });
    const data = await res.json();
    const meta = JSON.parse(data.result[0].posting_json_metadata || '{}');
    if (meta.allowed_names && Array.isArray(meta.allowed_names)) {
      await pool.query('DELETE FROM allowed_names');
      for (const n of meta.allowed_names) {
        await addAllowedName(n.toLowerCase());
      }
      for (const a of ADMIN_ACCOUNTS) {
        await addAllowedName(a);
      }
      console.log('Names synced from Hive:', meta.allowed_names.length);
    }
  } catch (e) {
    console.log('Hive fetch failed:', e.message);
  }
}

async function syncRCR() {
  try {
    const lastR = await pool.query('SELECT value FROM settings WHERE key=$1', ['rcr_last_seq']);
    const lastSeq = lastR.rows[0] ? parseInt(lastR.rows[0].value) : 0;

    const res = await fetch('https://api.hive.blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'condenser_api.get_account_history',
        params: ['rcr', -1, 100],
        id: 1,
      }),
    });
    const data = await res.json();
    const history = data.result || [];
    let maxSeq = lastSeq;

    for (const item of history) {
      const seq = item[0];
      if (seq <= lastSeq) continue;
      if (seq > maxSeq) maxSeq = seq;
      const op = item[1].op;
      if (op[0] !== 'transfer') continue;
      const memo = op[1].memo || '';
      const match = memo.match(/^(\S+)\s+[\+\-]\d+\s+RCR\s*\/\s*suma:\s*(\d+)\s+RCR/i);
      if (!match) continue;
      const username = match[1].toLowerCase().replace('@', '');
      const total    = parseInt(match[2]);
      await pool.query(
        'UPDATE users SET rcr_balance=$1 WHERE hive_name=$2',
        [total, username]
      );
      console.log('RCR updated:', username, total);
    }

    if (maxSeq > lastSeq) {
      await pool.query(
        'INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
        ['rcr_last_seq', maxSeq.toString()]
      );
    }
    console.log('RCR sync done, last seq:', maxSeq);
  } catch (e) {
    console.log('RCR sync error:', e.message);
  }
}

function startHiveSync() {
  fetchAllowedNames();
  setInterval(fetchAllowedNames, 5 * 60 * 1000);
  syncRCR();
  setInterval(syncRCR, 10 * 60 * 1000);
}

module.exports = { fetchAllowedNames, startHiveSync, syncRCR };
