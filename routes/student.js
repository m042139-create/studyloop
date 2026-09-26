const express = require("express");
const db = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

function getOrCreateSubject(userId) {
  let subject = db.prepare("SELECT * FROM subjects WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId);
  if (!subject) {
    const info = db
      .prepare("INSERT INTO subjects (user_id, name, semester, goal, weeks) VALUES (?, ?, ?, ?, ?)")
      .run(userId, "자료구조와 알고리즘", "2026-2학기", "", 8);
    subject = db.prepare("SELECT * FROM subjects WHERE id = ?").get(info.lastInsertRowid);
  }
  return subject;
}

// 내 과목/목표 조회 + 생성
router.get("/subject", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  res.json(subject);
});

router.put("/subject", (req, res) => {
  const { name, semester, goal, weeks } = req.body;
  const subject = getOrCreateSubject(req.user.id);
  db.prepare("UPDATE subjects SET name=?, semester=?, goal=?, weeks=? WHERE id=?").run(
    name ?? subject.name,
    semester ?? subject.semester,
    goal ?? subject.goal,
    weeks ?? subject.weeks,
    subject.id
  );
  res.json(db.prepare("SELECT * FROM subjects WHERE id=?").get(subject.id));
});

// AI 스타일 주차별 계획 자동 생성 (규칙 기반 목업 — 실제 LLM 연동 지점)
router.post("/subject/generate-plan", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  const goal = req.body.goal || subject.goal || "핵심 개념 정리";
  db.prepare("UPDATE subjects SET goal=? WHERE id=?").run(goal, subject.id);

  db.prepare("DELETE FROM tasks WHERE subject_id=?").run(subject.id);
  const stage = (w) => (w <= 2 ? "기초 다지기" : w <= 5 ? "응용 문제풀이" : "심화·복습");
  const insert = db.prepare("INSERT INTO tasks (subject_id, week, day, title, done, note) VALUES (?,?,?,?,0,'')");
  const plan = [];
  for (let w = 1; w <= subject.weeks; w++) {
    const title = `${goal.slice(0, 10)} — ${stage(w)} (W${w})`;
    insert.run(subject.id, w, 0, title);
    plan.push({ week: w, title });
  }
  res.json({ subject, plan });
});

// 오늘/이번 주 체크리스트
router.get("/tasks", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  const week = parseInt(req.query.week) || subject.weeks;
  const tasks = db.prepare("SELECT * FROM tasks WHERE subject_id=? AND week=? ORDER BY day").all(subject.id, week);
  res.json(tasks);
});

router.put("/tasks/:id", (req, res) => {
  const { done, note, title } = req.body;
  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "작업을 찾을 수 없습니다." });
  db.prepare("UPDATE tasks SET done=?, note=?, title=? WHERE id=?").run(
    done !== undefined ? (done ? 1 : 0) : task.done,
    note !== undefined ? note : task.note,
    title !== undefined ? title : task.title,
    task.id
  );
  res.json(db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id));
});

// 주차별 통계 (실행률 등) - 개인
router.get("/stats/weekly", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  const rows = db.prepare("SELECT * FROM weekly_stats WHERE subject_id=? ORDER BY week").all(subject.id);
  res.json(rows.map(r => ({ ...r, weak_concepts: JSON.parse(r.weak_concepts || "[]") })));
});

router.get("/stats/summary", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  const rows = db.prepare("SELECT * FROM weekly_stats WHERE subject_id=?").all(subject.id);
  const user = db.prepare("SELECT streak FROM users WHERE id=?").get(req.user.id);
  if (!rows.length) return res.json({ execRate: 0, quizAvg: 0, totalHours: 0, streak: user.streak });
  const execRate = Math.round(rows.reduce((a, r) => a + r.execution_rate, 0) / rows.length);
  const quizAvg = Math.round(rows.reduce((a, r) => a + r.quiz_score, 0) / rows.length);
  const totalHours = +rows.reduce((a, r) => a + r.study_hours, 0).toFixed(1);
  res.json({ execRate, quizAvg, totalHours, streak: user.streak });
});

