/* global Papa */

const PAGE_SIZE = 5;
const KEYS = ["A", "B", "C", "D"];
const STORAGE_PREFIX = "csv-quiz-v1";

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function sanitizeQuizId(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s || s.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(s)) return "";
  return s;
}

function getQuizStorageSlot() {
  try {
    const q = sanitizeQuizId(new URLSearchParams(window.location.search).get("quiz"));
    return q || "default";
  } catch {
    return "default";
  }
}

function getStorageKey() {
  const quizSlot = getQuizStorageSlot();
  let key = `${STORAGE_PREFIX}:q:${quizSlot}`;
  let raw = "";
  try {
    raw = new URLSearchParams(window.location.search).get("s") || "";
  } catch {
    raw = "";
  }
  const t = String(raw).trim().slice(0, 128);
  if (t) key += `:s${hashString(t)}`;
  return key;
}

function updateSessionUrlHint() {
  const el = document.getElementById("session-url-hint");
  if (!el) return;
  let raw = "";
  try {
    raw = new URLSearchParams(window.location.search).get("s") || "";
  } catch {
    raw = "";
  }
  const q = sanitizeQuizId(
    (() => {
      try {
        return new URLSearchParams(window.location.search).get("quiz");
      } catch {
        return "";
      }
    })()
  );
  let quizLine = "";
  if (q) {
    quizLine = ` Одоо «${q}» шалгалт (?quiz=).`;
  } else {
    quizLine = " Одоо үндсэн quiz.csv (эсвэл ?quiz=байхгүй).";
  }
  if (String(raw).trim()) {
    el.textContent =
      "Холбоосонд ?s=… түлхүүр байна — түр завсарлах, дүн зөвхөн энэ түлхүүр + энэ хөтөч + энэ шалгалтаар хадгалагдана. Өөр оюутанд өөр ?s=." +
      quizLine;
  } else {
    el.textContent =
      "Овог нэрээ дүн гарсны дараа «Багшид илгээх»-д бичнэ. Дахин ороход хөтөч таныг нэрээр биш localStorage-аар таньна; нэг утсан дээр олон оюутан бол ?s=дугаар ашиглана." +
      quizLine;
  }
}

