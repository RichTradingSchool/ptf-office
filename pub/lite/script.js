/* PIXEL TRADING FLOOR 체험판 — 직원 대사 (규칙 결과 → 말풍선·브리핑 문장)
   숫자는 전부 스냅숏·규칙 결과에서 온다. 없는 값은 "데이터 없음".
   배율을 말하는 문장에는 청산 경고를 함께 넣는다(CLAUDE.md). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./brain.js'));
  else root.LiteScript = factory(root.LiteBrain);
})(typeof self !== 'undefined' ? self : this, function (Brain) {
  'use strict';

  const R = Brain.RULES;
  const fmtPrice = Brain.fmtPrice;
  const NO_DATA = '데이터 없음';
  const pct = (v, d = 2) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}%` : NO_DATA);
  const score = (v) => (v > 0 ? `+${v}` : `${v}`);
  const SIDE_KO = { LONG: '롱', SHORT: '숏' };
  const FNG_KO = { 'Extreme Fear': '극단적 공포', Fear: '공포', Neutral: '중립', Greed: '탐욕', 'Extreme Greed': '극단적 탐욕' };
  const FLOW_KO = { NEW_LONG: '신규 매수 유입', NEW_SHORT: '신규 매도 유입', SHORT_COVER: '숏 커버', LONG_UNWIND: '롱 정리', FLAT: '변화 없음' };
  const TRIGGER_KO = { BREAKOUT: '6시간 박스 돌파', BB_REENTRY: '볼린저 되돌림' };
  const AUX_KO = { fng: '공포탐욕', funding: '펀딩비', ls: '롱숏', flow: '수급' };
  const MISSING_KO = { funding: '펀딩비', oi: '미결제약정', ls: '롱숏 비율', fng: '공포탐욕지수' };
  const voteSide = (v) => (v === 1 ? 'LONG' : v === -1 ? 'SHORT' : null);

  function priceLine(snap) {
    const axis = snap.axis === 'spot' ? '바이낸스 현물' : '바이낸스 USDT 무기한';
    return `$${fmtPrice(snap.price)} (${pct(snap.change24hPct)} 24h) · ${axis}`;
  }

  // 근거 목록 — side는 그 근거가 편드는 방향
  function evidence(sig) {
    const aux = (k) => sig.aux.find((x) => x.key === k).vote;
    const out = [];
    const trendTxt = sig.trend === 'UP' ? '위 — 상승 추세' : sig.trend === 'DOWN' ? '아래 — 하락 추세' : '±0.1% 안 — 추세 불명확';
    out.push({ key: 'trend', side: sig.trend === 'UP' ? 'LONG' : sig.trend === 'DOWN' ? 'SHORT' : null, text: `1시간 EMA50 ${fmtPrice(sig.ema50h)} ${trendTxt}` });
    if (sig.box) {
      out.push({
        key: 'box',
        side: sig.breakout === 'UP' ? 'LONG' : sig.breakout === 'DOWN' ? 'SHORT' : null,
        text: sig.breakout === 'UP' ? `6시간 박스 상단 ${fmtPrice(sig.box.high)} 돌파`
          : sig.breakout === 'DOWN' ? `6시간 박스 하단 ${fmtPrice(sig.box.low)} 이탈`
            : `6시간 박스 ${fmtPrice(sig.box.low)}~${fmtPrice(sig.box.high)} 안에서 횡보`,
      });
    }
    if (sig.bbReentry) {
      out.push({ key: 'bb', side: sig.bbReentry, text: sig.bbReentry === 'LONG' ? '볼린저 하단 밖에서 안으로 복귀 — 되돌림 매수 자리' : '볼린저 상단 밖에서 안으로 복귀 — 되돌림 매도 자리' });
    }
    if (sig.rsi != null) {
      const tag = sig.rsi >= R.pmRsiHot ? ' — 과열' : sig.rsi <= R.pmRsiCold ? ' — 과매도' : '';
      out.push({ key: 'rsi', side: sig.rsi >= R.pmRsiHot ? 'SHORT' : sig.rsi <= R.pmRsiCold ? 'LONG' : null, text: `5분 RSI14 ${sig.rsi.toFixed(1)}${tag}` });
    }
    out.push({
      key: 'fng', side: voteSide(aux('fng')),
      text: sig.fng ? `공포탐욕지수 ${sig.fng.value} (${FNG_KO[sig.fng.label] || sig.fng.label || '분류 없음'})`
        : sig.kind && sig.kind !== 'crypto' ? '공포탐욕지수 — 코인 시장 지표라 이 종목엔 쓰지 않습니다' : `공포탐욕지수 ${NO_DATA}`,
    });
    out.push({
      key: 'funding', side: voteSide(aux('funding')),
      text: sig.fundingPct != null ? `펀딩비 ${pct(sig.fundingPct, 4)}${sig.fundingPct >= R.fundingHot ? ' — 롱 쏠림' : sig.fundingPct <= R.fundingCold ? ' — 숏 쏠림' : ''}` : `펀딩비 ${NO_DATA}`,
    });
    out.push({
      key: 'ls', side: voteSide(aux('ls')),
      text: sig.topLS ? `상위 트레이더 롱숏 ${sig.topLS.ratio.toFixed(2)}${sig.topLS.ratio >= R.lsHigh ? ' — 롱 쏠림' : sig.topLS.ratio <= R.lsLow ? ' — 숏 쏠림' : ''}` : `상위 트레이더 롱숏 ${NO_DATA}`,
    });
    out.push({
      key: 'flow', side: voteSide(aux('flow')),
      text: sig.flow ? `미결제약정 ${sig.oi.hours}시간 ${pct(sig.oi.changePct)} · 가격 ${pct(sig.change24hPct)} → ${FLOW_KO[sig.flow]}` : `미결제약정 ${NO_DATA}`,
    });
    return out;
  }

  function marketLines(an, snap) {
    const head = `5분봉 ${snap.k5.length}개 · 1시간봉 ${snap.k1h.length}개${snap.axis === 'spot' ? ' (선물 접속 불가 — 현물 차트로 대체)' : ''}`;
    return [head, ...evidence(an.sig).map((e) => e.text)];
  }

  // 매매 카드 문구 — 배포판(20261002e) 모양 "시장가 1차 진입 · 격리 · 비중 13% · 익절가 +10% 설정".
  // 비중은 실제 들어간 값(PM 수정 승인이면 절반). 배율은 이 줄에 넣지 않는다(넣을 때는 숫자로만)
  function entryCard(marginPct) {
    return `시장가 1차 진입 · 격리 · 비중 ${marginPct}% · 익절가 +${R.targetMarginPct}% 설정`;
  }

  // 체험용 진입(관망 대신 들어간 판정)에서 규칙상 약한 부분
  function weakWhy(an, short) {
    const p = an.plan;
    if (p.reason === 'NO_TREND') return short ? '추세 불명확' : '1시간 EMA50 ±0.1% 안이라 추세가 불명확합니다';
    if (p.reason === 'NO_TRIGGER') return short ? '트리거 없음' : '같은 방향 트리거(박스 돌파·볼린저 되돌림)가 아직 없습니다';
    return short ? 'RSI 추격' : `5분 RSI ${an.sig.rsi.toFixed(1)} — ${p.side === 'LONG' ? `${R.rsiLongMax} 이상 과열` : `${R.rsiShortMin} 이하 과매도`} 구간 추격입니다`;
  }

  // 직원 대사 — 모드는 하나(스캘핑 길: TARO·VIBE → BLITZ → GUARD → ACE, 대표 결정 2026-10-12 알고리즘·스캘핑 합침)
  function texts(an, snap) {
    const { sig, plan, gate, final, lev } = an;
    const d = sig.display;
    const ev = evidence(sig);
    const find = (k) => ev.find((e) => e.key === k);
    const lines = (arr) => arr.map((e) => `· ${e.text}`).join('\n');
    const warn = `⚠ ${lev}배 격리는 가격이 약 ${(100 / lev - R.mmPct).toFixed(2)}% 반대로 움직이면 증거금 전액이 청산됩니다.`;
    const side = plan.side; // 데모 버전은 늘 방향이 있다 — 관망은 리스크 게이트가 막을 때만
    const lvl = `진입 ${fmtPrice(plan.entry)} · 익절 ${fmtPrice(plan.target)}(증거금 +${R.targetMarginPct}%) · 손절 ${fmtPrice(plan.stop)}(증거금 −${R.stopMarginPct}%)`;
    const why = plan.trial ? `체험용 진입 (${weakWhy(an, true)})` : TRIGGER_KO[plan.trigger];

    // TARO — 기술적 분석
    const taroBubble = sig.trend === 'FLAT' ? `추세가 애매합니다 — EMA50 ${side === 'LONG' ? '위라 롱' : '아래라 숏'} 쪽`
      : plan.trigger === 'BREAKOUT' ? (sig.trend === 'UP' ? '상승 추세에 박스 상단 돌파!' : '하락 추세에 박스 하단 이탈!')
        : plan.trigger === 'BB_REENTRY' ? (sig.trend === 'UP' ? '상승 추세 속 되돌림 매수 자리' : '하락 추세 속 되돌림 매도 자리')
          : `${sig.trend === 'UP' ? '상승' : '하락'} 추세, 트리거는 아직`;
    const taro = {
      bubble: taroBubble,
      report: [`[TARO · 기술적 분석] ${d} — 5분봉 ${snap.k5.length}개 · 1시간봉 ${snap.k1h.length}개`, `· 현재가 $${fmtPrice(sig.price)}`,
        lines(['trend', 'box', 'bb', 'rsi'].map(find).filter(Boolean))].join('\n'),
    };

    // VIBE — 군중 심리 (쏠림의 반대편에 점수)
    const crowd = ['fng', 'funding', 'ls'].map(find);
    const longs = crowd.filter((e) => e.side === 'LONG').length;
    const shorts = crowd.filter((e) => e.side === 'SHORT').length;
    const vibe = {
      bubble: longs > shorts ? '군중이 겁먹었어요 — 역발상 롱 쪽' : shorts > longs ? '군중이 들떴어요 — 역발상 숏 쪽'
        : sig.fng ? `시장 심리 '${FNG_KO[sig.fng.label] || sig.fng.label}' — 쏠림은 없어요` : '심리 지표가 비어 있어요',
      report: [`[VIBE · 센티먼트] ${d} — 쏠림의 반대편에 점수를 줍니다`, lines(crowd),
        sig.missing.length ? `· 수신 실패: ${sig.missing.map((m) => MISSING_KO[m] || m).join('·')} → 해당 항목 0점` : '']
        .filter(Boolean).join('\n'),
    };

    // BLITZ · GUARD — 스캘핑 데스크
    const blitz = {
      bubble: `${lev}x ${SIDE_KO[side]} — 청산가 ${fmtPrice(plan.liq)}`,
      report: `[BLITZ · 스캘핑] ${d} ${SIDE_KO[side]} — ${why}\n· ${lvl}\n${warn}`,
    };
    const liqL = Brain.levels('LONG', sig.price, lev).liq;
    const liqS = Brain.levels('SHORT', sig.price, lev).liq;
    const guard = {
      bubble: gate.stopBeyondLiq ? '청산이 먼저 옵니다! 진입 불가' : '청산가 확인 — 손절이 앞에 있어요',
      report: [`[GUARD · 리스크 관리] ${lev}배 격리 기준 (유지증거금 ${R.mmPct}%)`,
        `· 현재가 기준 롱 청산가 ${fmtPrice(liqL)} · 숏 청산가 ${fmtPrice(liqS)}`,
        `· 계획 손절 ${fmtPrice(plan.stop)} vs 청산 ${fmtPrice(plan.liq)} → ${gate.stopBeyondLiq ? '손절 전에 청산 — 진입 금지' : '손절이 먼저 작동'}`,
        warn].join('\n'),
    };

    // ACE — 판정 (신호가 약해도 관망 없이 방향을 고르고, 약하다는 걸 밝힌다)
    const dir = side === 'LONG' ? 1 : -1;
    const auxLine = sig.aux.map((x) => `${AUX_KO[x.key]} ${x.vote == null ? `${NO_DATA}(0)` : score(x.vote * dir * R.auxWeight)}`).join(' · ');
    const points = `추세 ${sig.trend === 'FLAT' ? 0 : 1} + 트리거 ${plan.trigger ? 1 : 0} + 보조 ${score(plan.auxScore)}`;
    const ace = {
      bubble: `${SIDE_KO[side]} ${plan.confidence}% — ${plan.trial ? '체험용 진입' : TRIGGER_KO[plan.trigger]}`,
      report: [`[ACE · 판정] ${d} ${SIDE_KO[side]} — 확신도 ${plan.confidence}%${plan.trial ? ' · 체험용 진입' : ''}`,
        `· 추세: ${find('trend').text}`,
        `· 트리거: ${plan.trigger ? TRIGGER_KO[plan.trigger] : '없음 — 체험용 진입(규칙상 신호가 약합니다)'}`,
        plan.rsiHot ? `· 추격: ${weakWhy({ ...an, plan: { ...plan, reason: 'RSI_GATE' } })}` : '',
        `· 보조: ${auxLine} → 합계 ${score(plan.auxScore)}`,
        `· 확신도 = 50 + 10 × (${points})${plan.rsiHot ? ` − RSI 추격 ${R.rsiPenalty}` : ''} → ${plan.confidence}% (50~85로 제한)`,
        plan.trial ? '· 데모 버전은 체험용이라 신호가 약해도 방향을 고릅니다 — 실제 매매 기준으로 쓰지 마세요' : '',
        `· ${lvl}`, `· ${lev}배 청산가 ${fmtPrice(plan.liq)}`, warn].filter(Boolean).join('\n'),
    };

    // 판정 한 줄 (decision.rationale)
    let rationale = `${find('trend').text.replace(/^1시간 /, '')} + ${plan.trigger ? TRIGGER_KO[plan.trigger] : '트리거 없음'} · 보조 ${score(plan.auxScore)} → ${SIDE_KO[side]} ${plan.confidence}%${plan.trial ? ' · 체험용 진입' : ''} (데모 버전 자체 로직 판정)`;
    if (gate.downgrade) rationale = `[리스크 게이트] ${gate.downgradeReasons.join(' · ')} ${rationale}`;

    return {
      taro, vibe, blitz, guard, ace, rationale,
      // 매매 카드 문구(entryCard)는 엔진이 실제로 포지션이 열릴 때만 앞에 붙인다
      scalpNote: final.side ? `${why} · 청산가 ${fmtPrice(plan.liq)}` : `패스 — ${gate.downgradeReasons.join(' · ') || '진입 조건 없음'}`,
    };
  }

  return { fmtPrice, priceLine, evidence, marketLines, entryCard, texts };
});
