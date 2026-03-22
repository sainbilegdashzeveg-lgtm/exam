export const DYN_QUIZ_KEY_PREFIX = "quiz:dyn:";
export const DYN_QUIZ_LIST_KEY = "quiz:dyn:list";

export function dynamicQuizStorageKey(id) {
  return `${DYN_QUIZ_KEY_PREFIX}${id}`;
}

export function parseDynamicQuiz(raw) {
  if (raw == null || raw === "") return null;
  try {
    const q = JSON.parse(raw);
    return q && typeof q === "object" ? q : null;
  } catch {
    return null;
  }
}

/** Оюутан илгээх / CSV авахад: идэвхтэй цонхонд л зөвшөөрнө */
export function canSubmitDynamicQuiz(q, now = Date.now()) {
  if (!q || typeof q !== "object") return { ok: false, reason: "missing" };
  if (q.status === "finished") return { ok: false, reason: "finished" };
  const t0 = Date.parse(q.openAt);
  const t1 = Date.parse(q.closeAt);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return { ok: false, reason: "bad_window" };
  if (now < t0) return { ok: false, reason: "before", openT: t0, closeT: t1 };
  if (now > t1) return { ok: false, reason: "after", openT: t0, closeT: t1 };
  if (q.status !== "active") return { ok: false, reason: "inactive" };
  return { ok: true, openT: t0, closeT: t1 };
}

export function stripCsvFromQuiz(q) {
  if (!q || typeof q !== "object") return q;
  const { csvText: _c, ...rest } = q;
  return rest;
}
