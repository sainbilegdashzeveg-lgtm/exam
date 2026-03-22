/* global Papa */

const PAGE_SIZE = 5;
const KEYS = ["A", "B", "C", "D"];
const STORAGE_KEY = "csv-quiz-v1";

const els = {
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
    const raw = localStorage.getItem(STORAGE_KEY);
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, ...partial }));
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
  localStorage.removeItem(STORAGE_KEY);
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
  els.screenUpload.classList.toggle("hidden", name !== "upload");
  els.screenQuiz.classList.toggle("hidden", name !== "quiz");
  els.screenResults.classList.toggle("hidden", name !== "results");
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

  els.review.innerHTML = "";
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
}

function showResults() {
  fillResultsUI();
  syncQuizId();
  if (els.submitStatus) els.submitStatus.textContent = "";
  showScreen("results");
  clampCurrentPage();
  saveSession({
    resumeToResults: false,
    finished: true,
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
    showResults();
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
      const fatal = (results.errors || []).find(
        (e) => e.type === "Quotes" || e.code === "TooManyFields" || e.fatal
      );
      if (fatal) {
        els.uploadError.textContent = fatal.message || "CSV parse error.";
        return;
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
      } catch (err) {
        els.uploadError.textContent = err.message || "Could not read CSV.";
      }
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
    showResults();
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
      if (!res.ok) throw new Error(j.error || String(res.status));
      els.submitStatus.textContent =
        "Амжилттай илгээгдлээ. Багш teacher.html хуудсаар «Ачаалах» дарж харна.";
    } catch (e) {
      els.submitStatus.textContent =
        "Илгээж чадсангүй. Сервер ажиллаж байгаа эсэхийг шалгана уу (server → npm start).";
    }
  });
}

if (!initFromStorage()) {
  showScreen("upload");
}
