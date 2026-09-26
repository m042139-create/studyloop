/* 데모용 초기 데이터 생성 스크립트: npm run seed */
const bcrypt = require("bcryptjs");
const db = require("./db");

const NAMES = ["김도윤","이서연","박지훈","최유나","정민재","한소율","오태양","윤채원","임하늘","강서준","배은우","조아린"];
const CONCEPTS = ["함수의 극한", "선형대수 기저", "확률변수", "자료구조-트리", "네트워크 계층", "미분방정식", "OS 프로세스", "DB 정규화"];

function rand(min, max) { return Math.random() * (max - min) + min; }

function run() {
  // 관리자 계정
  const adminEmail = "admin@studyloop.app";
  if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)").run(
      "관리자", adminEmail, bcrypt.hashSync("admin123", 10), "admin"
    );
    console.log("관리자 계정 생성: admin@studyloop.app / admin123");
  }

  NAMES.forEach((name, i) => {
    const email = `student${i + 1}@studyloop.app`;
    let user = db.prepare("SELECT id FROM users WHERE email=?").get(email);
    let userId;
    if (!user) {
      const info = db.prepare(
        "INSERT INTO users (name, email, password_hash, role, section, streak) VALUES (?,?,?,?,?,?)"
      ).run(name, email, bcrypt.hashSync("student123", 10), "student", i % 2 === 0 ? "A분반" : "B분반", Math.floor(rand(0, 15)));
      userId = info.lastInsertRowid;
    } else {
      userId = user.id;
    }

    let subject = db.prepare("SELECT id FROM subjects WHERE user_id=?").get(userId);
    let subjectId;
    if (!subject) {
      const info = db.prepare(
        "INSERT INTO subjects (user_id, name, semester, goal, weeks) VALUES (?,?,?,?,?)"
      ).run(userId, "자료구조와 알고리즘", "2026-2학기", "코딩테스트 수준 문제 해결", 8);
      subjectId = info.lastInsertRowid;
    } else {
      subjectId = subject.id;
    }

    const existingStats = db.prepare("SELECT COUNT(*) as c FROM weekly_stats WHERE subject_id=?").get(subjectId);
    if (existingStats.c === 0) {
      const trend = i % 5 === 0 ? -2 : i % 3 === 0 ? 1.5 : 0;
      const base = 40 + Math.random() * 40;
      for (let w = 1; w <= 8; w++) {
        const rate = Math.max(5, Math.min(100, Math.round(base + trend * w + rand(-15, 15))));
        const quiz = Math.max(0, Math.min(100, Math.round(base + trend * w + rand(-10, 10))));
        const hours = +rand(2, 8).toFixed(1);
        const weak = Math.random() < 0.6 ? [CONCEPTS[Math.floor(Math.random() * CONCEPTS.length)]] : [];
        db.prepare(
          "INSERT INTO weekly_stats (subject_id, week, execution_rate, quiz_score, study_hours, weak_concepts) VALUES (?,?,?,?,?,?)"
        ).run(subjectId, w, rate, quiz, hours, JSON.stringify(weak));
      }
    }

    const existingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE subject_id=?").get(subjectId);
    if (existingTasks.c === 0) {
      const titles = ["자료구조 3장 복습", "트리 순회 문제풀이", "네트워크 계층 정리", "OS 프로세스 개념", "DB 정규화 연습", "주간 총복습", "취약개념 재점검"];
      titles.forEach((t, d) => {
        db.prepare("INSERT INTO tasks (subject_id, week, day, title, done) VALUES (?,?,?,?,?)").run(
          subjectId, 8, d, t, d < 2 ? 1 : 0
        );
      });
    }
  });

  console.log("시드 데이터 생성 완료. 학생 로그인 예: student1@studyloop.app / student123");
}

run();
