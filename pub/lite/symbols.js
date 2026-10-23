/* PIXEL TRADING FLOOR 데모 버전 — 암호화폐 | 주식 스위치 + 종목 칩 줄 (p37 D5 — 모든 셸 사무실: 공용판 pub/·담당자판 m/ 데모·중계)
   설계: ptf-mobile docs/superpowers/specs/2026-10-09-ptf-p37-live-office-design.md §1 D5·§2.6 (R1~R4)
   · 전광판 머리 줄(#board-info) 끝 MARKET 배지 오른쪽에 두 칸 스위치(#lite-class), 바로 아래 칩 줄(#lite-syms — 고른 종류만 보임)
   · 칩은 분석 대상 선택기가 아니라 차트·입력칸 선택기(R1): 누르면 그 종목 차트 + 입력칸에 그 이름, 분석은 늘 🔍 정밀 분석
   · 종류의 진실 소스는 data.js resolveSymbol(kind) 하나(assetClass — R3: 금은 주식 쪽)
   · 스위치·칩은 차트를 따라간다(chart.js onChange) — 사람이 누른 것(칩·스위치)과 회원이 누른 분석의 run:start만 저장한다
   · 중계 사무실은 재생이 차트를 그리지 않으므로 run:start가 그 종목 차트를 연다(런 동안 붙잡음, 끝나면 실계좌 보유 종목으로) —
     칩은 차트가 바뀔 때 따라간다(p37 검토)
   · 고른 종류·종류별 마지막 종목은 이 기기에만(localStorage, try/catch — 막히면 이번 방문만)
   · 분석·재생·요청 기다림 중이면 잠김(.busy)
   createElement·textContent만 쓴다. createController는 순수(Node 시험), install이 브라우저에서 DOM을 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteSymbols = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // R4 — 지금 중계 칩 10개 그대로(늘리지 않음). [기호, 화면 이름]
  const CHIPS = Object.freeze([['BTC', 'BTC'], ['ETH', 'ETH'], ['SOL', 'SOL'], ['XRP', 'XRP'], ['DOGE', 'DOGE'],
    ['TSLA', 'TSLA'], ['NVDA', 'NVDA'], ['SAMSUNG', '삼성전자'], ['SKHYNIX', 'SK하이닉스'], ['XAU', '금']].map((x) => Object.freeze(x)));
  const KEY = 'pixel-lite-symclass-v1';
  const CLASSES = Object.freeze(['crypto', 'stock']);
  const FIRST = Object.freeze({ crypto: 'BTC', stock: 'TSLA' }); // 처음이면 암호화폐 BTC, 주식은 첫 주식 칩
  const TEXT = Object.freeze({ crypto: '암호화폐', stock: '주식', aria: '종목 종류' }); // O-47

  const isChip = (sym) => CHIPS.some(([s]) => s === sym);
  const labelOf = (sym) => { const c = CHIPS.find(([s]) => s === sym); return c ? c[1] : sym; };
  const classOf = (sym, assetClass) => { try { return assetClass(sym); } catch (_) { return null; } };
  function chipsOf(cls, assetClass) {
    return CHIPS.filter(([s]) => classOf(s, assetClass) === cls);
  }
  // 차트·런 기호(BTCUSDT·1000PEPEUSDT) → 칩 기호(BTC·PEPE)
  function baseOf(symbol) {
    const s = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
    if (!s) return '';
    return s.replace(/USDT$/, '').replace(/^1000(?=[A-Z])/, '');
  }

  const defaults = () => ({ cls: 'crypto', last: { ...FIRST } });
  // 저장값 → { cls, last } — 모양이 틀린 칸만 기본값(cls 둘 중 하나, last 값은 그 종류의 칩)
  function readStore(storage, key, assetClass) {
    const out = defaults();
    let raw = null;
    try { raw = storage ? storage.getItem(key) : null; } catch (_) { raw = null; }
    if (typeof raw !== 'string' || !raw) return out;
    let o = null;
    try { o = JSON.parse(raw); } catch (_) { return out; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 1) return out;
    if (CLASSES.includes(o.cls)) out.cls = o.cls;
    const last = o.last && typeof o.last === 'object' && !Array.isArray(o.last) ? o.last : {};
    for (const c of CLASSES) {
      if (typeof last[c] === 'string' && isChip(last[c]) && classOf(last[c], assetClass) === c) out.last[c] = last[c];
    }
    return out;
  }
  function writeStore(storage, key, st) {
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify({ v: 1, cls: st.cls, last: { crypto: st.last.crypto, stock: st.last.stock } }));
      return true;
    } catch (_) { return false; } // 막힌 저장소 — 이번 방문에서만
  }

  // deps: assetClass · chart{ show, onChange } · paper{ openSymbols } · storage · key · busy() · setInput(글) · render(view) · relay(중계 사무실인가)
  function createController(deps) {
    const ac = (s) => classOf(s, deps.assetClass);
    const st = readStore(deps.storage, deps.key, deps.assetClass);
    let pressed = st.last[st.cls];
    const busy = () => { try { return !!(deps.busy && deps.busy()); } catch (_) { return false; } };
    const view = () => ({
      cls: st.cls, pressed, busy: busy(),
      chips: CHIPS.map(([sym, label]) => ({ sym, label, cls: ac(sym) })).filter((x) => x.cls === st.cls),
    });
    const paint = () => { try { if (deps.render) deps.render(view()); } catch (_) { /* 그리기 실패가 차트를 막지 않게 */ } };
    const input = (sym) => { try { if (deps.setInput) deps.setInput(labelOf(sym)); } catch (_) { /* 입력칸이 없어도 */ } };
    const save = () => writeStore(deps.storage, deps.key, st);

    // 칩 누름(사람) — 그 종류의 마지막 종목으로 저장, 차트는 pin(회원이 고른 종목은 중계 보유 종목으로 저절로 옮기지 않음)
    function pick(sym) {
      if (busy() || !isChip(sym)) return false;
      const cls = ac(sym);
      if (!CLASSES.includes(cls)) return false;
      st.cls = cls;
      st.last[cls] = sym;
      pressed = sym;
      save();
      paint();
      input(sym);
      try { deps.chart.show(sym, { pin: true }); } catch (_) { /* 차트가 없어도 */ }
      return true;
    }
    function switchTo(cls) {
      if (busy() || !CLASSES.includes(cls)) return false;
      st.cls = cls;
      save();
      return pick(st.last[cls]);
    }
    // 차트가 종목을 바꿈(show·restore·런의 market) — 따라가기만, 저장하지 않음(저절로 따라간 것은 회원이 고른 것이 아님)
    function follow(m) {
      const base = baseOf(m && m.symbol);
      const cls = base ? ac(base) : null;
      if (!CLASSES.includes(cls)) return;
      st.cls = cls;
      pressed = isChip(base) ? base : null;
      paint();
      if (pressed) input(pressed);
    }
    // 회원이 누른 분석·재생의 run:start — 칩이면 그 종류·마지막 종목으로 저장.
    // 데모: 런의 market 이벤트가 차트를 그리므로 스위치·칩을 바로 맞춘다.
    // 중계(p37 검토): 재생·실시간 세션은 실계좌 차트를 건드리지 않아(analysis.js — market 없음) 칩만 옮기면 칩 TSLA·차트 BTC로 어긋난 채
    // 남았다(재생 뒤 restore도 st.symbol이 있으면 아무것도 안 함). 그래서 그 종목 차트를 여기서 연다 — hold: 런이 도는 동안은 실계좌 이벤트의
    // restore가 끌어가지 않고, run:end에 놓아 ui.js의 restore가 실계좌 보유 종목으로 되돌린다(pin 아님 — p34 '재생 뒤 실계좌 차트' 그대로).
    // 스위치·칩은 차트가 실제로 바뀔 때(onChange → follow) 따라가므로 차트를 못 열면 그대로 — 늘 차트와 같다.
    // 저장도 그 칩 차트를 실제로 연 뒤에만(본 종목만 '마지막으로 본 종목')
    function runStart(ev) {
      const base = baseOf(ev && ev.symbol);
      if (deps.relay) {
        if (!base) return;
        let shown = null;
        try { shown = deps.chart.show(base, { pin: false, hold: true }); } catch (_) { shown = null; }
        if (!isChip(base)) return;
        Promise.resolve(shown).then((ok) => {
          if (ok !== true || pressed !== base) return; // 못 열었거나 그 사이 다른 종목으로 바뀜
          const cls = ac(base);
          if (!CLASSES.includes(cls)) return;
          st.cls = cls;
          st.last[cls] = base;
          save();
        }).catch(() => { /* 저장 실패는 이번 방문만 */ });
        return;
      }
      if (!isChip(base)) { follow(ev); return; }
      const cls = ac(base);
      if (!CLASSES.includes(cls)) return;
      st.cls = cls;
      st.last[cls] = base;
      pressed = base;
      save();
      paint();
      input(base);
    }
    // 켤 때(순서 고정, §2.6): ① 저장값 → 칩·입력칸(차트는 아직) ② onChange 등록 ③ 열린 포지션이 없을 때만 show(last, pin 없음)
    function boot() {
      paint();
      input(pressed);
      try { deps.chart.onChange(follow); } catch (_) { /* 옛 차트 */ }
      let open = [];
      try { open = deps.paper && typeof deps.paper.openSymbols === 'function' ? deps.paper.openSymbols() : []; } catch (_) { open = []; }
      if (!open.length) {
        try { deps.chart.show(st.last[st.cls], { pin: false }); } catch (_) { /* 시세를 못 받으면 restore가 */ }
      }
    }
    return { boot, pick, switchTo, follow, runStart, refresh: paint, view };
  }

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !LITE.chart || !doc || !doc.documentElement) return null;
    // 셸 사무실만(R2) — 소개 사이트 데모(셸 아님)는 레일의 워치리스트 그대로
    if (!doc.documentElement.classList.contains('shell')) return null;
    const info = doc.querySelector('#board-info');
    if (!info) return null;
    const data = LITE.data || win.LiteData;
    if (!data || typeof data.assetClass !== 'function') return null;
    const make = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    const group = make('div', null, null);
    group.id = 'lite-class';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', TEXT.aria);
    const opts = CLASSES.map((c) => {
      const b = make('button', 'lc-opt', TEXT[c]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-cls', c);
      b.setAttribute('aria-checked', 'false');
      group.append(b);
      return b;
    });
    info.append(group);
    const row = make('div', null, null);
    row.id = 'lite-syms';
    const chips = CHIPS.map(([sym, label]) => {
      const b = make('button', 'ls-chip', label);
      b.type = 'button';
      b.setAttribute('data-sym', sym);
      b.setAttribute('aria-pressed', 'false');
      row.append(b);
      return b;
    });
    info.after(row);

    const inputEl = () => doc.querySelector('#symbol-input');
    let storage = null;
    try { storage = win.localStorage; } catch (_) { storage = null; }
    const key = typeof LITE.storageKey === 'function' ? LITE.storageKey(KEY) : KEY;
    const render = (v) => {
      opts.forEach((b) => b.setAttribute('aria-checked', b.getAttribute('data-cls') === v.cls ? 'true' : 'false'));
      const shown = new Set(v.chips.map((x) => x.sym));
      chips.forEach((b) => {
        const sym = b.getAttribute('data-sym');
        b.hidden = !shown.has(sym);
        b.setAttribute('aria-pressed', sym === v.pressed ? 'true' : 'false');
      });
      group.classList.toggle('busy', !!v.busy);
      row.classList.toggle('busy', !!v.busy);
      opts.concat(chips).forEach((b) => b.setAttribute('aria-disabled', v.busy ? 'true' : 'false'));
    };
    const c = createController({
      assetClass: data.assetClass, chart: LITE.chart, paper: LITE.paper, storage, key,
      busy: () => !!((LITE.engine && LITE.engine.isRunning()) || (LITE.analysis && typeof LITE.analysis.isBusy === 'function' && LITE.analysis.isBusy())),
      // 회원이 입력칸에 글자를 치는 중이면 덮지 않는다
      setInput: (v) => { const el = inputEl(); if (el && doc.activeElement !== el) el.value = v; },
      render,
      relay: !!LITE.relay,
    });
    opts.forEach((b) => b.addEventListener('click', () => c.switchTo(b.getAttribute('data-cls'))));
    chips.forEach((b) => b.addEventListener('click', () => c.pick(b.getAttribute('data-sym'))));
    if (LITE.bus) {
      LITE.bus.subscribe((ev) => {
        if (!ev || !ev.type) return;
        if (ev.type === 'run:start') { c.runStart(ev); c.refresh(); }
        // 재생 엔진은 run:end를 낸 뒤에 running을 내린다 — 다음 틱에 다시 본다
        else if (ev.type === 'run:end') { c.refresh(); win.setTimeout(() => c.refresh(), 0); }
        else if (ev.type === 'lite:analysis') c.refresh();
      });
    }
    c.boot();
    const api = { controller: c, view: c.view };
    LITE.symbols = api;
    return api;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { CHIPS, KEY, CLASSES, FIRST, TEXT, baseOf, chipsOf, readStore, writeStore, createController, install };
});
