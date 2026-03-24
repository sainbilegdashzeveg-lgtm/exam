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

    const ok = await authorizeTeacherRequest(req);
    if (!ok) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    let raw;
    try {
      raw = await redis.lrange(SUBMISSIONS_KEY, 0, 4999);
    } catch (e) {
      console.error("redis lrange", e);
      res.statusCode = 502;
      return res.end(
        JSON.stringify({ error: "Redis уншиж чадсангүй. Upstash тохиргоог шалгана уу." })
      );
    }

    const out = [];
    for (const line of raw) {
      try {
        const row = JSON.parse(line);
        if (!row || typeof row !== "object") continue;
        const sn = Number(row.score);
        const tn = Number(row.total);
        if (Number.isFinite(sn)) row.score = sn;
        if (Number.isFinite(tn)) row.total = tn;
        out.push(row);
      } catch {
        /* skip */
      }
    }

    res.statusCode = 200;
    return res.end(JSON.stringify(out));
  } catch (e) {
    console.error("api/submissions", e);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "Серверийн алдаа. Vercel Functions log-ыг шалгана уу." })
    );
  }
}
