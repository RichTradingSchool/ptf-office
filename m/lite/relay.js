/* PIXEL TRADING FLOOR 데모 버전 — 사무실 중계 모드 (?shell=1&relay=1, 모바일 앱 담당자판 사무실)
   모바일 앱 셸이 postMessage로 넣는 실계좌 회원 송출(RelayState·RelayEvent)을 LitePaper(paper.js)와 같은 모양으로 보여 준다.
   · 읽기 전용 — 스스로 열거나 닫지 않는다(tick은 평가만, settle·closeManual·reset은 아무것도 안 함)
   · 금액(증거금·수량·명목·손익 금액)은 늘 null, 결과는 증거금 기준 %만. account는 null, trades는 빈 배열
     (public/hq.js는 account가 있으면 "모의 계좌 잔고 … USDT"·정기 보고를, trades가 있으면 체결 보고를 만든다)
   · 송출 심볼(BTC)은 바이낸스 무기한 심볼(BTCUSDT)로 — live.js가 시세를 받고 chart.js가 캔들을 그린다
   · 셸 메시지는 검사해서 받는다: 모르는 키는 버리고, 숫자가 아니거나 심볼 형식(^[A-Z0-9]{1,20}$)이 아닌 값이 있는 항목은 버린다
   · 같은 이벤트가 두 번 와도(셸 재연결) 한 번만 반영한다
   설계: ptf-mobile docs/superpowers/specs/2026-10-07-ptf-phase3-2-3-member-follow-design.md §4.3·§4.4·§8.1 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteRelay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 화면 문구 — 설계 §8.1 그대로 (O-07 "인터넷 연결 필요"는 앱 셸 쪽 문구라 여기 없다)
  const TEXT = Object.freeze({
    live: (t) => `실계좌 매매 기록 중계 · 읽기 전용 · ${t} 갱신`, // O-01
    delayed: (t) => `중계 지연 · 마지막 갱신 ${t}`, // O-02
    down: '중계 끊김 — 다시 연결 중', // O-03
    noAnalyze: '실계좌 기록 중계 중에는 분석을 실행할 수 없습니다', // O-04 — 중계 paper.open(새로 분석하지 않음)
    noFeature: '실계좌 기록 중계 중에는 이 기능을 쓸 수 없습니다', // 포지션 닫기·그 밖의 막힌 경로(p34 설계 §4.2, 검토 31)
    basis: '금액은 표시하지 않습니다 · % = 증거금 기준 · 거래 비용 제외', // O-05
    rehearsal: '리허설(시험 신호)', // O-06
    // O-48(p37 — 새 O-08): 기록 말풍선 자리(ACE·GUARD)에 분석 재생·실시간 말도 쓰이므로 자리가 아니라 글의 '실계좌' 표시로 구분
    help: "'실계좌' 표시가 붙은 말풍선(체결·익절·손절 등)은 실계좌 기록, 다른 직원 말풍선은 리치 서버 AI 분석, 시세·뉴스 말풍선은 화면 장식입니다.",
  });
  const KINDS = Object.freeze(['entry', 'dca', 'adjust', 'tp', 'sl', 'close', 'liq', 'untracked', 'lost']);
  const END_KINDS = Object.freeze(['tp', 'sl', 'close', 'liq', 'untracked', 'lost']);
  // 끝 이벤트 → 매매 내역·차트의 정리 사유(설계 §4.4)
  const REASON = Object.freeze({ tp: '익절', sl: '손절', liq: '강제 청산', close: '종료', untracked: '결과 미확인', lost: '결과 미확인' });
  const LINKS = ['live', 'delayed', 'down'];
  const SYM = /^[A-Z0-9]{1,20}$/;
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const MAX_OPEN = 50;
  const MAX_RECENT = 20;
  const MAX_CLOSED = 50;
  const MAX_SEEN = 500;
  const KST = 9 * 3600000;
  const BAD = Object.freeze({ bad: true }); // 검사에 걸린 값 표시 — 메시지의 어떤 값과도 같은 객체가 아니다

  const r2 = (n) => Math.round(n * 100) / 100;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  // 시각(epoch ms) — JS Date가 다룰 수 있는 범위(±8.64e15)만, 한국 시간 +9시간을 더해도 넘지 않게 여유를 둔다
  // (밖이면 toISOString()이 RangeError를 내며 메시지 처리 중간에 멈춘다)
  const isTime = (v) => isNum(v) && v > 0 && v < 8.6e15;
  const reqTime = (v) => (isTime(v) ? v : BAD);
  const optTime = (v) => (v == null ? null : isTime(v) ? v : BAD);
  // 배율 — 3-1 §4.2 허브 검증과 같은 1~200. 없으면 그 항목을 버린다(차트 "롱 undefinedx"·"ROE NaN%", hq.js "nullx"를 막음)
  const reqLev = (v) => (isNum(v) && v >= 1 && v <= 200 ? v : BAD);
  const optNum = (v) => (v == null ? null : isNum(v) ? v : BAD);
  const optPrice = (v) => (v == null ? null : isNum(v) && v > 0 ? v : BAD);
  const optBool = (v) => (v == null ? false : typeof v === 'boolean' ? v : BAD);
  const reqSym = (v) => (typeof v === 'string' && SYM.test(v) ? v : BAD);
  const reqId = (v) => (typeof v === 'string' && ID.test(v) ? v : BAD);
  const reqSide = (v) => (v === 'long' || v === 'short' ? v : BAD);
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const clean = (o) => (Object.values(o).includes(BAD) ? null : o);

  // RelayEvent = { seq, at, kind, id, symbol, side, lev, stage, maxStage, manual, price, avg, tp, sl, resultPct, late, rehearsal }
  function cleanEvent(e) {
    if (!isObj(e) || !KINDS.includes(e.kind)) return null;
    return clean({
      seq: optNum(e.seq), at: reqTime(e.at), kind: e.kind, id: reqId(e.id), symbol: reqSym(e.symbol), side: reqSide(e.side),
      lev: reqLev(e.lev), stage: optNum(e.stage), maxStage: optNum(e.maxStage), manual: optBool(e.manual),
      price: optPrice(e.price), avg: optPrice(e.avg), tp: optPrice(e.tp), sl: optPrice(e.sl),
      resultPct: optNum(e.resultPct), late: optBool(e.late), rehearsal: optBool(e.rehearsal),
    });
  }

  // RelayState.open[] = { id, symbol, side, lev, stage, maxStage, openedAt, avg, tp, sl, liq, tpPct, slPct, rehearsal }
  function cleanOpen(o) {
    if (!isObj(o)) return null;
    return clean({
      id: reqId(o.id), symbol: reqSym(o.symbol), side: reqSide(o.side), lev: reqLev(o.lev), stage: optNum(o.stage), maxStage: optNum(o.maxStage),
      openedAt: reqTime(o.openedAt), avg: optPrice(o.avg), tp: optPrice(o.tp), sl: optPrice(o.sl), liq: optPrice(o.liq),
      tpPct: optNum(o.tpPct), slPct: optNum(o.slPct), rehearsal: optBool(o.rehearsal),
    });
  }

  // RelayState = { v: 1, test, updated, stale, autoOn, autoSymbols, open, recent } — 머리 값이 틀리면 통째로 버린다
  function cleanState(s) {
    if (!isObj(s) || s.v !== 1 || !Array.isArray(s.open) || (s.recent != null && !Array.isArray(s.recent))) return null;
    const head = clean({ test: optBool(s.test), updated: optTime(s.updated), stale: optBool(s.stale), autoOn: optBool(s.autoOn) });
    if (!head) return null;
    return {
      ...head,
      autoSymbols: Array.isArray(s.autoSymbols) ? s.autoSymbols.filter((x) => reqSym(x) !== BAD).slice(0, 20) : [],
      open: s.open.map(cleanOpen).filter(Boolean).slice(0, MAX_OPEN),
      recent: (s.recent || []).map(cleanEvent).filter(Boolean).slice(-MAX_RECENT),
    };
  }

  // 화면 시각은 한국 시간(기기 시간대와 무관)
  const hm = (ms) => (isTime(ms) ? new Date(ms + KST).toISOString().slice(11, 16) : '—');
  function mdhm(ms) {
    if (!isTime(ms)) return '—';
    const d = new Date(ms + KST);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${d.toISOString().slice(11, 16)}`;
  }
  // 결과 % — 소수 1자리, 음수는 −(U+2212), 0은 0.0%
  function pct(v) {
    if (!isNum(v)) return null;
    const r = Math.round(v * 10) / 10;
    if (r === 0) return '0.0%';
    return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}%`;
  }
  const sideKo = (s) => (s === 'short' || s === 'SHORT' ? '숏' : '롱');
  function stageText(stage, maxStage) {
    if (!isNum(stage)) return '';
    return isNum(maxStage) ? `${stage}/${maxStage}차` : `${stage}차`;
  }
  const toneOf = (v) => (isNum(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '');

  // 맨 위 띠 — 끊김(O-03) > 지연(O-02: link delayed 또는 상태 stale) > 실시간(O-01)
  function bandText(m) {
    const meta = m || {};
    if (meta.link === 'down') return { text: TEXT.down, tone: 'down' };
    if (meta.link === 'delayed' || meta.stale) return { text: TEXT.delayed(hm(meta.updated)), tone: 'delayed' };
    return { text: TEXT.live(hm(meta.updated)), tone: 'live' };
  }

  // 고정 말풍선(설계 §4.4 표) — 우리가 정한 문장만. 리허설은 앞에 O-06
  function bubbleFor(e) {
    if (!e) return null;
    const res = pct(e.resultPct);
    const withPct = (w) => (res ? `${w} ${res}` : w);
    let who = 'ace';
    let text = null;
    switch (e.kind) {
      case 'entry': text = `${e.symbol} ${sideKo(e.side)} ${isNum(e.stage) ? e.stage : 1}차 진입 체결`; break;
      case 'dca': text = e.manual ? '직접 추가 진입 체결' : isNum(e.stage) ? `${e.stage}차 추가 진입 체결` : '추가 진입 체결'; break;
      case 'adjust': who = 'guard'; text = '익절·손절가 조정'; break;
      case 'tp': text = withPct('익절'); break;
      case 'sl': who = 'guard'; text = withPct('손절'); break;
      case 'liq': who = 'guard'; text = withPct('청산'); break;
      case 'close': text = withPct('포지션 종료'); break;
      case 'untracked':
      case 'lost': who = 'guard'; text = '추적 종료 — 결과 미확인'; break;
      default: return null;
    }
    return { who, text: e.rehearsal ? `${TEXT.rehearsal} · ${text}` : text };
  }

  // 매매 내역 줄 — 보유 중(평가 ROE)과 최근 끝난 매매(결과 %). 금액 없음
  function historyRows(snap) {
    const s = snap || {};
    const open = (s.open || []).map((p) => ({
      open: true, time: mdhm(p.openedMs), who: `${p.display} ${sideKo(p.side)}`,
      detail: [p.relayStage, '보유 중'].filter(Boolean).join(' · '),
      pct: pct(p.roePct) || '평가 대기', tone: toneOf(p.roePct),
    }));
    const closed = (s.closed || []).map((c) => ({
      open: false, time: mdhm(c.closedMs), who: `${c.display} ${sideKo(c.side)}`,
      detail: [c.relayStage, c.closeReason].filter(Boolean).join(' · '),
      pct: pct(c.realizedRoePct) || '—', tone: toneOf(c.realizedRoePct),
    }));
    return [...open, ...closed];
  }

  function create(opts = {}) {
    const now = opts.now || (() => Date.now());
    let book = new Map(); // id → 열린 포지션(LitePaper 모양)
    let closed = []; // 최근 끝난 것, 새것부터
    let recent = []; // 최근 RelayEvent(오래된 것부터, 20건)
    const seen = new Set(); // 본 이벤트 키 — 넣은 순서대로, 같은 키는 한 번만(MAX_SEEN 넘으면 가장 오래된 것부터 뺀다)
    const meta = { test: false, updated: null, stale: false, autoOn: false, autoSymbols: [], link: null, hasState: false };

    const keyOf = (e) => [e.rehearsal ? 'r' : 'm', e.seq == null ? '' : e.seq, e.id, e.kind, e.at].join('|');
    // 상태마다 최근 20건을 다시 기억해도 키가 겹쳐 쌓이지 않게 — 이미 있던 키는 맨 뒤(새것)로 옮긴다.
    // (예전 배열+Set은 같은 키가 배열에 여러 번 쌓여, 상태 26번쯤 뒤 오래된 사본을 빼면서 방금 넣은 키까지 지웠다)
    function remember(k) {
      if (seen.has(k)) seen.delete(k);
      seen.add(k);
      while (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
    }

    function toPos(o) {
      const t = o.openedAt;
      return {
        id: o.id, symbol: `${o.symbol}USDT`, base: o.symbol, display: o.rehearsal ? `${o.symbol} · ${TEXT.rehearsal}` : o.symbol,
        side: o.side === 'short' ? 'SHORT' : 'LONG', mode: 'relay', axis: 'perp',
        entry: o.avg, stop: o.sl, target: o.tp, liq: o.liq, rr: null, leverage: o.lev,
        margin: null, marginPct: null, notional: null, qty: null, confidence: null,
        source: 'relay', status: 'open', openedAt: new Date(t).toISOString(), openedMs: t, checkFrom: t,
        lastPrice: null, markedAt: null, unrealizedPct: null, roePct: null, unrealizedAmt: null, hitStop: false, hitTarget: false,
        stage: o.stage, maxStage: o.maxStage, relayStage: stageText(o.stage, o.maxStage), tpPct: o.tpPct, slPct: o.slPct, rehearsal: o.rehearsal,
      };
    }
    // 장부에 없는 매매를 이벤트 하나로 — 진입·추가 진입은 평단이 비면 체결가로, 끝 이벤트는 평단을 모르면 비운 채
    // (끝 이벤트의 price는 청산가라 평단으로 쓰면 차트가 매수 표시·연결선을 청산가에 그린다)
    function posFromEvent(e) {
      const avg = END_KINDS.includes(e.kind) ? e.avg : e.avg != null ? e.avg : e.price;
      return toPos({
        id: e.id, symbol: e.symbol, side: e.side, lev: e.lev, stage: e.stage, maxStage: e.maxStage, openedAt: e.at,
        avg, tp: e.tp, sl: e.sl, liq: null, tpPct: null, slPct: null, rehearsal: e.rehearsal,
      });
    }
    // 실시간 가격으로 평가만 — 평단이 없으면 ROE도 없음, 배율이 없으면 ROE 없음
    function markPos(p, px) {
      if (!isNum(px) || !(px > 0)) return false;
      p.lastPrice = px;
      p.markedAt = new Date(now()).toISOString();
      if (!isNum(p.entry)) {
        p.unrealizedPct = null;
        p.roePct = null;
        return true;
      }
      const move = ((px - p.entry) / p.entry) * 100 * (p.side === 'SHORT' ? -1 : 1);
      p.unrealizedPct = r2(move);
      p.roePct = isNum(p.leverage) ? r2(move * p.leverage) : null;
      return true;
    }
    function toClosed(p, e) {
      const done = {
        ...p, status: 'closed', exitPrice: e.price, closedAt: new Date(e.at).toISOString(), closedMs: e.at,
        closeReason: REASON[e.kind], endKind: e.kind, realizedPct: null, realizedRoePct: e.resultPct, realizedAmt: null,
        holdMin: isNum(p.openedMs) ? Math.max(0, Math.round((e.at - p.openedMs) / 60000)) : null, note: null, late: e.late,
      };
      delete done.unrealizedPct;
      delete done.unrealizedAmt;
      delete done.roePct;
      return done;
    }

    // 셸 상태(1초 묶음)는 통째로 기준이지만, 그 상태를 만든 뒤에 온 실시간 이벤트(at > updated, 상태의 recent에 없음)는
    // 아직 들어가 있지 않을 수 있다 — 다시 얹어서 막 연 포지션이 사라지거나 막 끝난 매매의 끝 기록이 빠지지 않게(계획 「결정·해석」 6).
    // 끝 기록은 이미 있던 것(장부 값으로 만든 것)을 다시 쓰고, 없으면 직전 장부의 평단·진입 시각·익절·손절가로 만든다
    function applyState(input) {
      const s = cleanState(input);
      if (!s) return false;
      const prevBook = book;
      const prevClosed = new Map(closed.map((c) => [`${c.id}|${c.endKind}`, c]));
      const stateKeys = new Set(s.recent.map(keyOf));
      const late = isNum(s.updated) ? recent.filter((e) => e.at > s.updated && !stateKeys.has(keyOf(e))) : [];
      const next = new Map();
      for (const o of s.open) {
        const p = toPos(o);
        const prev = prevBook.get(o.id);
        if (prev && isNum(prev.lastPrice)) markPos(p, prev.lastPrice);
        next.set(o.id, p);
      }
      book = next;
      recent = [...s.recent, ...late].sort((a, b) => a.at - b.at).slice(-MAX_RECENT);
      recent.forEach((e) => remember(keyOf(e)));
      closed = s.recent.filter((e) => END_KINDS.includes(e.kind)).sort((a, b) => b.at - a.at)
        .map((e) => prevClosed.get(`${e.id}|${e.kind}`) || toClosed(prevBook.get(e.id) || posFromEvent(e), e)).slice(0, MAX_CLOSED);
      late.forEach((e) => step(e, { book: prevBook, closed: prevClosed }));
      Object.assign(meta, { test: s.test, updated: s.updated, stale: s.stale, autoOn: s.autoOn, autoSymbols: s.autoSymbols, hasState: true });
      return true;
    }

    // 실시간 이벤트 하나 — 진입·추가 진입은 열거나 갱신, 조정은 익절·손절만, 끝은 닫고 최근 끝난 목록 맨 앞에
    function applyEvent(input) {
      const e = cleanEvent(input);
      if (!e) return null;
      const k = keyOf(e);
      if (seen.has(k)) return null;
      remember(k);
      recent.push(e);
      if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT);
      return step(e, null);
    }

    // 이벤트 하나를 장부에 반영(중복 검사 없음) — applyEvent와 applyState(상태보다 늦은 이벤트 다시 얹기)가 같이 쓴다.
    // prev: applyState가 바꾸기 전 장부·끝 기록 — 상태에 아직 없는 포지션의 원래 값(진입 시각·평단)과 이미 만든 끝 기록을 이어 쓴다
    function step(e, prev) {
      const cur = book.get(e.id) || null;
      const known = cur || (prev && prev.book.get(e.id)) || null;
      if (e.kind === 'entry' || e.kind === 'dca') {
        const p = known || posFromEvent(e);
        if (isNum(e.stage)) p.stage = e.stage;
        if (isNum(e.maxStage)) p.maxStage = e.maxStage;
        p.relayStage = stageText(p.stage, p.maxStage);
        if (e.avg != null) p.entry = e.avg;
        else if (!isNum(p.entry) && e.price != null) p.entry = e.price;
        p.target = e.tp;
        p.stop = e.sl;
        if (isNum(e.lev)) p.leverage = e.lev;
        if (isNum(p.lastPrice)) markPos(p, p.lastPrice);
        book.set(e.id, p);
        return { event: { ...e }, action: cur ? null : 'open', position: { ...p } };
      }
      if (e.kind === 'adjust') {
        if (cur) {
          cur.target = e.tp;
          cur.stop = e.sl;
          if (e.avg != null) cur.entry = e.avg;
          if (isNum(cur.lastPrice)) markPos(cur, cur.lastPrice);
        }
        return { event: { ...e }, action: null, position: cur ? { ...cur } : null };
      }
      book.delete(e.id);
      const old = prev ? prev.closed.get(`${e.id}|${e.kind}`) : null;
      const done = !cur && old ? old : toClosed(known || posFromEvent(e), e);
      closed = [done, ...closed.filter((c) => !(c.id === done.id && c.endKind === done.endKind))].slice(0, MAX_CLOSED);
      return { event: { ...e }, action: 'close', position: { ...done } };
    }

    function setLink(m) {
      if (!isObj(m) || !LINKS.includes(m.link)) return false;
      meta.link = m.link;
      if (isTime(m.updated)) meta.updated = m.updated;
      return true;
    }

    function snapshot() {
      const list = [...book.values()].sort((a, b) => b.openedMs - a.openedMs);
      return {
        ok: true,
        relay: true,
        summary: {
          openCount: list.length, closedCount: closed.length, evaluated: 0, wins: null, losses: null, winRate: null,
          avgWinPct: null, avgLossPct: null, profitFactor: null, expectancyPct: null, avgRR: null, note: null,
        },
        open: list.map((p) => ({ ...p })),
        closed: closed.map((p) => ({ ...p })),
        account: null,
        trades: [],
      };
    }

    function openSymbols() {
      const by = new Map();
      for (const p of book.values()) {
        const c = by.get(p.symbol);
        if (!c || p.openedMs < c.from) by.set(p.symbol, { symbol: p.symbol, axis: 'perp', from: p.openedMs });
      }
      return [...by.values()];
    }

    function tick(symbol, px) {
      let marked = 0;
      for (const p of book.values()) if (p.symbol === symbol && markPos(p, px)) marked += 1;
      return { done: [], marked };
    }

    return {
      applyState, applyEvent, setLink, snapshot, openSymbols, tick,
      meta: () => ({ ...meta, autoSymbols: meta.autoSymbols.slice() }),
      recent: () => recent.map((e) => ({ ...e })),
      settle: () => [],
      getOpen: (id) => { const p = book.get(id); return p ? { ...p } : null; },
      closeManual: () => null,
      open: () => ({ skipped: TEXT.noAnalyze }),
      canOpen: () => false,
      balance: () => null,
      reset: () => {},
      persistent: () => true,
    };
  }

  return { TEXT, KINDS, END_KINDS, REASON, cleanEvent, cleanOpen, cleanState, hm, mdhm, pct, stageText, bandText, bubbleFor, historyRows, create };
});
