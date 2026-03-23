function fromNodeQuery(q, name) {
  if (!q || q[name] == null) return "";
  const v = q[name];
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function fromUrlSearch(reqUrl, name) {
  try {
    const u = new URL(String(reqUrl || ""), "http://localhost");
    return (u.searchParams.get(name) || "").trim();
  } catch {
    return "";
  }
}

/** Vercel зарим орчинд req.query хоосон — req.url-аас уншина */
export function getSearchParam(req, name) {
  const a = fromNodeQuery(req.query, name);
  if (a) return a;
  return fromUrlSearch(req.url, name);
}

export function getQuizIdFromReq(req) {
  return getSearchParam(req, "id") || getSearchParam(req, "quiz");
}
