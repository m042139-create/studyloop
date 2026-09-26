/* =========================================================
   StudyLoop 프론트엔드 — 백엔드(Express+SQLite) API 연동 버전
   ========================================================= */

const API = ""; // 같은 서버에서 서빙되므로 상대경로 사용
let token = localStorage.getItem("sdl_token") || null;
let me = JSON.parse(localStorage.getItem("sdl_user") || "null");

function todayStr(){ return new Date().toISOString().slice(0,10); }

async function api(path, opts={}){
  const headers = { "Content-Type": "application/json", ...(opts.headers||{}) };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || ("요청 실패: " + res.status));
  return data;
}

function setSession(t, user){
  token = t; me = user;
  localStorage.setItem("sdl_token", t);
  localStorage.setItem("sdl_user", JSON.stringify(user));
}
function clearSession(){
  token = null; me = null;
  localStorage.removeItem("sdl_token");
  localStorage.removeItem("sdl_user");
}

/* ---------- 상태 ---------- */
let mode = "student";
let adminTab = "overview";
let selectedStudentId = null;

const root = document.getElementById("app");

function setMode(m){ mode = m; render(); }

async function render(){
  root.innerHTML = "";
  if (!token || !me){
    root.appendChild(renderAuthScreen());
    return;
  }
  root.appendChild(renderTopbar());
  const container = document.createElement("div");
  container.className = "feed " + (mode === "admin" ? "wide" : "");
  container.innerHTML = `<div class="card">불러오는 중...</div>`;
  root.appendChild(container);
  const foot = document.createElement("footer");
  foot.className = "hint";
  foot.textContent = "Express + SQLite 백엔드 연동 버전 · " + (me.role === "admin" ? "관리자" : "학생") + "로 로그인됨 (" + me.name + ")";
  root.appendChild(foot);

  try {
    if (me.role === "admin") {
      container.innerHTML = "";
      container.appendChild(await renderAdminMode());
    } else {
      container.innerHTML = "";
      container.appendChild(await renderStudentMode());
    }
  } catch(e){
    container.innerHTML = `<div class="card"><h3>오류가 발생했습니다</h3><p class="muted">${e.message}</p></div>`;
  }
}

/* ---------- 로그인/회원가입 화면 ---------- */
let authTab = "login";
function renderAuthScreen(){
  const wrap = document.createElement("div");
  wrap.className = "feed";
  wrap.style.paddingTop = "60px";
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `
    <div class="label">StudyLoop</div>
    <h2>${authTab === "login" ? "로그인" : "회원가입"}</h2>
    <div class="tabbar">
      <button class="${authTab==='login'?'active':''}" id="tabLogin">로그인</button>
      <button class="${authTab==='register'?'active':''}" id="tabRegister">회원가입</button>
    </div>
    <div id="authForm"></div>
    <p class="muted" style="margin-top:14px;">데모 계정 — 관리자: admin@studyloop.app / admin123 · 학생: student1@studyloop.app / student123</p>
  `;
  wrap.appendChild(c);
  setTimeout(()=>{
    document.getElementById("tabLogin").onclick = ()=>{ authTab="login"; render(); };
    document.getElementById("tabRegister").onclick = ()=>{ authTab="register"; render(); };
    const formBox = document.getElementById("authForm");
    if (authTab === "login"){
      formBox.innerHTML = `
        <input type="email" id="loginEmail" placeholder="이메일" style="margin-bottom:10px;" />
        <input type="password" id="loginPw" placeholder="비밀번호" style="margin-bottom:10px;" />
        <button class="btn" id="loginBtn">로그인</button>
      `;
      document.getElementById("loginBtn").onclick = async ()=>{
        try{
          const email = document.getElementById("loginEmail").value.trim();
          const password = document.getElementById("loginPw").value;
          const data = await api("/api/auth/login", { method:"POST", body: JSON.stringify({ email, password }) });
          setSession(data.token, data.user);
          render();
        }catch(e){ alert(e.message); }
      };
    } else {
      formBox.innerHTML = `
        <input type="text" id="regName" placeholder="이름" style="margin-bottom:10px;" />
        <input type="email" id="regEmail" placeholder="이메일" style="margin-bottom:10px;" />
        <input type="password" id="regPw" placeholder="비밀번호" style="margin-bottom:10px;" />
        <select id="regRole" style="margin-bottom:10px;">
          <option value="student">학생</option>
          <option value="admin">관리자(교수/조교)</option>
        </select>
        <button class="btn" id="regBtn">회원가입</button>
      `;
      document.getElementById("regBtn").onclick = async ()=>{
        try{
          const name = document.getElementById("regName").value.trim();
          const email = document.getElementById("regEmail").value.trim();
          const password = document.getElementById("regPw").value;
          const role = document.getElementById("regRole").value;
          const data = await api("/api/auth/register", { method:"POST", body: JSON.stringify({ name, email, password, role }) });
          setSession(data.token, data.user);
          render();
        }catch(e){ alert(e.message); }
      };
    }
  },0);
  return wrap;
}

