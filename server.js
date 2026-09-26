require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

require("./db"); // 앱 시작 시 테이블 생성 보장

const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/student");
const adminRoutes = require("./routes/admin");

const app = express();
app.use(cors());
app.use(express.json());

// API 라우트
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 프론트엔드 정적 파일 서빙 (public/ 안에 index.html, styles.css, app.js 를 넣으면
// 백엔드 서버 하나로 프론트+백엔드가 같은 주소에서 동작합니다)
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`StudyLoop 서버 실행 중: http://localhost:${PORT}`);
});
