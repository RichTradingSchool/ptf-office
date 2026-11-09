/* PIXEL TRADING FLOOR 데모 버전 — AGENT CONSOLE (셸 사무실 html.m.shell만, R11)
   2026-10-23 요청: 옛 '대화 기록'(꼬리표·잡담 줄)을 PC판 AGENT CONSOLE과 같은 꼴로 바꿨다.
   · 머리 '◆ AGENT CONSOLE ◆' + [전체][에이전트][토론] 탭 + 접기 단추(펼침이 기본). 판정 줄(#m-verdict)·분석 고지 바로 아래
   · 줄은 오는 차례대로 아래에 쌓이고(맨 아래로 따라감), 새 분석 런(run:start)마다 비운다 — PC판 resetConsole과 같음
   · 줄 종류(PC판 app.js pushLog·pushAgentLog와 같은 갈래): 단계 줄 '── … ──' · 직원 줄(이름 · 역할 · 말 — 누르면 전체 글) ·
     최종 판정 줄 '>>> 최종 판정: SELL (83%) · PM APPROVE' · 안내 줄
   · 탭: 에이전트 = 직원(토론 빼고) + 최종 판정 줄, 토론 = BULL·BEAR·RISKY·NEUTRAL·SAFE, 전체 = 모두(PC판 applyFilter)
   · 들어오는 곳: 버스 log(단계·판정·안내 줄) · agent:done · run:start(비움) · lite:talk(system 안내 · discard — 그 요청의 실시간 줄을 거두고 안내 한 줄).
     잡담(life.js)·실계좌 기록(ui.js) 줄은 싣지 않는다(2026-10-23 요청)
   createElement·textContent만. createTalkLog·fromEvent는 순수(Node 시험), install이 브라우저에서 DOM을 만든다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteTalkLog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXT = Object.freeze({ head: '◆ AGENT CONSOLE ◆', empty: '대기 중', aria: 'AGENT CONSOLE', count: (n) => `브리핑 ${n}건`, jump: '↓ 새 로그' });
  const TABS = Object.freeze([['all', '전체'], ['agent', '에이전트'], ['debate', '토론']]);
  const LIMITS = Object.freeze({ rows: 200, text: 160, full: 8000 });
  const NAMES = Object.freeze({ taro: 'TARO', diana: 'DIANA', nova: 'NOVA', vibe: 'VIBE', bull: 'BULL', bear: 'BEAR', blitz: 'BLITZ', guard: 'GUARD',
    risky: 'RISKY', neutral: 'NEUTRAL', safe: 'SAFE', ace: 'ACE', pm: 'PM' });
  // PC판 ROLES·DEBATE_IDS와 같은 값
  const ROLES = Object.freeze({ taro: '기술적 분석', diana: '기본적 분석', nova: '뉴스 분석', vibe: '센티먼트', bull: '매수 근거', bear: '매도 근거',
    blitz: '스캘퍼', guard: '리스크 관리', risky: '공격적 리스크', neutral: '중립적 리스크', safe: '보수적 리스크', ace: '수석 트레이더', pm: '포트폴리오 매니저' });
  const DEBATE_IDS = Object.freeze(['bull', 'bear', 'risky', 'neutral', 'safe']);
  // PC판 app.js AGENT_TINT(콘솔 이름표 색) 그대로 — 2026-10-23 사무실 2차 요청 3. 색은 lite.css의 .tl-a-<id>(--tint)가 칠한다(style 속성 없음)
  const TINT = Object.freeze({ taro: '#3b6fd4', diana: '#a94f6b', nova: '#e8c84a', vibe: '#7a4bc4', bull: '#e08a3c', bear: '#c0392b', blitz: '#22d3ee',
    guard: '#9aa4b2', risky: '#ff7a3c', neutral: '#7f93b0', safe: '#2f9e8f', ace: '#e8c86a', pm: '#d4af37' });
  const KST = 9 * 3600000;

  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  function hm(at) {
    if (!(typeof at === 'number' && Number.isFinite(at))) return '--:--';
    return new Date(at + KST).toISOString().slice(11, 16);
  }
  const titleOf = (r) => [r.who, r.role, hm(r.at)].filter(Boolean).join(' · ');
  // 탭에 보이는가(PC판 applyFilter)
  function shows(filter, cat) {
    if (filter === 'agent') return cat === 'agent' || cat === 'verdict';
    if (filter === 'debate') return cat === 'debate';
    return true;
  }

  function createTalkLog(opts = {}) {
    const max = opts.max > 0 ? Math.round(opts.max) : LIMITS.rows;
    let rows = [];
    let seq = 0;
    return {
      add(r) {
        if (!r || !['sys', 'stage', 'verdict', 'agent', 'debate'].includes(r.cat)) return null;
        const text = clip(oneLine(r.text), LIMITS.text);
        if (!text) return null;
        const fullRaw = typeof r.full === 'string' && r.full.trim() ? r.full : String(r.text);
        seq += 1;
        const row = {
          cat: r.cat, live: r.live === true, who: typeof r.who === 'string' ? r.who : '', role: typeof r.role === 'string' ? r.role : '',
          id: typeof r.id === 'string' && Object.hasOwn(TINT, r.id) ? r.id : '', ev: typeof r.ev === 'string' ? clip(oneLine(r.ev), LIMITS.text) : '',
          text, full: clip(fullRaw, LIMITS.full), at: r.at, key: typeof r.key === 'string' && r.key ? r.key : `${r.cat}:${seq}`,
        };
        rows.push(row);
        if (rows.length > max) rows = rows.slice(rows.length - max);
        return row;
      },
      clear() { rows = []; },
      removeWhere(pred) {
        const before = rows.length;
        rows = rows.filter((r) => !pred(r));
        return before - rows.length;
      },
      rows: () => rows.map((r) => ({ ...r })),
      briefs: () => rows.filter((r) => r.cat === 'agent' || r.cat === 'debate').length,
    };
  }

  // 버스 이벤트 하나 → { clear?, add: [줄…], discard?: req } | null. opts: now()
  function fromEvent(ev, opts = {}) {
    if (!ev || typeof ev.type !== 'string') return null;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const row = (cat, text, extra = {}) => ({ cat, text, full: extra.full || text, at: now(), who: extra.who || '', role: extra.role || '', live: !!extra.live, key: extra.key || null, id: extra.id || '', ev: extra.ev || '' });
    if (ev.type === 'run:start') return { clear: true, add: [] };
    if (ev.type === 'log') {
      const line = typeof ev.line === 'string' ? ev.line : '';
      if (!line.trim()) return null;
      if (line.startsWith('>>>')) return { add: [row('verdict', line)] };
      if (ev.kind === 'stage') return { add: [row('stage', line)] };
      return { add: [row('sys', line.replace(/^>\s*/, ''))] };
    }
    if (ev.type === 'agent:done') {
      const id = String(ev.id || '');
      const who = NAMES[id] || id.toUpperCase();
      const text = typeof ev.bubble === 'string' ? ev.bubble : '';
      const full = typeof ev.report === 'string' && ev.report ? ev.report : text;
      const cat = DEBATE_IDS.includes(id) ? 'debate' : 'agent';
      // 근거 줄(PC판 콘솔의 '📊 …') — 본문에 그 줄이 있을 때만(허브가 넘긴 직원 본문 그대로, 새 칸 없음)
      const evLine = String(full || '').split('\n').map((x) => x.trim()).find((x) => x.startsWith('📊')) || '';
      const extra = { who, role: ROLES[id] || '', full, live: !!ev.live, key: ev.live ? `live:${ev.req}:${ev.n}` : null, id, ev: evLine };
      return { add: [row(cat, text, extra)] };
    }
    if (ev.type === 'lite:talk') {
      const text = typeof ev.text === 'string' ? ev.text : '';
      if (ev.kind === 'discard') return { discard: ev.req, add: text ? [row('sys', text)] : [] };
      if (ev.kind === 'system') return text ? { add: [row('sys', text)] } : null;
    }
    return null;
  }

  function applyEvent(log, ev, opts) {
    const r = fromEvent(ev, opts);
    if (!r) return false;
    if (r.clear) log.clear();
    if (r.discard != null) {
      const pre = `live:${r.discard}:`;
      log.removeWhere((x) => typeof x.key === 'string' && x.key.startsWith(pre));
    }
    // 같은 글 안내가 바로 앞 줄이면 다시 싣지 않는다(실시간 끝 O-41은 단계 줄 log와 lite:talk system이 같이 옴)
    r.add.forEach((x) => {
      const rows = log.rows();
      const last = rows[rows.length - 1];
      if (x.cat === 'sys' && last && oneLine(last.text) === oneLine(x.text)) return;
      log.add(x);
    });
    return true;
  }

  // 자리 — 분석 고지가 있으면 그 뒤, 없으면 판정 줄 뒤
  function placeAfter(doc) {
    return doc.querySelector('#lite-analysis-note') || doc.querySelector('#m-verdict') || null;
  }

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !LITE.bus || !doc || !doc.documentElement) return null;
    if (!doc.documentElement.classList.contains('shell')) return null; // 셸 사무실만(R11)
    const make = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const now = () => ((win.Date && typeof win.Date.now === 'function') ? win.Date.now() : Date.now());
    const log = createTalkLog({ max: LIMITS.rows });
    let filter = 'all';

    const box = make('section', null, null);
    box.id = 'lite-talklog';
    box.setAttribute('aria-label', TEXT.aria);
    const bar = make('div', 'tl-bar', null);
    const title = make('span', 'tl-title', TEXT.head);
    const tabs = make('div', 'tl-tabs', null);
    const tabEls = TABS.map(([f, label]) => {
      const b = make('button', f === filter ? 'tl-tab active' : 'tl-tab', label);
      b.type = 'button';
      b.setAttribute('data-filter', f);
      b.addEventListener('click', () => {
        filter = f;
        tabEls.forEach((x) => x.classList.toggle('active', x === b));
        paint();
      });
      tabs.append(b);
      return b;
    });
    const head = make('button', 'tl-fold', '▾');
    head.id = 'lite-talklog-head';
    head.type = 'button';
    head.setAttribute('aria-expanded', 'true');
    head.setAttribute('aria-controls', 'lite-talklog-list');
    head.setAttribute('aria-label', '접기');
    bar.append(title, tabs, head);
    const list = make('ol', null, null);
    list.id = 'lite-talklog-list';
    // PC판 #console-jump — 위로 올려 읽는 중 새 줄이 오면 보이고, 누르면 맨 아래로
    const jump = make('button', 'tl-jump', TEXT.jump);
    jump.id = 'lite-talklog-jump';
    jump.type = 'button';
    jump.hidden = true;
    let follow = true;
    const nearBottom = () => {
      try { return list.scrollHeight - list.scrollTop - list.clientHeight < 40; } catch (_) { return true; }
    };
    list.addEventListener('scroll', () => {
      follow = nearBottom();
      if (follow) jump.hidden = true;
    });
    jump.addEventListener('click', () => {
      try { list.scrollTop = list.scrollHeight; } catch (_) { /* 가짜 DOM */ }
      follow = true;
      jump.hidden = true;
    });
    const status = make('div', 'tl-status', null);
    const stStage = make('span', 'tl-stage', TEXT.empty);
    const stCount = make('span', 'tl-count', '');
    status.append(stStage, stCount);
    box.append(bar, list, jump, status);
    const anchor = placeAfter(doc);
    if (anchor && typeof anchor.after === 'function') anchor.after(box);
    else {
      const stage = doc.querySelector('#stage');
      (stage || doc.body).append(box);
    }

    let open = true;
    const setOpen = (on) => {
      open = !!on;
      box.classList.toggle('collapsed', !open);
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      head.setAttribute('aria-label', open ? '접기' : '펼치기');
      list.hidden = !open;
      head.textContent = open ? '▾' : '▸';
    };
    head.addEventListener('click', () => setOpen(!open));

    function rowEl(r) {
      const li = make('li', `tl-row tl-c-${r.cat}${r.id ? ` tl-a-${r.id}` : ''}${r.live ? ' tl-k-live' : ''}`, null);
      li.setAttribute('data-key', r.key);
      if (r.cat === 'agent' || r.cat === 'debate') {
        const btn = make('button', 'tl-line', null);
        btn.type = 'button';
        const text = make('span', 'tl-text', r.text);
        btn.append(make('b', 'tl-who', r.who));
        if (r.role) btn.append(make('span', 'tl-role', r.role));
        btn.append(text);
        if (r.ev) btn.append(make('span', 'tl-ev', r.ev));
        btn.addEventListener('click', () => {
          if (typeof win.openModal === 'function') { try { win.openModal(titleOf(r), r.full || r.text); return; } catch (_) { /* 아래로 */ } }
          const on = !li.classList.contains('open');
          li.classList.toggle('open', on);
          text.textContent = on ? r.full || r.text : r.text;
        });
        li.append(btn);
      } else if (r.cat === 'stage') {
        // PC판 단계 줄 — '—— 수석 트레이더 1차 판정 ——'
        const core = r.text.replace(/[─—]/g, '').trim();
        li.append(make('span', 'tl-text', core ? `—— ${core} ——` : r.text));
      } else {
        li.append(make('span', 'tl-text', r.text));
      }
      return li;
    }
    function paint() {
      const rows = log.rows();
      list.replaceChildren(...rows.filter((r) => shows(filter, r.cat)).map(rowEl));
      const stages = rows.filter((r) => r.cat === 'stage');
      stStage.textContent = stages.length ? stages[stages.length - 1].text.replace(/[─—]/g, '').trim() || TEXT.empty : TEXT.empty;
      const n = log.briefs();
      stCount.textContent = n ? TEXT.count(n) : '';
      if (!rows.length) follow = true;
      if (follow) {
        try { list.scrollTop = list.scrollHeight; } catch (_) { /* 가짜 DOM */ }
        jump.hidden = true;
      } else if (rows.length) jump.hidden = false;
    }
    LITE.bus.subscribe((ev) => {
      try { if (applyEvent(log, ev, { now })) paint(); } catch (_) { /* 콘솔 실패가 사무실을 멈추지 않게 */ }
    });
    paint();
    const api = { rows: () => log.rows(), open: setOpen, filter: () => filter };
    LITE.talklog = api;
    return api;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { TEXT, TABS, ROLES, DEBATE_IDS, TINT, LIMITS, hm, titleOf, shows, createTalkLog, fromEvent, applyEvent, placeAfter, install };
});