function renderTopbar(){
  const bar = document.createElement("div");
  bar.className = "topbar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.textContent = "StudyLoop";
  const switchWrap = document.createElement("div");
  switchWrap.style.display = "flex";
  switchWrap.style.alignItems = "center";
  switchWrap.style.gap = "14px";

  const nameTag = document.createElement("span");
  nameTag.className = "streak-badge";
  nameTag.textContent = me.name + (me.role==="admin" ? " · 관리자" : "");

  if (me.role === "student"){
    const ms = document.createElement("div");
    ms.className = "mode-switch";
    ms.innerHTML = `<button class="active">학생 모드</button>`;
    switchWrap.appendChild(nameTag);
    switchWrap.appendChild(ms);
  } else {
    switchWrap.appendChild(nameTag);
  }

  const logout = document.createElement("button");
  logout.className = "btn ghost small";
  logout.textContent = "로그아웃";
  logout.onclick = ()=>{ clearSession(); render(); };
  switchWrap.appendChild(logout);

  bar.appendChild(brand);
  bar.appendChild(switchWrap);
  return bar;
}

let chartCounter = 0;
function drawBarLineChart(canvas, labels, barData, lineData, barLabel, lineLabel){
  new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [
      { type:"bar", label: barLabel, data: barData, backgroundColor:"#d74b6399", borderRadius:6 },
      { type:"line", label: lineLabel, data: lineData, borderColor:"#d74b63", tension:.3 }
    ]},
    options: { responsive:true, scales:{ y:{ beginAtZero:true, max:100 } }, plugins:{ legend:{ labels:{ font:{ family:"Poppins" } } } } }
  });
}

/* ================= 학생 모드 ================= */
async function renderStudentMode(){
  const wrap = document.createElement("div");
  wrap.style.display = "contents";
  const [subject, summary, tasks, notes, peer] = await Promise.all([
    api("/api/student/subject"),
    api("/api/student/stats/summary"),
    api(`/api/student/tasks?week=${(await api("/api/student/subject")).weeks}`),
    api("/api/student/review-notes"),
    api("/api/student/peer-compare")
  ]);
  const weekly = await api("/api/student/stats/weekly");

  wrap.appendChild(card_goalPlanner(subject));
  wrap.appendChild(card_todayChecklist(subject, tasks));
  wrap.appendChild(card_weeklyQuiz());
  wrap.appendChild(card_myDashboard(summary, weekly));
  wrap.appendChild(card_reviewNotes(notes));
  wrap.appendChild(card_peerCompare(peer));
  return wrap;
}

