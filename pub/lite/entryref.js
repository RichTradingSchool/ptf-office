/* PIXEL TRADING FLOOR 데모 버전 — 진입 참고가 (담당자판 사무실 m/ — 셸 안 중계 html.m.shell.relay만)
   2026-10-23 사무실 2차 요청 4: PC판(동업자판 public/trade.js renderDraft '진입 참고가'·#dp-trade-btn)과 같은 꼴.
   · 판정 줄(#m-verdict)의 '진입 · 손절 · 목표' 세 칸(중계는 그 칸을 싣지 않아 늘 '—' — 보안 규칙 19) 대신 '▶ 진입가·익절가 보기' 버튼 하나
     — 롱·숏 판정이고 허브가 계산한 진입 참고가(분석 plan: 진입가 = 허브가 그 판정 때 받은 오렌지엑스 시세, 익절가)와 셸의 ptf:entry-ref
     (그 판 follow-rules 회원 기본값 — 배율·1차 비중·익절 %)를 받았을 때만. HOLD면 버튼·패널 없음
   · 누르면 판정 아래 패널: '<종목>/USDT · 진입 참고가' · 포지션 LONG/롱 오픈(SHORT/숏 오픈) · 마진 격리 · 레버리지 Nx · 비중 N% ·
     진입가(큰 주황) · 익절가(초록, (+N%)) · '▶ 1차 진입 시작'(셸 트레이딩 탭으로 — ptf:open-trade, 주문 칸을 채우거나 주문하지 않음 — 보안 규칙 22) · [닫기] · 안내 한 줄
   · 새 분석 런(run:start)이면 버튼·패널을 닫는다
   createElement·textContent만. cleanRef·planOf·panelText는 순수(Node 시험), install이 브라우저에서 DOM을 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteEntryRef = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXT = Object.freeze({
    button: '▶ 진입가·익절가 보기',
    title: (sym) => `${sym}/USDT · 진입 참고가`,
    pos: '포지션', margin: '마진', marginVal: '격리', lev: '레버리지', pct: '비중', entry: '진입가', tp: '익절가',
    side: (s) => (s === 'SHORT' ? 'SHORT/숏 오픈' : 'LONG/롱 오픈'),
    go: '▶ 1차 진입 시작',
    close: '닫기',
    hint: '누르면 트레이딩 탭으로 넘어갑니다 — 주문은 거기서 직접 합니다.',
  });
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const posNum = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

  // 셸 ptf:entry-ref → { lev, firstPct, tpPct } | null
  function cleanRef(d) {
    if (!isObj(d) || d.type !== 'ptf:entry-ref' || d.v !== 1) return null;
    if (!intIn(d.lev, 1, 200) || !(posNum(d.firstPct) && d.firstPct <= 100) || !(posNum(d.tpPct) && d.tpPct <= 1000)) return null;
    return { lev: d.lev, firstPct: d.firstPct, tpPct: d.tpPct };
  }
  // 판정 이벤트의 진입 참고가(재생 엔진이 중계 분석 plan을 ref로 실음) → { side, entry, tp, sym } | null
  function planOf(ev) {
    const p = ev && isObj(ev.ref) ? ev.ref : null;
    if (!p || (p.side !== 'LONG' && p.side !== 'SHORT') || !posNum(p.entry) || !posNum(p.tp)) return null;
    const sym = typeof p.sym === 'string' && /^[A-Za-z0-9가-힣 ._-]{1,24}$/.test(p.sym) ? p.sym.replace(/USDT$/, '') : 'BTC';
    return { side: p.side, entry: p.entry, tp: p.tp, sym };
  }
  function fmt(n) {
    const a = Math.abs(n);
    const d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 4 : 6;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function panelText(sym, plan, ref) {
    return {
      title: TEXT.title(sym), side: TEXT.side(plan.side), lev: `${ref.lev}x`, pct: `${ref.firstPct}%`,
      entry: fmt(plan.entry), tp: fmt(plan.tp), tpPct: `(+${ref.tpPct}%)`,
    };
  }

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !LITE.bus || !doc || !doc.documentElement) return null;
    const cls = doc.documentElement.classList;
    if (!cls.contains('shell') || !LITE.relay) return null; // 담당자판(셸 안 중계)만
    const make = (tag, c, text) => {
      const e = doc.createElement(tag);
      if (c) e.className = c;
      if (text != null) e.textContent = text;
      return e;
    };
    let ref = null;
    let cur = null; // { sym, plan }

    const btn = make('button', 'er-btn', TEXT.button);
    btn.id = 'lite-entry-btn';
    btn.type = 'button';
    btn.hidden = true;
    const mv = doc.querySelector('#m-verdict');
    if (mv) mv.append(btn);

    const panel = make('section', null, null);
    panel.id = 'lite-entry';
    panel.hidden = true;
    panel.setAttribute('aria-label', '진입 참고가');
    if (mv && typeof mv.after === 'function') mv.after(panel);
    else (doc.querySelector('#stage') || doc.body).append(panel);

    const port = () => {
      try { return win.parent && win.parent !== win ? win.parent : null; } catch (_) { return null; }
    };
    const shellOrigin = () => {
      try { return win.LITE_CONFIG && typeof win.LITE_CONFIG.shellOrigin === 'string' ? win.LITE_CONFIG.shellOrigin : null; } catch (_) { return null; }
    };
    function openTrade() {
      const p = port();
      const o = shellOrigin();
      if (p && o) { try { p.postMessage({ type: 'ptf:open-trade', v: 1 }, o); } catch (_) { /* 셸이 없으면 아무 일 없음 */ } }
    }
    function close() { panel.hidden = true; }
    function draw() {
      if (!cur || !ref) { panel.hidden = true; return; }
      const t = panelText(cur.sym, cur.plan, ref);
      const row = (lbl, val, vc) => { const d = make('div', null, null); d.append(make('span', 'lbl', lbl), vc ? make('b', vc, val) : doc.createTextNode(val)); return d; };
      const left = make('div', 'tv2-left', null);
      left.append(row(TEXT.pos, t.side, cur.plan.side === 'SHORT' ? 'short' : 'long'), row(TEXT.margin, TEXT.marginVal), row(TEXT.lev, t.lev), row(TEXT.pct, t.pct));
      const right = make('div', 'tv2-right', null);
      const tpv = make('div', 'tpv', null);
      tpv.append(make('span', null, t.tp), doc.createTextNode(' '), make('small', null, t.tpPct));
      right.append(make('div', 'lbl', TEXT.entry), make('div', 'val', t.entry), make('div', 'lbl tp', TEXT.tp), tpv);
      const grid = make('div', 'tv2-grid', null);
      grid.append(left, right);
      const go = make('button', 'er-go', TEXT.go);
      go.type = 'button';
      go.addEventListener('click', openTrade);
      const cl = make('button', 'ghost', TEXT.close);
      cl.type = 'button';
      cl.addEventListener('click', close);
      const acts = make('div', 'tv2-go plain', null);
      acts.append(go, cl);
      panel.replaceChildren(make('div', 'tv2-title', t.title), grid, acts, make('div', 'tv2-hint', TEXT.hint));
    }
    btn.addEventListener('click', () => {
      if (!cur || !ref) return;
      draw();
      panel.hidden = false;
    });
    function sync() { btn.hidden = !(cur && ref); if (btn.hidden) panel.hidden = true; }

    LITE.bus.subscribe((ev) => {
      if (!ev || typeof ev.type !== 'string') return;
      if (ev.type === 'run:start') { cur = null; sync(); return; }
      if (ev.type === 'decision') {
        const plan = planOf(ev);
        cur = plan ? { sym: plan.sym, plan } : null;
        sync();
      }
    });
    function receive(d) {
      const r = cleanRef(d);
      if (!r) return false;
      ref = r;
      sync();
      if (!panel.hidden) draw();
      return true;
    }
    const api = { receive, el: panel, button: btn };
    LITE.entryRef = api;
    if (LITE.pendingEntryRef) { receive(LITE.pendingEntryRef); LITE.pendingEntryRef = null; }
    return api;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { TEXT, cleanRef, planOf, panelText, fmt, install };
});
