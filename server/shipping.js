'use strict';
const { db } = require('./db');
const env = require('./env');

// Server-side source of truth for shipping cost. Never trust a fee sent by
// the client. Lagos is always free, regardless of what's in the rates table,
// so an admin can't accidentally break the core promise of the store.
function getShippingFee(stateName) {
  if (!stateName) return env.DEFAULT_SHIPPING_FEE;
  const normalized = String(stateName).trim();
  if (normalized.toLowerCase() === 'lagos') return 0;

  const row = db.prepare('SELECT fee FROM shipping_rates WHERE state = ? COLLATE NOCASE').get(normalized);
  if (row) return row.fee;
  return env.DEFAULT_SHIPPING_FEE;
}

function listShippingRates() {
  return db.prepare("SELECT state, fee FROM shipping_rates ORDER BY (state = 'Lagos') DESC, state ASC").all();
}

function setShippingRate(state, fee) {
  if (String(state).trim().toLowerCase() === 'lagos') {
    // Lagos stays free no matter what an admin submits.
    db.prepare('INSERT INTO shipping_rates (state, fee) VALUES (?, 0) ON CONFLICT(state) DO UPDATE SET fee = 0').run('Lagos');
    return;
  }
  db.prepare(
    'INSERT INTO shipping_rates (state, fee) VALUES (?, ?) ON CONFLICT(state) DO UPDATE SET fee = excluded.fee'
  ).run(state, fee);
}

module.exports = { getShippingFee, listShippingRates, setShippingRate };
