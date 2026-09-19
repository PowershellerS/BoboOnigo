// Minimal .env loader (no external dependencies).
'use strict';
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'change-this-password',
  SESSION_SECRET: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
  DEFAULT_SHIPPING_FEE: parseInt(process.env.DEFAULT_SHIPPING_FEE || '3500', 10),
  DEMO_MODE: !process.env.PAYSTACK_SECRET_KEY,
};
