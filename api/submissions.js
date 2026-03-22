import { getRedis, SUBMISSIONS_KEY } from "./lib/redis.js";

function teacherKey() {
  return process.env.TEACHER_KEY || "teacher-demo-key";
}

function getTeacherKeyFromRequest(req) {
  const q = req.query;
  if (q && q.key) return String(q.key);
  const h = req.headers["x-teacher-key"];
  if (h) return String(h);
  try {
    const raw = String(req.url || "").split("?")[1];
    if (!raw) return "";
    return new URLSearchParams(raw).get("key") || "";
  } catch {
    return "";
  }
}

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

    const key = getTeacherKeyFromRequest(req);
    if (key !== teacherKey()) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    const redis = getRedis();
    if (!redis) {
      res.statusCode = 503;
      return res.end(
        JSON.stringify({
          error:
            "Redis тохируулаагүй байна. Vercel дээр Upstash хувьсагчуудыг оруулна.",
        })
      );
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
        out.push(JSON.parse(line));
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
