const { cookie, login } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = login(req.body && req.body.password);
  if (!token) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  res.setHeader('Set-Cookie', cookie(token));
  return res.status(204).end();
};
