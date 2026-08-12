/*
  Scroll engine.

  Five behaviours, all opt-in via data attributes, all driven from one rAF loop
  and one IntersectionObserver so we never stack scroll listeners:

    data-reveal[="fade|left|right|scale"]  fade/slide in once on entry
    data-stagger                           same, cascading to children
    data-draw                              SVG stroke draws itself in
    data-parallax="0.25"                   translateY by a fraction of scroll
    data-scrub                             sets --progress 0..1 across its range
    data-count="80"                        counts up to the number on entry
    data-tilt                              pointer-tracked 3D tilt

  Everything degrades gracefully: with JS off, a no-js guard in BaseLayout
  makes revealed elements visible, and parallax/tilt simply never engage.
*/

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 1. reveal on entry (one-shot) ---------- */

const revealTargets = document.querySelectorAll("[data-reveal], [data-stagger], [data-draw], [data-count]");

// give each drawn path its true length so the dash animation is exact
document.querySelectorAll("[data-draw]").forEach((el) => {
  if (typeof el.getTotalLength === "function") {
    const len = Math.ceil(el.getTotalLength());
    el.style.setProperty("--len", len);
  }
});

if (reduced) {
  revealTargets.forEach((el) => el.classList.add("is-in"));
  document.querySelectorAll("[data-count]").forEach((el) => {
    el.textContent = formatCount(Number(el.dataset.count), el.dataset.countSuffix);
  });
} else {
  const show = (el) => {
    const delay = Number(el.dataset.revealDelay || 0);
    if (delay) el.style.transitionDelay = `${delay}ms`;
    el.classList.add("is-in");
    if (el.hasAttribute("data-count")) runCount(el);
  };

  // The negative bottom margin makes things reveal a beat *before* they reach
  // the bottom edge, which reads better on scroll — but it also means anything
  // sitting in the lowest 12% of the first screen would never fire until the
  // user scrolled. So the initial pass uses the true viewport instead.
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
  );

  revealTargets.forEach((el) => io.observe(el));

  // Reveal anything already on the first screen. This runs again after fonts
  // load and on window load, because webfont swap reflows the page — measuring
  // only once, before that, puts elements at positions they never actually
  // occupy and leaves above-the-fold content stuck invisible.
  const sweepVisible = () => {
    revealTargets.forEach((el) => {
      if (el.classList.contains("is-in")) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        show(el);
        io.unobserve(el);
      }
    });
  };

  sweepVisible();
  window.addEventListener("load", sweepVisible, { once: true });
  if (document.fonts?.ready) document.fonts.ready.then(sweepVisible);
}

/* ---------- 2. counters ---------- */

function formatCount(value, suffix) {
  return value.toLocaleString("en-US") + (suffix || "");
}

function runCount(el) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.countSuffix || "";
  const duration = Number(el.dataset.countDuration || 1600);
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    // easeOutExpo — lands softly on the final figure
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    el.textContent = formatCount(Math.round(target * eased), suffix);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- 3. parallax + scrub (single rAF loop) ---------- */

const parallaxEls = [...document.querySelectorAll("[data-parallax]")];
const scrubEls = [...document.querySelectorAll("[data-scrub]")];
const progressBars = [...document.querySelectorAll("[data-read-progress]")];

let ticking = false;

function frame() {
  ticking = false;
  const vh = window.innerHeight;

  for (const el of parallaxEls) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom < -vh || rect.top > vh * 2) continue;
    const speed = parseFloat(el.dataset.parallax) || 0.15;
    // distance of element centre from viewport centre, normalised
    const centre = rect.top + rect.height / 2 - vh / 2;
    el.style.transform = `translate3d(0, ${(-centre * speed).toFixed(2)}px, 0)`;
  }

  for (const el of scrubEls) {
    const rect = el.getBoundingClientRect();
    const total = rect.height - vh;
    if (total <= 0) continue;
    const p = Math.min(Math.max(-rect.top / total, 0), 1);
    el.style.setProperty("--progress", p.toFixed(4));
    el.classList.toggle("is-scrubbing", p > 0 && p < 1);
  }

  for (const bar of progressBars) {
    const doc = document.documentElement;
    const max = doc.scrollHeight - vh;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(doc.scrollTop / max, 1) : 0})`;
  }
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(frame);
}

if (!reduced && (parallaxEls.length || scrubEls.length || progressBars.length)) {
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  frame();
} else if (progressBars.length) {
  window.addEventListener("scroll", onScroll, { passive: true });
  frame();
}

/* ---------- 4. pointer parallax (hero depth planes) ---------- */

const pointerScenes = [...document.querySelectorAll("[data-pointer-scene]")];

if (!reduced && pointerScenes.length && window.matchMedia("(hover: hover)").matches) {
  pointerScenes.forEach((scene) => {
    const layers = [...scene.querySelectorAll("[data-pointer-depth]")];
    let raf = null;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    scene.addEventListener("pointermove", (e) => {
      const rect = scene.getBoundingClientRect();
      tx = (e.clientX - rect.left) / rect.width - 0.5;
      ty = (e.clientY - rect.top) / rect.height - 0.5;
      if (!raf) raf = requestAnimationFrame(loop);
    });

    scene.addEventListener("pointerleave", () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    });

    function loop() {
      // ease toward the pointer so motion never snaps
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      layers.forEach((layer) => {
        const d = parseFloat(layer.dataset.pointerDepth) || 10;
        layer.style.setProperty("--px", `${(cx * d).toFixed(2)}px`);
        layer.style.setProperty("--py", `${(cy * d).toFixed(2)}px`);
      });
      if (Math.abs(tx - cx) > 0.0005 || Math.abs(ty - cy) > 0.0005) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    }
  });
}

/* ---------- 5. card tilt ---------- */

if (!reduced && window.matchMedia("(hover: hover)").matches) {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    const max = parseFloat(card.dataset.tilt) || 7;

    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--tilt-x", `${(-py * max).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(px * max).toFixed(2)}deg`);
      card.style.setProperty("--gloss-x", `${((px + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--gloss-y", `${((py + 0.5) * 100).toFixed(1)}%`);
    });

    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

/* ---------- 6. nav condense on scroll ---------- */

const nav = document.querySelector("[data-site-nav]");
if (nav) {
  const setNavState = () => nav.classList.toggle("is-condensed", window.scrollY > 40);
  setNavState();
  window.addEventListener("scroll", setNavState, { passive: true });
}
