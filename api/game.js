import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ALLOWED_USERS = ['yeyun', 'woosong', 'jinyoung'];

export default async function handler(req, res) {
  // GET 요청은 query에서, POST 요청은 body에서 데이터 추출
  const userId = req.query.userId || req.body?.userId;
  const gameId = req.query.gameId || req.body?.gameId;

  if (!userId || !ALLOWED_USERS.includes(userId)) {
    return res.status(403).json({ error: '등록되지 않은 아이디입니다.' });
  }

  try {
    // [GET] 유저 정보 및 특정 게임의 탑 10 리더보드 반환 (기존 코드 그대로 유지)
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

    // [POST] 게임 시작, 점수 저장, 별 적립, 별->코인 교환
    if (req.method === 'POST') {
      const action = req.body?.action;

      // 1. 기존 게임 시작 로직 (유지)
      if (action === 'start') {
        const userRes = await sql`SELECT coins FROM users WHERE user_id = ${userId}`;
        if (userRes.length === 0) return res.status(404).json({ error: '유저 없음' });
        
        let coins = userRes[0].coins;
        if (coins < 1) return res.status(400).json({ error: '코인이 부족합니다!', coins });

        const updatedCoins = coins - 1;
        await sql`UPDATE users SET coins = ${updatedCoins} WHERE user_id = ${userId}`;
        return res.status(200).json({ success: true, coins: updatedCoins });
      }

      // 2. 기존 점수 저장 로직 (유지)
      if (action === 'save_score') {
        const score = req.body?.score;
        if (gameId && typeof score === 'number' && score > 0) {
          await sql`INSERT INTO scores (game_id, user_id, score) VALUES (${gameId}, ${userId}, ${score})`;
        }
        return res.status(200).json({ success: true });
      }

      // ---------------- [신규 추가 기능] ----------------

      // 3. 별 적립 (avoca.html 단어장 시험 합격 시 호출)
      if (action === 'add_star') {
        const amount = req.body?.amount || 1;
        await sql`
          UPDATE users 
          SET stars = COALESCE(stars, 0) + ${amount} 
          WHERE user_id = ${userId}
        `;
        return res.status(200).json({ success: true, message: '별이 적립되었습니다.' });
      }

      // 4. 별을 코인으로 교환 (index.html 메인 포털에서 호출)
      if (action === 'exchange_stars') {
        const userRes = await sql`SELECT COALESCE(stars, 0) AS stars, COALESCE(coins, 0) AS coins FROM users WHERE user_id = ${userId}`;
        if (userRes.length === 0) return res.status(404).json({ error: '유저 없음' });

        const currentStars = userRes[0].stars;
        if (currentStars <= 0) {
          return res.status(400).json({ success: false, message: '교환할 별이 없습니다.' });
        }

        const coinsToAdd = currentStars * 10; // 1⭐ = 10🪙

        // 별 초기화 및 코인 추가
        const updatedRes = await sql`
          UPDATE users 
          SET stars = 0, coins = coins + ${coinsToAdd} 
          WHERE user_id = ${userId}
          RETURNING stars, coins
        `;

        return res.status(200).json({
          success: true,
          stars: updatedRes[0].stars,
          coins: updatedRes[0].coins
        });
      }
      // --------------------------------------------------
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database connection error' });
  }
}
