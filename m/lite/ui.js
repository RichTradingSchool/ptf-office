/* PIXEL TRADING FLOOR 데모 버전 — 화면 보조 (hq.js·chart.js 다음에 로드)
   · 상단 레일: 데모 버전 표시 · AI 실제 버전 받기 · 모의 계좌 초기화 (횟수 제한 없음)
     배율·청산 고정 표시는 뺐다(대표 요청 2026-10-07) — 포지션별 청산 위험은 GUARD 보고(life.js)가 말한다
   · 가상 포지션 패널 아래 "매매 내역"(청산된 거래 목록)
     (소개 페이지 속 화면 ?embed=1 이면 '소개' 링크는 뺀다 — 페이지 안에 페이지가 뜨지 않게)
   · 첫 방문 안내(한 번만): 🔍 정밀 분석 분석하기 한 장 (분석 방식 칩은 없다 — 대표 결정 2026-10-22)
   · 좌석은 늘 스캘핑 데스크(TARO·VIBE → BLITZ → GUARD → ACE) — 알고리즘 모드 칩은 lite.css가 숨긴다
   · 모의 매매가 없는 빌드(LITE_CONFIG.paperTrading false — site.json paper_trading:false, m/)는 계좌 초기화·매매 내역·잔고판·'모의 계좌' 문구 없음
   · 무료 분석을 다 쓰면 ANALYZE 대신 안내 창(모의 계좌 성적 + 자료실)
   · 수익표(챌린지 실계좌 기록)는 실제 버전 기능이라 전광판 클릭을 안내로 바꾼다
   · full_only 설정(모바일 앱 공용판 사무실)이 있으면 실제 버전 전용 기능을 누를 때 문구 + 버튼 안내 창,
     무료 분석 끝 신청 안내에도 같은 문구 + 버튼을 신청 버튼 아래에 덧붙인다
   · 저장이 막힌 브라우저 안내
   · 셸 사무실(?shell=1 + shell_origin — sandbox iframe, allow-modals 없음)의 계좌 초기화 확인은 window.confirm 대신 페이지 안 확인 창
   · 중계 모드(LITE.relay — ?shell=1&relay=1, 모바일 앱 담당자판 사무실)면 위 것들 대신 relayUi: 스캘핑 좌석·맨 위 띠(O-01~O-03, 셸 연결 확인이 120초 끊기면 O-02)·
     도움말(O-48 — p37 새 O-08)·잔고판 자리 O-05·고정 말풍선(kind 'record' — '실계좌' 표시, 기록창 줄)·매매 내역(결과 %만). 숨김은 lite.css html.relay */
