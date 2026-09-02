const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 환경 변수가 필요합니다.');
}

const sourcePath = path.join(__dirname, '..', 'words.json');
const sourceWords = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(sourceWords)) throw new Error('words.json은 배열이어야 합니다.');

const sql = neon(process.env.DATABASE_URL);
const seen = new Set();
const words = sourceWords.map(item => {
  const subject = String(item.subject || '').trim();
  const chapter = String(item.chapter || '').trim();
  const word = String(item.word || '').trim();
  const meaning = String(item.meaning || '').trim();
  const wordKey = word.toLocaleLowerCase('en-US');
  const key = `${subject}\u0000${chapter}\u0000${wordKey}`;
  if (!subject || !chapter || !word || !meaning || seen.has(key)) throw new Error(`중복되었거나 잘못된 단어: ${JSON.stringify(item)}`);
  seen.add(key);
  return { subject, chapter, word, wordKey, meaning };
});

async function run() {
  const queries = [sql`DELETE FROM words`, sql`DELETE FROM chapters`, sql`DELETE FROM subjects`];
  for (const item of words) {
    queries.push(sql`INSERT INTO subjects (name) VALUES (${item.subject}) ON CONFLICT (name) DO NOTHING`);
    queries.push(sql`INSERT INTO chapters (subject_id, name) SELECT id, ${item.chapter} FROM subjects WHERE name = ${item.subject} ON CONFLICT (subject_id, name) DO NOTHING`);
    queries.push(sql`INSERT INTO words (chapter_id, word, word_key, meaning) SELECT c.id, ${item.word}, ${item.wordKey}, ${item.meaning} FROM chapters c JOIN subjects s ON s.id = c.subject_id WHERE s.name = ${item.subject} AND c.name = ${item.chapter}`);
  }
  await sql.transaction(queries);
  console.log(`${words.length}개 단어를 이전했습니다.`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
