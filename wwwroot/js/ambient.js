(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  var canvas = document.createElement("canvas");
  canvas.className = "ambient-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  var rootStyles = getComputedStyle(document.documentElement);

  function cssVar(name) {
    return rootStyles.getPropertyValue(name).trim();
  }

  function parseColor(str) {
    var hex = str.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      var v = hex[1];
      return [parseInt(v.substr(0, 2), 16), parseInt(v.substr(2, 2), 16), parseInt(v.substr(4, 2), 16)];
    }
    var rgb = str.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
      var parts = rgb[1].split(",").map(function (p) {
        return parseFloat(p);
      });
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }
    return [0, 0, 0];
  }

  function rgbString(c) {
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }

  var inkSoftRGB = parseColor(cssVar("--color-ink-soft"));
  var ashRGB = parseColor(cssVar("--color-ash"));

  var width = 0;
  var height = 0;

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    width = w;
    height = h;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeMarkShape() {
    // A scatter of small, separately-drawn grains along a randomly-oriented
    // smear axis — reads as charcoal dust rubbed onto paper, not a smooth
    // liquid drop (which is what a single filled cluster of same-alpha
    // circles looks like).
    var n = Math.round(rand(12, 18));
    var smearAngle = rand(0, Math.PI * 2);
    var stretch = rand(1.5, 2.4);
    var cos = Math.cos(smearAngle);
    var sin = Math.sin(smearAngle);
    var grains = [];
    for (var i = 0; i < n; i++) {
      var angle = rand(0, Math.PI * 2);
      var dist = rand(0, 1);
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist;
      grains.push({
        dx: (dx * cos - dy * sin) * stretch,
        dy: dx * sin + dy * cos,
        r: rand(0.1, 0.3),
        a: rand(0.4, 1)
      });
    }
    return grains;
  }

  // Charcoal trail: click/tap, plus mouse-wheel scroll on non-touch devices
  // (wheel events don't fire for touch-drag scrolling, so this is naturally
  // desktop-only without needing a pointerType check).
  var TRAIL_MAX = 50;
  var TRAIL_LIFETIME = 1350;
  var TRAIL_FADE_IN = 90;
  var TRAIL_PEAK_ALPHA = 0.35;
  var TRAIL_WHEEL_INTERVAL = 100;

  var trail = [];

  function spawnTrailMark(clientX, clientY, now) {
    // Stored in document coordinates (not viewport) so a mark stays put on
    // the page as you scroll, instead of sitting glued under the cursor.
    trail.push({
      pageX: clientX + window.scrollX,
      pageY: clientY + window.scrollY,
      spawnTime: now,
      color: Math.random() < 0.5 ? "inkSoft" : "ash",
      shape: makeMarkShape(),
      baseR: rand(14, 26)
    });
    if (trail.length > TRAIL_MAX) {
      trail.shift();
    }
  }

  function updateAndDrawTrailMark(mark, now) {
    var elapsed = now - mark.spawnTime;
    var alpha;
    if (elapsed < TRAIL_FADE_IN) {
      alpha = elapsed / TRAIL_FADE_IN;
    } else {
      alpha = 1 - (elapsed - TRAIL_FADE_IN) / (TRAIL_LIFETIME - TRAIL_FADE_IN);
    }
    alpha = Math.max(0, Math.min(1, alpha)) * TRAIL_PEAK_ALPHA;
    if (alpha <= 0.002) {
      return;
    }

    var rgb = mark.color === "inkSoft" ? inkSoftRGB : ashRGB;
    var cx = mark.pageX - window.scrollX;
    var cy = mark.pageY - window.scrollY;

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = rgbString(rgb);
    // Each grain is its own fill (own alpha) rather than one merged path,
    // so overlaps darken unevenly and the edge stays rough/grainy.
    mark.shape.forEach(function (c) {
      ctx.globalAlpha = alpha * c.a;
      var ccx = cx + c.dx * mark.baseR;
      var ccy = cy + c.dy * mark.baseR;
      var r = c.r * mark.baseR;
      ctx.beginPath();
      ctx.arc(ccx, ccy, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function handlePointerDown(e) {
    // Marks are allowed anywhere, including over the reading text: the
    // canvas paints above the page with mix-blend-mode: multiply (see
    // style.css), so a mark only darkens what's beneath it — dark ink
    // glyphs stay legible, it never paints an opaque shape over letters.
    spawnTrailMark(e.clientX, e.clientY, performance.now());
  }

  var lastWheelTrailTime = 0;

  function handleWheel(e) {
    var now = performance.now();
    if (now - lastWheelTrailTime < TRAIL_WHEEL_INTERVAL) {
      return;
    }
    lastWheelTrailTime = now;
    spawnTrailMark(e.clientX, e.clientY, now);
  }

  document.addEventListener("pointerdown", handlePointerDown, { passive: true });
  document.addEventListener("wheel", handleWheel, { passive: true });

  var rafId = null;
  var lastFrameTime = 0;
  var FRAME_INTERVAL = 1000 / 30;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (now - lastFrameTime < FRAME_INTERVAL) {
      return;
    }
    lastFrameTime = now;

    ctx.clearRect(0, 0, width, height);
    for (var i = trail.length - 1; i >= 0; i--) {
      if (now - trail[i].spawnTime >= TRAIL_LIFETIME) {
        trail.splice(i, 1);
      } else {
        updateAndDrawTrailMark(trail[i], now);
      }
    }
  }

  function startLoop() {
    if (rafId === null) {
      lastFrameTime = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") {
      stopLoop();
    } else {
      startLoop();
    }
  });

  var resizeTimer = null;

  function scheduleResize() {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(function () {
      resizeTimer = null;
      resize();
    }, 150);
  }

  window.addEventListener("resize", scheduleResize);
  window.addEventListener("orientationchange", scheduleResize);

  resize();

  if (document.visibilityState === "visible") {
    startLoop();
  }
})();
