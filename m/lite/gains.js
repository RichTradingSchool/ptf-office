/* PIXEL TRADING FLOOR 데모 버전 — 수익 알림 패널 (셸 사무실 html.m.shell만, 셸의 ptf:gains를 받은 뒤에만 보임)
   2026-10-23 요청 ⑤: PC판(동업자판) 전광판 옆 '◆ 수익 알림 ◆' 패널과 같은 꼴 — 제목 + 'N건', 부제 '분석을 누른 뒤 실제로 진입했다면?',
   줄마다 '종목 롱|숏 · +N% 수익' / 'HH:MM 진입 · 진행 중 최고'(6시간 안) 또는 'N시간 최고', 없으면 '아직 없음', 최근 30줄.
   원천은 허브(셸이 GET /v1/analysis/gains를 받아 ptf:gains로 넘김) — 허브가 8000 중계 판정마다 공개 시세로 계산(진입가 대비 6시간 최고점 × 배율,
   +10% 단위, 손실 줄 없음). PC판은 같은 설명을 패널 마우스 툴팁으로 두지만 휴대폰은 마우스가 없어 한 줄로 보인다(실현 수익이 아님을 숨기지 않게).
   메시지 모양: { type:'ptf:gains', v:1, items:[{ id, symbol, side:'LONG'|'SHORT', pct, openedAt, t, live, hours }] } — 틀린 항목만 뺀다.
   createElement·textContent만. cleanGains·rowText는 순수(Node 시험), install이 브라우저에서 DOM을 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteGains = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXT = Object.freeze({
    title: '◆ 수익 알림 ◆',
    help: '분석을 누른 뒤 실제로 진입했다면?',
    note: '진입가 대비 6시간 안 최고점 · 레버리지 증거금 기준 · 실현 수익이 아닙니다',
    empty: '아직 없음',
    count: (n) => (n ? `${n}건` : '0'),
    pct: (n) => `+${n}% 수익`,
    side: (s) => (s === 'SHORT' ? '숏' : '롱'),
    when: (hm, live, hours) => `${hm} 진입 · ${live ? '진행 중 최고' : `${hours}시간 최고`}`,
  });
  const ITEM_KEYS = Object.freeze(['id', 'symbol', 'side', 'pct', 'openedAt', 't', 'live', 'hours']);
  const MAX = 30;
  const SYM_RE = /^[A-Z0-9]{1,20}$/;
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const KST = 9 * 3600000;
  const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 8.6e15;
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const hm = (ms) => new Date(ms + KST).toISOString().slice(11, 16);

  function cleanItem(x) {
    if (!isObj(x)) return null;
    if (typeof x.id !== 'string' || !ID_RE.test(x.id) || typeof x.symbol !== 'string' || !SYM_RE.test(x.symbol)) return null;
    if (x.side !== 'LONG' && x.side !== 'SHORT') return null;
    if (!Number.isInteger(x.pct) || x.pct < 10 || x.pct > 100000 || !isTime(x.openedAt) || !isTime(x.t)) return null;
    if (!Number.isInteger(x.hours) || x.hours < 1 || x.hours > 48) return null;
    return { id: x.id, symbol: x.symbol, side: x.side, pct: x.pct, openedAt: x.openedAt, t: x.t, live: x.live === true, hours: x.hours };
  }
  // ptf:gains 하나 → 거른 줄 목록(새 고점 시각 최근 순 30) | null(모양 틀림)
  function cleanGains(d) {
    if (!isObj(d) || d.type !== 'ptf:gains' || d.v !== 1 || !Array.isArray(d.items)) return null;
    return d.items.slice(0, MAX * 2).map(cleanItem).filter(Boolean).sort((a, b) => b.t - a.t).slice(0, MAX);
  }
  function rowText(g) {
    return { head: `${g.symbol} ${TEXT.side(g.side)}`, pct: TEXT.pct(g.pct), sub: TEXT.when(hm(g.openedAt), g.live, g.hours) };
  }

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !doc || !doc.documentElement) return null;
    if (!doc.documentElement.classList.contains('shell')) return null; // 셸 사무실만
    const make = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const box = make('section', null, null);
    box.id = 'lite-gains';
    box.hidden = true; // 셸이 수익 알림을 보내기 전(허브 중계가 꺼진 동안)은 숨김
    box.setAttribute('aria-label', '수익 알림');
    box.title = TEXT.note;
    const head = make('div', 'gn-head', null);
    const cnt = make('span', 'gn-count', '0');
    head.append(make('span', 'gn-title', TEXT.title), cnt);
    const list = make('ol', 'gn-list', null);
    box.append(head, make('p', 'gn-help', TEXT.help), make('p', 'gn-note', TEXT.note), list);
    const anchor = doc.querySelector('#lite-talklog') || doc.querySelector('#lite-analysis-note') || doc.querySelector('#m-verdict');
    if (anchor && typeof anchor.after === 'function') anchor.after(box);
    else (doc.querySelector('#stage') || doc.body).append(box);

    function paint(items) {
      cnt.textContent = TEXT.count(items.length);
      if (!items.length) {
        list.replaceChildren(make('li', 'gn-empty', TEXT.empty));
        return;
      }
      list.replaceChildren(...items.map((g) => {
        const r = rowText(g);
        const li = make('li', 'gn-row', null);
        const top = make('div', 'gn-1', null);
        top.append(make('span', `gn-sym ${g.side === 'SHORT' ? 'short' : 'long'}`, r.head), make('span', 'gn-pct', r.pct));
        li.append(top, make('div', 'gn-2', r.sub));
        return li;
      }));
    }
    function receive(d) {
      const items = cleanGains(d);
      if (!items) return false;
      box.hidden = false;
      paint(items);
      return true;
    }
    const api = { receive, el: box };
    LITE.gains = api;
    // shim.js가 이 파일보다 먼저 받은 것(부팅 직후) — 마지막 하나
    if (LITE.pendingGains) { receive(LITE.pendingGains); LITE.pendingGains = null; }
    return api;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { TEXT, ITEM_KEYS, MAX, cleanItem, cleanGains, rowText, install };
});
