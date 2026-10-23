/* PIXEL TRADING FLOOR 데모 버전 — 분석 근거 창 (담당자판 사무실 m/ — 셸 안 중계 html.m.shell.relay만)
   2026-10-23 사무실 2차 요청 5: PC판(동업자판 public/trade.js evidenceHtml·chartEvidence·openEvidenceModal, style.css .ev-*)과 같은 꼴.
   · 판정 줄(#m-verdict)에 '판정 근거 보기' — 판정이 나온 뒤(HOLD 포함), 새 런(run:start)이면 숨김
   · 누르면 public/app.js openModalNode('분석 근거', …) — 닫기는 그 창의 오른쪽 위 빨간 ✕·Esc·바깥 누름(app.js 그대로)
   · ■ 차트 근거: 그 종목 5분봉(사무실이 이미 쓰는 해외 거래소 공개 시세 — 다른 거래소 이름은 쓰지 않음)·24시간 고저·마크 가격으로 이 기기에서 계산
     (PC판 chartEvidence 식 그대로 — 1H 박스·RSI14·볼린저(20,2σ)·EMA 20/50/200·15분 모멘텀·거래량 20봉·24h 고저·마크 괴리, 줄마다 '→ 해석')
   · ■ 뉴스 근거: 판정 이벤트에 실린 기사(news — 허브가 동업자판 그 런의 evidence.news를 거른 분석 news 칸, 2026-10-23) — 출처 칩·제목·'N분 전 · 원문 ↗'(https만, 새 창),
     없으면 '이번 분석에서 받은 기사가 없습니다'
   · ■ 토론 결론: 그 런의 BULL·BEAR 말(직원 말 그대로)
   createElement·textContent만. chartEvidence·cleanNews는 순수(Node 시험), install이 브라우저에서 DOM을 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteEvidence = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXT = Object.freeze({
    button: '판정 근거 보기',
    title: '분석 근거',
    chart: '■ 차트 근거', chartSub: '해외 거래소 공개 시세 5분봉 · 실시간 계산', chartWait: '차트 데이터 수신 중',
    news: '■ 뉴스 근거', newsNone: '이번 분석에서 받은 기사가 없습니다', newsLink: '원문 ↗',
    debate: '■ 토론 결론', bull: '🐂 BULL 매수 근거', bear: '🐻 BEAR 매도 근거', debateNone: '토론 결과 없음',
  });
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  function fmtP(n) {
    const a = Math.abs(n);
    const d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 4 : 6;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function ema(arr, n) { const k = 2 / (n + 1); let e = null; const out = []; for (const x of arr) { e = e == null ? x : x * k + e * (1 - k); out.push(e); } return out; }
  function rsi(closes, n = 14) { const a = 1 / n; let up = 1e-9; let dn = 1e-9; for (let i = 1; i < closes.length; i += 1) { const ch = closes[i] - closes[i - 1]; up = a * Math.max(ch, 0) + (1 - a) * up; dn = a * Math.max(-ch, 0) + (1 - a) * dn; } return 100 - 100 / (1 + up / dn); }

  // PC판 trade.js chartEvidence와 같은 식 — bars: 5분봉 [{t,o,h,l,c,v}](마지막은 진행 중), tk: { high24h, low24h, mark, price } | null
  function chartEvidence(bars, tk, fmt = fmtP) {
    const items = [];
    if (!Array.isArray(bars) || bars.length < 60) return items;
    const done = bars.slice(0, -1);
    const closes = done.map((b) => b.c);
    const px = bars[bars.length - 1].c;
    const box = done.slice(-12);
    const h12 = Math.max(...box.map((b) => b.h));
    const l12 = Math.min(...box.map((b) => b.l));
    const mid = (h12 + l12) / 2;
    const boxw = ((h12 - l12) / mid) * 100;
    if (px >= h12) items.push({ k: 'box', t: `1H 박스 상단 ${fmt(h12)} 돌파 (돌파폭 +${((px / h12 - 1) * 100).toFixed(2)}%)`, link: '1차 진입 기준선' });
    else if (px <= l12) items.push({ k: 'box', t: `1H 박스 하단 ${fmt(l12)} 이탈 (이탈폭 ${((px / l12 - 1) * 100).toFixed(2)}%)`, link: '1차 진입 기준선' });
    else items.push({ k: 'box', t: `1H 박스 ${fmt(l12)} ~ ${fmt(h12)} 안 (폭 ${boxw.toFixed(2)}%)`, link: '돌파 대기 구간' });
    const r = rsi(closes.slice(-99));
    items.push({ k: 'rsi', t: `5m RSI14 ${r.toFixed(1)} · ${r < 35 ? '과매도권' : r > 65 ? '과매수권' : '과열 전 구간'}`, link: r < 35 || r > 65 ? '2차 조건(RSI) 근접' : '2차 조건(RSI) 여유' });
    const c20 = closes.slice(-20);
    const m = c20.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(c20.reduce((a, x) => a + (x - m) ** 2, 0) / 20);
    items.push({ k: 'boll', t: `볼린저(20,2σ) 상단 ${fmt(m + 2 * sd)} · 하단 ${fmt(m - 2 * sd)} · 중심 ${fmt(m)}`, link: '3·4차 조건선 기준' });
    const e20 = ema(closes, 20).pop();
    const e50 = ema(closes, 50).pop();
    const e200 = closes.length >= 200 ? ema(closes, 200).pop() : null;
    const align = e200 == null ? (e20 > e50 ? '20>50 상승 배열' : '20<50 하락 배열') : (e20 > e50 && e50 > e200 ? '정배열' : e20 < e50 && e50 < e200 ? '역배열' : '혼조');
    items.push({ k: 'ema', t: `EMA 20/50${e200 != null ? '/200' : ''} ${align} (${fmt(e20)} / ${fmt(e50)}${e200 != null ? ` / ${fmt(e200)}` : ''})`, link: '추세 방향' });
    const m15 = closes.length > 3 ? (closes[closes.length - 1] / closes[closes.length - 4] - 1) * 100 : 0;
    items.push({ k: 'mom', t: `15분 모멘텀 ${m15 >= 0 ? '+' : ''}${m15.toFixed(2)}%`, link: m15 >= 0 ? '상방 압력' : '하방 압력' });
    const v20 = done.slice(-20).reduce((a, b) => a + (b.v || 0), 0) / 20;
    const vl = done[done.length - 1].v || 0;
    if (v20 > 0) items.push({ k: 'vol', t: `거래량 20봉 평균 대비 ${(vl / v20).toFixed(1)}배`, link: vl / v20 >= 1.5 ? '돌파 신뢰 ↑' : '거래량 평이' });
    if (tk) {
      if (fin(tk.high24h) && fin(tk.low24h)) items.push({ k: 'hl', t: `24h 고가 ${fmt(tk.high24h)} · 저가 ${fmt(tk.low24h)}`, link: '당일 범위' });
      if (fin(tk.mark) && fin(tk.price) && tk.mark > 0) {
        const gap = (tk.price / tk.mark - 1) * 100;
        items.push({ k: 'mark', t: `마크 대비 괴리 ${gap >= 0 ? '+' : ''}${gap.toFixed(3)}%`, link: Math.abs(gap) < 0.05 ? '과열 아님' : '괴리 주의' });
      }
    }
    return items;
  }

  // 지금 기준 지난 시간 — PC판 기사 줄의 'N분 전' 꼴
  function ageOf(at, now) {
    if (!fin(at) || at <= 0) return '';
    const d = now - at;
    if (!(d >= 60000)) return '방금';
    if (d < 3600000) return `${Math.floor(d / 60000)}분 전`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}시간 전`;
    return `${Math.floor(d / 86400000)}일 전`;
  }

  // 판정 이벤트의 기사 목록(분석 news 칸 — { source, title, at, link }) → [{ source, title, age, link }] — https 링크만, 글자 길이 상한, 최대 10
  function cleanNews(list, now = Date.now()) {
    if (!Array.isArray(list)) return [];
    const s = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
    return list.slice(0, 20).map((n) => {
      if (!isObj(n)) return null;
      const title = s(n.title, 200);
      if (!title) return null;
      let link = '';
      try { const u = new URL(String(n.link || '')); if (u.protocol === 'https:') link = u.href; } catch (_) { link = ''; }
      return { source: s(n.source, 30) || '뉴스', title, age: fin(n.at) ? ageOf(n.at, now) : s(n.age, 20), link };
    }).filter(Boolean).slice(0, 10);
  }

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !LITE.bus || !doc || !doc.documentElement) return null;
    if (!doc.documentElement.classList.contains('shell') || !LITE.relay) return null; // 담당자판(셸 안 중계)만
    const make = (tag, c, text) => {
      const e = doc.createElement(tag);
      if (c) e.className = c;
      if (text != null) e.textContent = text;
      return e;
    };
    let cur = null; // { sym, news }
    let bull = '';
    let bear = '';
    const btn = make('button', 'ev-btn', TEXT.button);
    btn.id = 'lite-evidence-btn';
    btn.type = 'button';
    btn.hidden = true;
    const mv = doc.querySelector('#m-verdict');
    if (mv) mv.append(btn);

    function section(head, sub) {
      const sec = make('div', 'ev-sec', null);
      const h = make('div', 'ev-head', null);
      h.append(doc.createTextNode(head));
      if (sub) h.append(make('small', null, sub));
      sec.append(h);
      return sec;
    }
    function body(items) {
      const root = make('div', 'ev-modal', null);
      const chart = section(TEXT.chart, TEXT.chartSub);
      chart.id = 'lite-ev-chart';
      const ul = make('ul', 'ev-list', null);
      if (items && items.length) items.forEach((it) => { const li = make('li', null, null); li.append(make('span', null, it.t), make('em', null, `→ ${it.link}`)); ul.append(li); });
      else { const li = make('li', null, null); li.append(make('span', null, TEXT.chartWait)); ul.append(li); }
      chart.append(ul);
      const news = section(TEXT.news);
      const nl = make('ul', 'ev-news', null);
      const list = cur ? cleanNews(cur.news) : [];
      if (list.length) {
        list.forEach((n) => {
          const li = make('li', null, null);
          const meta = make('span', 'ev-meta', null);
          if (n.age) meta.append(doc.createTextNode(n.age));
          if (n.link) {
            if (n.age) meta.append(doc.createTextNode(' · '));
            const a = make('a', null, TEXT.newsLink);
            a.setAttribute('href', n.link);
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
            meta.append(a);
          }
          li.append(make('span', 'ev-tag', n.source), make('span', 'ev-title', n.title), meta);
          nl.append(li);
        });
      } else {
        const li = make('li', null, null);
        li.append(make('span', 'ev-meta', TEXT.newsNone));
        nl.append(li);
      }
      news.append(nl);
      const deb = section(TEXT.debate);
      if (bull || bear) {
        const g = make('div', 'ev-debate', null);
        const side = (cls, head, text) => { const d = make('div', `ev-side ${cls}`, null); d.append(make('b', null, head), make('p', null, text || '—')); return d; };
        g.append(side('bull', TEXT.bull, bull), side('bear', TEXT.bear, bear));
        deb.append(g);
      } else deb.append(make('div', 'ev-meta', TEXT.debateNone));
      root.append(chart, news, deb);
      return root;
    }
    async function chartItems(sym) {
      const D = LITE.data;
      if (!D || typeof D.resolveSymbol !== 'function' || typeof D.fetchRecentCandles !== 'function') return [];
      let r;
      try { r = D.resolveSymbol(sym); } catch (_) { return []; }
      const [bars, tk] = await Promise.all([
        D.fetchRecentCandles(r.symbol, { axis: 'perp', limit: 300 }).catch(() => []),
        typeof D.fetchTicker24 === 'function' ? D.fetchTicker24(r.symbol).catch(() => null) : Promise.resolve(null),
      ]);
      return chartEvidence(bars, tk);
    }
    async function open() {
      if (!cur || typeof win.openModalNode !== 'function') return;
      const mine = cur;
      win.openModalNode(TEXT.title, body(null)); // 차트 근거는 받는 동안 '수신 중'
      const items = await chartItems(mine.sym);
      if (cur !== mine) return;
      const box = doc.querySelector('#modal-body');
      const old = box && typeof box.querySelector === 'function' ? box.querySelector('#lite-ev-chart') : null;
      if (old && typeof old.replaceWith === 'function') old.replaceWith(body(items).children[0]);
    }
    btn.addEventListener('click', () => { open().catch(() => {}); });

    LITE.bus.subscribe((ev) => {
      if (!ev || typeof ev.type !== 'string') return;
      if (ev.type === 'run:start') { cur = null; bull = ''; bear = ''; btn.hidden = true; return; }
      if (ev.type === 'agent:done' && (ev.id === 'bull' || ev.id === 'bear')) {
        const t = typeof ev.bubble === 'string' && ev.bubble.trim() ? ev.bubble : typeof ev.report === 'string' ? ev.report : '';
        if (ev.id === 'bull') bull = t || bull; else bear = t || bear;
        return;
      }
      if (ev.type === 'decision') {
        const sym = typeof ev.sym === 'string' && ev.sym ? ev.sym : ev.ref && typeof ev.ref.sym === 'string' ? ev.ref.sym : (LITE.lastAnalysisSymbol || 'BTC');
        cur = { sym: String(sym).replace(/USDT$/, ''), news: Array.isArray(ev.news) ? ev.news.slice(0, 20) : [] }; // 'N분 전'은 창을 열 때 계산
        btn.hidden = false;
      }
    });
    const api = { open, button: btn, body };
    LITE.evidence = api;
    return api;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { TEXT, chartEvidence, cleanNews, fmtP, install };
});
