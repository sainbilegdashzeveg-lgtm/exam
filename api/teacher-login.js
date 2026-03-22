import { connectRedis } from "./lib/redis.js";
import {
  createTeacherSession,
  teacherPasswordPlain,
} from "./lib/teacherAuth.js";
import { parseJsonBody } from "./lib/parseJsonBody.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const conn = connectRedis();
    if (!conn.ok) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: conn.error }));
    }
    const redis = conn.redis;

    let b;
    try {
      b = await parseJsonBody(req);
    } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid JSON" }));
    }

    const pwd =
      b && typeof b.password === "string" ? b.password.trim() : "";
    if (pwd !== teacherPasswordPlain()) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Нууц үг буруу байна." }));
    }

    const token = await createTeacherSession(redis);
    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: true,
        token,
        expiresInSec: 60 * 60 * 24 * 7,
      })
    );
  } catch (e) {
    console.error("api/teacher-login", e);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "Серверийн алдаа. Vercel Functions log-ыг шалгана уу." })
    );
  }
}
