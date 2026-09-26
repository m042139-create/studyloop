const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

// 회원가입
router.post("/register", (req, res) => {
  const { name, email, password, role, section } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "이름, 이메일, 비밀번호는 필수입니다." });
  }
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "이미 가입된 이메일입니다." });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role, section) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, hash, role === "admin" ? "admin" : "student", section || "");

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// 로그인
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.status(401).json({ error: "가입되지 않은 이메일입니다." });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;