const els = {
  screenClosed: document.getElementById("screen-closed"),
  screenUpload: document.getElementById("screen-upload"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenResults: document.getElementById("screen-results"),
  fileInput: document.getElementById("csv-file"),
  uploadError: document.getElementById("upload-error"),
  pageHeading: document.getElementById("page-heading"),
  questionsContainer: document.getElementById("questions-container"),
  btnPause: document.getElementById("btn-pause"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnContinue: document.getElementById("btn-continue"),
  btnContinueWrap: document.getElementById("btn-continue-wrap"),
  sessionHint: document.getElementById("session-hint"),
  progress: document.getElementById("progress"),
  scoreValue: document.getElementById("score-value"),
  scoreDetail: document.getElementById("score-detail"),
  review: document.getElementById("review"),
  btnRestart: document.getElementById("btn-restart"),
  btnScrollReview: document.getElementById("btn-scroll-review"),
  reviewSection: document.getElementById("review-section"),
  studentName: document.getElementById("student-name"),
  studentId: document.getElementById("student-id"),
  btnSubmitTeacher: document.getElementById("btn-submit-teacher"),
  submitStatus: document.getElementById("submit-status"),
  quizIdHint: document.getElementById("quiz-id-hint"),
};

let pool = [];
let quiz = [];
let selected = [];
let currentPage = 0;
let quizId = "";
let revealedReview = false;

function deriveRevealedReview(data) {
  if (data.revealedReview === true) return true;
  if (data.revealedReview === false) return false;
  if (data.finished && !Object.prototype.hasOwnProperty.call(data, "revealedReview")) {
    return true;
  }
  return false;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function val(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}

function objectToQuestion(obj) {
  const q = val(obj, "question", "q", "prompt");
  const c1 = val(obj, "choice1", "a", "option_a", "option1");
  const c2 = val(obj, "choice2", "b", "option_b", "option2");
  const c3 = val(obj, "choice3", "c", "option_c", "option3");
  const c4 = val(obj, "choice4", "d", "option_d", "option4");

  const choices = [c1, c2, c3, c4].filter(Boolean);
  if (!q || choices.length < 4) return null;

  const rawCorrect = val(obj, "correct", "answer", "key");
  let correctIndex = parseInt(rawCorrect, 10);
  if (!Number.isNaN(correctIndex) && correctIndex >= 1 && correctIndex <= 4) {
    correctIndex -= 1;
  } else {
    const letter = rawCorrect.toUpperCase();
    const li = KEYS.indexOf(letter);
    if (li >= 0) correctIndex = li;
    else {
      const match = choices.findIndex(
        (c) => c.toLowerCase() === rawCorrect.toLowerCase()
      );
      correctIndex = match >= 0 ? match : 0;
    }
  }

  if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;

  return { question: q, choices, correctIndex };
}

function processDataRows(rows) {
  if (!rows || !rows.length) throw new Error("CSV has no data rows.");

  const questions = [];
  for (const obj of rows) {
    if (!obj || typeof obj !== "object") continue;
    const q = objectToQuestion(obj);
    if (q) questions.push(q);
  }

  if (!questions.length) {
    throw new Error(
      "No valid rows. Expected columns: question, choice1–choice4 (or a–d), and correct (1–4, A–D, or matching option text)."
    );
  }

  return questions;
}

function computeQuizId(qlist) {
  const s = qlist
    .map((q) => [q.question, ...q.choices, q.correctIndex].join("\u001f"))
    .join("\u001e");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "q" + (h >>> 0).toString(16);
}

function buildSubmissionItems() {
  return quiz.map((q, i) => {
    const user = selected[i];
    const ok = user === q.correctIndex;
    return {
      n: i + 1,
      question: q.question,
      pickedIndex: user,
      pickedLabel: user == null ? null : KEYS[user],
      pickedText: user == null ? null : q.choices[user],
      correctIndex: q.correctIndex,
      correctLabel: KEYS[q.correctIndex],
      correctText: q.choices[q.correctIndex],
      correct: ok,
    };
  });
}

function syncQuizId() {
  quizId = quiz.length ? computeQuizId(quiz) : "";
  if (els.quizIdHint) {
    els.quizIdHint.textContent = quizId
      ? `Шалгалтын ID (багш шүүхэд): ${quizId}`
      : "";
  }
}

function applyQuizFromPapaResults(results, options = {}) {
  const silent = options.silent === true;
  if (!silent) els.uploadError.textContent = "";

  const fatal = (results.errors || []).find(
    (e) => e.type === "Quotes" || e.code === "TooManyFields" || e.fatal
  );
  if (fatal) {
    if (!silent) els.uploadError.textContent = fatal.message || "CSV parse error.";
    return false;
  }
  try {
    clearSession();
    pool = processDataRows(results.data);
    quiz = pool;
    syncQuizId();
    selected = quiz.map(() => null);
    currentPage = 0;
    hideSessionChrome();
    persistProgress();
    showScreen("quiz");
    renderPage();
    return true;
  } catch (err) {
    if (!silent) els.uploadError.textContent = err.message || "Could not read CSV.";
    return false;
  }
}

function fetchCsvText(url) {
  return fetch(url, { cache: "no-store" })
    .then((res) => (res.ok ? res.text() : null))
    .catch(() => null);
}

function parseCsvTextApply(text) {
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => normalizeHeader(h),
      complete: (results) => {
        resolve(applyQuizFromPapaResults(results, { silent: true }));
      },
      error: () => resolve(false),
    });
  });
}