function card_goalPlanner(subject){
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `
    <div class="label">1단계 · 목표 → 주차별 계획</div>
    <h2>${subject.name} <span class="muted">(${subject.semester})</span></h2>
    <p class="muted">이번 학기 학습 목표를 입력하면 AI가 주차별 실행 계획으로 나눠 제안합니다.</p>
    <textarea id="goalInput" placeholder="예: 자료구조 전 범위를 이해하고 코딩테스트 수준의 문제를 풀 수 있게 되기">${subject.goal||""}</textarea>
    <div class="row" style="margin-top:12px;"><button class="btn" id="genPlanBtn">AI 주차별 계획 생성</button></div>
    <div id="planPreview" style="margin-top:16px;"></div>
  `;
  setTimeout(()=>{
    document.getElementById("genPlanBtn").onclick = async ()=>{
      const goal = document.getElementById("goalInput").value.trim();
      const data = await api("/api/student/subject/generate-plan", { method:"POST", body: JSON.stringify({ goal }) });
      const preview = document.getElementById("planPreview");
      preview.innerHTML = `<div class="muted" style="margin-bottom:8px;">제안된 ${data.plan.length}주 계획이 저장되었습니다:</div>` +
        data.plan.map(p=>`<div class="checklist-item"><span class="mono" style="width:44px;color:var(--soft);">W${p.week}</span><span>${p.title}</span></div>`).join("");
      preview.innerHTML += `<p class="muted" style="margin-top:10px;">아래 '오늘의 학습'을 새로고침하면 반영됩니다.</p>
        <button class="btn small" id="reloadBtn">새로고침</button>`;
      document.getElementById("reloadBtn").onclick = render;
    };
  },0);
  return c;
}

function card_todayChecklist(subject, tasks){
  const c = document.createElement("div");
  c.className = "card";
  const done = tasks.filter(t=>t.done).length;
  const total = tasks.length || 1;
  const pct = Math.round(done/total*100);
  c.innerHTML = `
    <div class="label">3단계 · 오늘의 학습 체크리스트 (W${subject.weeks})</div>
    <h2>이번 주 실천 기록</h2>
    <div class="progress-bar" style="margin:10px 0 4px;"><span style="width:${pct}%"></span></div>
    <div class="muted">${done}/${tasks.length}개 완료 · 실행률 ${pct}%</div>
    <div id="checklistBox" style="margin-top:14px;"></div>
  `;
  const box = c.querySelector("#checklistBox");
  if (!tasks.length){
    box.innerHTML = `<p class="muted">아직 계획이 없습니다. 위에서 'AI 주차별 계획 생성'을 눌러주세요.</p>`;
  }
  tasks.forEach(t=>{
    const row = document.createElement("div");
    row.className = "checklist-item" + (t.done ? " done" : "");
    row.innerHTML = `
      <input type="checkbox" ${t.done?"checked":""} />
      <div style="flex:1;">
        <div class="task-title">${t.title}</div>
        <input type="text" placeholder="오늘 배운 내용 한 줄 기록" value="${t.note||""}" style="margin-top:6px;font-size:13px;padding:6px 10px;" />
      </div>
    `;
    row.querySelector("input[type=checkbox]").onchange = async (e)=>{
      await api(`/api/student/tasks/${t.id}`, { method:"PUT", body: JSON.stringify({ done: e.target.checked }) });
      render();
    };
    row.querySelector("input[type=text]").onchange = async (e)=>{
      await api(`/api/student/tasks/${t.id}`, { method:"PUT", body: JSON.stringify({ note: e.target.value }) });
    };
    box.appendChild(row);
  });
  return c;
}

