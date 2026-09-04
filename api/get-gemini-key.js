// 파일 위치: api/get-gemini-key.js
export default function handler(req, res) {
  // 보안 검사: 관리자 세션 쿠키가 있는지 확인하면 더 안전합니다.
  // if (!req.cookies.admin_token) {
  //     return res.status(401).json({ error: "Unauthorized" });
  // }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key is not configured" });
  }

  res.status(200).json({ apiKey: apiKey });
}