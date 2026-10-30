/* PIXEL TRADING FLOOR 데모 버전 — 진입 참고가 버튼 (담당자판 사무실 m/ — 셸 안 중계 html.m.shell.relay만)
   2026-10-23 사무실 2차 요청 4: 판정 줄(#m-verdict)의 '진입 · 손절 · 목표' 세 칸(중계는 그 칸을 싣지 않아 늘 '—' — 보안 규칙 19) 대신
   '▶ 진입가·익절가 보기' 버튼 하나 — 롱·숏 판정이고 허브가 계산한 진입 참고가(분석 plan)와 셸의 ptf:entry-ref(이 셸이 진입 참고가를 안다는 표시)를
   받았을 때만. HOLD면 버튼 없음, 새 분석 런(run:start)이면 숨김.
   대표 결정 2026-10-25(ptf-mobile 보안 규칙 22 예외): 누르면 사무실 안 패널 대신 셸에 ptf:open-trade { v:1, id }(그 분석 id만 — 가격 칸 없음) →
   셸이 트레이딩 탭으로 넘어가 그 id로 허브 분석 항목을 받아 '진입 참고가' 카드를 그 종목 차트와 함께 보인다. 주문은 셸 카드의 [진입하기]와 확인을
   회원이 눌러야만(이 파일은 주문하지 않는다). createElement·textContent만. cleanRef·planOf는 순수(Node 시험), install이 브라우저에서 DOM을 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteEntryRef = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXT = Object.freeze({ button: '▶ 진입가·익절가 보기' });
  const ID_RE = /^a[0-9a-f]{12}$/;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const posNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  // 셸 ptf:entry-ref → { lev, firstPct, tpPct } | null — 이 셸이 진입 참고가 카드를 아는지(값은 셸이 다시 정함)
  function cleanRef(d) {
    if (!isObj(d) || d.type !== 'ptf:entry-ref' || d.v !== 1) return null;
    if (!intIn(d.lev, 1, 200) || !(posNum(d.firstPct) && d.firstPct <= 100) || !(posNum(d.tpPct) && d.tpPct <= 1000)) return null;
    return { lev: d.lev, firstPct: d.firstPct, tpPct: d.tpPct };
  }
  // 판정 이벤트의 진입 참고가(재생 엔진이 중계 분석 plan을 ref로 실음) → { id, side } | null — 셸에 보내는 것은 id뿐
  function planOf(ev) {
    const p = ev && isObj(ev.ref) ? ev.ref : null;
    if (!p || (p.side !== 'LONG' && p.side !== 'SHORT') || !posNum(p.entry) || !posNum(p.tp) || typeof p.id !== 'string' || !ID_RE.test(p.id)) return null;
    return { id: p.id, side: p.side };
  }
  const openMsg = (id) => ({ type: 'ptf:open-trade', v: 1, id });

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !LITE.bus || !doc || !doc.documentElement) return null;
    const cls = doc.documentElement.classList;
    if (!cls.contains('shell') || !LITE.relay) return null; // 담당자판(셸 안 중계)만
    let ref = null;
    let cur = null; // { id, side }

    const btn = doc.createElement('button');
    btn.className = 'er-btn';
    btn.textContent = TEXT.button;
    btn.id = 'lite-entry-btn';
    btn.type = 'button';
    btn.hidden = true;
    const mv = doc.querySelector('#m-verdict');
    if (mv) mv.append(btn);

    const port = () => {
      try { return win.parent && win.parent !== win ? win.parent : null; } catch (_) { return null; }
    };
    const shellOrigin = () => {
      try { return win.LITE_CONFIG && typeof win.LITE_CONFIG.shellOrigin === 'string' ? win.LITE_CONFIG.shellOrigin : null; } catch (_) { return null; }
    };
    btn.addEventListener('click', () => {
      if (!cur || !ref) return;
      const p = port();
      const o = shellOrigin();
      if (p && o) { try { p.postMessage(openMsg(cur.id), o); } catch (_) { /* 셸이 없으면 아무 일 없음 */ } }
    });
    function sync() { btn.hidden = !(cur && ref); }

    LITE.bus.subscribe((ev) => {
      if (!ev || typeof ev.type !== 'string') return;
      if (ev.type === 'run:start') { cur = null; sync(); return; }
      if (ev.type === 'decision') { cur = planOf(ev); sync(); }
    });
    function receive(d) {
      const r = cleanRef(d);
      if (!r) return false;
      ref = r;
      sync();
      return true;
    }
    const api = { receive, button: btn };
    LITE.entryRef = api;
    if (LITE.pendingEntryRef) { receive(LITE.pendingEntryRef); LITE.pendingEntryRef = null; }
    return api;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { TEXT, cleanRef, planOf, openMsg, install };
});