async function tryLoadBundledQuizCsv() {
  let pid = "";
  try {
    pid = sanitizeQuizId(new URLSearchParams(window.location.search).get("quiz"));
  } catch {
    pid = "";
  }
  if (pid) {
    if (pid.startsWith("t_")) {
      const t = await fetchCsvText(
        `/api/quiz-csv?id=${encodeURIComponent(pid)}`
      );
      if (!t) return false;
      return parseCsvTextApply(t);
    }
    const t = await fetchCsvText(`/quizzes/${pid}.csv`);
    if (!t) return false;
    return parseCsvTextApply(t);
  }
  const t2 = await fetchCsvText("/quiz.csv");
  if (!t2) return false;
  return parseCsvTextApply(t2);
}

function totalPages() {
  return Math.ceil(quiz.length / PAGE_SIZE);
}

function normalizeSelected(arr, len) {
  const out = Array.isArray(arr) ? arr.slice(0, len) : [];
  while (out.length < len) out.push(null);
  return out;
}

function loadStored() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Array.isArray(data.quiz) || !data.quiz.length) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSession(partial) {
  try {
    const base = {
      v: 1,
      quiz,
      selected,
      currentPage,
      resumeToResults: false,
      finished: false,
      revealedReview,
    };
    localStorage.setItem(getStorageKey(), JSON.stringify({ ...base, ...partial }));
  } catch (_) {
    /* quota or private mode */
  }
}

function persistProgress() {
  if (!quiz.length) return;
  saveSession({
    resumeToResults: false,
    finished: false,
  });
}

function clearSession() {
  localStorage.removeItem(getStorageKey());
  els.sessionHint.classList.add("hidden");
  els.btnContinueWrap.classList.add("hidden");
}

function hideSessionChrome() {
  els.sessionHint.classList.add("hidden");
  els.btnContinueWrap.classList.add("hidden");
}

function clampCurrentPage() {
  const pages = totalPages();
  if (pages < 1) return;
  currentPage = Math.min(Math.max(0, currentPage), pages - 1);
}

function showScreen(name) {
  if (els.screenClosed) {
    els.screenClosed.classList.toggle("hidden", name !== "closed");
  }
  els.screenUpload.classList.toggle("hidden", name !== "upload");
  els.screenQuiz.classList.toggle("hidden", name !== "quiz");
  els.screenResults.classList.toggle("hidden", name !== "results");
}

