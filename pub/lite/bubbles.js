/* PIXEL TRADING FLOOR 데모 버전 — 말풍선 관리자 (p37 D1, life.js 앞에 로드 — app.js 다음)
   설계: ptf-mobile docs/superpowers/specs/2026-10-09-ptf-p37-live-office-design.md §1 D1·§2.2·§2.3 (R10)
   public/app.js의 전역 typeBubble·showThinking·resetBubble을 감싼다(app.js 안 직접 호출도 전역 속성을 거쳐 감싼 것을 부른다):
   · 자리별 주인(owner: chatter·record·analysis·system·think)과 세대(gen) — 잡담 9초 지움이 그 사이 새 말풍선을 지우지 않게
   · 책상 .talking(말풍선이 보이는 책상째 위로)·.top(가장 최근에 말한 책상 하나) — lite.css가 휴대폰 중계에서 쌓임을 고친다
   · 실계좌 기록 말풍선만 .rec('실계좌' 표시 — 자리가 아니라 글로 구분, O-48)
   · 휴대폰(html.m) 최신 하나만: analysis가 오면 다른 자리의 analysis·chatter·system을 지운다(think '…'·record는 둔다)
   · 가장자리 밀기: 말풍선이 사무실 칸(#floor) 좌우 4px 밖이면 marginLeft로 안쪽
   · blocked(id)·idleSeats() — life.js 잡담 순서(한 번에 한 명·흐린 자리 안 말함·보이는 말풍선과 겹치면 건너뜀)
   kind: typeBubble(id, text, report, kind) — app.js의 세 인자 호출은 analysis. lite/는 kind를 늘 적는다(기록 record·안내 system·잡담 chatter())
   create(env)는 DOM 없이 시험할 수 있게 재기·찾기를 env로 받는다. install(win)이 브라우저에서 env를 만들고 전역을 감싼다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiteBubbles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KINDS = Object.freeze(['chatter', 'record', 'analysis', 'system']);
  const CLEARED_BY_ANALYSIS = new Set(['analysis', 'chatter', 'system']); // 휴대폰 최신 하나만이 지우는 주인(think·record는 둔다)
  const CHATTER_MS = 9000;
  const EDGE = 4; // 사무실 칸 좌우 여유
  const GAP = 4; // 겹침 여유
  const BOX = Object.freeze({ mobile: 150, desk: 230, h: 56, lift: 8 }); // 말풍선 상자 추정(폭 휴대폰·그 밖, 높이, 책상 위 띄움)

  // env: desk(id) · bubble(desk) · mobile() · shown()(이 화면에 말풍선이 보이는가 — 휴대폰 데모는 거짓) · rect(el) · floor() ·
  //      desks() → [[id, el]] · idle(desk) · orig{ typeBubble, showThinking, resetBubble } · setTimeout · clearTimeout · watch?(bubble, fn)
  function create(env) {
    const owner = new Map(); // id → { kind, gen }
    let gen = 0;
    let topId = null;
    let chatterId = null;
    const deskOf = (id) => { try { return env.desk(id) || null; } catch (_) { return null; } };
    const bubbleOf = (d) => { try { return d ? env.bubble(d) : null; } catch (_) { return null; } };
    const rectOf = (e) => { try { return e ? env.rect(e) : null; } catch (_) { return null; } };
    const isMobile = () => { try { return !!env.mobile(); } catch (_) { return false; } };
    const isShown = () => { try { return !!env.shown(); } catch (_) { return true; } };

    function marks(id, d, on) {
      if (!d) return;
      const b = bubbleOf(d);
      if (on) {
        d.classList.add('talking');
        if (topId && topId !== id) { const t = deskOf(topId); if (t) t.classList.remove('top'); }
        d.classList.add('top');
        topId = id;
        return;
      }
      d.classList.remove('talking');
      d.classList.remove('top');
      if (topId === id) topId = null;
      if (b) {
        b.classList.remove('rec');
        if (b.style) b.style.marginLeft = '';
      }
    }

    // 사무실 칸 좌우 4px 밖이면 안쪽으로 — 한 번 비우고 재서(앞 밀기가 남지 않게) 넘친 만큼
    function nudge(id) {
      if (!isShown()) return;
      const b = bubbleOf(deskOf(id));
      if (!b || !b.style) return;
      b.style.marginLeft = '';
      const r = rectOf(b);
      let f = null;
      try { f = env.floor(); } catch (_) { f = null; }
      if (!r || !f || !(r.width > 0)) return;
      let dx = 0;
      if (r.left < f.left + EDGE) dx = f.left + EDGE - r.left;
      else if (r.right > f.right - EDGE) dx = f.right - EDGE - r.right;
      if (dx) b.style.marginLeft = `${Math.round(dx)}px`;
    }

    function resetBubble(id) {
      owner.delete(id);
      if (chatterId === id) chatterId = null;
      try { env.orig.resetBubble(id); } catch (_) { /* 책상이 없어도 */ }
      marks(id, deskOf(id), false);
    }

    function typeBubble(id, text, report, kind) {
      const k = KINDS.includes(kind) ? kind : 'analysis';
      if (k === 'analysis' && isMobile()) {
        for (const [oid, o] of [...owner]) if (oid !== id && CLEARED_BY_ANALYSIS.has(o.kind)) resetBubble(oid);
      }
      env.orig.typeBubble(id, text, report);
      const d = deskOf(id);
      if (!d) return 0;
      gen += 1;
      owner.set(id, { kind: k, gen });
      if (chatterId === id && k !== 'chatter') chatterId = null;
      marks(id, d, true);
      const b = bubbleOf(d);
      if (b) b.classList.toggle('rec', k === 'record');
      nudge(id);
      if (b && typeof env.watch === 'function') { try { env.watch(b, () => nudge(id), String(text || '').length); } catch (_) { /* 다시 재기 실패 */ } }
      return gen;
    }

    function showThinking(id) {
      try { env.orig.showThinking(id); } catch (_) { return; }
      const d = deskOf(id);
      if (!d) return;
      gen += 1;
      owner.set(id, { kind: 'think', gen });
      if (chatterId === id) chatterId = null;
      d.classList.add('talking');
      const b = bubbleOf(d);
      if (b) b.classList.remove('rec');
      nudge(id);
    }

    // 잡담 한마디 — 앞 잡담 자리를 먼저 지우고, 9초 뒤 그 자리 주인이 여전히 같은 세대의 잡담일 때만 지운다
    function chatter(id, text, report) {
      if (chatterId && chatterId !== id) {
        const o = owner.get(chatterId);
        if (o && o.kind === 'chatter') resetBubble(chatterId);
        chatterId = null;
      }
      const g = typeBubble(id, text, report, 'chatter');
      if (!g) return 0;
      chatterId = id;
      env.setTimeout(() => {
        const o = owner.get(id);
        if (o && o.kind === 'chatter' && o.gen === g) resetBubble(id);
      }, CHATTER_MS);
      return g;
    }

    // 그 책상 위에 생길 말풍선 상자가 지금 보이는 다른 말풍선과 겹치면 참 — 휴대폰에서 말풍선이 보이는 화면(중계)만.
    // 말풍선이 숨겨진 화면(휴대폰 데모)과 데스크톱(분석 말풍선이 다음 런까지 남아 첫 분석 뒤 잡담이 멈춤)은 늘 거짓(R10)
    function blocked(id) {
      if (!isShown() || !isMobile()) return false;
      const r = rectOf(deskOf(id));
      if (!r || !(r.width > 0)) return false;
      const w = isMobile() ? BOX.mobile : BOX.desk;
      const cx = (r.left + r.right) / 2;
      const box = { left: cx - w / 2 - GAP, right: cx + w / 2 + GAP, bottom: r.top - BOX.lift + GAP, top: r.top - BOX.lift - BOX.h - GAP };
      let list = [];
      try { list = env.desks() || []; } catch (_) { list = []; }
      for (const [oid, d] of list) {
        if (oid === id) continue;
        const b = bubbleOf(d);
        if (!b || !b.classList.contains('show')) continue;
        const o = rectOf(b);
        if (!o || !(o.width > 0) || !(o.height > 0)) continue;
        if (o.left < box.right && o.right > box.left && o.top < box.bottom && o.bottom > box.top) return true;
      }
      return false;
    }

    function idleSeats() {
      const out = new Set();
      let list = [];
      try { list = env.desks() || []; } catch (_) { list = []; }
      for (const [id, d] of list) {
        try { if (env.idle(d)) out.add(id); } catch (_) { /* 모르면 말하게 둔다 */ }
      }
      return out;
    }

    return {
      typeBubble, showThinking, resetBubble, chatter, blocked, idleSeats, nudge,
      owner: (id) => (owner.has(id) ? { ...owner.get(id) } : null),
      chatterSeat: () => chatterId,
    };
  }

  /* ----------------------------------------------------------------- 브라우저 */
  function install(win) {
    const LITE = win.LITE;
    const doc = win.document;
    if (!LITE || !doc || typeof win.typeBubble !== 'function' || typeof win.resetBubble !== 'function' || typeof win.showThinking !== 'function') return null;
    const orig = { typeBubble: win.typeBubble, showThinking: win.showThinking, resetBubble: win.resetBubble };
    const root = doc.documentElement;
    const cls = (c) => !!root && root.classList.contains(c);
    const deskList = () => [...doc.querySelectorAll('.desk[id^="desk-"]')].map((d) => [d.id.slice(5), d]);
    const visible = (e) => typeof e.checkVisibility === 'function' ? e.checkVisibility() : e.getClientRects().length > 0;
    // 말풍선이 바뀐 크기(타자 중 글이 늘어남)마다 다시 민다 — 한 관찰자로 모든 말풍선
    const watchers = new Map();
    const ro = typeof win.ResizeObserver === 'function'
      ? new win.ResizeObserver((es) => es.forEach((e) => { const fn = watchers.get(e.target); if (fn) fn(); })) : null;
    const env = {
      desk: (id) => doc.getElementById(`desk-${id}`),
      bubble: (d) => d.querySelector('.bubble'),
      mobile: () => cls('m'),
      // 휴대폰 데모는 public/hq.css가 말풍선을 모두 숨긴다(자막·피드) — 중계(html.relay)만 보인다
      shown: () => !cls('m') || cls('relay'),
      rect: (e) => e.getBoundingClientRect(),
      floor: () => { const f = doc.getElementById('floor'); return f ? f.getBoundingClientRect() : null; },
      desks: deskList,
      idle: (d) => d.classList.contains('idle') || !!d.closest('.room.idle') || !visible(d),
      orig,
      setTimeout: (fn, ms) => win.setTimeout(fn, ms),
      clearTimeout: (id) => win.clearTimeout(id),
      watch: (b, fn, len) => {
        watchers.set(b, fn);
        if (ro) ro.observe(b);
        else win.setTimeout(fn, Math.min(6000, len * 20 + 60)); // 타자가 끝날 무렵 한 번 더
      },
    };
    const m = create(env);
    win.typeBubble = function (id, text, report, kind) { return m.typeBubble(id, text, report, kind); };
    win.showThinking = function (id) { return m.showThinking(id); };
    win.resetBubble = function (id) { return m.resetBubble(id); };
    LITE.bubbles = m;
    return m;
  }

  if (typeof window !== 'undefined' && window.document && window.LITE && !window.LITE_NO_BOOT) install(window);

  return { KINDS, CHATTER_MS, BOX, create, install };
});
