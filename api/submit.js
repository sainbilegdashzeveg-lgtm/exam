import { getRedis, SUBMISSIONS_KEY } from "./lib/redis.js";
import { parseJsonBody } from "./lib/parseJsonBody.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const redis = getRedis();
  if (!redis) {
    res.statusCode = 503;
    return res.end(
      JSON.stringify({
        error:
          "Redis тохируулаагүй байна. Upstash Redis үүсгээд Vercel дээр UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN оруулна.",
      })
    );
  }

  let b;
  try {
    b = await parseJsonBody(req);
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Invalid JSON" }));
  }

  if (!b || typeof b.studentName !== "string" || !b.studentName.trim()) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "studentName required" }));
  }
  if (!b.quizId || typeof b.score !== "number" || typeof b.total !== "number") {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "invalid payload" }));
  }

  const row = {
    id:
      Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
    submittedAt: new Date().toISOString(),
    quizId: String(b.quizId).slice(0, 128),
    studentName: b.studentName.trim().slice(0, 120),
    studentId:
      (b.studentId && String(b.studentId).trim().slice(0, 64)) || "",
    score: Math.max(0, Math.min(10_000, b.score | 0)),
    total: Math.max(1, Math.min(10_000, b.total | 0)),
    items: Array.isArray(b.items) ? b.items : [],
  };

  await redis.lpush(SUBMISSIONS_KEY, JSON.stringify(row));

  res.statusCode = 200;
  return res.end(JSON.stringify({ ok: true, id: row.id }));
}