async function fetchQuizManifest() {
  try {
    const r = await fetch("/quizzes/manifest.json", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function resolveWindowConfig(manifest, quizSlot) {
  if (!manifest || typeof manifest !== "object") return null;
  if (quizSlot && quizSlot !== "default") {
    const list = Array.isArray(manifest.quizzes) ? manifest.quizzes : [];
    const q = list.find((x) => x && x.id === quizSlot);
    if (q && q.window && typeof q.window === "object") return q.window;
  }
  if (manifest.defaultWindow && typeof manifest.defaultWindow === "object") {
    return manifest.defaultWindow;
  }
  return null;
}

function evaluateWindow(w) {
  if (!w || !w.enabled) return { ok: true };
  const openT = Date.parse(w.openAt);
  const closeT = Date.parse(w.closeAt);
  if (Number.isNaN(openT) || Number.isNaN(closeT)) return { ok: true };
  const now = Date.now();
  if (now < openT) return { ok: false, reason: "before", openT, closeT };
  if (now > closeT) return { ok: false, reason: "after", openT, closeT };
  return { ok: true, openT, closeT };
}

function formatTs(ts) {
  try {
    return new Date(ts).toLocaleString("mn-MN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(ts);
  }
}

async function checkQuizWindow(quizSlot) {
  const manifest = await fetchQuizManifest();
  const w = resolveWindowConfig(manifest, quizSlot);
  const ev = evaluateWindow(w);
  if (ev.ok) return { ok: true };
  const custom =
    w && typeof w.message === "string" && w.message.trim()
      ? w.message.trim()
      : "Энэ шалгалт одоогоор нээлттэй биш — зөвшөөрөгдсөн шалгалтын хугацаанд л орно.";
  let detail = "";
  if (ev.reason === "before" && ev.openT != null && ev.closeT != null) {
    detail = `Шалгалтын хугацаа: ${formatTs(ev.openT)} – ${formatTs(ev.closeT)}. Одоо урьдчилан нээгдээгүй — дээрх эхний цагаас хойш орно.`;
  } else if (ev.reason === "after" && ev.closeT != null && ev.openT != null) {
    detail = `Шалгалтын хугацаа дууссан (${formatTs(ev.openT)} – ${formatTs(ev.closeT)}).`;
  }
  return { ok: false, message: custom, detail };
}

/** Багшийн порталаас үүсгэсэн шалгалт (Redis) — /api/quiz-status */
async function checkDynamicQuizWindow(pid) {
  try {
    const res = await fetch(`/api/quiz-status?id=${encodeURIComponent(pid)}`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 503) {
      return {
        ok: false,
        message: j.error || "Серверийн тохиргоо (Redis) шалгана уу.",
        detail: "",
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        message: "Энэ шалгалт олдсонгүй эсвэл устсан байна.",
        detail: "",
      };
    }
    if (j.ok === true) return { ok: true };
    return {
      ok: false,
      message: j.message || "Шалгалтын цонх хаалттай.",
      detail: j.detail || "",
    };
  } catch {
    return {
      ok: false,
      message: "Сүлжээний алдаа — шалгалтын төлөв ачаалагдсангүй.",
      detail: "",
    };
  }
}

function renderPage() {
  const pages = totalPages();
  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, quiz.length);

  els.pageHeading.textContent = `Дэлгэц ${currentPage + 1} / ${pages} · асуулт ${start + 1}–${end} (нийт ${quiz.length})`;
  els.progress.textContent = `${currentPage + 1} / ${pages}`;

  els.questionsContainer.innerHTML = "";
  for (let globalIndex = start; globalIndex < end; globalIndex++) {
    const item = quiz[globalIndex];
    const block = document.createElement("div");
    block.className = "question-block";

    const label = document.createElement("div");
    label.className = "question-label";
    label.textContent = `Асуулт ${globalIndex + 1}`;

    const qText = document.createElement("p");
    qText.className = "question-text";
    qText.textContent = item.question;

    const choicesWrap = document.createElement("div");
    choicesWrap.className = "choices";

    item.choices.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      if (selected[globalIndex] === i) btn.classList.add("selected");
      btn.innerHTML = `<span class="choice-key">${KEYS[i]}</span><span>${escapeHtml(text)}</span>`;
      btn.addEventListener("click", () => {
        selected[globalIndex] = i;
        renderPage();
        persistProgress();
      });
      choicesWrap.appendChild(btn);
    });

    block.appendChild(label);
    block.appendChild(qText);
    block.appendChild(choicesWrap);
    els.questionsContainer.appendChild(block);
  }

  els.btnPrev.disabled = currentPage === 0;
  els.btnNext.textContent = currentPage >= pages - 1 ? "Дүн харах" : "Дараах";
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function scoreQuiz() {
  let correct = 0;
  quiz.forEach((q, i) => {
    if (selected[i] === q.correctIndex) correct += 1;
  });
  return correct;
}

function fillResultsUI() {
  const total = quiz.length;
  const correct = scoreQuiz();
  els.scoreValue.textContent = `${correct} / ${total}`;
  els.scoreDetail.textContent =
    correct === total
      ? "Бүх асуулт зөв."
      : `${correct} зөв (нийт ${total}).`;

  const heading = document.getElementById("review-heading");
  const flowHint = document.getElementById("results-flow-hint");

  els.review.innerHTML = "";
  if (revealedReview) {
    if (heading) heading.textContent = "Асуулт бүрийн шалгалт";
    if (flowHint) {
      flowHint.innerHTML =
        "Доорх жагсаалтаас асуулт бүрийн зөв, буруу хариултаа харна уу.";
    }
    if (els.btnScrollReview) els.btnScrollReview.classList.remove("hidden");

    quiz.forEach((q, i) => {
      const user = selected[i];
      const ok = user === q.correctIndex;
      const your =
        user == null ? "Хариулсангүй" : `${KEYS[user]} — ${q.choices[user]}`;
      const right = `${KEYS[q.correctIndex]} — ${q.choices[q.correctIndex]}`;
      const div = document.createElement("div");
      div.className = "review-item";
      div.innerHTML = `
      <div class="review-q">${escapeHtml(q.question)}</div>
      <div class="review-meta ${ok ? "correct" : "incorrect"}">
        ${ok ? "Зөв." : `Таны хариулт: ${escapeHtml(your)}`}
      </div>
      ${ok ? "" : `<div class="review-meta correct">Зөв хариулт: ${escapeHtml(right)}</div>`}
    `;
      els.review.appendChild(div);
    });
  } else {
    if (heading) heading.textContent = "Асуулт бүрийн дүн";
    if (flowHint) {
      flowHint.innerHTML =
        "<strong>Алхам 1.</strong> Доор овог нэрээ бичиж багшид илгээнэ. <strong>Алхам 2.</strong> Илгээсний дараа асуулт бүрийн зөв, буруу хариулт доор гарна.";
    }
    if (els.btnScrollReview) els.btnScrollReview.classList.add("hidden");

    const p = document.createElement("p");
    p.className = "review-locked";
    p.textContent =
      "Энд асуулт бүрийн зөв, буруу хариулт багшид амжилттай илгээсний дараа л харагдана.";
    els.review.appendChild(p);
  }
}

function showResults(options = {}) {
  if (!options.preserveRevealed) {
    revealedReview = false;
  }
  fillResultsUI();
  syncQuizId();
  if (els.submitStatus) els.submitStatus.textContent = "";
  showScreen("results");
  clampCurrentPage();
  saveSession({
    resumeToResults: false,
    finished: true,
    revealedReview,
  });
}

function pauseQuiz() {
  if (!quiz.length) return;
  const pages = totalPages();
  const lastScreen = currentPage >= pages - 1;

  if (lastScreen) {
    saveSession({
      resumeToResults: true,
      finished: false,
    });
  } else {
    saveSession({
      currentPage: currentPage + 1,
      resumeToResults: false,
      finished: false,
    });
  }

  showScreen("upload");
  els.sessionHint.classList.remove("hidden");
  els.sessionHint.textContent =
    "Одоогийн хариултууд хадгалагдлаа. Дахин энэ холбоосоор ороход дараагийн дэлгэцээс үргэлжилнэ. Өмнөх сонголтууд эцсийн дүнд тооцогдоно.";
  els.btnContinueWrap.classList.remove("hidden");
}

function applyStoredSession(data) {
  quiz = data.quiz;
  pool = data.quiz;
  selected = normalizeSelected(data.selected, quiz.length);
  currentPage = data.currentPage | 0;
  clampCurrentPage();
  revealedReview = deriveRevealedReview(data);
  syncQuizId();
}

function initFromStorage() {
  const data = loadStored();
  if (!data) return false;

  applyStoredSession(data);

  if (data.finished) {
    showScreen("results");
    fillResultsUI();
    hideSessionChrome();
    return true;
  }

  if (data.resumeToResults) {
    showResults({ preserveRevealed: true });
    hideSessionChrome();
    return true;
  }

  showScreen("quiz");
  hideSessionChrome();
  renderPage();
  return true;
}

els.fileInput.addEventListener("change", () => {
  els.uploadError.textContent = "";
  const file = els.fileInput.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => normalizeHeader(h),
    complete: (results) => {
      applyQuizFromPapaResults(results, { silent: false });
    },
    error: (err) => {
      els.uploadError.textContent = err.message || "Failed to parse file.";
    },
  });
});