function card_weeklyQuiz(){
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `<div class="label">4단계 · 주간 점검 퀴즈</div><h2>배운 개념 점검하기</h2><div id="quizBody"><p class="muted">불러오는 중...</p></div>`;
  const body = c.querySelector("#quizBody");
  api("/api/student/quiz").then(questions=>{
    body.innerHTML = "";
    const answers = {};
    questions.forEach((q, qi) => {
      const qDiv = document.createElement("div");
      qDiv.style.marginTop = "18px";
      qDiv.innerHTML = `<h3>Q${qi+1}. ${q.question}</h3>`;
      q.options.forEach((opt, oi) => {
        const optDiv = document.createElement("div");
        optDiv.className = "quiz-option";
        optDiv.textContent = opt;
        optDiv.onclick = () => {
          if (body.dataset.answered) return;
          answers[q.id] = oi;
          [...qDiv.querySelectorAll(".quiz-option")].forEach(el=>el.classList.remove("selected"));
          optDiv.classList.add("selected");
        };
        qDiv.appendChild(optDiv);
      });
      body.appendChild(qDiv);
    });
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn";
    submitBtn.style.marginTop = "18px";
    submitBtn.textContent = "채점하기";
    submitBtn.onclick = async () => {
      body.dataset.answered = "1";
      const result = await api("/api/student/quiz/submit", { method:"POST", body: JSON.stringify({ answers }) });
      result.detail.forEach((d, qi) => {
        const optionEls = body.children[qi].querySelectorAll(".quiz-option");
        optionEls.forEach((el, oi) => {
          if (oi === d.answer_index) el.classList.add("correct");
          else if (oi === d.selected) el.classList.add("wrong");
        });
      });
      const fbDiv = document.createElement("div");
      fbDiv.className = "card";
      fbDiv.style.marginTop = "14px";
      fbDiv.innerHTML = `<h3>결과: ${result.correct}/${result.total} 정답 (${result.score}점)</h3>
        ${result.wrongConcepts.length ? `<p class="muted">취약 개념: ${result.wrongConcepts.join(", ")} — 복습 노트에 자동으로 추가되었습니다.</p>` : `<p class="muted">모두 정답입니다! 🎉</p>`}`;
      body.appendChild(fbDiv);
      submitBtn.disabled = true;
    };
    body.appendChild(submitBtn);
  });
  return c;
}

function card_myDashboard(summary, weekly){
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `
    <div class="label">5단계 · 나의 학습 대시보드</div>
    <h2>전체 통계 & 학습 진도</h2>
    <div class="grid" style="margin:14px 0;">
      <div class="stat-tile"><div class="num small">${summary.execRate}%</div><div class="muted">누적 실행률</div></div>
      <div class="stat-tile"><div class="num small">${summary.quizAvg}점</div><div class="muted">퀴즈 평균</div></div>
      <div class="stat-tile"><div class="num small">${summary.totalHours}h</div><div class="muted">누적 학습시간</div></div>
      <div class="stat-tile"><div class="num small">${summary.streak}일</div><div class="muted">연속 학습</div></div>
    </div>
    <canvas id="myChart_${++chartCounter}" height="140"></canvas>
  `;
  setTimeout(()=>{
    const canvas = c.querySelector(`#myChart_${chartCounter}`);
    drawBarLineChart(canvas, weekly.map(w=>"W"+w.week), weekly.map(w=>w.execution_rate), weekly.map(w=>w.quiz_score), "실행률(%)", "퀴즈점수");
  },0);
  return c;
}

function card_reviewNotes(notes){
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `<div class="label">부가 기능 · 복습 노트</div><h2>취약 개념 자동 정리</h2>`;
  if (!notes.length){
    c.innerHTML += `<p class="muted">아직 취약 개념이 없습니다. 퀴즈를 풀면 자동으로 쌓입니다.</p>`;
  } else {
    notes.forEach(n=>{
      const row = document.createElement("div");
      row.className = "checklist-item";
      row.innerHTML = `<span class="badge bad">개념</span><div style="flex:1;"><b>${n.concept}</b> <span class="muted">· ${(n.added_at||"").slice(0,10)} 추가</span></div>`;
      c.appendChild(row);
    });
  }
  return c;
}

