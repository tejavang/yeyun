// api/game.js
import { sql } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const userId = 'child'; // 아이 계정 ID

  try {
    // 1. 매일 5개 코인 자동 지급 로직 검사
    const userRes = await sql`SELECT coins, stars, last_daily_grant FROM users WHERE user_id = ${userId}`;
    if (userRes.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let { coins, stars, last_daily_grant } = userRes[0];
    const today = new Date().toISOString().split('T')[0];

    // 날짜가 지나 변경되었으면 5개 지급
    if (new Date(last_daily_grant).toISOString().split('T')[0] !== today) {
      coins += 5;
      await sql`
        UPDATE users 
        SET coins = ${coins}, last_daily_grant = CURRENT_DATE 
        WHERE user_id = ${userId}
      `;
    }

    // GET 요청: 현재 남은 코인 정보 조회
    if (req.method === 'GET') {
      return res.status(200).json({ coins, stars });
    }

    // POST 요청: 게임 시작 시 코인 1개 사용
    if (req.method === 'POST') {
      if (coins < 1) {
        return res.status(400).json({ error: '코인이 부족합니다!', coins });
      }

      const updatedCoins = coins - 1;
      await sql`
        UPDATE users 
        SET coins = ${updatedCoins} 
        WHERE user_id = ${userId}
      `;

      return res.status(200).json({ success: true, coins: updatedCoins });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database connection error' });
  }
}