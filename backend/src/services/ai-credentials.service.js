const crypto = require('crypto');

/**
 * AES-256-GCM encryption for API keys at rest.
 * Key derived from AI_KEYS_SECRET env var; falls back to JWT secret in dev.
 */
const ALGO = 'aes-256-gcm';

function getKey() {
  const secret = process.env.AI_KEYS_SECRET || process.env.JWT_SECRET || 'fyntrac-dev-key-change-me-please-32b';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return '';
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function keyHint(key) {
  if (!key || key.length < 8) return '';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

module.exports = { encrypt, decrypt, keyHint };
