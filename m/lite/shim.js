/* PIXEL TRADING FLOOR 체험판 — 서버 흉내
   app.js·hq.js가 부르는 /api/*를 가로채 LiteEngine·LitePaper로 답하고,
   EventSource('/api/stream')를 이벤트 버스 구독으로 바꾼다. 없는 기능은 "풀버전 전용" 404.
   index.html에서 app.js보다 먼저 로드돼야 한다(build.js가 순서를 보장).
   ?shell=1(모바일 앱 사무실 탭)이면 부모 창에 무료 분석 사용 횟수를 알린다(ptf:trial).
   LITE_CONFIG.fullOnly(모바일 앱 공용판 사무실)가 있으면 직접 누른 실제 버전 기능에 lite:full 신호 → ui.js 안내 창.
   모바일 앱 사무실(다른 출처, ptf-mobile 설계 3-2 §4.2·§4.3): LITE_CONFIG.shellOrigin이 있으면 ptf:trial·ptf:office-ready·ptf:open을
   그 출처로만 보내고 그 출처의 부모 창 메시지(ptf:trial-seed, 중계 ptf:relay-*)만 받는다. storageNs면 저장 키 앞에 'ptfm:' 같은 이름.
   ?shell=1&relay=1 + relayCapable이면 중계 모드 — LITE.paper 자리에 LiteRelay(읽기 전용), 분석 엔진·무료 횟수 없음.
   ?shell=1이면 window.open·다운로드(a.download)를 감싼다(wireShellPopups) — 바깥 주소는 ptf:open, 같은 출처 페이지·다운로드는 안내 토스트.
   LITE_CONFIG.analysisReplay(담당자판 m/, ptf-mobile p34 설계 §3·§4)면 셸의 ptf:analysis(리치 서버 AI 최신 분석)를 받아 두고, 🔍 정밀 분석(데모·중계 같음)·
   POST /api/analyze를 모두 재생 갈래(analysis.js createController)로 보낸다. ptf:office-ping을 받으면 office-ready를 다시, load 약 1초 뒤에도 한 번 더.
   LITE_CONFIG.analysisRequest(p35 요청 분석 B안)면 고른 종목으로 셸에 ptf:analysis-request를 보내고 셸의 ptf:analysis-result를 그 갈래로 넘긴다.
   LITE_CONFIG.analysisLive(p37 실시간 직원 말 D4)면 셸의 ptf:analysis-turns(요청 분석이 도는 동안 말을 마친 직원 말)도 그 갈래(receiveTurns)로.
   LITE_CONFIG.paperTrading === false(site.json paper_trading:false — 대표 결정 2026-10-12, 개인 코드 사무실 m/)면 모의 계좌 자리에 LitePaper.createNone(),
   html.no-paper, 데모 엔진·재생 엔진은 모의 포지션을 열지 않는다(판정만). 모드는 하나(스캘핑 길 'scalp') — 누르는 갈래·POST /api/analyze의 mode는 읽지 않는다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteShim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 칩 글자가 그대로 입력칸에 들어가 분석된다 — 한글 이름도 data.js가 바이낸스 무기한 심볼로 바꾼다
  const WATCHLIST = ['BTC', 'ETH', 'SOL', 'TSLA', 'NVDA', '삼성전자', '하이닉스', '금'];
  const FULL_ONLY = 'AI 실제 버전 기능입니다 — 텔레그램 자료실에서 받으세요';
  const LEV_KEY = 'pixel-lite-lev';
  const RUNS_KEY = 'pixel-lite-runs-v1';
  const TRIAL_RUNS = 3;
  // 중계 모드에서 막는 요청의 안내 — 포지션 닫기·그 밖의 막힌 경로는 relay.js TEXT.noFeature, 분석 요청(재생 갈래가 없을 때)은 TEXT.noAnalyze(O-04)
  // 와 같은 문장 (p34 설계 §4.2 — 검토 31: 분석은 이제 재생하므로 "분석을 실행할 수 없습니다"를 다른 기능 안내에 쓰지 않는다)
  const RELAY_OFF = '실계좌 기록 중계 중에는 이 기능을 쓸 수 없습니다';
  const RELAY_NO_ANALYZE = '실계좌 기록 중계 중에는 분석을 실행할 수 없습니다';
  // 중계 모드의 분석 엔진 자리 — 분석을 만들지 않는다(app.js·life.js·ui.js는 isRunning만 본다)
  const RELAY_ENGINE = Object.freeze({ isRunning: () => false, run: () => Promise.resolve() });
  // 체험 끝 안내 — trial_cta(모바일 앱 공용판 사무실)가 있으면 그 문구, 없으면 자료실 안내(소개 페이지 동작 그대로)
  function trialDoneText(n, cta) {
    const tail = cta && typeof cta.message === 'string' && cta.message ? cta.message : 'AI 실제 버전은 텔레그램 자료실에서 받으세요';
    return `무료 분석 ${n}회를 모두 썼습니다 — ${tail}`;
  }

  // 실제 버전 전용 기능 중 사용자가 직접 누른 것 — 쓰기 요청(급변동 감시·자동 운영 저장 등)·리플레이·리포트 열기.
  // 화면이 알아서 부르는 조회(감시 상태·리포트 목록·전광판·호스트 정보)는 아니다 — 그건 조용히 404(app.js가 기능을 숨긴다)
  function isFullOnlyAction(method, p) {
    return method !== 'GET' || p === '/api/replay' || p === '/reports' || p.startsWith('/reports/');
  }

  // 무료 분석 횟수 — 모의 포지션이 실제로 열린 분석만 센다(wireQuota). 이 브라우저에 저장(막히면 메모리).
  // 다른 탭(소개 페이지 속 화면 ↔ 단독 화면)과 나눠 쓰도록 매번 저장소를 다시 읽는다.
  function createQuota(opts = {}) {
    const limit = opts.limit > 0 ? Math.round(opts.limit) : TRIAL_RUNS;
    let storage = opts.storage || null;
    let mem = 0;
    const read = () => {
      if (storage) {
        try {
          const v = Number(storage.getItem(RUNS_KEY));
          if (Number.isFinite(v) && v > 0) mem = Math.max(mem, Math.floor(v));
        } catch (_) { storage = null; }
      }
      return mem;
    };
    return {
      limit,
      used: read,
      left: () => Math.max(0, limit - read()),
      use() {
        mem = read() + 1;
        try { if (storage) storage.setItem(RUNS_KEY, String(mem)); } catch (_) { storage = null; }
        return mem;
      },
      // 셸(모바일 앱)이 기억한 사용 횟수(ptf:trial-seed) — 이 창 값보다 클 때만 올린다(줄어드는 값·숫자 아닌 값은 무시).
      // iOS는 다른 출처 iframe 저장소를 앱을 닫을 때 지울 수 있어 셸 값이 기준이다(설계 §4.2)
      seed(n) {
        const v = Math.floor(Number(n));
        if (Number.isFinite(v) && v > read()) {
          mem = v;
          try { if (storage) storage.setItem(RUNS_KEY, String(mem)); } catch (_) { storage = null; }
        }
        return read();
      },
    };
  }

  // 모의 포지션이 실제로 열린 분석만 센다 — 관망·보류(이미 보유)·시세 오류는 무료 횟수를 쓰지 않는다.
  // 모의 매매가 없는 빌드(paperOn false — site.json paper_trading:false)는 포지션이 없으니 데모 엔진이 판정까지 간 분석을 센다(분석 재생은 세지 않음 — 지금처럼)
  function quotaEvent(ev, paperOn = true) {
    if (!ev) return false;
    if (paperOn) return ev.type === 'position' && ev.action === 'open';
    return ev.type === 'decision' && !ev.replay;
  }
  function wireQuota(bus, quota, paperOn = true) {
    return bus.subscribe((ev) => { if (quotaEvent(ev, paperOn)) quota.use(); });
  }

  // 모바일 앱(ptf-mobile) 사무실 탭(?shell=1) — 부모 창에 무료 분석 사용 횟수를 알린다. 처음 뜰 때 + 횟수가 깎일 때마다.
  // 받는 출처: origin(shell_origin — 사무실이 다른 출처로 옮겨 간 3-2 §4.2)이 있으면 그 출처, 없으면 지금처럼 같은 출처.
  // 앱 껍데기는 이 메시지만 믿고 used ≥ limit > 0이면 신청 버튼을 보인다(3-1 설계 §6·§7.3)
  function createTrialReporter(win, quota, origin) {
    let shell = false;
    try { shell = new URLSearchParams(win.location.search).get('shell') === '1'; } catch (_) { shell = false; }
    let parent = null;
    try { parent = win.parent; } catch (_) { parent = null; }
    if (!shell || !parent || parent === win || typeof parent.postMessage !== 'function') return null;
    return {
      report() {
        const msg = { type: 'ptf:trial', used: quota ? quota.used() : 0, limit: quota ? quota.limit : 0 };
        try { parent.postMessage(msg, origin || win.location.origin); } catch (_) { /* 부모가 못 받아도 데모는 계속 */ }
        return msg;
      },
    };
  }

  // wireQuota 다음에 불러야 한다 — 같은 position open에서 횟수를 먼저 깎고 알린다(버스는 구독 순서대로 부른다).
  // 사무실 창 load 때 한 번 더 보낸다 — 부모(앱 껍데기)가 수신을 늦게 걸었어도 받게(같은 값을 다시 보내도 무해)
  function wireTrialReport(bus, reporter, win, paperOn = true) {
    if (!reporter) return () => {};
    reporter.report();
    try {
      if (win && typeof win.addEventListener === 'function' && !(win.document && win.document.readyState === 'complete')) {
        win.addEventListener('load', () => reporter.report(), { once: true });
      }
    } catch (_) { /* load를 못 걸어도 처음·분석마다 알림은 그대로 */ }
    return bus.subscribe((ev) => { if (quotaEvent(ev, paperOn)) reporter.report(); });
  }

  // ---- 모바일 앱 셸 규약(설계 3-2 §4.2·§4.3) — 사무실이 다른 출처(richtradingschool.github.io/ptf-office/)로 옮겨 간 뒤 ----

  // 저장 키 앞붙임 — storage_ns가 있으면 'ptfm:pixel-lite-paper-v1'처럼. 없으면 키·저장소 그대로
  function nsKey(ns, key) {
    return ns ? `${ns}:${key}` : key;
  }
  function nsStorage(storage, ns) {
    if (!storage) return null;
    if (!ns) return storage;
    return {
      getItem: (k) => storage.getItem(nsKey(ns, k)),
      setItem: (k, v) => storage.setItem(nsKey(ns, k), v),
      removeItem: (k) => storage.removeItem(nsKey(ns, k)),
    };
  }

  // 주소·설정으로 정하는 셸 관계 — 중계 모드는 shell=1·relay=1·relay_capable·shell_origin·iframe 안이 모두 맞을 때만
  function shellParams(win, cfg) {
    let q = null;
    try { q = new URLSearchParams(win.location.search); } catch (_) { q = null; }
    const c = cfg || {};
    const shell = !!q && q.get('shell') === '1';
    const relay = !!q && q.get('relay') === '1';
    const origin = typeof c.shellOrigin === 'string' && c.shellOrigin ? c.shellOrigin : null;
    const capable = c.relayCapable === true;
    let parent = null;
    try { parent = win.parent; } catch (_) { parent = null; }
    const framed = !!parent && parent !== win && typeof parent.postMessage === 'function';
    return { shell, relay, capable, origin, framed, relayMode: shell && relay && capable && !!origin && framed };
  }

  // 셸로 보내는 창구 — 목적지는 늘 shell_origin('*' 금지). shell=1·iframe 안·shell_origin이 있어야 만든다
  function createShellPort(win, sp) {
    if (!sp || !sp.shell || !sp.origin || !sp.framed) return null;
    return {
      origin: sp.origin,
      post(msg) {
        try { win.parent.postMessage(msg, sp.origin); return true; } catch (_) { return false; }
      },
    };
  }

  // 사무실 준비 알림 — 데모 부팅 끝(DOMContentLoaded: 화면 코드가 모두 버스를 구독한 뒤)과 load 때, 그리고 load 약 1초 뒤 한 번 더.
  // 셸은 이 알림을 받고서야 무료 횟수 seed·중계 상태·분석을 보낸다(그래서 메시지 수신기는 이보다 먼저 건다).
  // 1초 뒤 한 번 더(p34 설계 §3.2, 검토 1): 셸은 iframe load마다 준비를 풀고 ptf:office-ping을 보낸다 — 자식 load 처리 안의 알림이 부모의
  // iframe load보다 먼저 처리돼 준비가 풀린 채 남는 경합에서, 핑을 놓쳐도 다시 준비되게 하는 받침. onSend: 보낼 때마다(옛 셸 판정 타이머)
  function wireOfficeReady(win, sp, port, onSend) {
    if (!port) return null;
    const send = () => {
      port.post({ type: 'ptf:office-ready', v: 1, relay: sp.relay, capable: sp.capable, path: String((win.location && win.location.pathname) || '') });
      if (typeof onSend === 'function') { try { onSend(); } catch (_) { /* 알림은 이미 보냈다 */ } }
    };
    const later = () => { if (typeof win.setTimeout === 'function') win.setTimeout(send, 1000); };
    let state = 'complete';
    try { state = win.document.readyState; } catch (_) { state = 'complete'; }
    try {
      if (state === 'loading') win.document.addEventListener('DOMContentLoaded', send, { once: true });
      else send();
      if (state !== 'complete') win.addEventListener('load', () => { send(); later(); }, { once: true });
      else later();
    } catch (_) { send(); }
    return send;
  }

  // 셸 메시지 수신 — shell_origin에서 부모 창(window.parent)이 보낸 v:1 메시지만.
  // ptf:trial-seed는 무료 횟수를 셸 값까지 올리고(줄이지 않음), ptf:relay-*는 중계 모드일 때만 relay에 넣는다
  // (모르는 키·형식 밖 값은 relay.js가 버린다). ptf:office-ping(셸이 iframe load마다 — 내용 없음)이면 office-ready를 다시(deps.ready),
  // ptf:analysis(리치 서버 AI 최신 분석)는 analysisReplay 사무실의 재생 갈래(deps.analysis)만 받는다(모양 검사는 analysis.js)
  function wireShellMessages(win, sp, deps) {
    if (!sp || !sp.shell || !sp.origin || !sp.framed || typeof win.addEventListener !== 'function') return null;
    const onMessage = (ev) => {
      if (!ev || ev.origin !== sp.origin || ev.source !== win.parent) return;
      const d = ev.data;
      if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1 || typeof d.type !== 'string') return;
      if (d.type === 'ptf:office-ping') {
        if (typeof deps.ready === 'function') deps.ready();
        return;
      }
      if (d.type === 'ptf:analysis') {
        if (deps.analysis) deps.analysis.receive(d);
        return;
      }
      // 요청 분석 결과(p35 §7.2) — 모양·(req, symbol) 확인은 analysis.js receiveResult
      if (d.type === 'ptf:analysis-result') {
        if (deps.analysis && typeof deps.analysis.receiveResult === 'function') deps.analysis.receiveResult(d);
        return;
      }
      // 실시간 직원 말(p37 §3.4) — 같은 확인(셸 출처·부모 창·v:1) 뒤 모양·(req, symbol)·analysisLive 확인은 analysis.js receiveTurns.
      // 중계 갈래보다 앞이라 데모·중계 둘 다
      if (d.type === 'ptf:analysis-turns') {
        if (deps.analysis && typeof deps.analysis.receiveTurns === 'function') deps.analysis.receiveTurns(d);
        return;
      }
      // 수익 알림(2026-10-23 요청 ⑤) — 같은 확인(셸 출처·부모 창) 뒤 모양 검사는 gains.js. 패널이 아직 없으면 마지막 하나를 맡겨 둔다
      if (d.type === 'ptf:gains') {
        const L = win.LITE || null;
        if (L && L.gains && typeof L.gains.receive === 'function') L.gains.receive(d);
        else if (L) L.pendingGains = d;
        return;
      }
      // 진입 참고가 값(2026-10-23 사무실 2차 요청 4 — 그 판 follow-rules 회원 기본값) — 모양 검사는 entryref.js. 패널이 아직 없으면 맡겨 둔다
      if (d.type === 'ptf:entry-ref') {
        const L = win.LITE || null;
        if (L && L.entryRef && typeof L.entryRef.receive === 'function') L.entryRef.receive(d);
        else if (L) L.pendingEntryRef = d;
        return;
      }
      // 체험 남은 횟수(대표 결정 2026-10-30 — 비활성화 사무실 맨 아래 띠) — 같은 확인(셸 출처·부모 창·v:1) 뒤 꼴 검사는 analysis.js cleanTrialLeft.
      // 체험 판 split만 받는다(중계·공용판·옛 판은 split이 없거나 체험이 없어 버림)
      if (d.type === 'ptf:trial-left') {
        if (deps.split && typeof deps.split.setLeft === 'function') deps.split.setLeft(d);
        return;
      }
      if (d.type === 'ptf:trial-seed') {
        if (deps.quota && Number.isInteger(d.used) && d.used >= 0) {
          deps.quota.seed(d.used);
          deps.bus.emit({ type: 'lite:quota' });
        }
        return;
      }
      const relay = sp.relayMode ? deps.relay : null;
      if (!relay) return;
      if (d.type === 'ptf:relay-state') {
        if (relay.applyState(d)) deps.bus.emit({ type: 'lite:relay', kind: 'state' });
      } else if (d.type === 'ptf:relay-event') {
        const r = relay.applyEvent(d.event);
        if (!r) return;
        if (r.action) deps.bus.emit({ type: 'position', action: r.action, position: r.position });
        deps.bus.emit({ type: 'lite:relay', kind: 'event', event: r.event });
      } else if (d.type === 'ptf:relay-link') {
        if (relay.setLink(d)) deps.bus.emit({ type: 'lite:relay', kind: 'link' });
      }
    };
    win.addEventListener('message', onMessage);
    return onMessage;
  }

  // 바깥 링크 — sandbox iframe(allow-popups 없음)은 새 창을 못 연다. 새 창(target=_blank)·다른 출처 http(s) 링크는
  // 열지 않고 셸에 ptf:open으로 부탁한다(셸은 허용 목록과 정확히 같은 주소만 연다). 같은 출처 이동은 그대로
  function linkTarget(a, here) {
    if (!a || typeof a.getAttribute !== 'function') return null;
    const raw = a.getAttribute('href');
    if (!raw) return null;
    let u = null;
    let base = null;
    try {
      u = new URL(raw, here);
      base = new URL(here);
    } catch (_) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (a.getAttribute('target') !== '_blank' && u.origin === base.origin) return null;
    return u.href;
  }
  function wireOpenLinks(win, port) {
    if (!port || !win.document || typeof win.document.addEventListener !== 'function') return null;
    const onClick = (e) => {
      const t = e && e.target;
      const a = t && typeof t.closest === 'function' ? t.closest('a[href]') : null;
      const url = linkTarget(a, win.location.href);
      if (!url) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      port.post({ type: 'ptf:open', v: 1, url });
    };
    win.document.addEventListener('click', onClick, true);
    return onClick;
  }

  // ---- 셸 사무실 새 창·다운로드 감싸기(?shell=1) ----
  // 모바일 앱 사무실은 sandbox iframe(allow-popups·allow-downloads 없음)이라 window.open(app.js 보고서 알림 토스트·성적표,
  // hq.js 녹화 창)은 null을 받고 a.download(판정 카드 PNG·CSV)는 무시돼 버튼이 조용히 죽는다. public/은 고치지 않으므로 여기서 감싼다:
  // 다른 출처 http(s) 주소는 셸 규약 ptf:open으로 셸에 부탁하고(허용 목록은 셸 쪽), 같은 출처 페이지·다운로드·셸 출처가 없는 경우는
  // 안내 토스트. 데모가 직접 새 창·내려받기를 열지 않는다. 빌드가 LITE_CONFIG.shellPopups = "wrapped"로 표시한다(ptf-mobile --strict 관문)
  const POPUP_BLOCKED = '휴대폰 앱에서는 열 수 없는 기능입니다 — PC 버전에서 이용해 주세요';
  function popupTarget(raw, here) {
    if (raw == null || raw === '') return null;
    let u = null;
    let base = null;
    try {
      u = new URL(String(raw), here);
      base = new URL(here);
    } catch (_) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.origin === base.origin) return null;
    return u.href;
  }
  function wireShellPopups(win, sp, port, notify) {
    if (!sp || !sp.shell) return null;
    const blocked = () => { try { notify(POPUP_BLOCKED); } catch (_) { /* 토스트를 못 띄워도 새 창은 열지 않는다 */ } };
    const here = () => String((win.location && win.location.href) || '');
    const isDownload = (a) => !!a && typeof a.hasAttribute === 'function' && a.hasAttribute('download');
    win.open = function shellOpen(url) {
      const ext = popupTarget(url, here());
      if (ext && port) port.post({ type: 'ptf:open', v: 1, url: ext });
      else blocked();
      return null;
    };
    // 화면 코드가 만든 a.download를 click()으로 누르는 길(downloadCanvas — 문서에 안 붙인 링크도 잡히게 원형을 감싼다)
    const A = win.HTMLAnchorElement && win.HTMLAnchorElement.prototype;
    if (A && typeof A.click === 'function') {
      const click = A.click;
      A.click = function () {
        if (isDownload(this)) { blocked(); return undefined; }
        return click.apply(this, arguments);
      };
    }
    // 사람이 누른 다운로드 링크 — ptf:open 링크 수신기(wireOpenLinks)보다 먼저 건다
    const onClick = (e) => {
      const t = e && e.target;
      const a = t && typeof t.closest === 'function' ? t.closest('a[download]') : null;
      if (!isDownload(a)) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      blocked();
    };
    if (win.document && typeof win.document.addEventListener === 'function') win.document.addEventListener('click', onClick, true);
    return { open: win.open, onClick };
  }

  // app.js·hq.js로 가는 SSE 흉내 — 중계 모드에서 position 이벤트는 'ledger'(포지션 다시 읽기)로만 넘긴다.
  // hq.js는 position마다 진입 보고(호칭·배율 문장)를, app.js는 "가상 포지션" 토스트를 띄우기 때문(public/은 고치지 않는다).
  // 차트·시세·말풍선(chart·live·ui.js)은 버스에서 position 이벤트를 그대로 받는다
  function sseView(ev, relay) {
    return relay && ev && ev.type === 'position' ? { type: 'ledger' } : ev;
  }

  // 레버리지 — 방문자가 고른 값은 저장, 시연 화면(fixedLev)은 늘 같은 배율이고 방문자 설정을 건드리지 않는다
  function createSettings(storage, opts = {}) {
    const ok = (v) => v >= 1 && v <= 125;
    let mem = null;
    return {
      get lev() {
        if (opts.fixedLev) return opts.fixedLev;
        if (mem != null) return mem;
        let v = 20;
        try { const s = storage && storage.getItem(LEV_KEY); if (s) v = Math.round(Number(s)); } catch (_) { /* 저장소 막힘 */ }
        return ok(v) ? v : 20;
      },
      set lev(v) {
        if (opts.fixedLev) return;
        const n = Math.round(Number(v));
        mem = ok(n) ? n : 20;
        try { if (storage) storage.setItem(LEV_KEY, String(mem)); } catch (_) { /* 저장소 막힘 */ }
      },
    };
  }

  function createRouter(ctx) {
    const json = (status, body) => ({ status, body });
    async function route(method, path, body) {
      const p = String(path).split('?')[0];
      // 비활성화 담당자판(대표 결정 2026-10-24): 어느 길로 와도 정밀 분석은 잠김 — 재생·셸 요청을 일으키지 않는다(체험 분석은 버튼으로만)
      if (ctx.split && method === 'POST' && p === '/api/analyze') {
        ctx.split.locked();
        return json(202, { ok: false, code: 'UID_GATE' });
      }
      // 분석 다시 보기(analysisReplay — 담당자판 사무실 m/, p34 설계 §4.1): 어느 길로 와도(버튼·엔터·워치리스트 칩) 같은 재생 갈래.
      // 새로 분석하지 않는다 — 받은 최신 분석을 재생하거나, 없으면 데모 엔진(데모)·토스트(중계)
      if (ctx.analysis && method === 'POST' && p === '/api/analyze') {
        const b = body || {};
        const r = ctx.analysis.press({ symbol: typeof b.symbol === 'string' ? b.symbol : '', mode: b.mode });
        if (r === 'busy') return json(409, { ok: false, error: '이미 분석이 진행 중입니다.' });
        if (r === 'limit') return json(202, { ok: false, code: 'TRIAL_LIMIT', error: trialDoneText(ctx.quota ? ctx.quota.limit : 0, ctx.trialCta) });
        return json(202, { ok: true });
      }
      // 중계 모드는 읽기 전용 — 분석을 만들지 않고 실계좌 포지션을 닫지 않는다(숨긴 버튼·엔터·워치리스트 칩 어디서 와도)
      if (ctx.relay && method === 'POST' && p === '/api/analyze') return json(200, { ok: false, code: 'RELAY', error: RELAY_NO_ANALYZE });
      if (ctx.relay && method === 'POST' && p === '/api/positions/close') return json(404, { ok: false, error: RELAY_OFF });
      if (method === 'GET' && p === '/api/config') {
        return json(200, { ok: true, watchlist: WATCHLIST.slice(), watcher: { enabled: false, intervalSec: 60 }, ui: { sound: true } });
      }
      if (method === 'GET' && p === '/api/tape') {
        let tape = [];
        try { tape = await ctx.data.fetchTape({ fetch: ctx.fetchImpl || undefined }); } catch (_) { tape = []; }
        return json(200, tape);
      }
      if (method === 'GET' && p === '/api/positions') return json(200, ctx.paper.snapshot());
      if (method === 'POST' && p === '/api/positions/close') {
        const id = body && body.id;
        const pos = id ? ctx.paper.getOpen(id) : null;
        if (!pos) return json(404, { ok: false, error: '열린 포지션을 찾지 못했습니다' });
        let price = pos.lastPrice;
        try { price = await ctx.data.fetchPrice(pos.symbol, { fetch: ctx.fetchImpl || undefined, axis: pos.axis }); } catch (_) { /* 마지막 평가가로 */ }
        const done = ctx.paper.closeManual(id, price);
        ctx.bus.emit({ type: 'position', action: 'close', position: done });
        return json(200, { ok: true, position: done });
      }
      if (method === 'GET' && p === '/api/autopilot') {
        return json(200, {
          ok: true,
          config: { enabled: false, ai: false, intervalMin: 30, mode: 'scalp', model: 'rule', maxOpen: 3, symbols: [], settle: true, reports: true, officeLife: true },
          risk: { leverage: ctx.settings.lev, maintenanceMarginPct: 0.5, feePct: 0 },
          running: ctx.engine.isRunning(), nextRunAt: null, lastRun: null, lastSkip: null, cyclesToday: 0, estCallsPerHour: 0, callsPerRun: 0,
        });
      }
      if (method === 'POST' && p === '/api/analyze') {
        if (ctx.engine.isRunning()) return json(409, { ok: false, error: '이미 분석이 진행 중입니다.' });
        if (ctx.quota && ctx.quota.left() <= 0) {
          // app.js는 2xx가 아니면 "요청 실패 (코드)" 토스트만 띄운다 — 조용히 받고 안내 창은 ui.js가 이 신호로 연다
          ctx.bus.emit({ type: 'lite:limit', limit: ctx.quota.limit });
          return json(202, { ok: false, code: 'TRIAL_LIMIT', error: trialDoneText(ctx.quota.limit, ctx.trialCta) });
        }
        const b = body || {};
        const lev = Math.round(Number(b.leverage));
        if (lev >= 1 && lev <= 125) ctx.settings.lev = lev;
        ctx.engine.run(b.symbol, { mode: b.mode, lev: ctx.settings.lev }).catch(() => {});
        return json(202, { ok: true });
      }
      if (ctx.relay) return json(404, { ok: false, error: RELAY_OFF }); // 중계 모드: 없는 기능은 FULL_ONLY 대신 O-04
      // full_only(모바일 앱 공용판 사무실) — 직접 누른 실제 버전 기능이면 ui.js가 lite:full 신호로 안내 창을 연다
      if (ctx.fullOnly && ctx.fullOnly.message) {
        if (isFullOnlyAction(method, p)) ctx.bus.emit({ type: 'lite:full', path: p });
        return json(404, { ok: false, error: ctx.fullOnly.message });
      }
      return json(404, { ok: false, error: FULL_ONLY });
    }
    return { route };
  }

  function install(win, ctx) {
    const origFetch = win.fetch.bind(win);
    ctx.fetchImpl = origFetch;
    const router = createRouter(ctx);
    const here = new URL(win.location.href);
    const ours = (u) => u.origin === here.origin
      && (u.pathname.startsWith('/api/') || u.pathname === '/reports' || u.pathname.startsWith('/reports/') || u.pathname === '/stats');

    win.fetch = async function liteFetch(input, init) {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      let u = null;
      try { u = new URL(url, win.location.href); } catch (_) { u = null; }
      if (!u || !ours(u)) return origFetch(input, init);
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      let body = null;
      if (init && typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (_) { body = null; }
      }
      const r = await router.route(method, u.pathname + u.search, body);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    };

    const OrigES = win.EventSource;
    function LiteEventSource(url) {
      let u = null;
      try { u = new URL(url, win.location.href); } catch (_) { u = null; }
      if (!(u && u.origin === here.origin && u.pathname === '/api/stream') && OrigES) return new OrigES(url);
      this.url = String(url);
      this.readyState = 1;
      this.onmessage = null;
      this.onerror = null;
      this.onopen = null;
      this._listeners = [];
      const self = this;
      this._off = ctx.bus.subscribe((ev) => {
        if (self.readyState !== 1) return;
        const msg = { data: JSON.stringify(sseView(ev, !!ctx.relay)) };
        if (typeof self.onmessage === 'function') self.onmessage(msg);
        self._listeners.forEach((fn) => fn(msg));
      });
    }
    LiteEventSource.prototype.addEventListener = function (type, fn) { if (type === 'message') this._listeners.push(fn); };
    LiteEventSource.prototype.removeEventListener = function (type, fn) { this._listeners = this._listeners.filter((x) => x !== fn); };
    LiteEventSource.prototype.close = function () { this.readyState = 2; if (this._off) this._off(); };
    win.EventSource = LiteEventSource;

    async function applyCandles(symbol, candles) {
      const done = ctx.paper.settle(symbol, candles);
      for (const p of done) ctx.bus.emit({ type: 'position', action: 'close', position: p });
      return done;
    }
    let ticking = false;
    async function settleTick() {
      if (ticking) return;
      ticking = true;
      try {
        for (const s of ctx.paper.openSymbols()) {
          try {
            const candles = await ctx.data.fetchMinuteCandles(s.symbol, s.from, { fetch: origFetch, axis: s.axis });
            await applyCandles(s.symbol, candles);
          } catch (_) { /* 잠깐 끊기면 다음 틱에 */ }
        }
      } finally {
        ticking = false;
      }
    }
    return { applyCandles, settleTick, router };
  }

  // 브라우저 자동 부팅
  function boot(win) {
    const cfg = win.LITE_CONFIG || {};
    const kiosk = new URLSearchParams(win.location.search).get('kiosk') === '1';
    let raw = null;
    try { raw = win.localStorage; } catch (_) { raw = null; }
    // storage_ns(모바일 앱 사무실 'ptfm') — 같은 출처 소개 페이지의 데모 계좌·횟수·배율과 섞이지 않게 키 앞에 붙인다. 없으면 지금 그대로
    const storage = nsStorage(raw, cfg.storageNs);
    const sp = shellParams(win, cfg);
    // 중계 모드 — 모의 계좌 자리에 중계(읽기 전용). 화면 코드보다 먼저 html.relay(lite.css가 분석 입력·잔고판을 숨긴다)
    const relay = sp.relayMode && win.LiteRelay ? win.LiteRelay.create() : null;
    if (relay) {
      try { win.document.documentElement.classList.add('relay'); } catch (_) { /* ui.js가 한 번 더 붙인다 */ }
    }
    // 모의 매매(site.json paper_trading → LITE_CONFIG.paperTrading, 기본 true). false면 모의 계좌 자리에 빈 자리(LitePaper.createNone) —
    // 데모 분석·분석 재생이 포지션을 열지 않고, lite.css(html.no-paper)가 잔고판·포지션 칸을 숨긴다(대표 결정 2026-10-12, 모바일 앱 개인 코드 사무실 m/)
    const paperOn = cfg.paperTrading !== false;
    if (!paperOn) {
      try { win.document.documentElement.classList.add('no-paper'); } catch (_) { /* ui.js가 한 번 더 붙인다 */ }
    }
    // 데모 버전은 50배 고정(배포판과 같게, 대표 결정 2026-10-07 저녁 — 10-01의 100배를 대체) — 시연 화면도 같다
    const settings = createSettings(storage, { fixedLev: win.LiteBrain ? win.LiteBrain.RULES.defaultLev : 50 });
    const bus = win.LiteEngine.createBus();
    // 소개 페이지 시연 화면은 방문자 계좌를 건드리지 않게 메모리 계좌를 쓴다
    const paper = relay || (paperOn ? win.LitePaper.create({ storage: kiosk ? null : storage }) : win.LitePaper.createNone());
    // 시연 화면은 방문자의 무료 분석 횟수를 쓰지 않는다 · 중계 모드는 분석이 없으니 횟수도 없다
    // 설정이 0이면 횟수 제한 없음(대표 결정 2026-10-01) — quota가 null이면 ui.js도 횟수·안내 창을 만들지 않는다
    const cfgRuns = win.LITE_CONFIG && Number.isFinite(win.LITE_CONFIG.trialRuns) ? win.LITE_CONFIG.trialRuns : TRIAL_RUNS;
    const quota = relay || kiosk || cfgRuns <= 0 ? null : createQuota({ storage, limit: cfgRuns });
    if (quota) wireQuota(bus, quota, paperOn);
    // 중계 모드는 무료 횟수가 없으니 ptf:trial도 보내지 않는다(설계 §4.4) — 셸이 기억한 최댓값은 그대로
    wireTrialReport(bus, relay ? null : createTrialReporter(win, quota, sp.origin), win, paperOn);
    const ctx = { bus, paper, data: win.LiteData, settings, engine: null, fetchImpl: null, quota, trialCta: (win.LITE_CONFIG && win.LITE_CONFIG.trialCta) || null, fullOnly: (win.LITE_CONFIG && win.LITE_CONFIG.fullOnly) || null, relay, analysis: null, split: null };
    const marketData = { resolveSymbol: win.LiteData.resolveSymbol, fetchSnapshot: (sym) => win.LiteData.fetchSnapshot(sym, { fetch: ctx.fetchImpl }) };
    const demoEngine = relay ? null : win.LiteEngine.createEngine({ bus, paper: paperOn ? paper : null, data: marketData, paperTrading: paperOn });
    ctx.engine = relay ? RELAY_ENGINE : demoEngine;
    const port = createShellPort(win, sp);
    // 비활성화 담당자판 사무실(m/ — 셸 안·중계 아님)의 분석 버튼 둘(대표 결정 2026-10-24): '🔍 체험 분석' = 데모 엔진(셸·허브 요청 없음),
    // '🔒 정밀 분석'·입력칸 Enter·POST /api/analyze = 잠김(토스트 + 셸 ptf:open-verify). 버튼 모양은 ui.js가 LITE.split.mount로.
    // 체험 판(analysisTrial > 0 — 2026-10-30)은 '🔍 정밀 분석' 하나 + 맨 아래 띠(셸 ptf:trial-left로 남은 횟수 — 아래 wireShellMessages)
    if (win.LiteAnalysis && typeof win.LiteAnalysis.splitOn === 'function' && win.LiteAnalysis.splitOn(cfg, { relay, port, kiosk })) {
      const doc0 = win.document;
      ctx.split = win.LiteAnalysis.createSplit({
        bus, demo: demoEngine, quota, port, lev: () => settings.lev, trial: cfg.analysisTrial,
        notify: (m, k) => { if (typeof win.toast === 'function') win.toast(m, k); },
        readSymbol: () => { try { const el = doc0.querySelector('#symbol-input'); return el ? String(el.value || '') : ''; } catch (_) { return ''; } },
      });
      // '정밀 분석'·Enter — 체험이 남았으면 요청 길(아래 컨트롤러가 setPress로 넣음), 아니면 잠김(대표 결정 2026-10-30 하루 체험).
      // 체험 판 맨 아래 띠 [UID 활성화] — 토스트 없이 ptf:open-verify
      win.LiteAnalysis.wireSplitButtons(doc0, { onQuick: () => ctx.split.quick(), onLocked: () => ctx.split.precise(), onVerify: () => ctx.split.verify() });
    }
    // 분석 다시 보기(p34 설계 §4) — analysis_replay 사무실(담당자판 m/)이 셸 안(shell=1·shell_origin·iframe)일 때만.
    // 데모·중계 모두: 입력칸 + 🔍 정밀 분석 → 셸이 넣어 준 리치 서버 AI 최신 분석을 재생(요청 분석 판은 다른 종목 요청). 엔진 자리(라우터·life.js·ui.js가 보는 isRunning)는
    // 재생(기다림 포함)과 데모 엔진을 함께 본다 — 겹쳐 누르기 막음
    if (cfg.analysisReplay === true && !kiosk && port && win.LiteAnalysis) {
      const An = win.LiteAnalysis;
      const doc = win.document;
      const $ = (s) => { try { return doc.querySelector(s); } catch (_) { return null; } };
      const replay = An.createReplayEngine({
        bus, paper: relay || !paperOn ? null : paper, mock: paperOn, data: marketData, lev: () => settings.lev,
        // 연출 속도 — 데모 엔진과 같은 1배. LITE_REPLAY_PACE는 브라우저 검사(check_analysis.py)만 쓴다
        pace: Number.isFinite(win.LITE_REPLAY_PACE) ? win.LITE_REPLAY_PACE : 1,
        sleep: (ms) => new Promise((ok) => win.setTimeout(ok, ms)),
      });
      ctx.analysis = An.createController({
        bus, relay: !!relay, quota, replay, demo: demoEngine, port, lev: () => settings.lev,
        // 요청 분석(B안, p35 §2.12 — 담당자판 m/의 analysisRequest): 고른 종목으로 셸에 ptf:analysis-request
        request: cfg.analysisRequest === true, resolve: win.LiteData.resolveSymbol, now: () => Date.now(),
        // 실시간 직원 말(p37 D4 — 담당자판 m/의 analysisLive): 요청 분석이 도는 동안 셸의 ptf:analysis-turns를 오는 대로 보여 준다
        live: cfg.analysisLive === true,
        notify: (m, k) => { if (typeof win.toast === 'function') win.toast(m, k); },
        setInput: (v) => { const el = $('#symbol-input'); const prev = el ? el.value : ''; if (el) el.value = v; return prev; },
        lock: (on) => { const b = $('#analyze-btn'); if (b) b.disabled = !!on; },
        // 체험(비활성화 기기) 오늘 다 씀 — split이 잠긴 모양·안내·활성화 화면
        onTrialOut: () => { if (ctx.split) ctx.split.trialOut(); },
        setTimeout: (fn, ms) => win.setTimeout(fn, ms),
        clearTimeout: (id) => { if (typeof win.clearTimeout === 'function') win.clearTimeout(id); },
      });
      // 모드는 하나(스캘핑 길 'scalp' — 대표 결정 2026-10-12 알고리즘·스캘핑 합침)
      const readInput = () => {
        const el = $('#symbol-input');
        return { symbol: el ? String(el.value || '') : '', mode: 'scalp' };
      };
      if (!ctx.split) An.wireAnalyzeButton(doc, () => ctx.analysis.press(readInput()));
      else if (typeof ctx.split.setPress === 'function') ctx.split.setPress(() => ctx.analysis.press(readInput()));
      ctx.engine = { isRunning: () => replay.isRunning() || !!(demoEngine && demoEngine.isRunning()), run: demoEngine ? demoEngine.run : () => Promise.resolve() };
      try { doc.documentElement.classList.add('lite-analysis'); } catch (_) { /* ui.js가 LITE.analysis로 한 번 더 본다 */ }
    }
    const api = install(win, ctx);
    if (kiosk) {
      const go = () => { if (!ctx.engine.isRunning()) ctx.engine.run('BTC', { mode: 'scalp', lev: settings.lev, kiosk: true }).catch(() => {}); };
      win.setTimeout(go, 3000); // 화면 코드가 접속 직후 2.5초 동안의 이벤트는 연출을 건너뛴다
      win.setInterval(go, 90000);
    } else if (!relay && paperOn) {
      win.setTimeout(api.settleTick, 1500);
      win.setInterval(api.settleTick, 10000);
    }
    // 셸 규약 — 수신기를 먼저 걸고 office-ready(셸은 그걸 받고서야 seed·중계 상태·분석을 보낸다). 핑을 받으면 office-ready를 다시
    const shellDeps = { bus, quota, relay, analysis: ctx.analysis, split: ctx.split, ready: null };
    wireShellMessages(win, sp, shellDeps);
    // 새 창·다운로드 감싸기(?shell=1) — 안내는 app.js 전역 toast(누를 때 부르므로 app.js가 이보다 늦게 떠도 된다)
    wireShellPopups(win, sp, port, (m) => { if (typeof win.toast === 'function') win.toast(m, 'err'); });
    wireOpenLinks(win, port);
    shellDeps.ready = wireOfficeReady(win, sp, port, ctx.analysis ? () => ctx.analysis.readySent() : null);
    win.LITE = { bus, engine: ctx.engine, paper, paperOn: !relay && paperOn, data: win.LiteData, settings, applyCandles: api.applyCandles, kiosk, quota, relay, analysis: ctx.analysis, split: ctx.split, storageKey: (k) => nsKey(cfg.storageNs, k),
      // 모바일 앱 사무실은 암호화폐만 — 주식 탭 닫음(대표 결정 2026-10-27, 배율 차이 — symbols.js)
      symClasses: ['crypto'] };
  }

  if (typeof window !== 'undefined' && window.document && window.LiteEngine && !window.LITE_NO_BOOT) boot(window);

  return {
    WATCHLIST, FULL_ONLY, RUNS_KEY, TRIAL_RUNS, RELAY_OFF, RELAY_NO_ANALYZE, RELAY_ENGINE, trialDoneText, isFullOnlyAction, createQuota, quotaEvent, wireQuota, createTrialReporter, wireTrialReport,
    nsKey, nsStorage, shellParams, createShellPort, wireOfficeReady, wireShellMessages, linkTarget, wireOpenLinks, sseView,
    POPUP_BLOCKED, popupTarget, wireShellPopups,
    createSettings, createRouter, install, boot,
  };
});
