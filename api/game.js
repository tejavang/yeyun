import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ALLOWED_USERS = ['yeyun', 'woosong', 'jinyoung'];

export default async function handler(req, res) {
  const userId = req.query.userId || req.body?.userId;
  const gameId = req.query.gameId || req.body?.gameId;

  if (!userId || !ALLOWED_USERS.includes(userId)) {
    return res.status(403).json({ error: '등록되지 않은 아이디입니다.' });
  }

  try {
    // [GET] 유저 정보 및 탑 10 리더보드 반환 (기존 유구한 로직 유지)
    if (req.method === 'GET') {
      const userRes = await sql`SELECT coins, stars, last_daily_grant FROM users WHERE user_id = ${userId}`;
      if (userRes.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

      let { coins, stars, last_daily_grant } = userRes[0];
      const today = new Date().toISOString().split('T')[0];

      if (new Date(last_daily_grant).toISOString().split('T')[0] !== today) {
        coins += 1;
        await sql`UPDATE users SET coins = ${coins}, last_daily_grant = CURRENT_DATE WHERE user_id = ${userId}`;
      }

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

    // [POST] 게임 시작, 점수 저장, 별 적립, 별->코인 교환
    if (req.method === 'POST') {
      const action = req.body?.action;

      // 게임 시작 (코인 차감)
      if (action === 'start') {
        const userRes = await sql`SELECT coins FROM users WHERE user_id = ${userId}`;
        if (userRes.length === 0) return res.status(404).json({ error: '유저 없음' });
        
        let coins = userRes[0].coins;
        if (coins < 3) return res.status(400).json({ error: '코인이 부족합니다!', coins });

        const updatedCoins = coins - 3;
        await sql`UPDATE users SET coins = ${updatedCoins} WHERE user_id = ${userId}`;
        return res.status(200).json({ success: true, coins: updatedCoins });
      }

      // 최고 점수 저장
      if (action === 'save_score') {
        const score = req.body?.score;
        if (gameId && typeof score === 'number' && score > 0) {
          await sql`INSERT INTO scores (game_id, user_id, score) VALUES (${gameId}, ${userId}, ${score})`;
        }
        return res.status(200).json({ success: true });
      }

      // 별 적립
      if (action === 'add_star' || action === 'addStar') { // 두 방식 모두 대응
        const amount = req.body?.amount || 1;
        const result = await sql`
          UPDATE users 
          SET stars = COALESCE(stars, 0) + ${amount} 
          WHERE user_id = ${userId}
          RETURNING stars
        `;
        return res.status(200).json({ 
          success: true, 
          message: '별이 적립되었습니다.',
          stars: result[0]?.stars || 0
        });
      }
      // 코인 적립
      if (action === 'add_coins' || action === 'addCoins') { // 두 방식 모두 대응
        const amount = req.body?.amount || 1;
        const result = await sql`
          UPDATE users 
          SET coins = COALESCE(coins, 0) + ${amount} 
          WHERE user_id = ${userId}
          RETURNING coins
        `;
        return res.status(200).json({ 
          success: true, 
          message: '코인이 적립되었습니다.',
          coins: result[0]?.coins || 0
        });
      }
      
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database connection error' });
  }
}
