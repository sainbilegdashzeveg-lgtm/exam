export function teacherKeyPlain() {
  return String(process.env.TEACHER_KEY || "teacher-demo-key").trim();
}

function queryKeyFromRequest(req) {
  if (req.query && req.query.key != null) return String(req.query.key);
  try {
    const u = new URL(String(req.url || ""), "http://localhost");
    return u.searchParams.get("key") || "";
  } catch {
    return "";
  }
}

/** GET /api/submissions — query ?key= эсвэл X-Teacher-Key */
export async function authorizeTeacherRequest(req) {
  const k = teacherKeyPlain();
  const q = queryKeyFromRequest(req);
  const xh = req.headers["x-teacher-key"];
  const xhs = xh != null ? String(xh) : "";
  return q === k || xhs === k;
}
