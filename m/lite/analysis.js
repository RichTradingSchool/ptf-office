/* PIXEL TRADING FLOOR 데모 버전 — 리치 서버 AI 최신 분석 다시 보기 (모바일 앱 담당자판 사무실 m/, LITE_CONFIG.analysisReplay)
   설계: ptf-mobile docs/superpowers/specs/2026-10-08-ptf-p34-analysis-events-ui-design.md §3·§4
   · 셸(모바일 앱)이 postMessage(ptf:analysis)로 넣어 준 "우리 앱(이 PC 8140) 가장 최근 분석"을 받는다 — 사무실은 허브에 직접 묻지 않는다
   · 받는 쪽도 거른다(cleanMessage): 모르는 키는 버리고, 모르는 열거값은 그 칸만 null, 문자열은 cleanText 한 번 더(설계 §2.4)
   · 🔍 정밀 분석(데모·중계 같음 — p37 D3)를 누르면 그 분석을 직원 대화 그대로 다시 보여 준다(createReplayEngine) — 새로 분석하지 않는다
   · 요청 분석(p35 설계 2026-10-08-ptf-p35-ondemand-hardening-design.md §2.12, LITE_CONFIG.analysisRequest): 실시간 분석이 안 도는 종목을 고르면
     셸에 ptf:analysis-request를 보내고(진행 줄 '직원들이 X 분석 중… 약 1~2분'), 결과(ptf:analysis-result)의 분석을 같은 재생 엔진으로 원문 재생
   · 실시간 직원 말(p37 D4, 설계 2026-10-09-ptf-p37-live-office-design.md §3.4, LITE_CONFIG.analysisLive): 요청 분석이 도는 동안 셸이 넘긴
     ptf:analysis-turns(TARO·VIBE·BLITZ·GUARD)를 재생 엔진 실시간 세션(openLive)으로 오는 대로 보이고, 끝 done이면 같은 글 직원은 건너뛰고 이어서
     (R13), 실패·멈춤이면 보인 말을 거둔다(stop cut — 런은 계속 · fail — 바로 실패 끝)
   · 문장은 원문 그대로(열린 질문 16 ① — '수수료'도 바꾸지 않음), 연결·연락처·레퍼럴류 문장만 지운다
   · 데모(미인증)는 지금 시세로 조건이 맞을 때만 모의 포지션을 연다(demoPlan, §4.5). 중계는 모의 포지션 없음.
     모의 매매가 없는 빌드(LITE_CONFIG.paperTrading false — 대표 결정 2026-10-12, m/)는 데모도 모의 포지션·계획선·'[모의 포지션]' 줄 없이 판정만
   화면 문장은 textContent로만 넣는다(받은 문장에 HTML 조각이 섞여 있어도 글자로 보인다). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./brain.js'), require('./script.js'), require('./engine.js'));
  else root.LiteAnalysis = factory(root.LiteBrain, root.LiteScript, root.LiteEngine);
})(typeof self !== 'undefined' ? self : this, function (Brain, Script, Engine) {
  'use strict';

  // ---- 계약(설계 §2.3·§10) ----
  const ANALYSIS_KEYS = Object.freeze(['v', 'id', 'at', 'symbol', 'display', 'kind', 'mode', 'action', 'confidence', 'pm',
    'entry', 'stop', 'target', 'rationale', 'report', 'scalp', 'plan', 'rr', 'riskOk', 'turns', 'news']);
  // 뉴스 근거(2026-10-23 — 동업자판 중계 런의 기사, 허브가 거른 것): 출처·제목·시각 ms|null·https 원문 링크|null, 최대 10
  const NEWS_KEYS = Object.freeze(['source', 'title', 'at', 'link']);
  const TURN_KEYS = Object.freeze(['id', 'name', 'role', 'turn', 'bubble', 'report', 'reconstructed']);
  const AUTOPILOT_KEYS = Object.freeze(['on', 'intervalMin', 'nextAt', 'running', 'runningSymbol', 'lastRunAt', 'waiting']);
  // p35 §3.2·§7.2 — ptf:analysis 끝 두 칸(sched·canRequest), 스케줄러 공개 칸, 요청 결과(ptf:analysis-result)
  const MESSAGE_KEYS = Object.freeze(['type', 'v', 'reply', 'up', 'stale', 'off', 'analysis', 'autopilot', 'sched', 'canRequest']);
  const SCHED_KEYS = Object.freeze(['up', 'symbols', 'running', 'runningSymbol', 'request', 'lastOkAt']);
  const RESULT_KEYS = Object.freeze(['type', 'v', 'req', 'symbol', 'state', 'ahead', 'etaSec', 'elapsedSec', 'reason', 'analysis']);
  // 계약 _reasons 사본(lite/test/analysis-contract.json) — 허브↔앱 REQ_REASONS + 셸이 만드는 것(busy·pending·lost·hub_down)
  const RESULT_STATES = Object.freeze(['ready', 'queued', 'running', 'done', 'failed', 'unsupported', 'limited', 'unavailable', 'busy']);
  const RESULT_REASONS = Object.freeze({
    ready: ['fresh', 'regular', 'position_open'],
    limited: ['hour', 'day', 'ip', 'device', 'queue'],
    unavailable: ['off', 'sched_down', 'app_down', 'hub_down'],
    failed: ['analysis_failed', 'no_report', 'timeout', 'expired', 'not_exported', 'rejected', 'app_down', 'position_open', 'lost'],
    unsupported: ['symbol'],
    queued: [null], running: [null], done: [null],
    busy: ['pending'],
  });
  const STAFF_IDS = Object.freeze(['taro', 'diana', 'nova', 'vibe', 'bull', 'bear', 'blitz', 'guard', 'risky', 'safe', 'neutral', 'ace', 'pm']);
  // p37 실시간 직원 말(설계 §3.4, lite/test/live-contract.json keys.liveIds·publicTurn·toOffice) — 스캘핑 직원 넷만(R6), 한 요청 n 1~8
  const LIVE_IDS = Object.freeze(['taro', 'vibe', 'blitz', 'guard']);
  // 계약 rev 2(2026-10-23 사무실 2차 요청 2): 동업자판 중계 런 직원(분석·토론·스캘핑 데스크·리스크 위원회·PM — ACE 없음), n 1~20(LIVE_N_MAX)
  const RELAY_LIVE_IDS = Object.freeze(['nova', 'taro', 'diana', 'vibe', 'bull', 'blitz', 'bear', 'guard', 'risky', 'safe', 'neutral', 'pm']);
  const ANY_LIVE = Object.freeze([...new Set([...LIVE_IDS, ...RELAY_LIVE_IDS])]);
  const LIVE_N_MAX = 20;
  const LIVE_TURN_KEYS = Object.freeze(['n', 'id', 'name', 'role', 'turn', 'bubble', 'report']);
  const TURNS_KEYS = Object.freeze(['type', 'v', 'req', 'symbol', 'live', 'stop', 'turns']);
  const LIVE_STATES = Object.freeze(['on', 'aborted']);
  const LIVE_STOPS = Object.freeze(['cut', 'fail']);
  const LIVE_MAX = 8;
  // 실시간 직원 말 사이 간격(p37 검토) — 한 메시지에 여럿이 와도 앞 직원 말풍선·자막이 보이게(연출 속도 pace를 곱함)
  const LIVE_GAP_MS = 2500;
  const KINDS = Object.freeze(['crypto', 'krstock', 'stock']);
  const MODES = Object.freeze(['scalp', 'algo']);
  const ACTIONS = Object.freeze(['BUY', 'SELL', 'HOLD']);
  const PMS = Object.freeze(['APPROVE', 'AMEND', 'REJECT', 'PM_FAILED']);
  const BIASES = Object.freeze(['LONG', 'SHORT', 'PASS']);
  const LIMITS = Object.freeze({ display: 24, name: 24, role: 24, bubble: 600, report: 8000, rationale: 2000, level: 300, scalp: 600, turns: 30, newsSource: 30, newsTitle: 200, newsLink: 500, news: 10 });
  const ID_RE = /^a[0-9a-f]{12}$/;
  const SYM_RE = /^[A-Z0-9]{1,20}$/;
  const KST = 9 * 3600000;
  // 표시 이름 — 우리 앱 심볼(자동 운영 실행 중 종목)을 화면 이름으로(data.js ASSETS와 같은 값)
  const DISPLAY = Object.freeze({ SKHYNIX: 'SK하이닉스', SAMSUNG: '삼성전자', XAU: '금' });

  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isTime = (v) => isNum(v) && v > 0 && v < 8.6e15;

  // ---- 화면 문구(설계 §4.1·§4.2·§4.5·§4.6·§4.7 — O-11~O-18) ----
  function mdhm(ms) {
    if (!isTime(ms)) return '—';
    const d = new Date(ms + KST);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.toISOString().slice(11, 16)}`;
  }
  function agoText(ms, now) {
    const diff = now - ms;
    if (!(diff >= 60000)) return '방금';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    return `${Math.floor(diff / 86400000)}일 전`;
  }
  const TEXT = Object.freeze({
    replayIntro: (at) => `> 리치 서버 AI가 ${mdhm(at)}에 낸 분석을 다시 보여 줍니다 — 새로 분석하는 것이 아닙니다`, // O-11
    loading: '> 리치 서버 AI 최신 분석을 불러오는 중…',
    fallback: '> 최신 분석을 받지 못해 데모 분석으로 보여 드립니다',
    switched: (d) => `최신 분석 종목(${d})으로 바꿨습니다`,
    none: '아직 받은 분석이 없습니다', // O-12
    failed: '분석 결과를 불러오지 못했습니다 — 잠시 뒤 다시 눌러 주세요', // O-16
    oldShell: '앱을 업데이트하면 최신 분석이 보입니다', // O-17
    risk: '원금 손실이 날 수 있고, 높은 배율에서는 작은 가격 변동으로도 증거금 전부를 잃을 수 있습니다.', // O-15
    relayNote: '이 분석은 모의 계좌 분석이며, 실계좌 매매 기록(말풍선)과 별개입니다.', // O-18
    ribbon: '모의 계좌',
    ribbonWhy: '분석은 리치 서버 AI 최신 분석 다시 보기',
    disclaimer: '모의 계좌 — 분석은 리치 서버 AI가 낸 최신 분석을 다시 보여 줍니다(새로 분석하지 않음) · 모의 포지션은 거래 비용 없이 계산 · 투자 조언이 아님',
    // 모의 매매가 없는 빌드(paper_trading:false — 대표 결정 2026-10-12)의 같은 자리 — '모의 계좌'·'모의 포지션' 없이
    relayNoteNoPaper: '이 분석은 리치 서버 AI 분석이며, 실계좌 매매 기록(말풍선)과 별개입니다.', // O-18 (모의 매매 없음)
    ribbonNoPaper: '분석 전용',
    disclaimerNoPaper: '분석 전용 — 분석은 리치 서버 AI가 낸 최신 분석을 다시 보여 줍니다(새로 분석하지 않음) · 투자 조언이 아님',
    // p37 D3: 중계도 데모와 같은 입력칸 + 🔍 정밀 분석 — '최신 분석 보기'·'{표시} 분석 보기'·'재생 중…' 버튼 글자는 없앴다
    caption: (display, when) => `지난 분석 다시 보기 — ${display} ${when}`,
    card: '지난 분석 다시 보기',
    // 데모 모의 포지션을 못 연 이유(§4.5) — '[이름] 글' 꼴이라 휴대폰 피드(hq.js feedLog — 콘솔 #console은 휴대폰에서 숨김)에도 한 줄로 보인다
    pass: '[모의 포지션] 관망 — 이번 판정으로는 포지션을 열지 않습니다',
    outside: '[모의 포지션] 조건부 진입 — 지금 가격이 분석의 진입 조건 밖이라 열지 않습니다',
    liqStop: '[모의 포지션] 손절가가 청산가 밖이라 열지 않습니다',
    noPrice: '[모의 포지션] 지금 시세를 받지 못해 열지 않습니다',
    tour: '🔍 정밀 분석을 누르면 리치 서버 AI가 가장 최근에 끝낸 분석을 직원 대화 그대로 다시 보여 줍니다. 새로 분석하는 것이 아니라서 분석 시각을 함께 보여 드립니다.',
    lineLatest: (at, ago) => `리치 서버 AI 최신 분석 · ${mdhm(at)} (${ago})`,
    // 종목 이름 뒤에 조사를 붙이지 않는다(p35 O-3 — '금를')
    lineRunning: (d) => (d ? `리치 서버 AI가 ${d} 분석 중입니다` : '리치 서버 AI가 분석 중입니다'), // O-13
    lineNext: (n, m) => `자동 분석 ${n}분마다 · 다음 분석 ${m > 0 ? `약 ${m}분 뒤` : '곧'}`,
    lineEvery: (n) => `자동 분석 ${n}분마다`,
    lineWaiting: (at) => (isTime(at) ? `자동 분석 대기 중 — 마지막 분석 ${mdhm(at)}` : '자동 분석 대기 중'),
    lineStale: (h) => `${h}시간 전 분석입니다 — 지금 시장과 다를 수 있습니다`,
    lineDown: '리치 서버 AI 연결 끊김 — 마지막 분석을 보여 드립니다',
    lineDownNone: '리치 서버 AI 연결 끊김 — 받은 분석이 없습니다', // p35 O-1 — 보여 줄 분석이 없을 때
    // 8140 자동 운영이 꺼진 동안 분석 스케줄러 상태(p35 §3.3) — 모르면 말하지 않는다
    lineSched: (ago) => (ago ? `가격이 움직일 때 자동 분석 · 최근 분석 ${ago}` : '가격이 움직일 때 자동 분석'),
    lineSchedRunning: (d) => (d ? `직원들이 ${d} 분석 중입니다` : '직원들이 분석 중입니다'),
    // 휴대폰에 보이는 안내 줄(#lite-analysis-line)에 쓰는 불러오는 중·대체 안내(p35 O-2 — 콘솔은 휴대폰에서 숨김)
    loadingLine: '리치 서버 AI 최신 분석을 불러오는 중…',
    fallbackLine: '최신 분석을 받지 못해 데모 분석으로 보여 드립니다',
    // ---- 요청 분석(p35 §2.12·§2.13, analysisRequest 빌드) ----
    reqQueued: (d, n, eta) => `직원들이 ${d} 분석 준비 중… ${n > 0 ? `앞 분석 ${n}건` : '곧 시작'} · ${eta}`, // O-21
    reqRunning: (d, eta, el) => `직원들이 ${d} 분석 중… ${eta} · ${el} 지남`, // O-22
    reqAsk: (d) => `직원들이 ${d} 분석 요청을 확인하는 중…`, // O-23
    leadDone: (d) => `> 요청하신 ${d} 분석이 끝났습니다 — 직원 대화를 그대로 보여 드립니다`, // O-24
    // O-25 — 2026-10-23: 다시 쓰기는 허브·동업자판 규칙(5분)이라 분 수를 적지 않는다
    leadFresh: (d, at) => `> ${d} — 방금 끝난 분석(${mdhm(at)})이라 그 분석을 다시 보여 드립니다(새로 분석하지 않음)`, // O-25
    leadRegular: (d, at) => `> ${d} — 자동 분석 종목이라 가장 최근 분석(${mdhm(at)})을 다시 보여 드립니다`, // O-26
    leadPosition: (d, at) => `> ${d} — 리치 서버 AI가 이 종목 모의 포지션을 들고 있어 새로 분석하지 않습니다 · 가장 최근 분석(${mdhm(at)})`, // O-27
    reqSendFail: '분석 요청을 보내지 못했습니다 — 가장 최근 분석을 보여 드립니다', // O-28
    reqOldShell: '앱을 업데이트하면 다른 종목도 분석을 요청할 수 있습니다', // O-29
    reqUnsupported: (d) => `${d} — 분석 대상이 아닙니다(코인·미국 주식·삼성전자·SK하이닉스 일부만 분석합니다)`, // O-30
    reqLimited: '지금은 요청이 많아 새 분석을 할 수 없습니다 — 가장 최근 분석을 보여 드립니다. 잠시 뒤 다시 눌러 주세요', // O-31
    reqUnavailable: '지금은 새 분석을 요청할 수 없습니다 — 가장 최근 분석을 보여 드립니다', // O-32
    reqFailed: (d) => `${d} 분석을 끝내지 못했습니다 — 잠시 뒤 다시 눌러 주세요`, // O-33
    reqTimeout: (d) => `${d} 분석이 오래 걸려 기다리기를 멈췄습니다 — 끝나면 최신 분석에 나옵니다`, // O-34
    reqNotNow: (d) => `${d} — 지금은 새로 분석하지 않습니다. 잠시 뒤 다시 눌러 주세요`, // O-35
    reqTaro: '이번 분석은 끝내지 못했어요. 잠시 뒤 다시 불러 주세요', // O-36
    // O-37 — 셸의 busy 결과에는 앞 요청 종목이 없다(같은 (req, symbol)만 돌려줌)라 이름 없이
    reqBusy: '앞 요청 분석이 끝나면 다시 눌러 주세요',
    // O-38·O-39·O-49 — 2026-10-23 요청(⑥): 누르면 늘 새 분석 요청(지난 분석 자동 다시 보기 없음)
    ribbonWhyRequest: '분석은 리치 서버 AI — 🔍 정밀 분석을 누르면 새 분석', // O-38
    disclaimerRequest: '모의 계좌 — 분석은 리치 서버 AI 분석입니다(🔍 정밀 분석을 누르면 새로 분석) · 모의 포지션은 거래 비용 없이 계산 · 투자 조언이 아님', // O-39
    disclaimerRequestNoPaper: '분석 전용 — 분석은 리치 서버 AI 분석입니다(🔍 정밀 분석을 누르면 새로 분석) · 투자 조언이 아님', // O-39 (모의 매매 없음)
    // O-49(p37 D3) — 셸 밖 데모 첫 안내. 인증(중계) 뒤에도 같은 입력칸 + 🔍 정밀 분석
    tourRequest: '🔍 정밀 분석: 누르면 리치 서버 AI에 새 분석을 요청합니다(약 1~2분 — 방금 끝난 분석이 있으면 그 분석, 요청이 많으면 잠시 뒤). 인증 뒤에도 같습니다.',
    // 실시간 직원 말 판(LITE_CONFIG.analysisLive — p37 D4)만 O-49 뒤에 덧붙인다(기능 한계: 판정 전·끝까지 못 가면 거둠)
    tourLive: ' 새 분석은 직원이 말을 마치는 대로 바로 보이고, 끝까지 가지 못하면 거둡니다.',
    // ---- 실시간 직원 말(p37 D4, 설계 §3.4 — analysisLive 빌드) · 종목 이름 뒤 조사 없음 ----
    // O-40 첫 줄(콘솔 '> '·run:start.lead는 '> ' 없이 — 휴대폰 피드 첫 줄·기록창 안내·자막)
    liveLead: (d) => `> 직원들이 ${d} 분석 중 — 말을 마친 직원부터 바로 보여 드립니다(최종 판정 전)`,
    liveDone: (d) => `요청하신 ${d} 분석이 끝났습니다 — 남은 직원 대화와 최종 판정을 보여 드립니다`, // O-41 끝 구분 줄(단계 줄)
    liveFail: (d) => `${d} 분석이 끝까지 가지 못해 보여 드린 직원 대화를 거뒀습니다 — 잠시 뒤 다시 눌러 주세요`, // O-42
    liveTimeout: (d) => `${d} 분석이 오래 걸려 기다리기를 멈추고 보여 드린 직원 대화를 거뒀습니다 — 끝나면 최신 분석에 나옵니다`, // O-43
    liveStop: '실시간 대화를 멈췄습니다 — 분석이 끝나면 직원 대화를 처음부터 보여 드립니다(끝까지 가지 못하면 알려 드립니다)', // O-44(stop cut만)
    // 인트로 카드(public/stage.js가 run:start마다 '지난 분석 다시 보기'로 그림 — ui.js가 실시간이면 고쳐 씀)
    liveCard: '실시간 분석 · 최종 판정 전',
    liveCardSub: '말을 마친 직원부터 보여 드립니다',
    liveCut: '── 분석 중단 ──', // 거둠 단계 줄(피드)
    // 2026-10-23 사무실 2차 요청 2 — 담당자판(중계)은 '다시 보기'·'다시 보여 드립니다' 대신(PC판처럼 결과만)
    resultCard: '분석 결과',
    resultCaption: (d, when) => `분석 결과 — ${d}${when ? ` ${when}` : ''}`,
    relayLead: (d, at) => `> ${d} 분석 결과 · ${mdhm(at)}`,
    relayLiveDone: (d) => `${d} 분석이 끝났습니다 — 남은 직원 대화와 최종 판정을 보여 드립니다`,
  });

  // 남은 시간 글(p35 §2.12) — r = 남은 초. 0 이하 '거의 끝났습니다'(0에서 120초 더 지나면 '최대 10분'), 60초 이하 '1분 안', 그 밖 '약 (m−1)~m분'
  function etaText(r) {
    if (!isNum(r)) return '약 1~2분';
    if (r <= -120) return '조금 더 걸리고 있습니다 — 최대 10분';
    if (r <= 0) return '거의 끝났습니다';
    if (r <= 60) return '1분 안';
    const m = Math.ceil(r / 60);
    return `약 ${m - 1}~${m}분`;
  }
  function mmss(sec) {
    const s = Math.max(0, Math.floor(isNum(sec) ? sec : 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  // 진행 줄 — 받은 시각(at) 뒤 지난 시간은 기기 시계로 이어 센다.
  // 대기도 남은 시간을 기기 시계로 줄인다(p35 검토 — 셸은 state·ahead가 바뀔 때만 다시 보내서 requeue로 대기가 길어지면 받은 값에 멈춰 있었다).
  // 대기 중에 남은 시간이 다 지나면 아직 시작 전이므로 '거의 끝났습니다'가 아니라 '조금 더 걸리고 있습니다 — 최대 10분'(허브가 대기 8분이면 끝냄).
  // 남은 시간을 모르면(etaSec 0) 기본 글 '약 1~2분'
  function progressText(p, now) {
    const d = p.display || p.symbol || '';
    if (p.kind === 'ask') return TEXT.reqAsk(d);
    if (p.kind === 'loading') return TEXT.loadingLine;
    if (p.kind === 'fallback') return TEXT.fallbackLine;
    const dt = isTime(p.at) && now > p.at ? (now - p.at) / 1000 : 0;
    if (p.kind === 'queued') {
      const r = p.etaSec > 0 ? p.etaSec - dt : null;
      return TEXT.reqQueued(d, p.ahead || 0, r == null ? etaText(null) : r > 0 ? etaText(r) : etaText(-120));
    }
    return TEXT.reqRunning(d, etaText((p.etaSec || 0) - dt), mmss((p.elapsedSec || 0) + dt));
  }

  // ---- 문장 거르기(설계 §2.4 — 허브와 같은 규칙을 받는 쪽에서 한 번 더) ----
  // 원문 그대로(p35 §4, 대표 결정 2026-10-08 — 열린 질문 16 ①): 낱말을 바꾸지 않는다. 연결·연락처·레퍼럴류 문장만 지운다
  const BANNED = /레퍼럴|리퍼럴|추천인|추천\s?코드|페이백|리베이트|캐시백|referral|rebate|수익\s*보장|보장\s*수익|원금\s*보장|확정\s*수익/i;
  const LINKS = [
    /https?:\/\/\S+/gi,
    /\bwww\.\S+/gi,
    /\b(?:t\.me|open\.kakao\.com|pf\.kakao\.com|bit\.ly)\/\S*/gi,
    /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    /(?<![\w.])@(?=[A-Za-z0-9_]*[A-Za-z])[A-Za-z0-9_]{4,}/g,
    /\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g,
    /\b0\d{1,2}-\d{3,4}-\d{4}\b/g,
  ];

  function dropBanned(line) {
    if (!BANNED.test(line)) return line;
    const parts = line.split(/((?<=[.!?。…])\s+)/);
    let out = '';
    for (let i = 0; i < parts.length; i += 2) {
      if (!BANNED.test(parts[i])) out += parts[i] + (parts[i + 1] || '');
    }
    return out.trimEnd();
  }

  function cleanText(input, opts = {}) {
    if (typeof input !== 'string') return '';
    const multi = !!opts.multiline;
    let s = input.replace(/\r\n?/g, '\n');
    // 제어문자·방향 바꿈 문자 — 여러 줄 칸은 줄바꿈만 남기고, 한 줄 칸은 줄바꿈·탭을 공백으로
    s = s.replace(/[‪-‮⁦-⁩]/g, '');
    s = multi ? s.replace(/\t/g, ' ').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '') : s.replace(/[\t\n]/g, ' ').replace(/[\u0000-\u001F\u007F]/g, '');
    for (const re of LINKS) s = s.replace(re, '');
    if (multi) {
      const lines = s.split('\n');
      s = lines.map((l) => [l, dropBanned(l)]).filter(([l, d]) => !(l.trim() && !d.trim())).map(([, d]) => d).join('\n');
      s = s.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } else {
      s = dropBanned(s).replace(/\s+/g, ' ').trim();
    }
    const max = opts.max > 0 ? opts.max : 0;
    if (max && s.length > max) s = `${s.slice(0, max - 1)}…`;
    return s;
  }

  // ---- 받은 메시지 모양 검사(설계 §2.3 — 허브 투영·앱 fetchAnalysis와 같은 규칙) ----
  const str = (v, max, multiline) => (typeof v === 'string' ? cleanText(v, { max, multiline }) || null : null);
  const posNum = (v) => (isNum(v) && v > 0 ? v : null);

  function cleanTurn(t) {
    if (!isObj(t) || !STAFF_IDS.includes(t.id)) return null;
    const bubble = cleanText(t.bubble, { max: LIMITS.bubble });
    if (!bubble) return null;
    return {
      id: t.id,
      name: cleanText(t.name, { max: LIMITS.name }) || t.id.toUpperCase(),
      role: cleanText(t.role, { max: LIMITS.role }),
      turn: Number.isInteger(t.turn) && t.turn >= 1 && t.turn <= 99 ? t.turn : null,
      bubble,
      report: cleanText(t.report, { max: LIMITS.report, multiline: true }),
      reconstructed: t.reconstructed === true,
    };
  }

  function cleanScalp(s) {
    if (!isObj(s)) return null;
    return {
      bias: BIASES.includes(s.bias) ? s.bias : null,
      entry: str(s.entry, LIMITS.scalp), stop: str(s.stop, LIMITS.scalp), target: str(s.target, LIMITS.scalp),
      note: str(s.note, LIMITS.scalp, true),
    };
  }

  function cleanPlan(p) {
    if (!isObj(p) || (p.side !== 'LONG' && p.side !== 'SHORT')) return null;
    return { side: p.side, entry: posNum(p.entry), tp: posNum(p.tp), sl: posNum(p.sl) };
  }

  function newsLink(v) {
    if (typeof v !== 'string' || v.length > LIMITS.newsLink || !v.startsWith('https://')) return null;
    try { return new URL(v).protocol === 'https:' ? v : null; } catch (_) { return null; }
  }
  function cleanNews(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, LIMITS.news * 2).map((n) => {
      if (!isObj(n)) return null;
      const title = cleanText(n.title, { max: LIMITS.newsTitle });
      if (!title) return null;
      return { source: cleanText(n.source, { max: LIMITS.newsSource }), title, at: isTime(n.at) ? n.at : null, link: newsLink(n.link) };
    }).filter(Boolean).slice(0, LIMITS.news);
  }

  function cleanAnalysis(a) {
    if (!isObj(a) || a.v !== 1) return null;
    if (typeof a.id !== 'string' || !ID_RE.test(a.id) || !isTime(a.at) || typeof a.symbol !== 'string' || !SYM_RE.test(a.symbol)) return null;
    if (!Array.isArray(a.turns)) return null;
    const turns = a.turns.map(cleanTurn).filter(Boolean).slice(0, LIMITS.turns);
    if (!turns.length) return null;
    return {
      v: 1, id: a.id, at: a.at, symbol: a.symbol,
      display: cleanText(a.display, { max: LIMITS.display }) || a.symbol,
      kind: KINDS.includes(a.kind) ? a.kind : null,
      mode: MODES.includes(a.mode) ? a.mode : null,
      action: ACTIONS.includes(a.action) ? a.action : null,
      confidence: Number.isInteger(a.confidence) && a.confidence >= 0 && a.confidence <= 100 ? a.confidence : null,
      pm: PMS.includes(a.pm) ? a.pm : null,
      entry: str(a.entry, LIMITS.level), stop: str(a.stop, LIMITS.level), target: str(a.target, LIMITS.level),
      rationale: str(a.rationale, LIMITS.rationale), report: str(a.report, LIMITS.report, true),
      scalp: cleanScalp(a.scalp), plan: cleanPlan(a.plan),
      rr: isNum(a.rr) ? Math.round(a.rr * 100) / 100 : null,
      riskOk: typeof a.riskOk === 'boolean' ? a.riskOk : null,
      turns,
      news: cleanNews(a.news),
    };
  }

  function cleanAutopilot(p) {
    if (!isObj(p)) return null;
    return {
      on: p.on === true,
      intervalMin: Number.isInteger(p.intervalMin) && p.intervalMin >= 5 && p.intervalMin <= 720 ? p.intervalMin : null,
      nextAt: isTime(p.nextAt) ? p.nextAt : null,
      running: p.running === true,
      runningSymbol: typeof p.runningSymbol === 'string' && SYM_RE.test(p.runningSymbol) ? p.runningSymbol : null,
      lastRunAt: isTime(p.lastRunAt) ? p.lastRunAt : null,
      waiting: p.waiting === true,
    };
  }

  // 스케줄러 공개 칸(p35 §3.2) — 정규 종목 이름·시각만. 객체가 아니면 null(모름 — 꾸미지 않는다)
  function cleanSched(s) {
    if (!isObj(s)) return null;
    const symbols = Array.isArray(s.symbols) ? s.symbols.filter((x) => typeof x === 'string' && SYM_RE.test(x)).slice(0, 20) : [];
    return {
      up: s.up === true,
      symbols,
      running: s.running === true,
      runningSymbol: typeof s.runningSymbol === 'string' && SYM_RE.test(s.runningSymbol) ? s.runningSymbol : null,
      request: s.request === true,
      lastOkAt: isTime(s.lastOkAt) ? s.lastOkAt : null,
    };
  }

  // ptf:analysis 하나 → { reply, up, stale, off, analysis, autopilot, sched, canRequest } (type·v가 틀리면 null)
  // canRequest: 셸이 요청 분석을 아는가 — 칸이 없는 옛 셸은 false
  function cleanMessage(d) {
    if (!isObj(d) || d.type !== 'ptf:analysis' || d.v !== 1) return null;
    return {
      reply: d.reply === true, up: d.up === true, stale: d.stale === true, off: d.off === true,
      analysis: d.analysis == null ? null : cleanAnalysis(d.analysis),
      autopilot: d.autopilot == null ? null : cleanAutopilot(d.autopilot),
      sched: d.sched == null ? null : cleanSched(d.sched),
      canRequest: d.canRequest === true,
    };
  }

  // ptf:analysis-result 하나 → { req, symbol, state, ahead, etaSec, elapsedSec, reason, analysis } (p35 §7.2)
  // type·v·req(1~1e9 정수)·symbol·state가 틀리면 null. 이유는 그 상태의 RESULT_REASONS 안 값만(밖이면 null), 숫자는 0 이상 정수(상한)
  const count = (v, max) => (isNum(v) && v >= 0 ? Math.min(Math.round(v), max) : 0);
  function cleanResult(d) {
    if (!isObj(d) || d.type !== 'ptf:analysis-result' || d.v !== 1) return null;
    if (!Number.isInteger(d.req) || d.req < 1 || d.req > 1e9) return null;
    if (typeof d.symbol !== 'string' || !SYM_RE.test(d.symbol) || !RESULT_STATES.includes(d.state)) return null;
    const reasons = RESULT_REASONS[d.state];
    return {
      req: d.req, symbol: d.symbol, state: d.state,
      ahead: count(d.ahead, 99), etaSec: count(d.etaSec, 86400), elapsedSec: count(d.elapsedSec, 86400),
      reason: d.reason !== null && reasons.includes(d.reason) ? d.reason : null,
      analysis: d.analysis == null ? null : cleanAnalysis(d.analysis),
    };
  }

  // ptf:analysis-turns 하나 → { req, symbol, live, stop, turns } (p37 §3.4 — 셸이 허브 공개 turns 응답을 넘긴 것)
  // type·v·req(1~1e9 정수)·symbol·live(on|aborted)·stop(on이면 null, aborted면 cut|fail)이 틀리면 null.
  // 직원 항목은 실시간 직원 넷·n 1~8 정수·말(거른 뒤) 있는 것만 — 틀린 항목만 뺀다(최대 8). aborted는 말을 싣지 않는다(늘 [])
  function cleanLiveTurn(t) {
    if (!isObj(t) || !ANY_LIVE.includes(t.id) || !Number.isInteger(t.n) || t.n < 1 || t.n > LIVE_N_MAX) return null;
    const c = cleanTurn(t);
    if (!c) return null;
    return { n: t.n, id: c.id, name: c.name, role: c.role, turn: c.turn, bubble: c.bubble, report: c.report };
  }
  function cleanTurns(d) {
    if (!isObj(d) || d.type !== 'ptf:analysis-turns' || d.v !== 1) return null;
    if (!Number.isInteger(d.req) || d.req < 1 || d.req > 1e9) return null;
    if (typeof d.symbol !== 'string' || !SYM_RE.test(d.symbol) || !LIVE_STATES.includes(d.live) || !Array.isArray(d.turns)) return null;
    if (d.live === 'on' ? d.stop !== null : !LIVE_STOPS.includes(d.stop)) return null;
    const turns = d.live === 'on' ? d.turns.slice(0, LIVE_MAX * 4).map(cleanLiveTurn).filter(Boolean).slice(0, LIVE_MAX) : [];
    return { req: d.req, symbol: d.symbol, live: d.live, stop: d.live === 'on' ? null : d.stop, turns };
  }

  // ---- 데모 모의 포지션(설계 §4.5) — 진입가 = 지금 시세, 익절·손절 = 분석의 plan, 배율 = 데모 고정 ----
  // 열지 않는 경우: 관망(plan 없음) · 레벨 없음·지금 시세가 분석 조건 밖 · 시세 없음 · 손절이 청산가 밖.
  // 차트 계획선(plan)은 실제로 여는 때만, 포지션과 같은 값(진입가 = 지금 시세)으로 — 열지 않을 때 분석의 조건부 진입가(예 1269)로
  // 선을 그리면 차트가 판정판(HOLD)과 다른 '매도 판정'·가상 ROE −51%를 보이고, 시세를 못 받았으면 이전 종목(BTC) 차트에 다른 종목 레벨이 얹힌다
  const ENTRY_BAND = 0.002;
  function demoPlan(analysis, price, { lev = 50, now = Date.now() } = {}) {
    const p = analysis && analysis.plan;
    const no = (why) => ({ open: false, why, plan: null, position: null });
    if (!p) return no('pass');
    if (!isNum(p.tp) || !isNum(p.sl)) return no('outside');
    if (!isNum(price) || !(price > 0)) return no('noprice');
    const inside = p.side === 'LONG' ? p.sl < price && price < p.tp : p.tp < price && price < p.sl;
    if (!inside) return no('outside');
    // p35 O-4: 지금 시세가 분석의 진입가 0.2% 안일 때만 — 직원들이 '현재가 추격 금지, X 아래 마감 확인 시에만'이라고 한 분석을 지금 값으로 열지 않게.
    // 숫자 진입가가 없으면(허브 planOf entry null) 진입 조건을 확인할 수 없어 열지 않는다
    if (!isNum(p.entry) || !(p.entry > 0) || Math.abs(price - p.entry) / p.entry > ENTRY_BAND) return no('outside');
    const liq = Brain.levels(p.side, price, lev).liq;
    if (p.side === 'LONG' ? !(p.sl > liq) : !(p.sl < liq)) return no('liq');
    return {
      open: true, why: null,
      plan: { side: p.side, entry: price, target: p.tp, stop: p.sl, liq, lev, at: now },
      position: { side: p.side, entry: price, target: p.tp, stop: p.sl, liq, leverage: lev },
    };
  }

  // ---- 안내 줄(설계 §4.7 + p35 §3.3) — 요청 진행(맨 앞) · 최신 분석 시각 · 오래됨 · 연결 끊김 · 자동 운영 또는 분석 스케줄러. 기기 시계로 계산 ----
  // 8140 자동 운영이 꺼져 있으면(지금 운영) 스케줄러 상태로만 말한다 — 모르면(sched 없음·up 거짓) 자동 분석 말을 지어내지 않는다.
  // 허브 연결이 끊기면(view.up 거짓) 셸은 앞 값(autopilot·sched)을 그대로 두고 up만 바꿔 보낸다 — 그 값은 끊기기 전 상태라
  // '직원들이 X 분석 중입니다'·'최근 분석 N분 전'·'다음 분석'을 그리지 않는다(p35 검토 사무실 4, §3.3·§10-4 '모르면 말하지 않음')
  function lineParts(view, now, displayOf) {
    if (!view || view.off) return [];
    const shown = (sym) => (typeof displayOf === 'function' ? displayOf(sym) : null) || DISPLAY[sym] || sym;
    const a = view.analysis;
    const p = view.progress;
    const out = [];
    if (p) out.push({ kind: 'req', text: progressText(p, now) });
    // 2026-10-23 요청(⑥ — PC판에 없는 줄): 요청 분석 판은 진행 줄만 — '최신 분석 · N분 전'·자동 분석·오래됨·연결 끊김 줄 없음
    if (view.request) return out;
    if (a) out.push({ kind: 'latest', text: TEXT.lineLatest(a.at, agoText(a.at, now)) });
    if (a && view.stale) out.push({ kind: 'stale', text: TEXT.lineStale(Math.max(1, Math.floor((now - a.at) / 3600000))) });
    if (!view.up) {
      out.push({ kind: 'down', text: a ? TEXT.lineDown : TEXT.lineDownNone });
      return out;
    }
    const ap = view.autopilot;
    const s = view.sched;
    if (ap && ap.on) {
      if (ap.running) out.push({ kind: 'auto', text: TEXT.lineRunning(ap.runningSymbol ? shown(ap.runningSymbol) : null) });
      else if (ap.waiting) out.push({ kind: 'auto', text: TEXT.lineWaiting(a ? a.at : ap.lastRunAt) });
      else if (ap.intervalMin && ap.nextAt) out.push({ kind: 'auto', text: TEXT.lineNext(ap.intervalMin, Math.ceil((ap.nextAt - now) / 60000)) });
      else if (ap.intervalMin) out.push({ kind: 'auto', text: TEXT.lineEvery(ap.intervalMin) });
    } else if (s && s.up && s.running) {
      // 이 기기 요청의 진행 줄과 같은 종목이면 겹쳐 쓰지 않는다
      if (!(p && p.symbol && p.symbol === s.runningSymbol)) out.push({ kind: 'auto', text: TEXT.lineSchedRunning(s.runningSymbol ? shown(s.runningSymbol) : null) });
    } else if (s && s.up) {
      out.push({ kind: 'auto', text: TEXT.lineSched(isTime(s.lastOkAt) ? agoText(s.lastOkAt, now) : null) });
    }
    return out;
  }

  // ---- 재생 엔진(설계 §4.3) — 데모 엔진(engine.js)과 같은 이벤트·연출 속도, 문장은 받은 분석 그대로 ----
  // 단계 줄은 우리 앱 리플레이와 같은 글(배율 없이). 직원은 리포트 순서대로 무리를 지어 한 라운드씩
  const STAGE = Object.freeze({
    analysts: '── 애널리스트 팀 분석 ──', debate: '── 리서치 토론 (BULL vs BEAR) ──', scalp: '── 스캘핑 데스크 ──',
    final: '── 최종 판정 ──', firstVerdict: '── 수석 트레이더 1차 판정 ──', risk: '── 리스크 위원회 심사 ──', pm: '── 포트폴리오 매니저 최종 승인 ──',
  });
  const GROUP = Object.freeze({
    taro: 'analysts', diana: 'analysts', nova: 'analysts', vibe: 'analysts', bull: 'debate', bear: 'debate',
    blitz: 'scalp', guard: 'scalp', ace: 'ace', risky: 'risk', safe: 'risk', neutral: 'risk', pm: 'pm',
  });

  // 직원 차례 → [단계 줄, [라운드…]] — 애널리스트 동시 · 토론은 턴 1·2, 3·4 · 스캘핑 데스크는 BLITZ, GUARD 따로 · RISKY‖SAFE → NEUTRAL
  function stagesOf(turns) {
    const of = (g) => turns.filter((t) => GROUP[t.id] === g);
    const out = [];
    const analysts = of('analysts');
    if (analysts.length) out.push([STAGE.analysts, [analysts]]);
    const debate = of('debate');
    if (debate.length) {
      const rounds = [];
      debate.forEach((t, i) => {
        const k = Math.ceil((t.turn || i + 1) / 2);
        const r = rounds.find((x) => x.k === k);
        if (r) r.items.push(t); else rounds.push({ k, items: [t] });
      });
      out.push([STAGE.debate, rounds.map((r) => r.items)]);
    }
    const scalp = of('scalp');
    if (scalp.length) out.push([STAGE.scalp, scalp.map((t) => [t])]);
    const ace = of('ace');
    const pm = of('pm');
    if (ace.length) out.push([pm.length ? STAGE.firstVerdict : STAGE.final, [ace]]);
    const risk = of('risk');
    if (risk.length) {
      const first = risk.filter((t) => t.id !== 'neutral');
      const last = risk.filter((t) => t.id === 'neutral');
      out.push([STAGE.risk, [first, last].filter((r) => r.length)]);
    }
    if (pm.length) out.push([STAGE.pm, [pm]]);
    return out;
  }

  // 판정 이벤트(app.js onDecision·hq.js setVerdict가 그리는 모양) — 분석 값 그대로, 권장 비중·청산가 없음. 차트 계획선(plan)은 부르는 쪽이 붙인다
  function decisionEvent(a) {
    const dec = {
      type: 'decision', action: a.action || 'HOLD', confidence: a.confidence, entry: a.entry, stop: a.stop, target: a.target,
      rationale: a.rationale, report: a.report,
    };
    if (a.scalp) dec.scalp = { ...a.scalp };
    if (a.pm) dec.verdict = a.pm;
    dec.rr = a.rr;
    dec.riskOk = a.riskOk;
    if (Array.isArray(a.news) && a.news.length) dec.news = a.news.map((n) => ({ ...n })); // 분석 근거 창(evidence.js) ■ 뉴스 근거
    return dec;
  }

  // deps: bus · paper(데모 모의 계좌 — 중계면 쓰지 않음) · mock(false = 모의 매매가 없는 빌드 — 데모도 포지션·계획선·'[모의 포지션]' 줄 없음)
  //       · data{ resolveSymbol, fetchSnapshot } · lev()(데모 고정 배율) · pace·sleep·now(시험용)
  function createReplayEngine(deps) {
    const bus = deps.bus;
    const mock = deps.mock !== false;
    const THINK = (Engine && Engine.THINK) || {};
    const pace = deps.pace == null ? 1 : deps.pace;
    const sleep = deps.sleep || ((ms) => new Promise((ok) => setTimeout(ok, ms)));
    const wait = (ms) => (pace > 0 && ms > 0 ? sleep(ms * pace) : Promise.resolve());
    const now = deps.now || (() => Date.now());
    const levOf = () => { const v = typeof deps.lev === 'function' ? deps.lev() : deps.lev; return Brain.clampLev(v); };
    const emit = (ev) => bus.emit({ ...ev, replay: true });
    const log = (line, kind = 'sys') => emit({ type: 'log', kind, line: String(line) });
    let running = false;
    let held = false;

    async function round(items) {
      for (const it of items) emit({ type: 'agent:start', id: it.id, ...(it.turn ? { turn: it.turn } : {}) });
      const order = items.slice().sort((a, b) => (THINK[a.id] || 1500) - (THINK[b.id] || 1500));
      let elapsed = 0;
      for (const it of order) {
        const t = THINK[it.id] || 1500;
        await wait(t - elapsed);
        elapsed = t;
        emit({ type: 'agent:done', id: it.id, ...(it.turn ? { turn: it.turn } : {}), bubble: it.bubble, report: it.report });
      }
    }

    const resolve = (s) => { try { return deps.data && deps.data.resolveSymbol ? deps.data.resolveSymbol(s) : null; } catch (_) { return null; } };
    // 시세 → 차트 이벤트(데모 엔진과 같은 꼴 — 바이낸스 무기한 5분봉)
    const marketEvent = (s, sym, display) => ({
      type: 'market', priceLine: Script.priceLine(s), symbol: sym.symbol, display, kind: sym.kind === 'krstock' ? 'krstock' : 'crypto',
      axis: s.axis, tf: '5m', candles: (s.k5 || []).slice(-144).map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
    });

    async function run(a, opts = {}) {
      if (running) {
        const err = new Error('이미 분석이 진행 중입니다.');
        err.code = 409;
        throw err;
      }
      running = true;
      return play(a, { relay: opts.relay, lead: opts.lead });
    }

    // 재생 몸통 — run(처음부터)과 실시간 세션의 끝(finish — continued: run:start·첫 줄 없이 이어서, skip = 실시간으로 이미 보인 직원 글)이 같이 쓴다.
    // skip(id → 보인 말풍선)과 최종 글이 같은 직원은 건너뛰고, 다른 글이면 최종 문장으로 다시(R13). 라운드가 모두 비면 그 단계 줄도 건너뛴다
    async function play(a, opts = {}) {
      const relay = !!opts.relay;
      const continued = !!opts.continued;
      const skip = opts.skip instanceof Map ? opts.skip : new Map();
      // 첫 줄(p35 §2.13): 요청 분석이 끝난 것이면 O-24, 재생만이면 이유(O-25~O-27) — 없으면 O-11. 휴대폰 피드(hq.js)는 run:start.lead를 첫 줄로
      const lead = typeof opts.lead === 'string' && opts.lead ? opts.lead : null;
      let decided = false;
      try {
        const sym = resolve(a.symbol);
        if (!continued) {
          const start = { type: 'run:start', symbol: sym ? sym.symbol : a.symbol, display: a.display, mock: false, mode: a.mode || 'scalp', auto: false, model: null, at: a.at, when: mdhm(a.at) };
          if (lead) start.lead = lead.replace(/^>\s*/, '');
          emit(start);
          log(lead || (relay ? TEXT.relayLead(a.display, a.at) : TEXT.replayIntro(a.at)));
        }
        // 데모만: 지금 시세·차트(데모와 같은 바이낸스 무기한) — 실패하면 차트는 그대로 두고 계속. 중계는 실계좌 차트를 건드리지 않는다.
        // 시세는 나란히 받는다(p35 O-6 — 느린 망에서 첫 직원이 20~30초 늦지 않게). 판정 때까지 안 오면 3초까지만 더 기다리고,
        // 그 뒤에 온 시세로는 차트를 바꾸지 않는다(판정·포지션과 어긋나지 않게)
        let snap = null;
        let snapDone = true;
        let snapP = null;
        if (!relay && sym && deps.data && deps.data.fetchSnapshot) {
          snapDone = false;
          let first;
          try { first = deps.data.fetchSnapshot(sym); } catch (e) { first = Promise.reject(e); }
          snapP = Promise.resolve(first)
            .then((s) => {
              if (decided || !s) return null;
              snap = s;
              emit(marketEvent(s, sym, a.display));
              return s;
            })
            .catch(() => null)
            .then((s) => { snapDone = true; return s; });
        }
        await wait(600);
        for (const [line, rounds] of stagesOf(a.turns)) {
          const left = rounds.map((r) => r.filter((t) => !(skip.has(t.id) && skip.get(t.id) === t.bubble))).filter((r) => r.length);
          if (!left.length) continue;
          log(line, 'stage');
          for (const r of left) await round(r);
        }
        if (snapP && !snapDone) await Promise.race([snapP, sleep(3000)]);
        decided = true;
        const price = snap && isNum(snap.price) ? snap.price : null;
        const axis = (snap && snap.axis) || 'perp';
        if (typeof a.riskOk === 'boolean') {
          emit({ type: 'risk', rr: a.rr, ok: a.riskOk, reasons: [], sizing: null, liq: null, stopBeyondLiq: false, downgrade: false });
        }
        const lev = levOf();
        // 데모: 시세를 못 받았으면(price null — market 이벤트도 없었다) 차트는 이전 종목에 머물러 있으니 계획선도 없다(demoPlan이 null)
        // 모의 매매가 없는 빌드(mock false)는 중계처럼 계획선·모의 포지션이 없다 — 판정만
        const demo = !relay && mock;
        const dp = demo ? demoPlan(a, price, { lev, now: now() }) : null;
        const dec = decisionEvent(a);
        if (demo) dec.plan = dp.plan;
        // 분석 근거 창(2026-10-23 요청 5 — evidence.js): 중계 판정의 종목·기사(news — 허브가 싣는 판에서만)
        if (relay) {
          dec.sym = a.display || a.symbol;
          if (Array.isArray(a.news)) dec.news = a.news;
        }
        // 진입 참고가(2026-10-23 사무실 2차 요청 4 — entryref.js): 중계 분석의 plan(허브가 판정 때 받은 오렌지엑스 시세·익절가)을 ref로
        if (relay && a.plan && (a.plan.side === 'LONG' || a.plan.side === 'SHORT') && isNum(a.plan.entry) && a.plan.entry > 0 && isNum(a.plan.tp) && a.plan.tp > 0) {
          dec.ref = { side: a.plan.side, entry: a.plan.entry, tp: a.plan.tp, sym: a.display || a.symbol };
        }
        emit(dec);
        log(`>>> 최종 판정: ${a.action || 'HOLD'} (${a.confidence == null ? '—' : a.confidence}%)${a.pm ? ` · PM ${a.pm}` : ''}`, 'stage');
        if (demo) openDemo(a, sym, dp, axis);
      } catch (e) {
        log(`> ⚠ ${e && e.message ? e.message : String(e)}`);
      } finally {
        decided = true; // 끝난 뒤 늦게 온 시세로 차트를 바꾸지 않는다
        emit(continued ? { type: 'run:end', live: true } : { type: 'run:end' });
        running = false;
      }
    }

    // 실시간 직원 말 세션(p37 D4, 설계 §3.4) — 요청 분석이 도는 동안 셸이 넘긴 직원 말(TARO·VIBE·BLITZ·GUARD)을 도착하는 대로 보여 준다.
    // 다른 재생이 도는 중이면 null(그 요청은 실시간 없이 끝 결과로). 요청 기다림(hold)과는 상관없이 연다 — 기다림이 hold를 건 채로 열린다.
    // run:start { replay, live, lead O-40 } — public/의 '지난 분석 다시 보기' 인트로 카드·자막은 ui.js가 고쳐 쓴다.
    // turn(t): 줄에 세우고 하나씩 — 단계 줄(그 무리 처음만) → agent:start → agent:done { live, req, n }. 앞 직원 말 뒤 LIVE_GAP_MS(× pace)가
    //   지났으면 바로(실제 도착이 속도), 아니면 그만큼 기다림(한 메시지에 여럿이 와도 말풍선·자막이 하나씩 보이게 — p37 검토)
    // finish(a, { lead }): 구분 줄 O-41 → 같은 글 직원은 건너뛰고 나머지·ACE·판정(play continued) → run:end { live }
    // discard(text): 보인 말을 거둔다 — lite:analysis live-discard(ui.js가 말풍선·피드 줄·자막) · lite:talk discard(기록창) · 중단 줄 · run:end { live }
    function openLive({ symbol, display, relay = false, req = null, lead = null } = {}) {
      if (running) return null;
      running = true;
      const sym = resolve(symbol);
      const at = now();
      const start = { type: 'run:start', live: true, symbol: sym ? sym.symbol : symbol, display: display || symbol, mock: false, mode: 'scalp', auto: false, model: null, at, when: mdhm(at) };
      if (typeof lead === 'string' && lead) start.lead = lead.replace(/^>\s*/, '');
      emit(start);
      if (typeof lead === 'string' && lead) log(lead);
      const shown = new Map();
      const staged = new Set();
      let open = true;
      // 직원 말 줄(p37 검토): 한 메시지에 여럿이 와도(8140은 TARO·VIBE를 함께 돌려 한 받기에 같이 끝남 · 화면을 다시 켬 · 새 창에 다시 보냄)
      // 하나씩 낸다 — 앞 직원 말 뒤 LIVE_GAP_MS(× 연출 속도). 같은 틱에 모두 내면 휴대폰 중계 '최신 하나만'이 앞 말풍선을 그리기도 전에 지우고
      // hq.js 자막도 덮였다. 줄에 남은 직원은 보이지 않은 것 — 끝(finish)이면 최종 문장으로 재생되고 거둠(discard)에는 들지 않는다
      const queue = [];
      let pumping = false;
      let lastAt = null;
      const gapMs = () => (pace > 0 ? LIVE_GAP_MS * pace : 0);
      const release = (t) => {
        const g = GROUP[t.id];
        if (g && STAGE[g] && !staged.has(g)) { staged.add(g); log(STAGE[g], 'stage'); }
        const turn = t.turn ? { turn: t.turn } : {};
        emit({ type: 'agent:start', id: t.id, ...turn, live: true });
        emit({ type: 'agent:done', id: t.id, ...turn, bubble: t.bubble, report: t.report, live: true, req, n: t.n });
        shown.set(t.id, t.bubble);
        lastAt = now();
      };
      async function pump() {
        if (pumping) return;
        pumping = true;
        try {
          while (open && queue.length) {
            const left = lastAt == null ? 0 : gapMs() - (now() - lastAt);
            if (left > 0) await sleep(left);
            if (!open) break;
            release(queue.shift());
          }
        } catch (_) { /* 기다림 실패 — 남은 말은 끝 재생이 보인다 */ } finally {
          pumping = false;
        }
      }
      // 데모만: 그 종목 시세·차트를 바로(칩 줄·스위치는 run:start를 따라가므로 차트도 같이). 끝 재생(finish)은 판정 때 시세를 다시 받는다.
      // 거두거나 끝 재생이 시작된 뒤에 온 시세로는 그리지 않는다. 중계는 실계좌 차트를 건드리지 않는다
      if (!relay && sym && deps.data && typeof deps.data.fetchSnapshot === 'function') {
        let first;
        try { first = deps.data.fetchSnapshot(sym); } catch (e) { first = Promise.reject(e); }
        Promise.resolve(first).then((s) => { if (open && s) emit(marketEvent(s, sym, display || symbol)); }).catch(() => {});
      }
      return {
        turn(t) {
          if (!open || !t || !ANY_LIVE.includes(t.id)) return false;
          queue.push(t);
          pump();
          return true;
        },
        finish(a, o = {}) {
          if (!open) return Promise.resolve(false);
          open = false;
          queue.length = 0;
          const l = typeof o.lead === 'string' && o.lead ? o.lead : null;
          if (l) {
            log(l, 'stage');
            bus.emit({ type: 'lite:talk', kind: 'system', text: l });
          }
          return play(a, { relay, continued: true, skip: shown }).then(() => true);
        },
        discard(text) {
          if (!open) return false;
          open = false;
          queue.length = 0;
          const why = String(text || '');
          bus.emit({ type: 'lite:analysis', kind: 'live-discard', ids: [...shown.keys()], req, text: why });
          bus.emit({ type: 'lite:talk', kind: 'discard', req, text: why });
          log(TEXT.liveCut, 'stage');
          emit({ type: 'run:end', live: true });
          running = false;
          return true;
        },
        shown: () => new Map(shown),
        isOpen: () => open,
      };
    }

    // 데모 모의 포지션(설계 §4.5) — 열면 데모 엔진과 같은 포지션 이벤트·콘솔 줄, 못 열면 이유 한 줄
    function openDemo(a, sym, dp, axis) {
      if (!dp.open) {
        log(dp.why === 'pass' ? TEXT.pass : dp.why === 'liq' ? TEXT.liqStop : dp.why === 'noprice' ? TEXT.noPrice : TEXT.outside);
        return;
      }
      if (!deps.paper || !sym) { log(TEXT.noPrice); return; }
      const p = dp.position;
      const res = deps.paper.open({
        symbol: sym.symbol, display: a.display, side: p.side, mode: a.mode || 'scalp', entry: p.entry, stop: p.stop, target: p.target, liq: p.liq,
        leverage: p.leverage, confidence: a.confidence, rr: a.rr, axis,
      });
      if (res.position) {
        emit({ type: 'position', action: 'open', position: res.position });
        log(`> 가상 포지션 오픈: ${a.display} ${p.side} ${p.leverage}x @ ${Script.fmtPrice(p.entry)} · 증거금 ${res.position.margin.toFixed(2)} USDT · 청산가 ${Script.fmtPrice(p.liq)}`);
      } else {
        log(`> 가상 포지션 보류 — ${res.skipped}`);
      }
    }

    return {
      run,
      openLive,
      // 실시간 세션이 열린 동안도 참 — 잡담·다른 누름·스위치 잠김이 같이 따른다
      isRunning: () => running || held,
      hold(on) { held = !!on; },
    };
  }

  // ---- 누르는 갈래(설계 §4.1·§4.2·§4.8 + p35 §2.12 요청 분석) ----
  // 셸이 넣어 준 값(receive)을 들고 있다가, 누르면(press) 가진 분석을 곧바로 재생하고 셸에 새 값만 묻는다.
  // 가진 분석이 없으면 묻고 최대 6초 기다린다(셸 받기 제한 5초보다 길게). 옛 셸(office-ready 뒤 10초 무수신)은 기다리지 않는다.
  // 분석이 끝내 없으면 데모: 지금 데모 엔진 + 첫 줄 안내 / 중계: 토스트(O-12·O-16·O-17)
  // 요청 분석(deps.request — analysisRequest 빌드, 담당자판 m/): 종목을 고르면(입력칸 — 데모·중계 같음, p37 D3)
  //   1 종목 없음 → 위 그대로 · 2 가진 최신 분석과 같은 종목이고 정규 종목(sched.symbols)이거나 30분 안 → 바로 재생
  //   3 셸이 요청을 모름(canRequest 거짓 — 옛 셸) → 최신 재생 + O-29 · 4 그 밖 → ptf:analysis-request {req, symbol}
  //   요청 결과(ptf:analysis-result)는 (req, symbol)이 지금 요청과 같을 때만 받는다 — 첫 결과가 12초(셸 POST 8초 + 4초) 안에 없으면
  //   O-28 + 최신 재생, 그 req의 뒤늦은 결과는 버린다. 첫 결과 뒤 13분(셸 12분 상한 + 1분) 끝 결과가 없으면 기다리기를 멈춘다
  // deps: bus · relay(중계 사무실인가) · quota(데모 무료 횟수, 없으면 null) · replay(재생 엔진) · demo(데모 엔진, 중계면 null) · port(셸 창구)
  //       · lev() · notify(글, 종류) · setInput(글 → 앞 값) · lock(버튼 잠금) · setTimeout·clearTimeout · waitMs·oldShellMs
  //       · request(요청 분석 빌드인가) · resolve(입력 글 → { symbol, display }, data.js resolveSymbol) · now()
  const REUSE_MS = 30 * 60000;
  function createController(deps) {
    const bus = deps.bus;
    const relay = !!deps.relay;
    const request = deps.request === true;
    // 실시간 직원 말(p37 D4 — LITE_CONFIG.analysisLive 빌드만, 아니면 ptf:analysis-turns를 버린다). 요청 분석 갈래 안에서만 온다
    const live = request && deps.live === true;
    const setT = deps.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clearT = deps.clearTimeout || ((id) => clearTimeout(id));
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    const WAIT_MS = deps.waitMs > 0 ? deps.waitMs : 6000;
    const OLD_MS = deps.oldShellMs > 0 ? deps.oldShellMs : 10000;
    const REQ_WAIT_MS = deps.reqWaitMs > 0 ? deps.reqWaitMs : 12000;
    const REQ_MAX_MS = deps.reqMaxMs > 0 ? deps.reqMaxMs : 13 * 60000;
    const notify = (m, k) => { try { if (deps.notify) deps.notify(m, k); } catch (_) { /* 토스트 실패가 갈래를 막지 않게 */ } };
    const lock = (on) => { try { if (deps.lock) deps.lock(on); } catch (_) { /* 버튼이 없어도 */ } };
    let last = null; // 마지막으로 받은 값 { up, stale, off, analysis, autopilot, sched, canRequest }
    let received = false;
    let oldShell = false;
    let oldTimer = null;
    let pending = null; // 답 기다림 — 최신 분석 묻기 { kind:'ask', input, timer } | 요청 { kind:'request', req, symbol, display, input, timer, state }
    let progress = null; // 안내 줄 맨 앞(휴대폰에 보임) — { kind:'ask'|'queued'|'running'|'loading'|'fallback', symbol, display, ahead, etaSec, elapsedSec, at }
    let drawnId = null; // 중계: 판정판에 그린 분석 id(lite:analysis verdict 신호 또는 재생) — 새 id면 다시 그림(p35 O-5)
    let reqSeq = 0;
    let followArmed = true; // 중계 정규 런 따라 보기(2026-10-23 요청 2) — 다음 런을 기다리는 중

    const busy = () => !!pending || deps.replay.isRunning() || !!(deps.demo && deps.demo.isRunning());
    const ask = () => { if (deps.port) deps.port.post({ type: 'ptf:analysis-get', v: 1 }); };
    const changed = () => bus.emit({ type: 'lite:analysis', kind: 'progress' });
    const setProgress = (p) => { progress = p; changed(); };
    // TARO·VIBE 책상 — 요청을 보내면 '…'(think — 말풍선만), 끝내 재생이 없으면 정리(clear·fail). ui.js가 그린다
    const staff = (what) => bus.emit({ type: 'lite:analysis', kind: 'staff', staff: what });
    // 대체(데모 엔진) 런이 끝나면 대체 안내 줄을 지운다
    bus.subscribe((ev) => {
      if (ev && ev.type === 'run:end' && !ev.replay && progress && progress.kind === 'fallback') setProgress(null);
    });

    // opts.quiet: 종목 바꿈 토스트를 띄우지 않음(요청 갈래 — 입력칸의 한글 이름·결과 토스트와 겹치지 않게) · opts.lead: 재생 첫 줄(O-24~O-27)
    // 중계도 데모와 같게(p37 D3 — 같은 입력칸이라 종목이 바뀌면 알린다)
    function startReplay(a, opts = {}) {
      let prev = '';
      try { prev = deps.setInput ? String(deps.setInput(a.display) || '') : ''; } catch (_) { prev = ''; }
      const p = prev.trim().toUpperCase();
      if (!opts.quiet && p !== a.display.toUpperCase() && p !== a.symbol) notify(TEXT.switched(a.display), 'ok');
      if (relay) drawnId = a.id; // 재생이 판정판을 그린다 — 처음 받음 판정을 따로 내지 않게
      const ro = { relay };
      if (opts.lead) ro.lead = opts.lead;
      deps.replay.run(a, ro).catch(() => {});
    }

    // 실시간 세션이 끝 분석으로 이어질 때 — 재생 시작과 같이 입력칸을 그 종목으로(토스트 없음), 중계는 판정판을 그 분석이 그린다
    function setInputQuiet(a) {
      try { if (deps.setInput) deps.setInput(a.display); } catch (_) { /* 입력칸이 없어도 */ }
      if (relay) drawnId = a.id;
    }

    // why: 'none'(분석 아직 없음·끄기) | 'failed'(연결 끊김·무응답) | 'old'(옛 셸)
    function fallback(input, why) {
      if (relay) {
        notify(why === 'old' ? TEXT.oldShell : why === 'none' ? TEXT.none : TEXT.failed, 'err');
        return 'toast';
      }
      const sym = input && typeof input.symbol === 'string' && input.symbol.trim() ? input.symbol.trim() : 'BTC';
      const lev = typeof deps.lev === 'function' ? deps.lev() : deps.lev;
      // 휴대폰은 콘솔(#console)이 숨어 있다 — 대체 안내를 안내 줄에도(p35 O-2), 그 런이 끝나면 지움
      setProgress({ kind: 'fallback' });
      // 모드는 하나(스캘핑 길 — 대표 결정 2026-10-12)
      if (deps.demo) deps.demo.run(sym, { mode: 'scalp', lev, lead: TEXT.fallback }).catch(() => {});
      return 'demo';
    }

    // 최신 분석 묻기(p34 갈래)가 끝남 — 답(msg) 또는 6초 무응답(null)
    function settle(msg) {
      const p = pending;
      if (!p || p.kind !== 'ask') return;
      pending = null;
      clearT(p.timer);
      deps.replay.hold(false);
      lock(false);
      progress = null;
      if (msg && msg.analysis) { changed(); startReplay(msg.analysis); return; }
      if (msg) fallback(p.input, msg.up && !msg.off ? 'none' : msg.off ? 'none' : 'failed');
      else fallback(p.input, oldShell ? 'old' : 'failed');
      changed();
    }

    // 가진 최신 분석을 묻고 기다린다(p34 갈래 — 가진 분석이 없을 때)
    function askAndWait(input) {
      if (oldShell) return fallback(input, 'old');
      ask();
      deps.replay.hold(true);
      lock(true);
      if (!relay) bus.emit({ type: 'log', kind: 'sys', line: TEXT.loading });
      pending = { kind: 'ask', input, timer: setT(() => settle(null), WAIT_MS) };
      setProgress({ kind: 'loading' });
      return 'wait';
    }

    function replayLatestOrAsk(input) {
      if (last && last.analysis) {
        startReplay(last.analysis);
        ask();
        return 'replay';
      }
      return askAndWait(input);
    }

    // 누른 종목 — 입력칸 글 → data.js resolveSymbol 기호(USDT 뗌). 데모·중계 같음(p37 D3 — 중계도 입력칸 + 🔍 정밀 분석, 종목 버튼 고르기 없음).
    // 없으면 null, 알아볼 수 없으면 { bad }
    // 바이낸스 무기한의 1000개 단위 밈코인(data.js THOUSAND — 1000PEPE·1000SHIB…)은 우리 앱·허브 기호(PEPE·SHIB)로 — 허브가 별칭으로 바꾼
    // 분석 기호와 같아야 30분 안 다시 누르기(갈래 2)·스케줄러 줄 겹침 막기·첫 줄 이름이 맞는다(p35 검토)
    function target(input) {
      const raw = input && typeof input.symbol === 'string' ? input.symbol.trim() : '';
      if (!raw) return null;
      try {
        const r = deps.resolve(raw);
        const pair = String(r.symbol || '').replace(/USDT$/, '');
        const symbol = pair.replace(/^1000(?=[A-Z])/, '');
        if (!SYM_RE.test(symbol)) return { bad: TEXT.failed };
        return { symbol, display: symbol !== pair || !r.display ? symbol : r.display };
      } catch (e) {
        return { bad: e && e.message ? String(e.message) : TEXT.failed };
      }
    }

    // 정규 종목(스케줄러가 도는 종목) — 허브에 연결돼 있을 때 받은 sched만 믿는다(끊기면 셸이 앞 값을 그대로 보냄 — p35 검토 사무실 4)
    const isRegular = (sym) => !!(last && last.up && last.sched && last.sched.symbols.includes(sym));

    function press(input = {}) {
      if (busy()) return 'busy';
      if (!relay && deps.quota && deps.quota.left() <= 0) {
        bus.emit({ type: 'lite:limit', limit: deps.quota.limit });
        return 'limit';
      }
      const canPick = request && typeof deps.resolve === 'function';
      // 2026-10-23 요청(⑥): 요청을 아는 셸이면 빈 칸도 지난 분석 재생 대신 BTC 새 분석 요청(입력칸 처음 값과 같은 종목)
      const emptyAsk = canPick && !!(last && last.canRequest) && !(input && typeof input.symbol === 'string' && input.symbol.trim());
      const pick = canPick ? target(emptyAsk ? { symbol: 'BTC' } : input) : null;
      if (!pick) return replayLatestOrAsk(input); // 갈래 1(요청 분석이 없는 빌드도 여기 — p34 그대로)
      if (pick.bad) { notify(pick.bad, 'err'); return 'bad'; }
      const a = last && last.analysis;
      // 갈래 2 — 같은 종목이고 정규 종목이거나 30분 안. 첫 줄은 새로 돌리지 않은 이유(정규 O-26 · 30분 안 O-25 — 허브 ready와 같은 글,
      // 설계 §8.1 S8-2·S8-4, 대표 결정 1 '30분 안이면 그 분석 재생'을 회원이 본다)
      // 2026-10-23 요청(⑥ — PC판과 같게): 요청을 아는 셸(canRequest)이면 이 갈래 없이 늘 허브에 묻는다 — 다시 쓰기(5분)는 허브·동업자판이 정한다
      if (a && a.symbol === pick.symbol && !(last && last.canRequest)) {
        const regular = isRegular(pick.symbol);
        if (regular || now() - a.at < REUSE_MS) {
          startReplay(a, { quiet: true, lead: regular ? TEXT.leadRegular(pick.display, a.at) : TEXT.leadFresh(pick.display, a.at) });
          ask();
          return 'replay';
        }
      }
      if (!last) return replayLatestOrAsk(input); // 셸 값을 아직 하나도 못 받음 — 요청을 아는 셸인지 모른다
      // 갈래 3 — 옛 셸
      if (!last.canRequest) {
        notify(TEXT.reqOldShell, 'ok');
        if (a) { startReplay(a, { quiet: true }); ask(); } else fallback(input, 'none');
        return 'old';
      }
      // 갈래 4 — 요청
      reqSeq += 1;
      // session·seen·liveDead — 실시간 직원 말(receiveTurns): 열린 세션, 받은 n, 이 요청의 실시간이 끝났는가(멈춤·세션을 못 엶)
      const p = { kind: 'request', req: reqSeq, symbol: pick.symbol, display: pick.display, input, state: 'ask', timer: null, session: null, seen: new Set(), liveDead: false };
      p.timer = setT(() => noAnswer(p), REQ_WAIT_MS);
      pending = p;
      deps.replay.hold(true);
      lock(true);
      if (deps.port) deps.port.post({ type: 'ptf:analysis-request', v: 1, req: p.req, symbol: p.symbol });
      // TARO·VIBE '…' — 버스 agent:start로 내지 않는다(p35 검토 사무실 1·3): 그 이벤트는 stage.js 책상 working·타자 불꽃 타이머·hq.js 자막·
      // 휴대폰 피드 대기 줄까지 가서, 재생 없이 끝나면 남고 재생으로 끝나면 타이머가 쌓였다. ui.js가 말풍선만 그리고(showThinking),
      // 재생이 시작되면 재생 엔진의 agent:start가 이어받는다
      staff('think');
      setProgress({ kind: 'ask', symbol: p.symbol, display: p.display });
      return 'request';
    }

    // 요청을 끝냄(버튼·기다림 풀기) — 그 뒤 같은 req 결과는 pending이 없어 버려진다
    function finish(p) {
      if (pending !== p) return false;
      pending = null;
      clearT(p.timer);
      deps.replay.hold(false);
      lock(false);
      progress = null;
      changed();
      return true;
    }

    // 셸 무응답 12초(O-28) — 가진 최신 분석을 재생(없으면 p34 대체)
    function noAnswer(p) {
      if (!finish(p)) return;
      const a = last && last.analysis;
      if (a) {
        notify(TEXT.reqSendFail, 'err');
        startReplay(a, { quiet: true });
      } else {
        staff('clear');
        fallback(p.input, 'failed');
      }
    }

    // 첫 결과 뒤 13분 — 셸 12분 상한의 안전망(마지막이 실행이면 '끝나면 최신 분석에 나옵니다', 대기면 '지금은 새로 분석하지 않습니다')
    function giveUp(p) {
      if (pending !== p) return;
      const s = takeSession(p);
      finish(p);
      // 실시간 직원 말을 보였으면 거둔다(O-43 — 기다리기를 멈춤)
      if (s) { dropLive(s, TEXT.liveTimeout(p.display)); return; }
      notify(p.state === 'running' ? TEXT.reqTimeout(p.display) : TEXT.reqNotNow(p.display), 'err');
      staff('fail');
    }

    // 열린 실시간 세션을 요청에서 떼어 낸다(그 요청의 실시간은 끝) — 없으면 null
    function takeSession(p) {
      if (!p) return null;
      const s = p.session;
      p.session = null;
      p.liveDead = true;
      return s;
    }
    // 실패 끝(R14·§4.5): 보인 말을 거두고 그 글을 토스트로 + TARO O-36
    function dropLive(s, text) {
      try { s.discard(text); } catch (_) { /* 거두기 실패가 요청 끝을 막지 않게 */ }
      notify(text, 'err');
      staff('fail');
    }

    // ptf:analysis-turns(p37 §3.4) — 지금 요청(req·symbol)이 대기·실행 중일 때만. 같은 n은 한 번만.
    // on: 세션이 없으면 열고(O-40) 새 직원마다 한 줄 · aborted cut: 보인 말을 거두고 O-44, 그 요청은 실시간 끝(진행 줄·끝 결과는 그대로) ·
    // aborted fail(내보낼 수 없는 런, R14): 끝을 기다리지 않고 거둠 O-42(보인 말이 없으면 O-33) + TARO O-36 + 요청 끝(뒤의 결과는 버려짐)
    function receiveTurns(raw) {
      if (!live) return false;
      const r = cleanTurns(raw);
      const p = pending;
      if (!r || !p || p.kind !== 'request' || r.req !== p.req || r.symbol !== p.symbol) return false;
      if ((p.state !== 'queued' && p.state !== 'running') || p.liveDead) return false;
      const d = p.display;
      if (r.live === 'on') {
        const fresh = r.turns.filter((t) => !p.seen.has(t.n));
        if (!fresh.length) return true;
        if (!p.session) {
          let s = null;
          try { s = deps.replay.openLive ? deps.replay.openLive({ symbol: p.symbol, display: d, relay, req: p.req, lead: TEXT.liveLead(d) }) : null; } catch (_) { s = null; }
          // 다른 재생이 도는 중 — 그 요청은 실시간 없이 끝 결과로(R14 cut과 같은 끝)
          if (!s) { p.liveDead = true; return false; }
          p.session = s;
        }
        for (const t of fresh) {
          p.seen.add(t.n);
          p.session.turn(t);
        }
        return true;
      }
      const s = takeSession(p);
      if (r.stop === 'cut') {
        if (s) {
          try { s.discard(TEXT.liveStop); } catch (_) { /* 아래 그대로 */ }
          notify(TEXT.liveStop, 'ok');
          // 거둠의 run:end에 app.js setBusy(false)가 버튼을 풀었다 — 요청은 아직 도는 중이라 다시 잠근다
          lock(true);
        }
        return true;
      }
      finish(p);
      if (s) dropLive(s, TEXT.liveFail(d));
      else { notify(TEXT.reqFailed(d), 'err'); staff('fail'); }
      return true;
    }

    // 실린 분석(없으면 가진 최신 분석)을 재생 — 둘 다 없으면 false
    function replayCarried(a0) {
      const a = a0 || (last && last.analysis);
      if (!a) return false;
      startReplay(a, { quiet: true });
      return true;
    }

    function receiveResult(raw) {
      const r = cleanResult(raw);
      const p = pending;
      if (!r || !p || p.kind !== 'request' || r.req !== p.req || r.symbol !== p.symbol) return false;
      const d = p.display;
      if (r.state === 'queued' || r.state === 'running') {
        clearT(p.timer);
        p.timer = setT(() => giveUp(p), REQ_MAX_MS);
        p.state = r.state;
        setProgress({ kind: r.state, symbol: p.symbol, display: d, ahead: r.ahead, etaSec: r.etaSec, elapsedSec: r.elapsedSec, at: now() });
        return true;
      }
      const s = takeSession(p);
      finish(p);
      if (s) {
        // 실시간 직원 말을 보인 요청(p37 §3.4·§4.5): done(분석 실림)이면 이어서 끝(같은 글 직원 건너뜀 — R13), 그 밖은 모두 거둠
        if ((r.state === 'done' || r.state === 'ready') && r.analysis) {
          setInputQuiet(r.analysis);
          // 끝 재생(continued)은 run:start를 다시 내지 않아 app.js setBusy(true)가 다시 걸리지 않는다 — 위 finish(p)가 푼 버튼을
          // 끝 재생이 끝날 때까지 다시 잠근다(그 사이 누름은 busy로 조용히 버려졌다 — 종단 확인 2026-10-09). 끝 run:end에 app.js도 푼다
          lock(true);
          s.finish(r.analysis, { lead: relay ? TEXT.relayLiveDone(d) : TEXT.liveDone(d) }).catch(() => {}).then(() => lock(false));
        } else {
          dropLive(s, r.state === 'failed' && r.reason === 'timeout' ? TEXT.liveTimeout(d) : TEXT.liveFail(d));
        }
        return true;
      }
      if (r.state === 'done' || r.state === 'ready') {
        if (!r.analysis) { notify(TEXT.reqNotNow(d), 'err'); staff('clear'); return true; }
        const at = r.analysis.at;
        const lead = r.state === 'done' ? TEXT.leadDone(d)
          : relay ? TEXT.relayLead(d, at)
          : r.reason === 'regular' ? TEXT.leadRegular(d, at) : r.reason === 'position_open' ? TEXT.leadPosition(d, at) : TEXT.leadFresh(d, at);
        startReplay(r.analysis, { quiet: true, lead });
      } else if (r.state === 'limited' || r.state === 'unavailable') {
        if (replayCarried(r.analysis)) notify(r.state === 'limited' ? TEXT.reqLimited : TEXT.reqUnavailable, 'err');
        else { notify(TEXT.reqNotNow(d), 'err'); staff('clear'); }
      } else if (r.state === 'unsupported') {
        notify(TEXT.reqUnsupported(d), 'err');
        staff('clear');
      } else if (r.state === 'busy') {
        notify(TEXT.reqBusy, 'err');
        staff('clear');
      } else {
        const why = r.reason;
        notify(why === 'timeout' ? TEXT.reqTimeout(d) : why === 'expired' || why === 'lost' || why === 'position_open' ? TEXT.reqNotNow(d) : TEXT.reqFailed(d), 'err');
        staff('fail');
      }
      return true;
    }

    function receive(raw) {
      const m = cleanMessage(raw);
      if (!m) return false;
      received = true;
      oldShell = false;
      if (oldTimer) { clearT(oldTimer); oldTimer = null; }
      last = { up: m.up, stale: m.stale, off: m.off, analysis: m.analysis, autopilot: m.autopilot, sched: m.sched, canRequest: m.canRequest };
      if (pending && pending.kind === 'ask') settle(m);
      // 2026-10-23 요청(⑥): 요청 분석 판은 누르기 전에 지난 분석 판정을 그리지 않는다(PC판처럼 '판정 대기 중'에서 시작)
      else if (relay && !request && m.analysis && m.analysis.id !== drawnId && !busy()) {
        // 중계 받음(설계 §4.2 '연출 없이 판정 하나', p35 O-5 — 새 분석이면 다시): 버스 decision으로 내지 않는다 — 가짜 EventSource를 거쳐
        // app.js onDecision이 ACE 책상(실계좌 기록 말풍선 자리)에 '최종 판정'을 찍고 stage.js 도장·색종이·hq.js 'ACE · 최종 판정' 자막까지 돈다.
        // 화면 코드가 모르는 신호(lite:analysis verdict)로 내고, ui.js가 판정 줄(hq.js setVerdict)·안내 칸만 그린다
        drawnId = m.analysis.id;
        bus.emit({ type: 'lite:analysis', kind: 'verdict', decision: { ...decisionEvent(m.analysis), replay: true } });
      }
      // 2026-10-23 사무실 2차 요청 2(실시간 중계 — '그냥 화면만 쏴주면'): 담당자판(중계·요청·실시간 판)은 셸 값의 sched가 '그 종목 분석 중'이면
      // 누가 요청하지 않은 정규 런이라도 그 종목을 한 번 요청한다 — 허브가 도는 런의 표에 합류시켜(셈 없음) 직원 말을 오는 대로 받는다.
      // 같은 런에는 다시 묻지 않고(sched.running이 거짓으로 한 번 바뀌면 다음 런), 회원 요청·재생이 도는 중이면 묻지 않는다
      if (relay && live && m.canRequest && m.up) {
        const sc = m.sched;
        if (!sc || !sc.running || !sc.runningSymbol) followArmed = true;
        else if (followArmed && !busy()) {
          followArmed = false;
          press({ symbol: sc.runningSymbol });
        }
      }
      // p37 D3: 중계 입력칸은 보이는 회원 입력칸이다 — 받은 분석 종목으로 30~60초마다 덮지 않는다
      bus.emit({ type: 'lite:analysis', kind: 'state' });
      return true;
    }

    // office-ready를 보낼 때마다 — 처음 한 번만 10초 타이머(그 안에 ptf:analysis가 한 번도 안 오면 옛 셸)
    function readySent() {
      if (received || oldShell || oldTimer) return;
      oldTimer = setT(() => {
        oldTimer = null;
        if (received) return;
        oldShell = true;
        bus.emit({ type: 'lite:analysis', kind: 'state' });
      }, OLD_MS);
    }

    return {
      press, receive, receiveResult, receiveTurns, readySent,
      view: () => {
        if (last) return { ...last, progress, request };
        // 셸 값이 아직 없는데 불러오는 중이면 그 줄만
        return progress ? { up: true, stale: false, off: false, analysis: null, autopilot: null, sched: null, canRequest: false, progress, request } : null;
      },
      isOldShell: () => oldShell,
      isBusy: busy,
    };
  }

  // 🔍 정밀 분석 클릭·입력칸 Enter를 캡처 단계에서 먼저 받는다(검토 17) — app.js analyze()는 입력칸이 비면 토스트만 띄우고 끝나므로
  // 그 길을 거치지 않고 재생 갈래를 직접 부른다. 한글 조합 중 Enter는 그대로 둔다
  function wireAnalyzeButton(doc, onPress) {
    if (!doc || typeof doc.addEventListener !== 'function') return null;
    const stop = (e) => {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    const onClick = (e) => {
      const t = e && e.target;
      const btn = t && typeof t.closest === 'function' ? t.closest('#analyze-btn') : null;
      if (!btn) return;
      stop(e);
      if (btn.disabled) return;
      onPress();
    };
    const onKey = (e) => {
      if (!e || e.key !== 'Enter' || e.isComposing) return;
      const t = e.target;
      if (!t || t.id !== 'symbol-input') return;
      stop(e);
      onPress();
    };
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    return { onClick, onKey };
  }

  // ---- 비활성화 담당자판 사무실의 분석 버튼 둘(대표 결정 2026-10-24 — 동업자판 public/app.js v1.5 체험 모드와 같은 글자·동작) ----
  // m/(relay_capable)이 셸 안에서 중계가 아닐 때(= s·j판 UID 비활성화 기기): '🔍 체험 분석'(데모 엔진 — 공개 시세 지표 규칙 판정과 직원 연출,
  // 셸·허브·우리 앱 분석 요청 없음) + '🔒 정밀 분석'(누르면 토스트 + 셸에 ptf:open-verify → UID 활성화 화면). 입력칸 Enter도 동업자처럼 잠김 쪽.
  // 활성화(중계 &relay=1)되면 지금처럼 '🔍 정밀 분석' 하나. 공용판(pub/)은 UID 활성화가 없는 판이라 그대로(데모·무료 횟수)
  const SPLIT = Object.freeze({
    quick: '🔍 체험 분석',
    quickBusy: '🔍 분석 중…',
    quickTitle: '실시간 차트 지표로 13명이 분석 · 클로드 불필요',
    locked: '🔒 정밀 분석',
    lockedTitle: '오렌지엑스 UID 활성화 후 · AI 정밀 분석',
    lockedToast: '정밀 분석(AI)은 오렌지엑스 UID 활성화 후 사용할 수 있습니다',
  });
  const OPEN_VERIFY = Object.freeze({ type: 'ptf:open-verify', v: 1 });

  function splitOn(cfg, { relay, port, kiosk }) {
    return !!(cfg && cfg.relayCapable === true) && !relay && !!port && !kiosk;
  }

  // deps: { bus, demo(데모 엔진), quota, port, lev(), notify(m, kind), readSymbol() }
  function createSplit(deps) {
    const { bus, demo, quota, port } = deps;
    let view = null;
    bus.subscribe((ev) => {
      if (!view || !ev) return;
      if (ev.type === 'run:start') view.busy(true);
      else if (ev.type === 'run:end') view.busy(false);
    });
    function quick() {
      if (!demo || demo.isRunning()) return 'busy';
      if (quota && quota.left() <= 0) {
        bus.emit({ type: 'lite:limit', limit: quota.limit });
        return 'limit';
      }
      const raw = String(deps.readSymbol() || '').trim();
      demo.run(raw || 'BTC', { mode: 'scalp', lev: deps.lev() }).catch(() => {});
      return 'demo';
    }
    function locked() {
      try { deps.notify(SPLIT.lockedToast, 'err'); } catch (_) { /* 토스트를 못 띄워도 안내 화면은 연다 */ }
      if (port) port.post({ ...OPEN_VERIFY });
      return 'locked';
    }
    // 버튼 모양 — public/index.html은 고치지 않으므로 여기서 만든다(textContent만)
    function mount(doc) {
      const ab = doc && doc.querySelector('#analyze-btn');
      if (!ab || !ab.parentNode) return null;
      let qb = doc.querySelector('#quick-btn');
      if (!qb) {
        qb = doc.createElement('button');
        qb.id = 'quick-btn';
        qb.type = 'button';
        ab.parentNode.insertBefore(qb, ab);
      }
      qb.textContent = SPLIT.quick;
      qb.title = SPLIT.quickTitle;
      ab.textContent = SPLIT.locked;
      ab.title = SPLIT.lockedTitle;
      ab.classList.add('btn-locked');
      try { doc.documentElement.classList.add('lite-split'); } catch (_) { /* 모양만 */ }
      view = {
        busy(on) {
          qb.disabled = !!on;
          qb.textContent = on ? SPLIT.quickBusy : SPLIT.quick;
        },
      };
      return view;
    }
    return { quick, locked, mount };
  }

  // 캡처 단계에서 먼저 받는다(wireAnalyzeButton과 같은 까닭 — app.js analyze()·재생 갈래로 가지 않게)
  function wireSplitButtons(doc, { onQuick, onLocked }) {
    if (!doc || typeof doc.addEventListener !== 'function') return null;
    const stop = (e) => {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };
    const onClick = (e) => {
      const t = e && e.target;
      if (!t || typeof t.closest !== 'function') return;
      const qb = t.closest('#quick-btn');
      if (qb) {
        stop(e);
        if (!qb.disabled) onQuick();
        return;
      }
      const ab = t.closest('#analyze-btn');
      if (!ab) return;
      stop(e);
      if (!ab.disabled) onLocked();
    };
    const onKey = (e) => {
      if (!e || e.key !== 'Enter' || e.isComposing) return;
      const t = e.target;
      if (!t || t.id !== 'symbol-input') return;
      stop(e);
      onLocked();
    };
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    return { onClick, onKey };
  }

  return {
    SPLIT, OPEN_VERIFY, splitOn, createSplit, wireSplitButtons,
    ANALYSIS_KEYS, NEWS_KEYS, TURN_KEYS, AUTOPILOT_KEYS, MESSAGE_KEYS, SCHED_KEYS, RESULT_KEYS, RESULT_STATES, RESULT_REASONS, STAFF_IDS, KINDS, MODES, LIMITS, TEXT, STAGE,
    LIVE_IDS, RELAY_LIVE_IDS, LIVE_N_MAX, LIVE_TURN_KEYS, TURNS_KEYS, LIVE_GAP_MS,
    mdhm, agoText, etaText, mmss, cleanText, cleanAnalysis, cleanAutopilot, cleanSched, cleanMessage, cleanResult, cleanTurns, demoPlan, lineParts, stagesOf, decisionEvent,
    createReplayEngine, createController, wireAnalyzeButton,
  };
});
