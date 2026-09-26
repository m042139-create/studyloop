# StudyLoop 백엔드 (Express + SQLite)

대학생 자기주도 학습 앱의 백엔드 API 서버입니다. 프론트엔드(`public/` 폴더에 넣은 index.html/styles.css/app.js)를 같은 서버에서 함께 서빙하므로, 배포하면 **API + 사이트가 하나의 주소**로 동작합니다.

## 로컬 실행

```bash
cd backend
npm install
cp .env.example .env      # 필요하면 JWT_SECRET, ADMIN_PASSWORD 수정
npm run seed               # 데모 학생 12명 + 관리자 계정 생성
npm start                  # http://localhost:3000 에서 실행
```

브라우저에서 `http://localhost:3000` 접속.

- 관리자 로그인: `admin@studyloop.app` / `admin123`
- 학생 로그인 예: `student1@studyloop.app` / `student123`

## 무료로 실제 인터넷 주소(http 링크) 만들기 — Render.com 배포

1. 이 `backend` 폴더 전체를 GitHub 저장소로 올립니다 (Render는 GitHub 연동 배포).
   - GitHub에 새 repo 생성 → 이 폴더 내용을 push
2. https://render.com 가입 (GitHub 계정으로 로그인 가능, 무료)
3. Dashboard → **New +** → **Web Service** → 방금 만든 GitHub 저장소 선택
4. 설정값:
   - **Build Command**: `npm install && npm run seed`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. **Environment** 탭에서 환경변수 추가:
   - `JWT_SECRET` = 아무 긴 임의 문자열
   - `ADMIN_PASSWORD` = 원하는 관리자 비밀번호
6. **Create Web Service** 클릭 → 2~3분 후 `https://your-app-name.onrender.com` 같은 실제 URL이 발급됩니다.
7. 그 주소로 접속하면 바로 로그인 화면이 뜨고, 프론트+백엔드+DB가 모두 그 하나의 링크에서 동작합니다.

> 무료 플랜은 일정 시간 미접속 시 서버가 잠들었다가 첫 요청 때 다시 깨어나는 데 몇십 초 걸릴 수 있습니다. 상시 구동이 필요하면 유료 플랜으로 올리면 됩니다.

## 대안: Railway.app

Render와 거의 동일한 방식(GitHub 연동 → 자동 배포 → URL 발급)입니다. railway.app 가입 후 "Deploy from GitHub repo" 선택, Start Command `npm start` 지정, 배포 후 Settings에서 "Generate Domain" 클릭하면 URL이 생성됩니다.

## API 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | /api/auth/register | 회원가입 (role: student/admin) |
| POST | /api/auth/login | 로그인 → JWT 토큰 발급 |
| GET/PUT | /api/student/subject | 내 과목/목표 조회·수정 |
| POST | /api/student/subject/generate-plan | 목표 입력 → 주차별 계획 자동 생성 |
| GET/PUT | /api/student/tasks(/:id) | 체크리스트 조회/수정 |
| GET | /api/student/stats/weekly, /stats/summary | 개인 통계 |
| GET | /api/student/quiz | 퀴즈 문항 조회 |
| POST | /api/student/quiz/submit | 채점 + 취약개념 기록 |
| GET | /api/student/review-notes | 복습 노트 |
| GET | /api/student/peer-compare | 익명 동료 비교 |
| GET | /api/admin/overview | 관리자 전체 요약 통계 |
| GET | /api/admin/weekly?week=N | 주차별 학생 전체 통계 |
| GET | /api/admin/students(/:id) | 학생 목록/상세 |
| POST | /api/admin/students/:id/notify | 알림 발송 |
| GET | /api/admin/weak-concepts | 취약개념 랭킹 |
| GET/POST/PUT/DELETE | /api/admin/quiz-questions | 퀴즈 문항 관리 |
| GET | /api/admin/export/csv | CSV 내보내기 |
| GET | /api/admin/report | 학기 누적 리포트 |

모든 `/api/student/*`, `/api/admin/*` 요청은 헤더에 `Authorization: Bearer <토큰>` 이 필요합니다.