function card_peerCompare(peer){
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `
    <div class="label">부가 기능 · 익명 학습 진도 비교</div>
    <h2>같은 과목 동료들과 비교</h2>
    <div class="grid">
      <div class="stat-tile"><div class="num small">${peer.me}%</div><div class="muted">내 실행률</div></div>
      <div class="stat-tile"><div class="num small">${peer.avg}%</div><div class="muted">분반 평균</div></div>
      <div class="stat-tile"><div class="num small">${peer.rank}/${peer.totalPeers}</div><div class="muted">익명 순위</div></div>
    </div>
  `;
  return c;
}

/* ================= 관리자 모드 ================= */
async function renderAdminMode(){
  const wrap = document.createElement("div");
  wrap.style.display = "contents";
  const tabs = document.createElement("div");
  tabs.className = "card";
  tabs.innerHTML = `<div class="tabbar" id="adminTabs"></div><div id="adminBody"><p class="muted">불러오는 중...</p></div>`;
  wrap.appendChild(tabs);

  const tabDefs = [
    ["overview","전체 요약"], ["weekly","주차별 통계"], ["students","학생 목록/상세"],
    ["weak","취약개념 랭킹"], ["content","콘텐츠·퀴즈 관리"], ["report","리포트·내보내기"]
  ];
  const tabbar = tabs.querySelector("#adminTabs");
  tabDefs.forEach(([key,label])=>{
    const b = document.createElement("button");
    b.textContent = label;
    b.className = adminTab === key ? "active" : "";
    b.onclick = () => { adminTab = key; render(); };
    tabbar.appendChild(b);
  });

  const body = tabs.querySelector("#adminBody");
  body.innerHTML = "";
  if (adminTab === "overview") body.appendChild(await admin_overview());
  if (adminTab === "weekly") body.appendChild(await admin_weekly());
  if (adminTab === "students") body.appendChild(await admin_students());
  if (adminTab === "weak") body.appendChild(await admin_weak());
  if (adminTab === "content") body.appendChild(await admin_content());
  if (adminTab === "report") body.appendChild(await admin_report());
  return wrap;
}

async function admin_overview(){
  const wrap = document.createElement("div");
  const data = await api("/api/admin/overview");
  const stats = document.createElement("div");
  stats.className = "grid";
  stats.innerHTML = `
    <div class="stat-tile"><div class="num">${data.totalStudents}</div><div class="muted">전체 학생 수</div></div>
    <div class="stat-tile"><div class="num">${data.avgRate}%</div><div class="muted">전체 평균 실행률</div></div>
    <div class="stat-tile"><div class="num">${data.avgQuiz}점</div><div class="muted">전체 평균 정답률</div></div>
    <div class="stat-tile"><div class="num">${data.avgHours}h</div><div class="muted">1인당 평균 학습시간</div></div>
  `;
  wrap.appendChild(stats);

  if (data.riskStudents.length){
    const warnCard = document.createElement("div");
    warnCard.className = "card";
    warnCard.style.marginTop = "18px";
    warnCard.innerHTML = `<h3>⚠️ 참여율 저조 / 실행률 급감 경고 (${data.riskStudents.length}명)</h3>`;
    data.riskStudents.forEach(s=>{
      const row = document.createElement("div");
      row.className = "checklist-item";
      row.innerHTML = `<span class="badge bad">경고</span><div style="flex:1;">${s.name} · 누적 실행률 ${s.execRate}%</div><button class="btn small ghost">알림 보내기</button>`;
      row.querySelector("button").onclick = async () => {
        await api(`/api/admin/students/${s.id}/notify`, { method:"POST", body: JSON.stringify({ message:"학습 참여를 독려합니다. 이번 주 계획을 확인해보세요!" }) });
        alert(`${s.name} 학생에게 독려 메시지를 전송했습니다.`);
      };
      warnCard.appendChild(row);
    });
    wrap.appendChild(warnCard);
  }
  return wrap;
}