(function () {
  'use strict';
  const cfg = window.LITE_CONFIG || {};
  const LITE = window.LITE;
  if (!LITE) return;
  const $ = (s) => document.querySelector(s);
  const say = (msg, kind) => { if (typeof toast === 'function') toast(msg, kind || ''); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const embed = new URLSearchParams(window.location.search).get('embed') === '1';
  const quota = LITE.quota;
  // 체험 끝 신청 버튼(site.json trial_cta → LITE_CONFIG.trialCta, 모바일 앱 공용판 사무실). 없으면 기존 자료실 안내 그대로
  const cta = cfg.trialCta && cfg.trialCta.url ? cfg.trialCta : null;
  // "AI 실제 버전 받기"(리본 칩·체험 끝 자료실 버튼) — site.json real_cta → LITE_CONFIG.realCta. 모바일 앱 공용판 사무실만 false로 숨긴다
  const realCta = cfg.realCta !== false;
  // 실제 버전 전용 기능 안내(site.json full_only → LITE_CONFIG.fullOnly, 모바일 앱 공용판 사무실). 없으면 지금 그대로(조용히 404·수익표 토스트)
  const fullOnly = cfg.fullOnly && typeof cfg.fullOnly.message === 'string' && cfg.fullOnly.message ? cfg.fullOnly : null;
  const doneText = (n) => (window.LiteShim && window.LiteShim.trialDoneText ? window.LiteShim.trialDoneText(n, cta) : `무료 분석 ${n}회를 모두 썼습니다`);
  const START = (window.LitePaper && window.LitePaper.DEFAULTS.start) || 10000;
  // 모의 매매가 없는 빌드(site.json paper_trading:false → LITE_CONFIG.paperTrading false, 대표 결정 2026-10-12) — 판정만 보인다
  const noPaper = cfg.paperTrading === false;
  if (noPaper) document.documentElement.classList.add('no-paper');
  // 무료 횟수가 깎이는 이벤트 — 모의 매매가 있으면 모의 포지션 열림, 없으면 데모 엔진 판정(shim.js quotaEvent와 같은 규칙)
  const quotaHit = (ev) => (window.LiteShim && typeof window.LiteShim.quotaEvent === 'function'
    ? window.LiteShim.quotaEvent(ev, !noPaper)
    : !!ev && ev.type === 'position' && ev.action === 'open');
  // 분석 다시 보기(LITE_CONFIG.analysisReplay — 담당자판 사무실 m/, ptf-mobile p34 설계 §4): shim이 만든 재생 갈래가 있을 때만
  const An = window.LiteAnalysis || null;
  const analysis = LITE.analysis && An ? LITE.analysis : null;
  // 요청 분석(LITE_CONFIG.analysisRequest — 담당자판 m/, p35 §2.12): 리본·아래 고지·안내는 '자동 분석 종목은 다시 보기, 다른 종목은 요청하면 새 분석'(O-38·O-39)
  const request = !!(analysis && cfg.analysisRequest === true);
  // 데모 리본·하단 고지의 지금 문구 — 분석 다시 보기에서는 대체(데모 엔진) 런 동안만 이 문구로 되돌린다
  // 담당자판 사무실(m/ — relayCapable)은 '데모 버전' 말 없이 '체험 분석'(대표 결정 2026-10-30 — 비활성화도 정식 버전, 정밀 분석만 횟수 제한).
  // 체험 분석(데모 엔진) 런이 AI가 아니라는 사실은 그대로 적는다(기능 한계를 숨기지 않음)
  const mOffice = cfg.relayCapable === true;
  const DEMO_TAG = mOffice ? '체험 분석' : '데모 버전';
  const DEMO_WHY = mOffice ? '*AI 대신 차트 지표 규칙 (🔍 정밀 분석은 AI)' : '*실시간 뉴스 분석·AI 기능 없음 (자체 트레이딩 로직)';
  const DEMO_DISC = mOffice
    ? '체험 분석 — AI 대신 차트 지표 규칙으로 판정(🔍 정밀 분석은 AI) · 투자 조언이 아님'
    : noPaper
      ? '데모 버전 — 실시간 뉴스 분석·AI 기능 없음(AI 엔진 대신 자체 트레이딩 로직) · 투자 조언이 아님'
      : `데모 버전 — 실시간 뉴스 분석·AI 기능 없음(AI 엔진 대신 자체 트레이딩 로직) · 거래 비용 없이 계산 · 투자 조언이 아님`;
  // 비활성화 담당자판(LITE.split — 대표 결정 2026-10-24 '🔍 체험 분석' + '🔒 정밀 분석'): 도는 분석은 데모 엔진뿐이라 리본·고지도 데모 문구,
  // #controls 아래 최신 분석 안내 줄도 그리지 않는다(정밀 분석이 잠겨 있음)
  const split = LITE.split || null;
  // 체험 정밀 분석이 있는 판(LITE_CONFIG.analysisTrial — 대표 결정 2026-10-30 하루 5회)은 실제 AI 분석도 도므로 리본·고지·안내 줄을 요청 분석 판과 같게.
  // 같은 날 '정밀 분석 하나만'(동업자 의견)으로 체험 판에는 '🔍 체험 분석'(데모 엔진) 버튼이 없다 — 데모 문구는 옛 셸 대체 런 동안만(demoLook)
  const splitDemo = !!split && !(Number.isInteger(cfg.analysisTrial) && cfg.analysisTrial > 0);
  const AN_WHY = analysis ? (splitDemo ? DEMO_WHY : request ? An.TEXT.ribbonWhyRequest : An.TEXT.ribbonWhy) : null;
  // 체험 판 비활성화 사무실은 '분석 전용' 표시 없이(대표 결정 2026-10-30 — 정식 버전 그대로, 맨 아래 띠의 횟수만 다름)
  const trialSplit = !!split && !splitDemo;
  const AN_TAG = analysis ? (splitDemo ? DEMO_TAG : trialSplit ? '' : noPaper ? An.TEXT.ribbonNoPaper : An.TEXT.ribbon) : null;
  const AN_DISC = analysis
    ? (splitDemo ? DEMO_DISC : request ? (noPaper ? An.TEXT.disclaimerRequestNoPaper : An.TEXT.disclaimerRequest) : (noPaper ? An.TEXT.disclaimerNoPaper : An.TEXT.disclaimer))
    : null;
  // 중계: 실계좌 기록 말풍선 자리 기억(relayUi가 만든다) — 분석 재생이 끝나면 analysisUi가 restore()로 되돌린다
  let relayBubbles = null;
  if (LITE.kiosk) document.documentElement.classList.add('kiosk');
  if (embed) document.documentElement.classList.add('embed');
  // 모드는 하나(스캘핑 길 — 대표 결정 2026-10-12): app.js는 알고리즘 좌석(body.mode-algo)으로 뜬다 — 스캘핑 데스크 좌석으로 바꿔 둔다.
  // setMode가 app.js의 currentMode를 바꾸므로 app.js init(DOMContentLoaded)의 applyModeDim(currentMode)도 스캘핑으로 그린다(중계는 relayUi가 같은 길로)
  if (!LITE.relay && typeof window.setMode === 'function') window.setMode('scalp');
  if (!LITE.relay && typeof window.applyModeDim === 'function') window.applyModeDim('scalp');
  // 중계 모드 — 리본·무료 횟수·첫 방문 안내·데모 고지 대신 중계 화면만
  if (LITE.relay) {
    relayUi();
    if (analysis) analysisUi(true);
    return;
  }

  // 입력칸 예시 — 코인·미국 주식·한국 주식·금. 처음엔 BTC를 넣어 두고 첫 분석 전까지 ANALYZE를 깜빡인다
  const si = $('#symbol-input');
  if (si && !LITE.kiosk) {
    si.placeholder = 'BTC, 테슬라, 삼성전자, 금…';
    if (!si.value) si.value = 'BTC';
    document.documentElement.classList.add('lite-first');
    LITE.bus.subscribe((ev) => { if (ev.type === 'run:start') document.documentElement.classList.remove('lite-first'); });
  }

  const rail = $('#v2-rail');
  let ribbonTag = null;
  let ribbonWhy = null;
  if (rail && !$('#lite-ribbon')) {
    const box = document.createElement('div');
    box.id = 'lite-ribbon';
    // 휴대폰은 레일이 옆으로 밀리므로 남은 횟수·자료실 링크를 앞에 둔다.
    // 앞의 두 칸(표시·설명)은 분석 다시 보기가 글자를 바꾸므로 createElement·textContent로 따로 만든다(p34 설계 §4.1 리본)
    box.innerHTML = (quota ? '<em id="lite-left"></em>' : '')
      + (realCta && cfg.filesUrl ? `<a class="full" href="${esc(cfg.filesUrl)}" target="_blank" rel="noopener">AI 실제 버전 받기</a>` : '')
      + (embed ? '' : `<a href="${esc(cfg.landingUrl || '../')}">소개</a>`)
      // 매매 내역·계좌 초기화는 모의 계좌가 있는 빌드만
      + (noPaper ? '' : '<button type="button" id="lite-hist-btn">📋 매매 내역</button>'
        + '<button type="button" id="lite-reset">계좌 초기화</button>');
    ribbonTag = make('b', null, analysis ? AN_TAG : DEMO_TAG);
    ribbonTag.hidden = !ribbonTag.textContent; // 빈 표시(체험 판 비활성화)는 칸째 숨김
    ribbonWhy = make('span', 'why', analysis ? AN_WHY : DEMO_WHY);
    box.prepend(ribbonTag, ribbonWhy);
    const gap = rail.querySelector('.rail-gap');
    rail.insertBefore(box, gap ? gap.nextSibling : null);
    if (!noPaper) $('#lite-hist-btn').addEventListener('click', showHistory);
    if (!noPaper) $('#lite-reset').addEventListener('click', () => {
      askConfirm(`모의 계좌를 ${money(START)} USDT로 초기화할까요? 보유 포지션과 매매 내역이 모두 지워집니다.`, '초기화', () => {
        LITE.paper.reset();
        if (typeof loadPositions === 'function') loadPositions();
        if (LITE.chart) LITE.chart.render();
        say(`모의 계좌를 ${money(START)} USDT로 초기화했습니다`, 'ok');
      });
    });
  }

  // ---- 매매 내역 — 청산된 거래(수익·손실 모두)와 보유 중 포지션을 한 창에. 수치는 이 브라우저의 모의 계좌 원장 그대로 ----
  function histBox() {
    let el = $('#lite-hist');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lite-hist';
    el.className = 'hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lh-title');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) el.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.classList.add('hidden'); });
    return el;
  }

  function showHistory() {
    const H = window.LiteHistory;
    const snap = LITE.paper.snapshot();
    const list = H.rows(snap.trades, 50);
    const s = H.summary(snap.trades);
    const signed = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
    const open = snap.open.map((p) => `<li class="lh-open"><span>보유 중</span><b>${esc(p.display || p.symbol)}</b>`
      + `<span>${p.side === 'SHORT' ? '숏' : '롱'} ${p.leverage}x</span><em class="${p.unrealizedAmt > 0 ? 'up' : p.unrealizedAmt < 0 ? 'down' : ''}">${signed(p.unrealizedAmt || 0)} USDT</em></li>`).join('');
    const rows = list.map((t) => `<li><span>${esc(t.time)}</span><b>${esc(t.who)}</b><span>${esc(t.side)} ${esc(t.lev)}x · ${esc(t.result)}</span>`
      + `<em class="${t.tone}">${signed(t.roe, 1)}% · ${signed(t.pnl)} USDT</em></li>`).join('');
    const el = histBox();
    el.innerHTML = '<div class="lh-box">'
      + '<button class="ll-x" type="button" data-close aria-label="닫기">✕</button>'
      + '<h2 id="lh-title">매매 내역</h2>'
      + `<p class="lh-sum">청산 ${s.n}건 · ${s.wins}승 ${s.losses}패 · 손익 <b class="${s.pnl > 0 ? 'up' : s.pnl < 0 ? 'down' : ''}">${signed(s.pnl)} USDT</b>`
      + ` · 보유 ${snap.open.length}개 <small>수익·손실 모두 · 이 브라우저의 모의 계좌 · 거래 비용 없이 계산</small></p>`
      + `<ul class="lh-list">${open}${rows || '<li class="lh-empty">아직 청산된 거래가 없습니다 — 종목을 넣고 🔍 정밀 분석을 눌러 보세요</li>'}</ul>`
      + '<button class="ll-close" type="button" data-close>닫기</button>'
      + '</div>';
    el.classList.remove('hidden');
  }

  // ---- 중계 모드(?relay=1 · 모바일 앱 담당자판 사무실) — 셸이 넣는 실계좌 회원 송출을 읽기 전용으로 (설계 3-2 §4.4) ----
  // 분석 입력·버튼·워치리스트·잔고판 내용·포지션 청산 버튼은 lite.css(html.relay)가 숨기고, 여기서는 맨 위 띠(O-01~O-03)·도움말(O-08)·
  // 잔고판 자리 안내(O-05)·고정 말풍선·매매 내역(결과 %만)을 만든다. 셸이 준 문자열은 textContent로만 넣는다
  function relayUi() {
    const R = window.LiteRelay;
    const relay = LITE.relay;
    document.documentElement.classList.add('relay');
    // 좌석은 스캘핑 데스크 — app.js는 알고리즘 좌석(body.mode-algo)으로 떠서 GUARD 자리를 숨긴다(style.css L1019~1020).
    // 중계 모드는 분석·모드 전환이 없으니 여기서 바꿔 둔다 — 손절·청산·조정·결과 미확인 말풍선(GUARD)이 보이게.
    // setMode가 app.js의 currentMode를 바꾸므로 app.js init(DOMContentLoaded)의 applyModeDim(currentMode)도 스캘핑으로 그린다
    if (typeof window.setMode === 'function') window.setMode('scalp');
    // 2026-10-23 요청 1(PC판 단일 모드 floor — '그냥 화면만 쏴주면'): 담당자판 사무실은 13명 자리를 모두 켠다 — 스캘핑 좌석(BLITZ·GUARD) 위에
    // 토론방·DIANA·NOVA 흐림을 풀고 body.mode-floor(lite.css — 리스크 위원회·PM 자리). public/app.js는 floor를 모르므로 applyModeDim을 감싼다:
    // 어떤 모드로 불려도(재생 run:start·실시간 run:start·재생 끝 되돌림) 같은 좌석
    if (typeof window.applyModeDim === 'function') {
      const baseDim = window.applyModeDim;
      window.applyModeDim = function floorDim() {
        try { baseDim('scalp'); } catch (_) { /* 좌석 그리기 실패가 중계를 막지 않게 */ }
        ['#room-research', '#desk-diana', '#desk-nova'].forEach((sel) => { const el = $(sel); if (el) el.classList.remove('idle'); });
        document.body.classList.remove('mode-algo');
        document.body.classList.add('mode-floor');
        const label = $('#scalp-room-label');
        if (label) label.textContent = '◆ 스캘핑·리스크 ◆';
      };
      window.applyModeDim('floor');
    }
    const box = make('div', null, null);
    box.id = 'lite-relay';
    const band = make('p', 'lr-band', '');
    band.id = 'lite-relay-band';
    band.setAttribute('role', 'status');
    // 2026-10-23 요청(④): PC판에 없는 '실계좌 매매 기록 중계' 띠·도움말(O-48)은 화면에서 뺀다 — 띠는 숨긴 채 상태 계산만 남김(검사 도구가 읽음)
    band.hidden = true;
    const hist = make('button', 'lr-hist', '📋 매매 내역');
    hist.type = 'button';
    hist.id = 'lite-relay-hist';
    box.append(band, hist);
    document.body.prepend(box);
    // 하단 잔고판(데모 모의 금액 자리)은 lite.css가 통째로 숨긴다(2026-10-08 대표 요청 — 금액 칸 뺌)
    // 종목 칩 줄(2026-10-08 대표 요청)은 p37부터 모든 셸 사무실의 symbols.js(#lite-syms — 암호화폐 | 주식 스위치, 칩 = 차트·입력칸 선택기)
    // 화면 장식의 명패·포지션 판 제목·하단 고지도 중계에 맞게 — 데모용 명패 글자·"가상 포지션"·"자체 트레이딩 로직"이 실계좌 기록 위에 남지 않게
    const plate = $('#ceo-plate');
    if (plate) plate.textContent = 'CEO';
    const title = $('#pp-title');
    if (title) title.textContent = '◆ 실계좌 포지션 · 읽기 전용 ◆';
    const disc = $('#disclaimer');
    if (disc) disc.textContent = `${R.TEXT.basis} · 투자 조언이 아님`;
    // 벽 TV(hq.js renderTv가 "자동 운영 대기"로 다시 씀)·스캘핑 데스크 이름표(app.js·hq.js가 데모 배율을 붙임)는 고정 글자로 유지,
    // 판정 판의 다른 거래소 이름은 뺀다 — 실계좌 화면에 데모의 자동 운영 상태·배율·거래소 이름이 남지 않게
    const keep = (el, text) => {
      if (!el) return;
      const fix = () => { if (el.textContent !== text) el.textContent = text; };
      new MutationObserver(fix).observe(el, { childList: true, characterData: true, subtree: true });
      fix();
    };
    keep($('#tv-line1'), 'PIXEL CAPITAL'); // 2026-10-23 요청 ④ — 옛 '실계좌 기록 중계 · 읽기 전용' 문구 뺌
    // 이름표는 데모 배율 꼬리만 늘 뗀다 — 알고리즘 분석을 재생하는 동안의 '리스크 위원회' 글자는 그대로(p34 설계 §4.2)
    labelHold().on();
    document.querySelectorAll('.dp-scalp-head').forEach((el) => { el.textContent = el.textContent.replace('탭비트 ', ''); });
    // 띠 — 셸이 알려 준 상태(O-01~O-03). 셸이 멈추면 신호가 끊겨 초록 "실시간"에 머무니, 120초 넘게 아무 신호가 없으면 O-02(지연)로.
    // 규약(test/relay-contract.json _doc): 셸은 연결된 동안 30초마다 ptf:relay-link(같은 link 값)로 연결 확인을 보낸다 — 120초 = 4번 놓침.
    // 상태·이벤트는 바뀔 때만 오므로(설계 §4.3) 연결 확인을 한 번도 못 본 셸이면 스스로 지연 판정을 하지 않는다
    // (조용한 시간에 건강한 중계가 노란 "중계 지연"으로 보이지 않게). 연결 확인 = 앞과 같은 link 값이 다시 온 것
    const QUIET_MS = 120000;
    let lastSignal = Date.now();
    let quiet = false;
    let heartbeat = false;
    let lastLink = null;
    const paint = () => {
      const m = relay.meta();
      const b = R.bandText(quiet ? { ...m, stale: true } : m);
      band.textContent = b.text;
      band.className = `lr-band ${b.tone}`;
    };
    paint();
    window.setInterval(() => {
      const q = heartbeat && Date.now() - lastSignal > QUIET_MS;
      if (q !== quiet) {
        quiet = q;
        paint();
      }
    }, 15000);
    hist.addEventListener('click', showRelayHistory);
    // 실계좌 기록 말풍선 자리 — ACE·GUARD(bubbleFor가 쓰는 자리)와 잡담을 끈 BLITZ·PM(life.js RELAY_MUTE). 자리마다 마지막 실계좌 말풍선을
    // 기억해 두고, 분석 재생(app.js onRunStart가 말풍선을 모두 지우고 분석 문장을 남김)이 끝나면 그 글로 다시 쓰고 없던 자리는 비운다
    // (분석 문장이 실계좌 기록 자리에 남지 않게, p34 설계 §7-8). p37: 실계좌 말풍선은 kind 'record' — 말풍선 관리자(bubbles.js)가
    // '실계좌' 표시(.rec, O-48)를 붙이고 휴대폰 '최신 하나만'에서도 지우지 않는다. 되살림은 말풍선만(기록창 줄은 처음 한 번)
    const RECORD_SEATS = ['ace', 'guard', 'blitz', 'pm'];
    const lastReal = {};
    relayBubbles = {
      restore() {
        for (const id of RECORD_SEATS) {
          try {
            if (typeof window.resetBubble === 'function') window.resetBubble(id);
            const text = lastReal[id];
            if (text && typeof window.typeBubble === 'function') window.typeBubble(id, text, text, 'record');
          } catch (_) { /* 말풍선 실패가 중계를 멈추지 않게 */ }
        }
      },
    };
    // 잔고판 자리(O-05)를 눌러도 hq.js의 수익표 창(모의 계좌·챌린지 기록)이 열리지 않게 — 캡처 단계에서 먼저 받는다
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('#pnl-board')) e.stopPropagation();
    }, true);
    LITE.bus.subscribe((ev) => {
      if (!ev || ev.type !== 'lite:relay') return;
      lastSignal = Date.now();
      quiet = false;
      if (ev.kind === 'link') {
        const l = relay.meta().link;
        if (l === lastLink) heartbeat = true;
        lastLink = l;
      }
      paint();
      if (ev.kind === 'state' || ev.kind === 'event') {
        if (typeof window.loadPositions === 'function') window.loadPositions();
        if (LITE.chart && typeof LITE.chart.restore === 'function') LITE.chart.restore();
      }
      if (ev.kind !== 'event') return;
      const b = R.bubbleFor(ev.event);
      if (!b) return;
      lastReal[b.who] = b.text;
      if (typeof window.typeBubble === 'function') {
        try { window.typeBubble(b.who, b.text, b.text, 'record'); } catch (_) { /* 말풍선 실패가 중계를 멈추지 않게 */ }
      }
      // 대화 기록창(talklog.js) '실계좌 기록' 줄
      LITE.bus.emit({ type: 'lite:talk', kind: 'record', id: b.who, bubble: b.text });
    });
  }

  // 중계 매매 내역 — 보유 중(평가 ROE)과 최근 끝난 매매(결과 %). 금액·계좌 문구 없이, createElement·textContent만
  function showRelayHistory() {
    const R = window.LiteRelay;
    const snap = LITE.relay.snapshot();
    const rows = R.historyRows(snap);
    const el = histBox();
    const box = make('div', 'lh-box', null);
    const x = make('button', 'll-x', '✕');
    x.type = 'button';
    x.setAttribute('data-close', '');
    x.setAttribute('aria-label', '닫기');
    const h = make('h2', null, '매매 내역');
    h.id = 'lh-title';
    const sum = make('p', 'lh-sum', null);
    sum.append(make('span', null, `보유 ${snap.open.length}개 · 최근 끝난 매매 ${snap.closed.length}건`), make('small', null, R.TEXT.basis));
    const list = make('ul', 'lh-list', null);
    rows.forEach((r) => {
      const li = make('li', r.open ? 'lh-open' : null, null);
      li.append(make('span', null, r.time), make('b', null, r.who), make('span', null, r.detail), make('em', r.tone || null, r.pct));
      list.append(li);
    });
    if (!rows.length) list.append(make('li', 'lh-empty', '아직 중계된 매매가 없습니다'));
    const close = make('button', 'll-close', '닫기');
    close.type = 'button';
    close.setAttribute('data-close', '');
    box.append(x, h, sum, list, close);
    el.replaceChildren(box);
    el.classList.remove('hidden');
  }

  // ---- 무료 분석 횟수 (설정이 0이면 quota가 없어 쓰이지 않는다 — 횟수 제한 없음) ----
  function showLeft() {
    const el = $('#lite-left');
    if (!el || !quota) return;
    const left = quota.left();
    el.textContent = left ? `무료 분석 ${left}/${quota.limit}` : '무료 분석 끝';
    el.classList.toggle('out', !left);
    document.documentElement.classList.toggle('lite-out', !left);
    const btn = $('#analyze-btn');
    if (btn) btn.title = left ? `무료 분석 ${left}회 남음` : (cta ? doneText(quota.limit) : '무료 분석을 모두 썼습니다 — AI 실제 버전은 텔레그램 자료실에서');
  }

  function limitBox() {
    let el = $('#lite-limit');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lite-limit';
    el.className = 'hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'll-title');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) el.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.classList.add('hidden'); });
    return el;
  }

  function showLimit() {
    if (cta) { showLimitCta(); return; }
    const el = limitBox();
    const snap = LITE.paper.snapshot();
    const a = snap.account;
    const open = snap.open.length;
    // 모의 계좌 성적 칸 — 모의 매매가 없는 빌드(account null)는 없음
    let score = '';
    if (!noPaper && a) {
      const ret = a.equityReturnPct;
      const tone = ret > 0 ? 'up' : ret < 0 ? 'down' : '';
      score = `<div class="ll-score"><span>모의 계좌</span><b>${money(a.start)} → ${money(a.equity)} USDT</b>`
        + `<em class="${tone}">${ret > 0 ? '+' : ''}${ret.toFixed(2)}%</em>`
        + `<small>${a.wins}승 ${a.losses}패 · 거래 비용 없이 계산${open ? ` · 보유 ${open}개 — 계속 실시간 정산됩니다` : ''}</small></div>`;
    }
    el.innerHTML = '<div class="ll-box">'
      + '<button class="ll-x" type="button" data-close aria-label="닫기">✕</button>'
      + `<div class="ll-badge">FREE RUNS 0/${quota ? quota.limit : 3}</div>`
      + `<h2 id="ll-title">무료 분석 ${quota ? quota.limit : 3}회를 모두 쓰셨어요</h2>`
      + score
      + '<p>실제 버전에서는 AI 직원 13명이 뉴스까지 읽고 각자 분석·토론해서 판정합니다.<br>Claude 또는 ChatGPT(Codex) 구독과 PC만 있으면 텔레그램 자료실에서 받아 추가 비용 없이 바로 쓸 수 있어요.</p>'
      + (realCta && cfg.filesUrl ? `<a class="ll-go" href="${esc(cfg.filesUrl)}" target="_blank" rel="noopener">텔레그램 자료실에서 받기 ▶</a>` : '')
      + '<button class="ll-close" type="button" data-close>계속 구경하기</button>'
      + '</div>';
    el.classList.remove('hidden');
    const go = el.querySelector('.ll-go');
    if (go) go.focus({ preventScroll: true });
  }

  // 공용판 사무실(trial_cta) — 기존 자료실 안내 대신 "무료 분석 N회를 모두 썼습니다 — " + 설정 문구 + 신청 버튼(새 창).
  // 설정 값은 textContent·href로만 넣는다
  function make(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 확인 묻기 — 셸 사무실(?shell=1 + shell_origin: 모바일 앱의 sandbox iframe, allow-modals 없음)에서는 window.confirm이 창 없이 false를
  // 돌려주고 콘솔 오류를 낸다. 그래서 페이지 안 확인 창(limitBox)으로 묻고 확인 버튼에서만 onYes. 그 밖은 지금처럼 window.confirm.
  // (설계 3-2 §4.2가 가짜 창을 막으려고 allow-modals를 뺐다 — 셸에 되돌려 달라고 하지 않는다)
  function askConfirm(question, yesText, onYes) {
    const sandboxed = new URLSearchParams(window.location.search).get('shell') === '1' && !!cfg.shellOrigin;
    if (!sandboxed) {
      if (window.confirm(question)) onYes();
      return;
    }
    const el = limitBox();
    const box = make('div', 'll-box');
    const x = make('button', 'll-x', '✕');
    x.type = 'button';
    x.setAttribute('data-close', '');
    x.setAttribute('aria-label', '닫기');
    const msg = make('p', 'll-full-msg', question);
    msg.id = 'll-title';
    const yes = make('button', 'll-go', yesText);
    yes.type = 'button';
    yes.id = 'lite-confirm-yes';
    yes.addEventListener('click', () => {
      el.classList.add('hidden');
      onYes();
    });
    const no = make('button', 'll-close', '취소');
    no.type = 'button';
    no.setAttribute('data-close', '');
    box.append(x, msg, yes, no);
    el.replaceChildren(box);
    el.classList.remove('hidden');
    no.focus({ preventScroll: true });
  }

  function showLimitCta() {
    const el = limitBox();
    const n = quota ? quota.limit : 0;
    const a = LITE.paper.snapshot().account;
    const box = make('div', 'll-box');
    const x = make('button', 'll-x', '✕');
    x.type = 'button';
    x.setAttribute('data-close', '');
    x.setAttribute('aria-label', '닫기');
    const title = make('h2', 'll-cta-title', doneText(n));
    title.id = 'll-title';
    // 모의 계좌 성적 칸 — 모의 매매가 없는 빌드(account null)는 없음
    let score = null;
    if (!noPaper && a) {
      const ret = a.equityReturnPct;
      score = make('div', 'll-score');
      score.append(
        make('span', null, '모의 계좌'),
        make('b', null, `${money(a.start)} → ${money(a.equity)} USDT`),
        make('em', ret > 0 ? 'up' : ret < 0 ? 'down' : '', `${ret > 0 ? '+' : ''}${ret.toFixed(2)}%`),
        make('small', null, `${a.wins}승 ${a.losses}패 · 거래 비용 없이 계산`),
      );
    }
    const go = make('a', 'll-go', cta.text);
    go.href = cta.url;
    go.target = '_blank';
    go.rel = 'noopener';
    const close = make('button', 'll-close', '계속 구경하기');
    close.type = 'button';
    close.setAttribute('data-close', '');
    box.append(x, make('div', 'll-badge', `FREE RUNS 0/${n}`), title, ...(score ? [score] : []), go);
    // 개별 분석을 다 쓴 사람에게 "개별 분석은 PC 버전" 안내(full_only)를 신청 버튼 아래에 덧붙인다 — 신청 안내는 그대로
    if (fullOnly) {
      box.append(make('p', 'll-full-msg ll-full-note', fullOnly.message));
      fullOnlyLinks(box);
    }
    box.append(close);
    el.replaceChildren(box);
    el.classList.remove('hidden');
    go.focus({ preventScroll: true });
  }

  // full_only 버튼(설정 순서대로, 새 창) — 첫 버튼을 돌려준다
  function fullOnlyLinks(box) {
    let first = null;
    (fullOnly.actions || []).forEach((a) => {
      const go = make('a', 'll-go', a.text);
      go.href = a.url;
      go.target = '_blank';
      go.rel = 'noopener';
      box.append(go);
      if (!first) first = go;
    });
    return first;
  }

  // 공용판 사무실(full_only) — 실제 버전 전용 기능(급변동 감시·자동 운영 저장·리플레이·리포트·챌린지 수익표)을 누르면
  // 체험 끝 안내와 같은 창에 설정 문구 + 버튼(설정 순서대로, 새 창). 설정 값은 textContent·href로만 넣는다
  function showFullOnly() {
    const el = limitBox();
    const box = make('div', 'll-box');
    const x = make('button', 'll-x', '✕');
    x.type = 'button';
    x.setAttribute('data-close', '');
    x.setAttribute('aria-label', '닫기');
    const msg = make('p', 'll-full-msg', fullOnly.message);
    msg.id = 'll-title';
    box.append(x, make('div', 'll-badge', 'PC 버전 기능'), msg);
    const first = fullOnlyLinks(box);
    const close = make('button', 'll-close', '계속 구경하기');
    close.type = 'button';
    close.setAttribute('data-close', '');
    box.append(close);
    el.replaceChildren(box);
    el.classList.remove('hidden');
    (first || close).focus({ preventScroll: true });
  }

  // 같은 요청에 app.js·hq.js가 띄우는 404 토스트("감시 기능이 아직 서버에 없습니다"·"자동 운영 저장 실패 (404)"·
  // "리플레이 기능이 아직 서버에 없습니다")는 안내 창과 겹치니 한 번만 삼킨다 — 다른 오류 토스트는 그대로
  const FULL_404 = /아직 서버에 없습니다|\(404\)/;
  let fullArmedAt = 0;
  function quietFullOnlyToast(msg, kind) {
    if (kind !== 'err' || !fullArmedAt || Date.now() - fullArmedAt > 1500 || !FULL_404.test(String(msg))) return false;
    fullArmedAt = 0;
    return true;
  }

  if (fullOnly) {
    LITE.bus.subscribe((ev) => { if (ev && ev.type === 'lite:full') { fullArmedAt = Date.now(); showFullOnly(); } });
    if (typeof window.toast === 'function') {
      const origToast = window.toast;
      window.toast = function (msg, kind, href) { if (quietFullOnlyToast(msg, kind)) return undefined; return origToast.call(this, msg, kind, href); };
    }
  }

  if (quota) {
    showLeft();
    // 다 쓴 뒤의 분석 요청(ANALYZE·엔터·워치리스트 칩 어디서든)은 shim이 조용히 받고 lite:limit 신호를 보낸다
    // 횟수는 모의 포지션이 열릴 때 준다(shim이 먼저 구독해 이 시점엔 이미 깎여 있다) — 모의 매매가 없는 빌드는 데모 엔진 판정 때(quotaHit)
    let lastRun = false;
    LITE.bus.subscribe((ev) => {
      if (ev.type === 'lite:limit') {
        showLeft();
        showLimit();
      } else if (ev.type === 'lite:quota') {
        // 셸(모바일 앱)이 기억한 사용 횟수(ptf:trial-seed)로 올렸다 — 남은 횟수 표시만 다시
        showLeft();
      } else if (quotaHit(ev)) {
        showLeft();
        lastRun = quota.left() === 0;
      } else if (ev.type === 'run:end' && lastRun) {
        lastRun = false;
        setTimeout(() => say(noPaper ? '무료 분석을 모두 썼어요' : '무료 분석을 모두 썼어요 — 열린 모의 포지션은 계속 실시간으로 정산됩니다', 'ok'), 2500);
      }
    });
    // 소개 페이지 속 화면과 단독 화면이 횟수를 나눠 쓴다
    // storage_ns(모바일 앱 사무실)면 저장 키 앞에 'ptfm:'가 붙는다 — shim이 준 storageKey로 같은 키를 본다
    const baseRunsKey = (window.LiteShim && window.LiteShim.RUNS_KEY) || 'pixel-lite-runs-v1';
    const runsKey = typeof LITE.storageKey === 'function' ? LITE.storageKey(baseRunsKey) : baseRunsKey;
    window.addEventListener('storage', (e) => { if (e.key === runsKey) showLeft(); });
  }

  // ---- 첫 방문 안내 (브라우저마다 한 번) — ① 분석 방식(모드는 하나) ② 🔍 정밀 분석 분석하기 ----
  // 셸 사무실(?shell=1 + shell_origin — 모바일 앱 사무실 탭)은 띄우지 않는다: 모바일 앱이 처음 켠 기기에 자기 첫 실행 안내(12장)로
  // 사무실 패널을 비추는데, 이 안내가 0.9초 뒤 패널 안에 같이 떠서 누를 수 없고 앱 안내가 끝난 뒤에도 남았다(2026-10-08 ptf-mobile 검토).
  // 빌드는 LITE_CONFIG.shellTour = 'off'로 이 동작을 알린다(ptf-mobile 사무실 게시 관문 checkOfficeTour). 판단은 askConfirm의 sandboxed와 같은 조건
  const shellOffice = new URLSearchParams(window.location.search).get('shell') === '1' && !!cfg.shellOrigin;
  const TOUR_KEY = 'pixel-lite-tour-v1';
  let tourSeen = false;
  try { tourSeen = window.localStorage.getItem(TOUR_KEY) === '1'; } catch (_) { tourSeen = false; }
  const TOUR = [
    {
      // 대표 결정 2026-10-22: 분석 방식 칩을 없앴다 — 🔍 정밀 분석 버튼 하나뿐이라 안내도 한 장
      target: '#analyze-btn', step: '분석하기', next: '알겠어요',
      html: '<p class="lt-big">🔍 정밀 분석을 눌러 <b>분석하기!</b></p>'
        + '<p>종목은 BTC·ETH 같은 코인은 물론 <b>테슬라·엔비디아·삼성전자·SK하이닉스·금</b>도 됩니다.</p>'
        + (noPaper ? '' : '<p class="lt-note">데모 버전은 체험이 빨리 끝나도록 초단타로 체결됩니다.</p>'),
    },
  ];
  // 분석 다시 보기 사무실은 🔍 정밀 분석이 고른 종목을 새로 분석하지 않는다 — 모드·종목 안내 대신 재생 설명 한 장(보이는 기능 = 실제 기능)
  const TOUR_STEPS = analysis
    ? [{ target: '#analyze-btn', step: request ? '🔍 정밀 분석 · 다시 보기·요청' : '최신 분석 다시 보기', next: '알겠어요', html: `<p>${esc(request ? An.TEXT.tourRequest + (cfg.analysisLive === true ? An.TEXT.tourLive : '') : An.TEXT.tour)}</p>` }]
    : TOUR;
  let tourEl = null;
  let tourAt = -1;
  let tourDone = tourSeen;
  function tourPlace() {
    if (!tourEl || tourAt < 0) return;
    const t = $(TOUR_STEPS[tourAt].target);
    if (!t) return;
    const r = t.getBoundingClientRect();
    const w = tourEl.offsetWidth;
    const h = tourEl.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 14 + h <= window.innerHeight || r.top - 14 - h < 0;
    tourEl.dataset.at = below ? 'below' : 'above';
    tourEl.style.left = `${Math.round(left)}px`;
    tourEl.style.top = `${Math.round(below ? r.bottom + 14 : r.top - 14 - h)}px`;
    const arrow = tourEl.querySelector('.lt-arrow');
    if (arrow) arrow.style.left = `${Math.round(Math.max(12, Math.min(w - 24, r.left + r.width / 2 - left - 6)))}px`;
  }
  function tourEnd() {
    if (!tourEl || tourDone) return;
    tourDone = true;
    tourEl.classList.add('hidden');
    document.querySelectorAll('.lite-tour-on').forEach((el) => el.classList.remove('lite-tour-on'));
    tourAt = -1;
    try { window.localStorage.setItem(TOUR_KEY, '1'); } catch (_) { /* 저장 막힘 — 이번 방문에서만 닫힌다 */ }
  }
  function tourShow(i) {
    if (i >= TOUR_STEPS.length) { tourEnd(); return; }
    tourAt = i;
    const s = TOUR_STEPS[i];
    document.querySelectorAll('.lite-tour-on').forEach((el) => el.classList.remove('lite-tour-on'));
    const t = $(s.target);
    if (t) t.classList.add('lite-tour-on');
    tourEl.innerHTML = '<i class="lt-arrow" aria-hidden="true"></i>'
      + `<span class="lt-step">${s.step}</span>${s.html}`
      + `<div class="lt-row"><button type="button" class="lt-skip">건너뛰기</button><button type="button" class="lt-next">${s.next}</button></div>`;
    tourEl.classList.remove('hidden');
    tourPlace();
  }
  if (!LITE.kiosk && !shellOffice && !tourSeen && $('#analyze-btn')) {
    tourEl = document.createElement('div');
    tourEl.id = 'lite-tour';
    tourEl.className = 'hidden';
    tourEl.setAttribute('role', 'dialog');
    tourEl.setAttribute('aria-label', '처음 오셨나요? 사용법 안내');
    document.body.appendChild(tourEl);
    tourEl.addEventListener('click', (e) => {
      if (e.target.closest('.lt-next')) tourShow(tourAt + 1);
      else if (e.target.closest('.lt-skip')) tourEnd();
    });
    // 분석이 시작되면 안내 끝
    LITE.bus.subscribe((ev) => { if (ev.type === 'run:start') tourEnd(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tourAt >= 0) tourEnd(); });
    window.addEventListener('resize', tourPlace);
    window.addEventListener('scroll', tourPlace, { passive: true });
    setTimeout(() => { if (!tourDone && tourAt < 0 && !LITE.engine.isRunning()) tourShow(0); }, 900);
  }

  // 실제 버전 화면 문구 중 데모 버전에 맞지 않는 것 — AI 시뮬레이션·탭비트·자동 운영
  // (분석 다시 보기면 리치 서버 AI 분석을 다시 보여 준다는 고지 — 대체 런 동안만 데모 고지, analysisUi)
  const disc = $('#disclaimer');
  if (disc) disc.textContent = analysis ? AN_DISC : DEMO_DISC;
  document.querySelectorAll('.dp-scalp-head').forEach((el) => { el.textContent = el.textContent.replace('탭비트 ', ''); });
  const tv = $('#tv-line1');
  if (tv) {
    const fixTv = () => { if (/자동 운영/.test(tv.textContent)) tv.textContent = mOffice ? '분석 대기' : '데모 버전 · 분석 대기'; };
    new MutationObserver(fixTv).observe(tv, { childList: true, characterData: true, subtree: true });
    fixTv();
  }
  // 하단 모의 계좌 설명 — hq.js가 잔고를 그릴 때마다 실제 버전 문구(비용 반영)로 다시 쓴다(모의 매매가 없는 빌드는 잔고판이 숨으므로 안 씀)
  const basis = noPaper ? null : $('#pb-basis');
  if (basis) {
    const BASIS = '모의 계좌 · 실제 시세로 계산 · 거래 비용 없이 계산 · 투자 조언 아님';
    const fixBasis = () => { if (basis.textContent !== BASIS) basis.textContent = BASIS; };
    new MutationObserver(fixBasis).observe(basis, { childList: true, characterData: true, subtree: true });
    fixBasis();
  }

  // 캡처 단계에서 먼저 받아 hq.js의 수익표 열기를 막는다 (채찍 휘두르기 중인 클릭은 통과)
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#pnl-board')) return;
    if (document.body.classList.contains('whip-mode')) return;
    e.stopPropagation();
    if (fullOnly) showFullOnly();
    else if (!noPaper) say('데모 버전은 이 브라우저의 모의 계좌만 보여 줍니다 — 챌린지 수익표는 AI 실제 버전 기능입니다');
  }, true);

  if (analysis) analysisUi(false);
  // 비활성화 담당자판: 옛 판은 정밀 분석 앞에 '🔍 체험 분석'을 만들고 정밀 분석을 '🔒' 잠금 모양으로, 체험 판(analysisTrial > 0)은
  // '🔍 정밀 분석' 하나 + 맨 아래 띠(남은 횟수·UID 활성화 — 2026-10-30)(analysis.js createSplit — textContent만)
  if (split && typeof split.mount === 'function') {
    split.mount(document);
    const si = $('#symbol-input');
    if (si && !si.value) si.value = 'BTC';
  }

  // 스캘핑 데스크 이름표의 데모 배율 꼬리(app.js applyModeDim — '◆ 스캘핑 데스크 ◆ 50x')를 뗀다. 리스크 위원회 글자(알고리즘 좌석)는 그대로.
  // on()부터 off()까지 app.js·hq.js가 다시 써도 MutationObserver로 고친다(중계는 늘, 데모는 분석 재생 동안만 — p34 설계 §4.6)
  function labelHold() {
    const el = $('#scalp-room-label');
    let obs = null;
    const fix = () => {
      if (!el) return;
      const t = el.textContent;
      if (/스캘핑 데스크/.test(t) && t !== '◆ 스캘핑 데스크 ◆') el.textContent = '◆ 스캘핑 데스크 ◆';
    };
    return {
      on() {
        if (el && !obs && typeof MutationObserver === 'function') {
          obs = new MutationObserver(fix);
          obs.observe(el, { childList: true, characterData: true, subtree: true });
        }
        fix();
      },
      off() {
        if (obs) { obs.disconnect(); obs = null; }
      },
    };
  }

  // ---- 분석 다시 보기(LITE.analysis — p34 설계 §4.1·§4.2·§4.7) — 데모·중계 공통 화면 ----
  // · #controls 아래 안내 줄(최신 분석 시각·자동 운영·오래됨·연결 끊김), 받을 때마다·30초마다 다시 그림
  // · 판정판 아래 고지 줄 없음(O-18은 2026-10-23, O-15는 2026-10-26에 뺐다)
  // · 중계(p37 D3): 데모와 같은 입력칸·모드 칩·🔍 정밀 분석(글자 안 바꿈), 재생이 끝나면 실계좌 차트·재생 전 회원이 고른 좌석으로 되돌림(R12)
  // · 데모: 재생 동안 이름표 데모 배율 뗌, 대체(데모 엔진) 런 동안만 리본·고지를 데모 문구로
  // 받은 문장은 textContent로만 넣는다
  function analysisUi(relay) {
    const T = An.TEXT;
    const line = make('p', null, null);
    line.id = 'lite-analysis-line';
    line.setAttribute('role', 'status');
    line.hidden = true;
    const ctl = $('#controls');
    if (ctl && typeof ctl.after === 'function') ctl.after(line);
    else document.body.append(line);
    const displayOf = (sym) => {
      try { return LITE.data && LITE.data.resolveSymbol ? LITE.data.resolveSymbol(sym).display : null; } catch (_) { return null; }
    };
    // 요청 분석이 대기·실행 중이면(p35 §2.12) 남은 시간·지난 시간을 1초마다 다시 — 끝나면 1초 타이머를 멈춘다
    let secTimer = null;
    const paint = () => {
      let v = null;
      try { v = analysis.view(); } catch (_) { v = null; }
      let parts = [];
      try { parts = An.lineParts(v, Date.now(), displayOf); } catch (_) { parts = []; }
      line.replaceChildren(...parts.map((p) => make('span', `la-${p.kind}`, p.text)));
      line.hidden = !parts.length || splitDemo;
      const live = !!(v && v.progress && (v.progress.kind === 'queued' || v.progress.kind === 'running'));
      if (live && !secTimer) secTimer = window.setInterval(paint, 1000);
      else if (!live && secTimer) { window.clearInterval(secTimer); secTimer = null; }
    };
    paint();
    window.setInterval(paint, 30000);
    // 요청을 보내면 TARO·VIBE 책상에 '…'(think — app.js showThinking 말풍선만. 버스 agent:start가 아니라서 stage.js 책상 working·타자 불꽃·
    // hq.js 자막·휴대폰 피드 대기 줄은 생기지 않는다 — p35 검토 사무실 1·3), 재생 없이 끝나면 정리하고(clear), 실패면 TARO가 짧게 말한다(fail, O-36).
    // 재생으로 끝나면 재생 엔진의 run:start(app.js onRunStart)가 말풍선을 비우고 agent:start가 이어받는다
    const staffDesk = (what) => {
      try {
        if (what === 'think') {
          for (const id of ['taro', 'vibe']) if (typeof window.showThinking === 'function') window.showThinking(id);
          return;
        }
        for (const id of ['taro', 'vibe']) if (typeof window.resetBubble === 'function') window.resetBubble(id);
        // O-36은 안내(system) — 휴대폰 '최신 하나만'을 일으키지 않아 실계좌 기록 말풍선을 지우지 않는다(p37 D1)
        if (what === 'fail' && typeof window.typeBubble === 'function') window.typeBubble('taro', T.reqTaro, T.reqTaro, 'system');
      } catch (_) { /* 말풍선 실패가 분석 화면을 멈추지 않게 */ }
    };

    // 판정판 아래 고지 칸은 없다 — 중계의 O-18 줄은 2026-10-23 요청 ④로, O-15(원금 손실 고지)
    // 줄은 대표 요청 2026-10-26으로 뺐다(이 화면은 m/ 담당자판 — 공용판 pub/에는 분석 다시 보기가 없어 원래 없음)

    // p37 D3: 중계도 데모와 같은 입력칸 + 모드 칩 + 🔍 정밀 분석(버튼 글자를 바꾸지 않는다 — 재생·요청 중에는 setBusy·lock이 잠그기만)
    if (relay) {
      const si = $('#symbol-input');
      if (si && !si.value) si.value = 'BTC'; // 다른 길로 analyze()가 불려도 빈 칸 토스트가 뜨지 않게
    }
    // 재생이 끝나면 돌아갈 좌석 — 모드는 하나(스캘핑 데스크, 대표 결정 2026-10-12)라 늘 'scalp'.
    // 알고리즘 리포트(13명)를 재생하는 동안은 app.js가 그 좌석을 쓰고(분석 원문 그대로), 끝나면 스캘핑 좌석으로 되돌린다
    const chosenMode = () => 'scalp';
    let seatBefore = null;
    const label = relay ? null : labelHold();
    const demoLook = (on) => {
      if (relay) return;
      if (ribbonTag) {
        ribbonTag.textContent = on ? DEMO_TAG : AN_TAG;
        ribbonTag.hidden = !ribbonTag.textContent;
      }
      if (ribbonWhy) ribbonWhy.textContent = on ? DEMO_WHY : AN_WHY;
      const d = $('#disclaimer');
      if (d) d.textContent = on ? DEMO_DISC : AN_DISC;
    };
    // ---- 실시간 직원 말(p37 D4, 설계 §3.4) — public/은 고치지 않으므로 그 DOM을 고쳐 쓴다(textContent만) ----
    // 자막 붙잡기: hq.js caption()은 타자 타이머(28ms마다 2자)로 #cap-line을 다시 쓰므로 한 번 쓰면 덮인다. 붙잡는 동안 #cap-name·#cap-line이
    // 바뀌면 그 글로 되돌리고, hq.js가 새 자막을 쓰는 이벤트(직원·판정·다음 런 — 버스는 ui.js를 hq.js보다 먼저 부른다)나 ms 뒤에 놓는다
    let capHold = null;
    const capRelease = () => {
      if (!capHold) return;
      capHold.obs.forEach((o) => { try { o.disconnect(); } catch (_) { /* 이미 끊김 */ } });
      if (capHold.timer && typeof clearTimeout === 'function') clearTimeout(capHold.timer);
      capHold = null;
    };
    const capFix = () => {
      if (!capHold) return;
      const n = $('#cap-name');
      const l = $('#cap-line');
      if (n && n.textContent !== capHold.name) n.textContent = capHold.name;
      if (l && l.textContent !== capHold.text) l.textContent = capHold.text;
    };
    const holdCaption = (text, ms) => {
      capRelease();
      const nodes = [$('#cap-name'), $('#cap-line')].filter(Boolean);
      if (!nodes.length || !text) return;
      const h = { name: 'PIXEL CAPITAL', text, obs: [], timer: null };
      capHold = h;
      if (typeof MutationObserver === 'function') {
        nodes.forEach((el) => {
          const o = new MutationObserver(capFix);
          o.observe(el, { childList: true, characterData: true, subtree: true });
          h.obs.push(o);
        });
      }
      capFix();
      h.timer = setTimeout(() => { if (capHold === h) capRelease(); }, ms);
    };
    // 실시간 run:start — stage.js 인트로 카드('지난 분석 다시 보기')·hq.js 자막('지난 분석 다시 보기 — 종목 시각')은 이 구독 다음에 그려지므로
    // 자막은 붙잡고(첫 직원까지 — 타자가 끝날 3초면 충분), 카드는 방송이 끝난 뒤 고쳐 쓴다: body에 카드가 붙는 것을 MutationObserver로 보고
    // (마이크로태스크 — 그리기 전이라 옛 글이 한 장면도 보이지 않음) 고치고, setTimeout 0에 한 번 더 보고 그만 본다. 피드 첫 줄은 ev.lead(O-40)라 그대로
    let cardText = [T.liveCard, T.liveCardSub];
    const fixCards = () => {
      try {
        Array.from(document.querySelectorAll('#intro-card')).forEach((card) => {
          const m = card.querySelector('.ic-mode');
          if (m && m.textContent !== cardText[0]) m.textContent = cardText[0];
          const s = card.querySelector('.ic-sub');
          if (s && s.textContent !== cardText[1]) s.textContent = cardText[1];
        });
      } catch (_) { /* 카드가 없거나 이미 사라짐 */ }
    };
    // 2026-10-23 사무실 2차 요청 2: 담당자판(중계)의 끝난 분석 재생은 '지난 분석 다시 보기'(public/) 대신 '분석 결과'(카드·자막)
    const liveStart = (ev, result = false) => {
      const when = typeof ev.when === 'string' ? ev.when : '';
      cardText = result ? [T.resultCard, `${when} 분석`.trim()] : [T.liveCard, T.liveCardSub];
      holdCaption(result ? T.resultCaption(ev.display || ev.symbol || '', when) : typeof ev.lead === 'string' ? ev.lead : '', 3000);
      let mo = null;
      if (typeof MutationObserver === 'function' && document.body) {
        mo = new MutationObserver(fixCards);
        mo.observe(document.body, { childList: true });
      }
      setTimeout(() => {
        fixCards();
        if (mo) mo.disconnect();
      }, 0);
    };
    // 거둠(analysis.js 세션 discard — 실패·멈춤): 보인 직원 말풍선을 비우고, 그 세션 피드 직원 줄(hq.js data-agent)을 빼고, 자막에 거둠 글.
    // 판정 줄은 건드리지 않는다(실시간 run:start가 비워 둠). 기록창 줄은 talklog.js가 lite:talk discard로 거둔다.
    // 중계는 뒤따르는 run:end가 실계좌 기록 자리(ACE·GUARD…)를 마지막 실계좌 글로 되살린다
    const liveDiscard = (ev) => {
      const ids = Array.isArray(ev.ids) ? ev.ids.filter((x) => typeof x === 'string') : [];
      for (const id of ids) {
        try { if (typeof window.resetBubble === 'function') window.resetBubble(id); } catch (_) { /* 다음 자리 */ }
      }
      try {
        Array.from(document.querySelectorAll('#mf-body .mf-row.agent')).forEach((r) => {
          const a = r.dataset ? r.dataset.agent : null;
          if (a && ids.includes(a) && typeof r.remove === 'function') r.remove();
        });
      } catch (_) { /* 피드가 없는 화면(데스크톱) */ }
      holdCaption(String(ev.text || '').replace(/^>\s*/, ''), 3000);
    };

    // 중계 처음 받은 분석(analysis.js가 lite:analysis verdict로 냄) — 판정 줄(#m-verdict)만 hq.js와 같은 꼴로. app.js onDecision(ACE 말풍선·
    // 스포트라이트·효과음)·stage.js 도장·hq.js 자막을 거치지 않는다(설계 §4.2 '연출 없음')
    const drawVerdict = (dec) => {
      try {
        if (typeof HQ !== 'undefined' && HQ && typeof HQ.setVerdict === 'function') HQ.setVerdict(dec);
      } catch (_) { /* 판정 줄을 못 그려도 안내 칸은 보인다 */ }
    };
    LITE.bus.subscribe((ev) => {
      if (!ev || !ev.type) return;
      // hq.js가 새 자막을 쓰는 이벤트면 붙잡은 자막을 놓는다(실시간 run:start는 아래에서 다시 붙잡음)
      if (capHold && (ev.type === 'agent:start' || ev.type === 'agent:done' || ev.type === 'decision' || ev.type === 'run:start')) capRelease();
      if (ev.type === 'run:start' && ev.replay && ev.live) liveStart(ev);
      else if (relay && ev.type === 'run:start' && ev.replay && !ev.live) liveStart(ev, true);
      if (ev.type === 'lite:analysis') {
        if (ev.kind === 'staff') staffDesk(ev.staff);
        if (ev.kind === 'live-discard') liveDiscard(ev);
        if (relay && ev.kind === 'verdict' && ev.decision) drawVerdict(ev.decision);
        paint();
      } else if (ev.type === 'run:start') {
        if (ev.replay) {
          if (label) label.on();
          // 이 구독은 app.js onRunStart(setMode(ev.mode))보다 먼저 불린다 — 지금 모드 칩이 회원이 고른 좌석
          if (relay) seatBefore = chosenMode();
        } else {
          demoLook(true);
        }
      } else if (ev.type === 'run:end') {
        if (ev.replay) {
          if (label) label.off();
          if (relay) {
            // 재생은 시세(market) 이벤트를 내지 않지만 — 받침으로 실계좌 보유 종목 차트·스캘핑 좌석으로 되돌린다
            // (R12 — 모드가 하나가 된 뒤로 늘 스캘핑 좌석. 알고리즘 리포트 재생 중에도 GUARD 자리는 lite.css가 보이게 둔다)
            if (LITE.chart && typeof LITE.chart.restore === 'function') LITE.chart.restore();
            const seat = seatBefore || 'scalp';
            seatBefore = null;
            if (typeof window.setMode === 'function') window.setMode(seat);
            if (typeof window.applyModeDim === 'function') window.applyModeDim(seat);
            // 실계좌 기록 자리(ACE·GUARD·BLITZ·PM)에 남은 분석 문장 → 마지막 실계좌 말풍선(없던 자리는 비움)
            if (relayBubbles) relayBubbles.restore();
          }
        } else {
          demoLook(false);
        }
        paint();
      }
    });
  }
  // ---- 분석 다시 보기 끝 ----

  if (!LITE.kiosk && !LITE.paper.persistent()) {
    setTimeout(() => say('이 브라우저는 저장이 막혀 있어 새로고침하면 모의 계좌와 무료 분석 횟수가 초기화됩니다', 'err'), 1500);
  }
})();
