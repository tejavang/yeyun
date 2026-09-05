import { neon } from '@neondatabase/serverless';

// 1. DATABASE_URL 환경 변수를 사용해 sql 클라이언트 생성
const sql = neon(process.env.DATABASE_URL);

// 허용된 아이디 목록 (3개 고정)
const ALLOWED_USERS = ['yeyun', 'woosong', 'jinyoung'];

export default async function handler(req, res) {
  const userId = req.query.userId || req.body?.userId;

  if (!userId || !ALLOWED_USERS.includes(userId)) {
    return res.status(403).json({ error: '등록되지 않은 아이디입니다.' });
  }

  try {
    // 2. sql`쿼리` 형태를 sql('쿼리', [파라미터]) 또는 sql`쿼리` 형태로 호출
    const userRes = await sql(`SELECT coins, stars, last_daily_grant FROM users WHERE user_id = $1`, [userId]);
    
    if (userRes.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    let { coins, stars, last_daily_grant } = userRes[0];
    const today = new Date().toISOString().split('T')[0];

    // 매일 5개 코인 자동 지급
    if (new Date(last_daily_grant).toISOString().split('T')[0] !== today) {
      coins += 5;
      await sql(`UPDATE users SET coins = $1, last_daily_grant = CURRENT_DATE WHERE user_id = $2`, [coins, userId]);
    }

    // GET 요청: 잔여 코인 조회
    if (req.method === 'GET') {
      return res.status(200).json({ coins, stars });
    }

    // POST 요청: 게임 시작 시 코인 차감
    if (req.method === 'POST') {
      if (coins < 1) {
        return res.status(400).json({ error: '코인이 부족합니다!', coins });
      }

      const updatedCoins = coins - 1;
      await sql(`UPDATE users SET coins = $1 WHERE user_id = $2`, [updatedCoins, userId]);

      return res.status(200).json({ success: true, coins: updatedCoins });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database connection error' });
  }
}
