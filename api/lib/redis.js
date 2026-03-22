import { Redis } from "@upstash/redis";

export const SUBMISSIONS_KEY = "quiz:submissions";

export function connectRedis() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) {
    return {
      ok: false,
      error:
        "Redis тохируулаагүй байна. Upstash Redis үүсгээд Vercel дээр UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN оруулна.",
    };
  }
  try {
    return { ok: true, redis: new Redis({ url, token }) };
  } catch (e) {
    console.error("Upstash Redis init", e);
    return {
      ok: false,
      error:
        "Redis REST URL эсвэл token буруу байна. Upstash dashboard-аас https://… хаяг болон token-ийг шалгаад Vercel Environment Variables-д зөв оруулна (эхлэл/ төгсгөлд илүү зай орохгүйгээр).",
    };
  }
}
