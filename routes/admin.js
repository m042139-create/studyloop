const express = require("express");
const db = require("../db");
const { authRequired, adminRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired, adminRequired);

function studentSubject(userId) {
  return db.prepare("SELECT * FROM subjects WHERE user_id=? ORDER BY id DESC LIMIT 1").get(userId);
}
function studentStats(userId) {
  const subject = studentSubject(userId);
  if (!subject) return { execRate: 0, quizAvg: 0, totalHours: 0, weeks: [] };
  const weeks = db.prepare("SELECT * FROM weekly_stats WHERE subject_id=? ORDER BY week").all(subject.id);
  const execRate = weeks.length ? Math.round(weeks.reduce((a, r) => a + r.execution_rate, 0) / weeks.length) : 0;
  const quizAvg = weeks.length ? Math.round(weeks.reduce((a, r) => a + r.quiz_score, 0) / weeks.length) : 0;
  const totalHours = +weeks.reduce((a, r) => a + r.study_hours, 0).toFixed(1);
  return { subject, execRate, quizAvg, totalHours, weeks: weeks.map(w => ({ ...w, weak_concepts: JSON.parse(w.weak_concepts || "[]") })) };
}

// 전체 요약 (전체 통계)
router.get("/overview", (req, res) => {
  const students = db.prepare("SELECT * FROM users WHERE role='student'").all();
  const perStudent = students.map(s => ({ id: s.id, name: s.name, section: s.section, streak: s.streak, ...studentStats(s.id) }));

  const withData = perStudent.filter(s => s.weeks.length);
  const avgRate = withData.length ? Math.round(withData.reduce((a, s) => a + s.execRate, 0) / withData.length) : 0;
  const avgQuiz = withData.length ? Math.round(withData.reduce((a, s) => a + s.quizAvg, 0) / withData.length) : 0;
  const avgHours = withData.length ? +(withData.reduce((a, s) => a + s.totalHours, 0) / withData.length).toFixed(1) : 0;

  const risk = perStudent.filter(s => {
    if (!s.weeks.length) return false;
    const recentDrop = s.weeks.length >= 2 && (s.weeks[s.weeks.length - 2].execution_rate - s.weeks[s.weeks.length - 1].execution_rate >= 20);
    return s.execRate < 45 || recentDrop;
  });

  res.json({
    totalStudents: students.length,
    avgRate, avgQuiz, avgHours,
    riskStudents: risk.map(s => ({ id: s.id, name: s.name, execRate: s.execRate })),
  });
});

// 주차별 전체 학생 통계 (그래프용)
router.get("/weekly", (req, res) => {
  const week = parseInt(req.query.week) || 1;
  const students = db.prepare("SELECT * FROM users WHERE role='student'").all();
  const rows = students.map(s => {
    const subject = studentSubject(s.id);
    if (!subject) return { name: s.name, execution_rate: 0, quiz_score: 0 };
    const stat = db.prepare("SELECT * FROM weekly_stats WHERE subject_id=? AND week=?").get(subject.id, week);
    return { name: s.name, execution_rate: stat ? stat.execution_rate : 0, quiz_score: stat ? stat.quiz_score : 0 };
  });
  res.json(rows);
});

// 학생 목록
router.get("/students", (req, res) => {
  const students = db.prepare("SELECT id, name, email, section, streak FROM users WHERE role='student'").all();
  const rows = students.map(s => {
    const stats = studentStats(s.id);
    return { ...s, execRate: stats.execRate, quizAvg: stats.quizAvg, totalHours: stats.totalHours };
  });
  res.json(rows);
});

// 학생 상세
router.get("/students/:id", (req, res) => {
  const s = db.prepare("SELECT id, name, email, section, streak FROM users WHERE id=? AND role='student'").get(req.params.id);
  if (!s) return res.status(404).json({ error: "학생을 찾을 수 없습니다." });
  const stats = studentStats(s.id);
  res.json({ ...s, ...stats });
});

