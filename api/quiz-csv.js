import { connectRedis } from "./lib/redis.js";
import {
  dynamicQuizStorageKey,
  parseDynamicQuiz,
  canSubmitDynamicQuiz,
} from "./lib/dynamicQuiz.js";
import { getQuizIdFromReq } from "./lib/requestQuery.js";

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const qid = getQuizIdFromReq(req);
    if (!qid.startsWith("t_") || qid.length > 80) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Invalid quiz id" }));
    }

    const conn = connectRedis();
    if (!conn.ok) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: conn.error }));
    }
    const redis = conn.redis;

    const raw = await redis.get(dynamicQuizStorageKey(qid));
    const q = parseDynamicQuiz(raw);
    if (!q || !q.csvText) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Not found" }));
    }

    const sub = canSubmitDynamicQuiz(q, Date.now());
    if (!sub.ok) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(
        JSON.stringify({
          error:
            sub.reason === "finished"
              ? "Энэ шалгалт багшаар дуусгагдсан."
              : "Шалгалтын хугацаа одоо идэвхгүй.",
        })
      );
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(q.csvText);
  } catch (e) {
    console.error("api/quiz-csv", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(
      JSON.stringify({ error: "Серверийн алдаа. Vercel Functions log-ыг шалгана уу." })
    );
  }
}
