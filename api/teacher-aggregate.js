import { connectRedis, SUBMISSIONS_KEY } from "./lib/redis.js";
import { authorizeTeacherRequest } from "./lib/teacherAuth.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "GET") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const conn = connectRedis();
    if (!conn.ok) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: conn.error }));
    }
    const redis = conn.redis;

    const ok = await authorizeTeacherRequest(req, redis);
    if (!ok) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    const quizId =
      req.query && req.query.quizId != null
        ? String(req.query.quizId).trim()
        : "";
    if (!quizId) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "quizId required" }));
    }

    let raw;
    try {
      raw = await redis.lrange(SUBMISSIONS_KEY, 0, 9999);
    } catch (e) {
      console.error("teacher-aggregate lrange", e);
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "Redis уншиж чадсангүй." }));
    }

    const rows = [];
    let sumPct = 0;
    let n = 0;
    for (const line of raw) {
      try {
        const r = JSON.parse(line);
        if (!r || String(r.quizId) !== quizId) continue;
        const score = Number(r.score) | 0;
        const total = Math.max(1, Number(r.total) | 0);
        const pct = (score / total) * 100;
        sumPct += pct;
        n += 1;
        rows.push({
          studentName: r.studentName,
          studentId: r.studentId || "",
          score,
          total,
          pct: Math.round(pct * 100) / 100,
          submittedAt: r.submittedAt,
        });
      } catch {
        /* skip */
      }
    }

    rows.sort((a, b) => {
      const ta = Date.parse(a.submittedAt) || 0;
      const tb = Date.parse(b.submittedAt) || 0;
      return tb - ta;
    });

    const averagePercent = n ? Math.round((sumPct / n) * 100) / 100 : 0;

    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        quizId,
        count: n,
        averagePercent,
        rows,
      })
    );
  } catch (e) {
    console.error("api/teacher-aggregate", e);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "Серверийн алдаа. Vercel Functions log-ыг шалгана уу." })
    );
  }
}
