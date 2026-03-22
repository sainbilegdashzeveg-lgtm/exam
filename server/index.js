const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3847;
const TEACHER_KEY = process.env.TEACHER_KEY || "teacher-demo-key";
const DATA_FILE = path.join(__dirname, "data", "submissions.jsonl");
const ROOT = path.join(__dirname, "..");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT));

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

app.post("/api/submit", (req, res) => {
  const b = req.body;
  if (!b || typeof b.studentName !== "string" || !b.studentName.trim()) {
    return res.status(400).json({ error: "studentName required" });
  }
  if (!b.quizId || typeof b.score !== "number" || typeof b.total !== "number") {
    return res.status(400).json({ error: "invalid payload" });
  }

  const row = {
    id:
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10),
    submittedAt: new Date().toISOString(),
    quizId: String(b.quizId).slice(0, 128),
    studentName: b.studentName.trim().slice(0, 120),
    studentId:
      (b.studentId && String(b.studentId).trim().slice(0, 64)) || "",
    score: Math.max(0, Math.min(10_000, b.score | 0)),
    total: Math.max(1, Math.min(10_000, b.total | 0)),
    items: Array.isArray(b.items) ? b.items : [],
  };

  ensureDataDir();
  fs.appendFileSync(DATA_FILE, JSON.stringify(row) + "\n", "utf8");
  res.json({ ok: true, id: row.id });
});

app.get("/api/submissions", (req, res) => {
  const key = req.query.key || req.headers["x-teacher-key"];
  if (key !== TEACHER_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    return res.json([]);
  }
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip bad line */
    }
  }
  out.reverse();
  res.json(out);
});

app.listen(PORT, () => {
  console.log(`Quiz app: http://localhost:${PORT}/index.html`);
  console.log(`Багш: http://localhost:${PORT}/teacher.html (түлхүүр: TEACHER_KEY)`);
});
