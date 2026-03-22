import { connectRedis } from "./lib/redis.js";
import {
  dynamicQuizStorageKey,
  parseDynamicQuiz,
  canSubmitDynamicQuiz,
} from "./lib/dynamicQuiz.js";

function formatTs(ts) {
  try {
    return new Date(ts).toLocaleString("mn-MN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
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

    const id =
      (req.query && req.query.id != null && String(req.query.id)) ||
      (req.query && req.query.quiz != null && String(req.query.quiz)) ||
      "";
    const qid = id.trim();
    if (!qid.startsWith("t_") || qid.length > 80) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid quiz id" }));
    }

    const conn = connectRedis();
    if (!conn.ok) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: conn.error }));
    }
    const redis = conn.redis;

    const raw = await redis.get(dynamicQuizStorageKey(qid));
    const q = parseDynamicQuiz(raw);
    if (!q) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Not found" }));
    }

    if (q.status === "draft") {
      return res.end(
        JSON.stringify({
          ok: false,
          reason: "draft",
          message:
            "Энэ шалгалт хараахан эхлээгүй — багш «Эхлүүлэх» дарсны дараа оюутанд нээгдэнэ.",
          detail: "",
        })
      );
    }

    if (q.status === "finished") {
      return res.end(
        JSON.stringify({
          ok: false,
          reason: "finished",
          message: "Энэ шалгалт багшаар дуусгагдсан.",
          detail: q.finishedAt
            ? `Дуусгасан: ${formatTs(q.finishedAt)}`
            : "",
        })
      );
    }

    const sub = canSubmitDynamicQuiz(q, Date.now());
    if (sub.ok) {
      return res.end(
        JSON.stringify({
          ok: true,
          title: q.title || "",
          questionCount: q.questionCount || 0,
          openAt: q.openAt,
          closeAt: q.closeAt,
        })
      );
    }

    let message = "Энэ шалгалт одоогоор нээлттэй биш.";
    let detail = "";
    if (sub.reason === "before" && sub.openT != null && sub.closeT != null) {
      message = q.windowMessage || message;
      detail = `Шалгалтын хугацаа: ${formatTs(sub.openT)} – ${formatTs(sub.closeT)}. Одоо урьдчилан нээгдээгүй.`;
    } else if (sub.reason === "after" && sub.openT != null && sub.closeT != null) {
      detail = `Шалгалтын хугацаа дууссан (${formatTs(sub.openT)} – ${formatTs(sub.closeT)}).`;
    }

    return res.end(
      JSON.stringify({
        ok: false,
        reason: sub.reason || "closed",
        message,
        detail,
      })
    );
  } catch (e) {
    console.error("api/quiz-status", e);
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "Серверийн алдаа. Vercel Functions log-ыг шалгана уу." })
    );
  }
}