els.btnPause.addEventListener("click", () => {
  pauseQuiz();
});

els.btnContinue.addEventListener("click", () => {
  const data = loadStored();
  if (!data || !data.quiz?.length) return;

  applyStoredSession(data);
  hideSessionChrome();

  if (data.resumeToResults) {
    showResults({ preserveRevealed: true });
    return;
  }

  showScreen("quiz");
  renderPage();
});

els.btnPrev.addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage -= 1;
    renderPage();
    persistProgress();
  }
});

els.btnNext.addEventListener("click", () => {
  const pages = totalPages();
  if (currentPage < pages - 1) {
    currentPage += 1;
    renderPage();
    persistProgress();
  } else {
    showResults();
  }
});

els.btnRestart.addEventListener("click", () => {
  quiz = pool;
  selected = quiz.map(() => null);
  currentPage = 0;
  syncQuizId();
  if (pool.length) {
    clearSession();
    persistProgress();
    showScreen("quiz");
    renderPage();
  } else {
    clearSession();
    showScreen("upload");
  }
});

if (els.btnScrollReview && els.reviewSection) {
  els.btnScrollReview.addEventListener("click", () => {
    els.reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (els.btnSubmitTeacher) {
  els.btnSubmitTeacher.addEventListener("click", async () => {
    const name = els.studentName.value.trim();
    if (!name) {
      els.submitStatus.textContent = "Овог нэрээ оруулна уу.";
      return;
    }
    if (!quizId) {
      els.submitStatus.textContent = "Шалгалтын өгөгдөл алга.";
      return;
    }
    const body = {
      quizId,
      studentName: name,
      studentId: els.studentId.value.trim(),
      score: scoreQuiz(),
      total: quiz.length,
      items: buildSubmissionItems(),
    };
    els.submitStatus.textContent = "Илгээж байна…";
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Алдаа ${res.status}`);
      revealedReview = true;
      saveSession({ finished: true, revealedReview: true });
      fillResultsUI();
      els.submitStatus.textContent =
        "Амжилттай илгээгдлээ. Доор асуулт бүрийн зөв, буруу харагдана. Багш teacher.html → «Ачаалах».";
      if (els.reviewSection) {
        requestAnimationFrame(() => {
          els.reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (e) {
      const fallback =
        "Илгээж чадсангүй. Сүлжээ эсвэл тохиргоо шалгана (Vercel: Upstash Redis env, локал: server/npm start).";
      els.submitStatus.textContent =
        e instanceof Error && e.message ? e.message : fallback;
    }
  });
}

updateSessionUrlHint();

const bootLoadingEl = document.getElementById("bootstrap-loading");

async function bootstrap() {
  if (initFromStorage()) return;
  if (bootLoadingEl) bootLoadingEl.classList.remove("hidden");
  let pid = "";
  try {
    pid = sanitizeQuizId(new URLSearchParams(window.location.search).get("quiz"));
  } catch {
    pid = "";
  }
  const slot = pid || "default";
  const win =
    pid && pid.startsWith("t_")
      ? await checkDynamicQuizWindow(pid)
      : await checkQuizWindow(slot);
  if (!win.ok) {
    if (bootLoadingEl) bootLoadingEl.classList.add("hidden");
    const cm = document.getElementById("closed-message");
    const cd = document.getElementById("closed-window-detail");
    if (cm) cm.textContent = win.message || "";
    if (cd) cd.textContent = win.detail || "";
    showScreen("closed");
    return;
  }
  const ok = await tryLoadBundledQuizCsv();
  if (bootLoadingEl) bootLoadingEl.classList.add("hidden");
  if (!ok) {
    if (pid) {
      els.uploadError.textContent = pid.startsWith("t_")
        ? `«${pid}» динамик шалгалт ачаалагдсангүй (цонх хаалттай эсвэл серверийн тохиргоо). Багшийн портал шалгана уу.`
        : `«${pid}» шалгалт олдсонгүй. Файл quizzes/${pid}.csv байгаа эсэхийг шалгана уу.`;
    }
    showScreen("upload");
  }
}

bootstrap();