// 퀴즈 조회
router.get("/quiz", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  let questions = db.prepare("SELECT * FROM quiz_questions WHERE subject_id=?").all(subject.id);
  if (!questions.length) {
    // 기본 문항 시딩
    const defaults = [
      ["이진 탐색 트리에서 평균 탐색 시간 복잡도는?", ["O(1)", "O(log n)", "O(n)", "O(n^2)"], 1, "자료구조-트리"],
      ["TCP는 OSI 7계층 중 어디에 속하는가?", ["응용 계층", "전송 계층", "네트워크 계층", "물리 계층"], 1, "네트워크 계층"],
      ["확률변수 X의 기댓값 E[X]가 의미하는 것은?", ["최빈값", "분산", "평균적으로 기대되는 값", "표준편차"], 2, "확률변수"],
    ];
    const insert = db.prepare(
      "INSERT INTO quiz_questions (subject_id, question, options, answer_index, concept) VALUES (?,?,?,?,?)"
    );
    defaults.forEach(([q, opts, ans, c]) => insert.run(subject.id, q, JSON.stringify(opts), ans, c));
    questions = db.prepare("SELECT * FROM quiz_questions WHERE subject_id=?").all(subject.id);
  }
  // 정답은 클라이언트로 그대로 내려주는 데모 구성 (제출 시 서버가 재검증)
  res.json(questions.map(q => ({ ...q, options: JSON.parse(q.options) })));
});

// 퀴즈 제출 및 채점
router.post("/quiz/submit", (req, res) => {
  const { answers } = req.body; // { questionId: selectedIndex }
  const subject = getOrCreateSubject(req.user.id);
  const questions = db.prepare("SELECT * FROM quiz_questions WHERE subject_id=?").all(subject.id);

  let correct = 0;
  const wrongConcepts = [];
  const detail = questions.map(q => {
    const selected = answers ? answers[q.id] : undefined;
    const isCorrect = selected === q.answer_index;
    if (isCorrect) correct++;
    else wrongConcepts.push(q.concept);
    return { id: q.id, correct: isCorrect, answer_index: q.answer_index, selected };
  });
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  const week = subject.weeks;

  db.prepare(
    "INSERT INTO quiz_attempts (user_id, subject_id, week, score, wrong_concepts) VALUES (?,?,?,?,?)"
  ).run(req.user.id, subject.id, week, score, JSON.stringify(wrongConcepts));

  wrongConcepts.forEach(c => {
    const exists = db.prepare("SELECT id FROM review_notes WHERE user_id=? AND concept=?").get(req.user.id, c);
    if (!exists) db.prepare("INSERT INTO review_notes (user_id, concept) VALUES (?,?)").run(req.user.id, c);
  });

  // 이번 주 실행률 계산해서 weekly_stats 반영
  const tasks = db.prepare("SELECT * FROM tasks WHERE subject_id=? AND week=?").all(subject.id, week);
  const execRate = tasks.length ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0;

  const existingStat = db.prepare("SELECT * FROM weekly_stats WHERE subject_id=? AND week=?").get(subject.id, week);
  if (existingStat) {
    db.prepare("UPDATE weekly_stats SET execution_rate=?, quiz_score=?, weak_concepts=? WHERE id=?").run(
      execRate, score, JSON.stringify(wrongConcepts), existingStat.id
    );
  } else {
    db.prepare(
      "INSERT INTO weekly_stats (subject_id, week, execution_rate, quiz_score, study_hours, weak_concepts) VALUES (?,?,?,?,?,?)"
    ).run(subject.id, week, execRate, score, 4, JSON.stringify(wrongConcepts));
  }

  res.json({ correct, total: questions.length, score, wrongConcepts, detail });
});

// 복습 노트
router.get("/review-notes", (req, res) => {
  const rows = db.prepare("SELECT * FROM review_notes WHERE user_id=? ORDER BY added_at DESC").all(req.user.id);
  res.json(rows);
});

// 익명 동료 비교
router.get("/peer-compare", (req, res) => {
  const subject = getOrCreateSubject(req.user.id);
  const myRows = db.prepare("SELECT AVG(execution_rate) as r FROM weekly_stats WHERE subject_id=?").get(subject.id);
  const me = Math.round(myRows.r || 0);

  const all = db
    .prepare(
      `SELECT s.user_id, AVG(ws.execution_rate) as rate
       FROM subjects s JOIN weekly_stats ws ON ws.subject_id = s.id
       WHERE s.name = ?
       GROUP BY s.user_id`
    )
    .all(subject.name);

  const avg = all.length ? Math.round(all.reduce((a, r) => a + r.rate, 0) / all.length) : me;
  const sorted = all.map(r => Math.round(r.rate)).sort((a, b) => b - a);
  const rank = sorted.indexOf(me) + 1 || 1;

  res.json({ me, avg, rank, totalPeers: all.length || 1 });
});

// 내 알림
router.get("/notifications", (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC").all(req.user.id);
  res.json(rows);
});

module.exports = router;
