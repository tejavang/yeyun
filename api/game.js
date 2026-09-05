import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ALLOWED_USERS = ['yeyun', 'woosong', 'jinyoung'];

export default async function handler(req, res) {
  // GET 요청은 query에서, POST 요청은 body에서 데이터 추출
  const userId = req.query.userId || req.body?.userId;
  const gameId = req.query.gameId || req.body?.gameId; // 추가됨

  if (!userId || !ALLOWED_USERS.includes(userId)) {
    return res.status(403).json({ error: '등록되지 않은 아이디입니다.' });
  }

  try {
    // [GET] 유저 정보 및 특정 게임의 탑 10 리더보드 반환
    if (req.method === 'GET') {
      const userRes = await sql`SELECT coins, stars, last_daily_grant FROM users WHERE user_id = ${userId}`;
      if (userRes.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

      let { coins, stars, last_daily_grant } = userRes[0];
      const today = new Date().toISOString().split('T')[0];

      if (new Date(last_daily_grant).toISOString().split('T')[0] !== today) {
        coins += 5;
        await sql`UPDATE users SET coins = ${coins}, last_daily_grant = CURRENT_DATE WHERE user_id = ${userId}`;
      }

      // 요청받은 gameId에 해당하는 점수만 내림차순으로 상위 10개 조회
      let leaderboard = [];
      if (gameId) {
        leaderboard = await sql`
          SELECT user_id, score 
          FROM scores 
          WHERE game_id = ${gameId} 
          ORDER BY score DESC 
          LIMIT 10
        `;
      }

      return res.status(200).json({ coins, stars, leaderboard });
    }

    // [POST] 게임 시작 또는 점수 저장
    if (req.method === 'POST') {
      const action = req.body?.action;

      if (action === 'start') {
        const userRes = await sql`SELECT coins FROM users WHERE user_id = ${userId}`;
        if (userRes.length === 0) return res.status(404).json({ error: '유저 없음' });
        
        let coins = userRes[0].coins;
        if (coins < 1) return res.status(400).json({ error: '코인이 부족합니다!', coins });

        const updatedCoins = coins - 1;
        await sql`UPDATE users SET coins = ${updatedCoins} WHERE user_id = ${userId}`;
        return res.status(200).json({ success: true, coins: updatedCoins });
      }

      if (action === 'save_score') {
        const score = req.body?.score;
        // gameId가 있어야만 저장되도록 방어 로직 추가
        if (gameId && typeof score === 'number' && score > 0) {
          await sql`INSERT INTO scores (game_id, user_id, score) VALUES (${gameId}, ${userId}, ${score})`;
        }
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database connection error' });
  }
}