// 학생에게 알림 보내기
router.post("/students/:id/notify", (req, res) => {
  const { message } = req.body;
  db.prepare("INSERT INTO notifications (user_id, message) VALUES (?, ?)").run(
    req.params.id, message || "학습 참여를 독려합니다. 이번 주 계획을 확인해보세요!"
  );
  res.json({ ok: true });
});

// 취약개념 랭킹
router.get("/weak-concepts", (req, res) => {
  const rows = db.prepare("SELECT weak_concepts FROM weekly_stats").all();
  const tally = {};
  rows.forEach(r => {
    JSON.parse(r.weak_concepts || "[]").forEach(c => { tally[c] = (tally[c] || 0) + 1; });
  });
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([concept, count]) => ({ concept, count }));
  res.json(sorted);
});

// 퀴즈 문항 관리
router.get("/quiz-questions", (req, res) => {
  const rows = db.prepare("SELECT * FROM quiz_questions").all();
  res.json(rows.map(r => ({ ...r, options: JSON.parse(r.options) })));
});

router.post("/quiz-questions", (req, res) => {
  const { subject_id, question, options, answer_index, concept } = req.body;
  const info = db.prepare(
    "INSERT INTO quiz_questions (subject_id, question, options, answer_index, concept) VALUES (?,?,?,?,?)"
  ).run(subject_id, question, JSON.stringify(options || []), answer_index || 0, concept || "");
  res.json(db.prepare("SELECT * FROM quiz_questions WHERE id=?").get(info.lastInsertRowid));
});

router.put("/quiz-questions/:id", (req, res) => {
  const { question, options, answer_index, concept } = req.body;
  const q = db.prepare("SELECT * FROM quiz_questions WHERE id=?").get(req.params.id);
  if (!q) return res.status(404).json({ error: "문항을 찾을 수 없습니다." });
  db.prepare("UPDATE quiz_questions SET question=?, options=?, answer_index=?, concept=? WHERE id=?").run(
    question ?? q.question,
    JSON.stringify(options ?? JSON.parse(q.options)),
    answer_index ?? q.answer_index,
    concept ?? q.concept,
    q.id
  );
  res.json(db.prepare("SELECT * FROM quiz_questions WHERE id=?").get(q.id));
});

router.delete("/quiz-questions/:id", (req, res) => {
  db.prepare("DELETE FROM quiz_questions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// CSV 내보내기
router.get("/export/csv", (req, res) => {
  const students = db.prepare("SELECT id, name, section, streak FROM users WHERE role='student'").all();
  const rows = [["학생명", "분반", "누적실행률(%)", "퀴즈평균", "누적학습시간", "스트릭"]];
  students.forEach(s => {
    const stats = studentStats(s.id);
    rows.push([s.name, s.section, stats.execRate, stats.quizAvg, stats.totalHours, s.streak]);
  });
  const csv = "\uFEFF" + rows.map(r => r.join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="studyloop_stats_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

// 학기 누적 리포트
router.get("/report", (req, res) => {
  const students = db.prepare("SELECT id FROM users WHERE role='student'").all();
  const all = students.map(s => studentStats(s.id)).filter(s => s.weeks.length);
  const avgRate = all.length ? Math.round(all.reduce((a, s) => a + s.execRate, 0) / all.length) : 0;
  const avgQuiz = all.length ? Math.round(all.reduce((a, s) => a + s.quizAvg, 0) / all.length) : 0;

  const tallyRows = db.prepare("SELECT weak_concepts FROM weekly_stats").all();
  const tally = {};
  tallyRows.forEach(r => JSON.parse(r.weak_concepts || "[]").forEach(c => { tally[c] = (tally[c] || 0) + 1; }));
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];

  res.json({
    totalStudents: students.length,
    avgRate, avgQuiz,
    insight: top ? `"${top[0]}" 개념의 오답 빈도가 가장 높습니다 — 해당 단원 콘텐츠 난이도 조정을 검토해보세요.` : "현재 뚜렷한 취약 개념 편중이 없습니다."
  });
});

module.exports = router;
