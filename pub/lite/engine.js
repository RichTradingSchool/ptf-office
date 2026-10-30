/* PIXEL TRADING FLOOR 체험판 — 엔진
   서버 engine.js와 같은 이벤트를 브라우저 안에서 만든다. 판정은 LiteBrain, 대사는 LiteScript.
   직원별 "생각 시간"은 연출이다(pace 0이면 즉시 — 테스트용). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./brain.js'), require('./script.js'));
  else root.LiteEngine = factory(root.LiteBrain, root.LiteScript);
})(typeof self !== 'undefined' ? self : this, function (Brain, Script) {
  'use strict';

  const THINK = {
    taro: 1800, vibe: 2200, diana: 2000, nova: 1200, bull: 2000, bear: 2200, blitz: 1800,
    guard: 1600, ace: 2400, risky: 1600, safe: 1800, neutral: 1800, pm: 2000,
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const CHART_BARS = 144; // 상단 차트 = 최근 12시간 5분봉

  function createBus() {
    const subs = new Set();
    return {
      emit(ev) {
        for (const fn of [...subs]) {
          try { fn(ev); } catch (_) { /* 구독자 오류가 방송을 막지 않게 */ }
        }
      },
      subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
    };
  }

  function createEngine(deps) {
    const bus = deps.bus;
    const pace = deps.pace == null ? 1 : deps.pace;
    const sleep = deps.sleep || ((ms) => new Promise((ok) => setTimeout(ok, ms)));
    const wait = (ms) => (pace > 0 && ms > 0 ? sleep(ms * pace) : Promise.resolve());
    const now = deps.now || (() => Date.now());
    const emit = (ev) => bus.emit(ev);
    const log = (line, kind = 'sys') => emit({ type: 'log', kind, line: String(line) });
    // 오류는 토스트(run:error)만으로는 몇 초 뒤 사라진다 — 콘솔에도 이유를 남긴다
    const fail = (message) => {
      log(`> ⚠ ${message}`);
      emit({ type: 'run:error', message });
    };
    let running = false;
    // 모의 매매(site.json paper_trading → LITE_CONFIG.paperTrading, 기본 true). false면 이 빌드에는 모의 계좌가 없다 —
    // 포지션·잔고 기준 비중·차트 계획선(가상 ROE)·매매 카드 문구를 내지 않고 판정만 보인다(대표 결정 2026-10-12)
    const mock = deps.paperTrading !== false;

    // 한 라운드 — 전원 동시에 생각 시작, 생각 시간이 짧은 순서로 발언
    async function round(items) {
      for (const it of items) emit({ type: 'agent:start', id: it.id, ...(it.turn ? { turn: it.turn } : {}) });
      const order = items.slice().sort((a, b) => (THINK[a.id] || 1500) - (THINK[b.id] || 1500));
      let elapsed = 0;
      for (const it of order) {
        const t = THINK[it.id] || 1500;
        await wait(t - elapsed);
        elapsed = t;
        emit({ type: 'agent:done', id: it.id, ...(it.turn ? { turn: it.turn } : {}), bubble: it.text.bubble, report: it.text.report });
      }
    }

    async function run(input, opts = {}) {
      if (running) {
        const err = new Error('이미 분석이 진행 중입니다.');
        err.code = 409;
        throw err;
      }
      running = true;
      // 모드는 하나(스캘핑 길, 대표 결정 2026-10-12 알고리즘·스캘핑 합침) — opts.mode는 읽지 않는다
      const mode = 'scalp';
      const lev = Brain.clampLev(opts.lev);
      const kiosk = !!opts.kiosk;
      try {
        let sym;
        try {
          sym = deps.data.resolveSymbol(input);
        } catch (e) {
          fail(e.message);
          return;
        }
        // auto는 늘 false — 화면(hq.js)이 auto면 "자동 분석 개시 · AI <모델>" 배너를 띄워 AI 판정처럼 보인다
        emit({ type: 'run:start', symbol: sym.symbol, display: sym.display, mock: false, mode, auto: false, model: '자체 로직' });
        // lead: 이 런의 첫 콘솔 줄(run:start가 콘솔을 비운 바로 다음) — 분석 다시 보기의 대체 런 안내(analysis.js TEXT.fallback)
        if (typeof opts.lead === 'string' && opts.lead) log(opts.lead);
        // 담당자판 사무실(m/)은 '데모 버전' 말 없이(대표 결정 2026-10-30 — 비활성화도 정식 버전 + 정밀 분석 횟수 제한)
        log((typeof window !== 'undefined' && window.LITE_CONFIG && window.LITE_CONFIG.relayCapable === true)
          ? '> 체험 분석 — AI 대신 차트 지표 규칙으로 판정합니다 (🔍 정밀 분석은 13명이 각자 AI로 분석)'
          : '> 데모 버전 — AI 엔진 대신 자체 트레이딩 로직으로 판정합니다 (실제 버전은 13명이 각자 AI로 분석)');
        log(`> 바이낸스 ${sym.display} 시세 요청…`);
        const snap = await deps.data.fetchSnapshot(sym);
        const an = Brain.analyze(snap, { lev, mode });
        const T = Script.texts(an, snap);
        // 전광판 배지: 한국 주식은 "KRX 장 시간 · 무기한은 24H", 나머지(코인·미국 주식·금 무기한)는 24시간 거래
        emit({
          type: 'market', priceLine: Script.priceLine(snap), symbol: sym.symbol, display: sym.display, kind: sym.kind === 'krstock' ? 'krstock' : 'crypto',
          axis: snap.axis, tf: '5m',
          candles: snap.k5.slice(-CHART_BARS).map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
        });
        log('> 실시간 시세 수신 완료');
        log(`> ${Script.priceLine(snap)}`);
        for (const l of Script.marketLines(an, snap)) log(`> ${l}`);
        await wait(600);

        log('── 애널리스트 팀 분석 ──', 'stage');
        await round([{ id: 'taro', text: T.taro }, { id: 'vibe', text: T.vibe }]);
        log(`── 스캘핑 데스크 (${lev}x) ──`, 'stage');
        await round([{ id: 'blitz', text: T.blitz }]);
        await round([{ id: 'guard', text: T.guard }]);
        log('── 최종 판정 ──', 'stage');
        await round([{ id: 'ace', text: T.ace }]);

        const { plan, gate, final } = an;
        const bal = deps.paper && mock ? deps.paper.balance() : null;
        const sizing = final.side && bal != null
          ? { marginRequired: r2((bal * final.marginPct) / 100), notional: r2((bal * final.marginPct * lev) / 100), notionalPctOfAccount: final.marginPct * lev }
          : null;
        emit({
          type: 'risk', rr: gate.rr, ok: gate.ok, reasons: gate.reasons.slice(), sizing,
          downgradeReasons: gate.downgradeReasons.slice(), scope: 'scalp', side: plan.side, liq: gate.liq,
          stopBeyondLiq: gate.stopBeyondLiq, downgrade: gate.downgrade, minRR: null, mode,
        });
        log('── 리스크 게이트 ──', 'stage');
        for (const r of gate.reasons) log(`> ${r}`);

        const lv = (v) => (plan.side ? Script.fmtPrice(v) : '-');
        const dec = {
          type: 'decision', action: final.action, confidence: plan.confidence,
          entry: lv(plan.entry), stop: lv(plan.stop), target: lv(plan.target), rationale: T.rationale, report: T.ace.report,
        };
        // 매매 카드 문구는 실제로 모의 포지션이 열릴 판정에만 — 시연·보유 중·한도·잔고 부족·모의 매매 없음이면 "시장가 1차 진입"이라 쓰지 않는다
        const willOpen = mock && !!final.side && !kiosk && !!deps.paper && (!deps.paper.canOpen || deps.paper.canOpen(sym.symbol, final.marginPct));
        dec.scalp = {
          bias: final.bias, entry: lv(plan.entry), stop: lv(plan.stop), target: lv(plan.target),
          note: willOpen ? `${Script.entryCard(final.marginPct)} — ${T.scalpNote}` : T.scalpNote,
        };
        // 모의 매매가 없는 빌드 — public/hq.js가 '진입은 보류했습니다' 보고를 지어내지 않게(ev.replay와 같은 가드)
        if (!mock) dec.noPaper = true;
        dec.rr = gate.rr;
        dec.riskOk = gate.ok;
        dec.riskReasons = gate.reasons.slice();
        dec.liq = gate.liq;
        if (sizing) dec.riskSizing = sizing;
        // 상단 차트용 — 실제로 들어가는 판정의 숫자 레벨, 그리고 규칙이 본 6시간 박스(관망일 때 "돌파 대기"선).
        // 모의 매매가 없으면 계획선도 없다(차트가 '모의 포지션 보류'·가상 ROE를 그리지 않게)
        dec.plan = final.side && mock
          ? { side: final.side, entry: plan.entry, target: plan.target, stop: plan.stop, liq: plan.liq, lev, at: now() }
          : null;
        // 분석이 끝난 뒤에도 사무실이 이어서 이야기할 재료(VIBE 등)
        dec.mood = { rsi: an.sig.rsi, fng: snap.fng || null, fundingPct: Number.isFinite(snap.fundingPct) ? snap.fundingPct : null };
        const k5 = snap.k5;
        const box = an.sig.box;
        const n = k5.length;
        dec.rule = {
          trend: an.sig.trend, candidate: plan.candidate, trigger: plan.trigger, reason: plan.reason, trial: !!plan.trial,
          blocked: gate.downgrade ? 'LIQ' : null,
          // 박스 = 마지막 봉 직전 72개 — 끝 시각은 그 마지막 봉이 닫히는 때
          box: box && n > box.bars + 2
            ? { high: box.high, low: box.low, from: k5[n - 1 - box.bars].t, to: k5[n - 2].t + (k5[n - 2].t - k5[n - 3].t) }
            : null,
        };
        emit(dec);
        log(`>>> 최종 판정: ${final.action} (${plan.confidence}%)`, 'stage');

        if (!mock) {
          // 모의 매매 없음 — 판정만(포지션·보류 줄 없음)
        } else if (final.side && kiosk) {
          log('> 소개 화면 자동 시연 — 모의 포지션은 열지 않습니다');
        } else if (final.side && deps.paper) {
          const res = deps.paper.open({
            symbol: sym.symbol, display: sym.display, side: final.side, mode, entry: plan.entry, stop: plan.stop,
            target: plan.target, liq: plan.liq, leverage: lev, confidence: plan.confidence, rr: gate.rr,
            axis: snap.axis, marginPct: final.marginPct,
          });
          if (res.position) {
            emit({ type: 'position', action: 'open', position: res.position });
            log(`> 가상 포지션 오픈: ${sym.display} ${final.side} ${lev}x @ ${Script.fmtPrice(plan.entry)} · 증거금 ${res.position.margin.toFixed(2)} USDT · 청산가 ${Script.fmtPrice(plan.liq)}`);
            log(`> ${Script.entryCard(final.marginPct)}`);
          } else {
            log(`> 가상 포지션 보류 — ${res.skipped}`);
          }
        } else if (!final.side) {
          log('> 관망 — 이번 판정으로는 포지션을 열지 않습니다');
        }
      } catch (e) {
        fail(e && e.message ? e.message : String(e));
      } finally {
        emit({ type: 'run:end' });
        running = false;
      }
    }

    return { run, isRunning: () => running };
  }

  return { THINK, createBus, createEngine };
});
