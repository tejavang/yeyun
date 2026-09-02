const { neon } = require('@neondatabase/serverless');
const { isAuthenticated } = require('../lib/auth');

const githubPagesOrigin = 'https://tejavang.github.io';

function setCors(req, res) {
  const allowedOrigin = process.env.GITHUB_PAGES_ORIGIN || githubPagesOrigin;
  if (req.headers.origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

function validateWords(value) {
  if (!Array.isArray(value) || value.length > 10000) return null;
  const seen = new Set();
  const words = [];
  for (const item of value) {
    if (!item || typeof item.subject !== 'string' || typeof item.chapter !== 'string' || typeof item.word !== 'string' || typeof item.meaning !== 'string') return null;
    const subject = item.subject.trim();
    const chapter = item.chapter.trim();
    const word = item.word.trim();
    const meaning = item.meaning.trim();
    if (!subject || !chapter || !word || !meaning || subject.length > 200 || chapter.length > 300 || word.length > 300 || meaning.length > 1000) return null;
    const wordKey = word.toLocaleLowerCase('en-US');
    const key = `${subject}\u0000${chapter}\u0000${wordKey}`;
    if (seen.has(key)) return null;
    seen.add(key);
    words.push({ subject, chapter, word, wordKey, meaning });
  }
  return words;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: '데이터베이스가 아직 연결되지 않았습니다.' });

  const sql = neon(process.env.DATABASE_URL);
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT w.id, s.name AS subject, c.name AS chapter, w.word, w.meaning
      FROM words w
      JOIN chapters c ON c.id = w.chapter_id
      JOIN subjects s ON s.id = c.subject_id
      ORDER BY s.name, c.name, w.created_at, w.word`;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(rows);
  }

  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthenticated(req)) return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  const words = validateWords(req.body && req.body.words);
  if (!words) return res.status(400).json({ error: '단어장 형식이 올바르지 않습니다.' });

  const queries = [
    sql`DELETE FROM words`,
    sql`DELETE FROM chapters`,
    sql`DELETE FROM subjects`
  ];
  for (const item of words) {
    queries.push(sql`INSERT INTO subjects (name) VALUES (${item.subject}) ON CONFLICT (name) DO NOTHING`);
    queries.push(sql`
      INSERT INTO chapters (subject_id, name)
      SELECT id, ${item.chapter} FROM subjects WHERE name = ${item.subject}
      ON CONFLICT (subject_id, name) DO NOTHING`);
    queries.push(sql`
      INSERT INTO words (chapter_id, word, word_key, meaning)
      SELECT c.id, ${item.word}, ${item.wordKey}, ${item.meaning}
      FROM chapters c JOIN subjects s ON s.id = c.subject_id
      WHERE s.name = ${item.subject} AND c.name = ${item.chapter}`);
  }
  await sql.transaction(queries);
  return res.status(200).json({ count: words.length });
};
