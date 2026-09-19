'use strict';
const https = require('https');
const crypto = require('crypto');
const env = require('./env');

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.paystack.co',
        path: urlPath,
        method,
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return reject(new Error('Invalid response from Paystack'));
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(Object.assign(new Error(parsed.message || 'Paystack request failed'), { statusCode: res.statusCode, body: parsed }));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Amount is in Naira in our app; Paystack wants kobo (x100).
async function initializeTransaction({ email, amountNaira, reference, callbackUrl, metadata }) {
  return request('POST', '/transaction/initialize', {
    email,
    amount: Math.round(amountNaira * 100),
    reference,
    callback_url: callbackUrl,
    metadata,
  });
}

async function verifyTransaction(reference) {
  return request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!env.PAYSTACK_SECRET_KEY || !signatureHeader) return false;
  const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

module.exports = { initializeTransaction, verifyTransaction, verifyWebhookSignature };