async function admin_weekly(){
  const wrap = document.createElement("div");
  const weeks = 8;
  const sel = document.createElement("select");
  for (let w=1; w<=weeks; w++){
    const opt = document.createElement("option");
    opt.value = w; opt.textContent = "W"+w;
    if (w===weeks) opt.selected = true;
    sel.appendChild(opt);
  }
  wrap.appendChild(Object.assign(document.createElement("h3"), { textContent: "주차 선택" }));
  wrap.appendChild(sel);
  const chartWrap = document.createElement("div");
  chartWrap.style.marginTop = "18px";
  chartWrap.innerHTML = `<canvas id="wk_chart" height="110"></canvas>`;
  wrap.appendChild(chartWrap);

  const draw = async () => {
    const rows = await api(`/api/admin/weekly?week=${sel.value}`);
    const canvas = document.getElementById("wk_chart");
    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas.getContext("2d"), {
      data: { labels: rows.map(r=>r.name), datasets: [
        { type:"bar", label:"실행률(%)", data: rows.map(r=>r.execution_rate), backgroundColor:"#d74b6399", borderRadius:6 },
        { type:"line", label:"퀴즈 정답률(%)", data: rows.map(r=>r.quiz_score), borderColor:"#200e17", tension:.3 }
      ]},
      options: { responsive:true, scales:{ y:{ beginAtZero:true, max:100 } } }
    });
  };
  sel.onchange = draw;
  setTimeout(draw, 0);
  return wrap;
}

async function admin_students(){
  const wrap = document.createElement("div");
  if (selectedStudentId){
    const s = await api(`/api/admin/students/${selectedStudentId}`);
    const back = document.createElement("button");
    back.className = "btn ghost small";
    back.textContent = "← 목록으로";
    back.onclick = () => { selectedStudentId = null; render(); };
    wrap.appendChild(back);

    const detail = document.createElement("div");
    detail.style.marginTop = "14px";
    const allWeak = [...new Set(s.weeks.flatMap(w=>w.weak_concepts))];
    detail.innerHTML = `
      <h2>${s.name}</h2>
      <p class="muted">${s.section} · 연속 ${s.streak}일 학습</p>
      <div class="grid">
        <div class="stat-tile"><div class="num small">${s.execRate}%</div><div class="muted">누적 실행률</div></div>
        <div class="stat-tile"><div class="num small">${s.quizAvg}점</div><div class="muted">퀴즈 평균</div></div>
        <div class="stat-tile"><div class="num small">${s.totalHours}h</div><div class="muted">누적 학습시간</div></div>
      </div>
      <canvas id="stu_chart" height="120" style="margin-top:14px;"></canvas>
      <h3 style="margin-top:20px;">취약 개념</h3>
      <div>${allWeak.map(c=>`<span class="badge bad">${c}</span>`).join(" ") || '<span class="muted">없음</span>'}</div>
    `;
    wrap.appendChild(detail);
    setTimeout(()=>{
      drawBarLineChart(document.getElementById("stu_chart"), s.weeks.map(w=>"W"+w.week), s.weeks.map(w=>w.execution_rate), s.weeks.map(w=>w.quiz_score), "실행률(%)", "퀴즈점수");
    },0);
    return wrap;
  }

  const students = await api("/api/admin/students");
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";
  tableWrap.innerHTML = `
    <table>
      <thead><tr><th>학생</th><th>분반</th><th>누적 실행률</th><th>퀴즈 평균</th><th>학습시간</th><th>스트릭</th><th>상태</th></tr></thead>
      <tbody>
        ${students.map(s=>`
          <tr class="clickable" data-id="${s.id}">
            <td>${s.name}</td><td>${s.section}</td><td>${s.execRate}%</td>
            <td>${s.quizAvg}점</td><td>${s.totalHours}h</td><td>${s.streak}일</td>
            <td>${s.execRate < 45 ? '<span class="badge bad">주의</span>' : '<span class="badge good">양호</span>'}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
  wrap.appendChild(tableWrap);
  setTimeout(()=>{
    tableWrap.querySelectorAll("tr[data-id]").forEach(tr=>{
      tr.onclick = () => { selectedStudentId = tr.dataset.id; render(); };
    });
  },0);
  return wrap;
}

