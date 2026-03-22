import { randomBytes } from "crypto";
import { connectRedis } from "./lib/redis.js";
import {
  dynamicQuizStorageKey,
  DYN_QUIZ_LIST_KEY,
  parseDynamicQuiz,
  stripCsvFromQuiz,
} from "./lib/dynamicQuiz.js";
import { authorizeTeacherRequest } from "./lib/teacherAuth.js";
import { parseJsonBody } from "./lib/parseJsonBody.js";

const MAX_CSV = 1_500_000;

function newQuizId() {
  return `t_${randomBytes(14).toString("hex")}`;
}

function newSessionEpoch() {
  return randomBytes(8).toString("hex");
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    const conn = connectRedis();
    if (!conn.ok) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: conn.error }));
    }
    const redis = conn.redis;

    if (req.method === "GET") {
      const ok = await authorizeTeacherRequest(req, redis);
      if (!ok) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      const ids = await redis.lrange(DYN_QUIZ_LIST_KEY, 0, 1999);
      const seen = new Set();
      const list = [];
      for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const raw = await redis.get(dynamicQuizStorageKey(id));
        const q = parseDynamicQuiz(raw);
        if (q) list.push(stripCsvFromQuiz(q));
      }
      list.sort((a, b) => {
        const ta = Date.parse(a.createdAt) || 0;
        const tb = Date.parse(b.createdAt) || 0;
        return tb - ta;
      });
      res.statusCode = 200;
      return res.end(JSON.stringify({ quizzes: list }));
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    const authOk = await authorizeTeacherRequest(req, redis);
    if (!authOk) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    let b;
    try {
      b = await parseJsonBody(req);
    } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid JSON" }));
    }

    const action = b && typeof b.action === "string" ? b.action : "";

    if (action === "create") {
      const title =
        b.title != null ? String(b.title).trim().slice(0, 200) : "";
      const durationMinutes = Math.max(
        1,
        Math.min(10_080, Number(b.durationMinutes) | 0)
      );
      const questionCount = Math.max(
        1,
        Math.min(50_000, Number(b.questionCount) | 0)
      );
      const csvText =
        b.csvText != null ? String(b.csvText).slice(0, MAX_CSV) : "";
      const mode = b.mode === "draft" ? "draft" : "start";

      if (!title) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Нэр шаардлагатай." }));
      }
      if (!csvText || csvText.length < 10) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "CSV агуулга хоосон байна." }));
      }

      const id = newQuizId();
      const createdAt = new Date().toISOString();
      let status = "draft";
      let openAt = null;
      let closeAt = null;

      if (mode === "start") {
        status = "active";
        const t0 = Date.now();
        openAt = new Date(t0).toISOString();
        closeAt = new Date(t0 + durationMinutes * 60_000).toISOString();
      }

      const record = {
        id,
        title,
        durationMinutes,
        questionCount,
        csvText,
        status,
        openAt,
        closeAt,
        createdAt,
        finishedAt: null,
        sessionEpoch: newSessionEpoch(),
      };

      await redis.set(dynamicQuizStorageKey(id), JSON.stringify(record));
      await redis.lpush(DYN_QUIZ_LIST_KEY, id);

      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          ok: true,
          quiz: stripCsvFromQuiz(record),
        })
      );
    }

    if (action === "start") {
      const id = b.id != null ? String(b.id).trim() : "";
      if (!id.startsWith("t_") || id.length > 80) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "ID буруу." }));
      }
      const raw = await redis.get(dynamicQuizStorageKey(id));
      const q = parseDynamicQuiz(raw);
      if (!q) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Олдсонгүй." }));
      }
      if (q.status !== "draft") {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Зөвхөн ноорог шалгалтыг эхлүүлнэ." }));
      }
      const t0 = Date.now();
      q.status = "active";
      q.openAt = new Date(t0).toISOString();
      q.closeAt = new Date(t0 + (q.durationMinutes || 60) * 60_000).toISOString();
      q.sessionEpoch = newSessionEpoch();
      await redis.set(dynamicQuizStorageKey(id), JSON.stringify(q));
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, quiz: stripCsvFromQuiz(q) }));
    }

    if (action === "finish") {
      const id = b.id != null ? String(b.id).trim() : "";
      if (!id.startsWith("t_") || id.length > 80) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "ID буруу." }));
      }
      const raw = await redis.get(dynamicQuizStorageKey(id));
      const q = parseDynamicQuiz(raw);
      if (!q) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Олдсонгүй." }));
      }
      if (q.status === "finished") {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Аль хэдийн дууссан." }));
      }
      q.status = "finished";
      q.finishedAt = new Date().toISOString();
      q.sessionEpoch = newSessionEpoch();
      await redis.set(dynamicQuizStorageKey(id), JSON.stringify(q));
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, quiz: stripCsvFromQuiz(q) }));
    }

    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Unknown action" }));
  } catch (e) {
    console.error("api/teacher-quiz", e);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "Серверийн алдаа. Vercel Functions log-ыг шалгана уу." })
    );
  }
}
