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

function startHiveSync() {
  fetchAllowedNames();
  setInterval(fetchAllowedNames, 5 * 60 * 1000);
}

module.exports = { fetchAllowedNames, startHiveSync };