async function admin_weak(){
  const wrap = document.createElement("div");
  const tally = await api("/api/admin/weak-concepts");
  wrap.innerHTML = `<h3>오답률 상위 개념 랭킹</h3>`;
  const list = document.createElement("div");
  tally.forEach((item, i)=>{
    const row = document.createElement("div");
    row.className = "checklist-item";
    row.innerHTML = `<span class="mono" style="width:28px;">#${i+1}</span><div style="flex:1;">${item.concept}</div><span class="badge bad">${item.count}건</span>`;
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

async function admin_content(){
  const wrap = document.createElement("div");
  wrap.innerHTML = `<h3>퀴즈 문항 관리</h3><p class="muted">문항을 등록·수정·삭제할 수 있습니다.</p>`;
  const questions = await api("/api/admin/quiz-questions");
  const list = document.createElement("div");
  questions.forEach((q) => {
    const row = document.createElement("div");
    row.className = "card";
    row.style.marginBottom = "10px";
    row.innerHTML = `
      <div class="row">
        <input type="text" value="${q.question}" data-f="q" />
        <input type="text" value="${q.concept}" data-f="concept" placeholder="관련 개념" />
      </div>
      <button class="btn danger small" style="margin-top:10px;">삭제</button>
    `;
    row.querySelector("input[data-f=q]").onchange = async (e)=>{ await api(`/api/admin/quiz-questions/${q.id}`, { method:"PUT", body: JSON.stringify({ question: e.target.value }) }); };
    row.querySelector("input[data-f=concept]").onchange = async (e)=>{ await api(`/api/admin/quiz-questions/${q.id}`, { method:"PUT", body: JSON.stringify({ concept: e.target.value }) }); };
    row.querySelector("button").onclick = async () => { await api(`/api/admin/quiz-questions/${q.id}`, { method:"DELETE" }); render(); };
    list.appendChild(row);
  });
  wrap.appendChild(list);
  const addBtn = document.createElement("button");
  addBtn.className = "btn";
  addBtn.textContent = "+ 문항 추가";
  addBtn.onclick = async () => {
    const subjectId = questions[0]?.subject_id || 1;
    await api("/api/admin/quiz-questions", { method:"POST", body: JSON.stringify({ subject_id: subjectId, question:"새 문항을 입력하세요", options:["보기1","보기2","보기3","보기4"], answer_index:0, concept:"새 개념" }) });
    render();
  };
  wrap.appendChild(addBtn);
  return wrap;
}

async function admin_report(){
  const wrap = document.createElement("div");
  const data = await api("/api/admin/report");
  wrap.innerHTML = `<h3>학기 누적 리포트 · 내보내기</h3>`;
  const summary = document.createElement("div");
  summary.className = "grid";
  summary.innerHTML = `
    <div class="stat-tile"><div class="num small">${data.avgRate}%</div><div class="muted">학기 평균 실행률</div></div>
    <div class="stat-tile"><div class="num small">${data.avgQuiz}점</div><div class="muted">학기 평균 정답률</div></div>
    <div class="stat-tile"><div class="num small">${data.totalStudents}</div><div class="muted">수강생 수</div></div>
  `;
  wrap.appendChild(summary);
  const insight = document.createElement("p");
  insight.className = "muted";
  insight.textContent = "인사이트: " + data.insight;
  wrap.appendChild(insight);
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.style.marginTop = "14px";
  btn.textContent = "CSV로 내보내기";
  btn.onclick = () => { window.location.href = "/api/admin/export/csv?token=" + token; };
  wrap.appendChild(btn);
  return wrap;
}

render();
