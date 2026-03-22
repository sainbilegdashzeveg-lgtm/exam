import { connectRedis } from "./redis.js";
import { randomBytes } from "crypto";

export function teacherPasswordPlain() {
  return String(
    process.env.TEACHER_PASSWORD || process.env.TEACHER_KEY || "teacher-demo-key"
  ).trim();
}

export function teacherKeyPlain() {
  return String(process.env.TEACHER_KEY || "teacher-demo-key").trim();
}

export async function createTeacherSession(redis) {
  const token = randomBytes(32).toString("hex");
  const key = `teacher:sess:${token}`;
  await redis.set(key, "1", { ex: 60 * 60 * 24 * 7 });
  return token;
}

export async function isTeacherSession(redis, token) {
  if (!token || String(token).length > 200) return false;
  const v = await redis.get(`teacher:sess:${token}`);
  return v != null;
}

/**
 * Илгээлтийн API: TEACHER_KEY query/header эсвэл нэвтэрсэн Bearer session.
 */
function queryKeyFromRequest(req) {
  if (req.query && req.query.key != null) return String(req.query.key);
  try {
    const raw = String(req.url || "").split("?")[1];
    if (!raw) return "";
    return new URLSearchParams(raw).get("key") || "";
  } catch {
    return "";
  }
}

export async function authorizeTeacherRequest(req, redis) {
  const k = teacherKeyPlain();
  const q = queryKeyFromRequest(req);
  const xh = req.headers["x-teacher-key"];
  const xhs = xh != null ? String(xh) : "";
  if (q === k || xhs === k) return true;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return isTeacherSession(redis, t);
  }
  return false;
}
