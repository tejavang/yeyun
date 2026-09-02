const crypto = require('crypto');

const COOKIE_NAME = 'voca_admin';
const MAX_AGE_SECONDS = 60 * 60 * 8;

function requireSecret() {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    throw new Error('관리자 인증 환경 변수가 설정되지 않았습니다.');
  }
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(value).digest('base64url');
}

function encode(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(item => item.trim().split(/=(.*)/s, 2)).filter(([key]) => key));
}

function isAuthenticated(req) {
  try {
    requireSecret();
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token) return false;
    const [body, signature] = token.split('.');
    if (!body || !signature || !timingSafeEqual(signature, sign(body))) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

function login(password) {
  requireSecret();
  if (typeof password !== 'string' || !timingSafeEqual(password, process.env.ADMIN_PASSWORD)) return null;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return encode({ role: 'admin', exp });
}

function cookie(value, maxAge = MAX_AGE_SECONDS) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

module.exports = { cookie, isAuthenticated, login };
