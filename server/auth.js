'use strict';
const crypto = require('crypto');
const { db } = require('./db');
const { parseCookies, setCookie, clearCookie } = require('./http-utils');
const env = require('./env');

const COOKIE_NAME = 'admin_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // still run a compare to avoid short-circuit timing leaks
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkPassword(password) {
  return timingSafeEqualStr(password || '', env.ADMIN_PASSWORD);
}

function createSession(res) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (id, data, expires_at) VALUES (?, ?, ?)').run(id, '{}', expiresAt);
  setCookie(res, COOKIE_NAME, id, { maxAge: SESSION_TTL_MS / 1000 });
  return id;
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE_NAME];
  if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  clearCookie(res, COOKIE_NAME);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE_NAME];
  if (!sid) return false;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
  if (!row) return false;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    return false;
  }
  return true;
}

// Periodically clean up expired sessions.
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}, 60 * 60 * 1000).unref();

module.exports = { checkPassword, createSession, destroySession, isAuthenticated, COOKIE_NAME };
