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

  function makeSmearLayers() {
    // One stronger, narrower core stroke plus several wider, lighter strokes
    // nudged sideways and shortened/lengthened by their own random amount —
    // the core keeps a visible dark spine so the mark doesn't read as one
    // flat tone, while the loose outer layers rough up the edge (finger
    // dragged through charcoal), not a cluster of separate dots.
    var layers = [
      { perp: 0, widthScale: 0.55, alpha: 1, padStart: -0.05, padEnd: 0.05 }
    ];
    var n = Math.round(rand(4, 7));
    for (var i = 0; i < n; i++) {
      layers.push({
        perp: rand(-0.4, 0.4),
        widthScale: rand(0.5, 1.5),
        alpha: rand(0.2, 0.75),
        padStart: rand(-0.3, 0.15),
        padEnd: rand(-0.15, 0.3)
      });
    }
    return layers;
  }

  // Charcoal trail: click/drag/tap, plus wheel-scroll on non-touch devices
  // (wheel events don't fire for touch-drag scrolling, so this is naturally
  // desktop-only without needing a pointerType check). Each mark is a short
  // straight smear rather than a point, so a stationary click still reads
  // as a dab and a drag reads as a continuous smudged stroke.
  var TRAIL_MAX = 90;
  var TRAIL_LIFETIME = 1600;
  var TRAIL_FADE_IN = 70;
  var TRAIL_PEAK_ALPHA = 0.32;
  var TRAIL_WHEEL_INTERVAL = 70;
  var TRAIL_BLUR = "blur(1.1px)";

  var trail = [];

  function spawnSmear(clientX1, clientY1, clientX2, clientY2, now) {
    // Stored in document coordinates (not viewport) so a mark stays put on
    // the page as you scroll, instead of sitting glued under the cursor.
    trail.push({
      x1: clientX1 + window.scrollX,
      y1: clientY1 + window.scrollY,
      x2: clientX2 + window.scrollX,
      y2: clientY2 + window.scrollY,
      spawnTime: now,
      color: Math.random() < 0.5 ? "inkSoft" : "ash",
      baseWidth: rand(6, 12),
      layers: makeSmearLayers()
    });
    if (trail.length > TRAIL_MAX) {
      trail.shift();
    }
  }

  function updateAndDrawSmear(mark, now) {
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
    var x1 = mark.x1 - window.scrollX;
    var y1 = mark.y1 - window.scrollY;
    var x2 = mark.x2 - window.scrollX;
    var y2 = mark.y2 - window.scrollY;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var ux = dx / len;
    var uy = dy / len;
    var px = -uy;
    var py = ux;

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.filter = TRAIL_BLUR;
    ctx.strokeStyle = rgbString(rgb);
    ctx.lineCap = "round";
    // Each layer is its own stroke (own offset, width and alpha) rather than
    // one merged path, so the combined edge darkens unevenly and stays rough.
    mark.layers.forEach(function (layer) {
      var ox = px * layer.perp * len;
      var oy = py * layer.perp * len;
      var sx = x1 + ux * len * layer.padStart + ox;
      var sy = y1 + uy * len * layer.padStart + oy;
      var ex = x2 + ux * len * layer.padEnd + ox;
      var ey = y2 + uy * len * layer.padEnd + oy;
      ctx.globalAlpha = alpha * layer.alpha;
      ctx.lineWidth = mark.baseWidth * layer.widthScale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Ambient mist: builds up slowly while the page sits untouched, as if
  // breath fogged a window, and clears quickly the moment the reader acts
  // again. Purely time-driven (no marks/state to track), so it needs only
  // a "when did something last happen" timestamp updated by every input
  // event, touch-trail or not.
  var FOG_IDLE_DELAY = 1500;
  var FOG_MAX_ALPHA = 0.4;
  var FOG_RISE_TAU = 1600;
  var FOG_FALL_TAU = 220;

  var lastInteractionTime = performance.now();
  var fogAlpha = 0;

  function makeFogBlobs() {
    var n = Math.round(rand(3, 5));
    var blobs = [];
    for (var i = 0; i < n; i++) {
      blobs.push({
        x: rand(0.1, 0.9),
        y: rand(0.1, 0.9),
        r: rand(0.32, 0.55),
        driftSpeed: rand(0.00002, 0.00005) * (Math.random() < 0.5 ? 1 : -1),
        phase: rand(0, Math.PI * 2)
      });
    }
    return blobs;
  }

  var fogBlobs = makeFogBlobs();

  function markActivity() {
    lastInteractionTime = performance.now();
  }

  function updateAndDrawFog(now, dt) {
    var idle = now - lastInteractionTime;
    var target = idle > FOG_IDLE_DELAY ? FOG_MAX_ALPHA : 0;
    var tau = target > fogAlpha ? FOG_RISE_TAU : FOG_FALL_TAU;
    fogAlpha += (target - fogAlpha) * (1 - Math.exp(-dt / tau));
    if (fogAlpha <= 0.002) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    fogBlobs.forEach(function (b) {
      var driftX = Math.sin(now * b.driftSpeed + b.phase) * 0.06;
      var driftY = Math.cos(now * b.driftSpeed * 0.8 + b.phase) * 0.06;
      var cx = (b.x + driftX) * width;
      var cy = (b.y + driftY) * height;
      var r = b.r * Math.max(width, height);
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(" + inkSoftRGB[0] + "," + inkSoftRGB[1] + "," + inkSoftRGB[2] + "," + fogAlpha + ")");
      grad.addColorStop(1, "rgba(" + inkSoftRGB[0] + "," + inkSoftRGB[1] + "," + inkSoftRGB[2] + ",0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
    ctx.restore();
  }

  var DRAG_MIN_DIST = 9;
  var isPointerDown = false;
  var lastDragX = 0;
  var lastDragY = 0;

  function handlePointerDown(e) {
    // Marks are allowed anywhere, including over the reading text: the
    // canvas paints above the page with mix-blend-mode: multiply (see
    // style.css), so a mark only darkens what's beneath it — dark ink
    // glyphs stay legible, it never paints an opaque shape over letters.
    isPointerDown = true;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    // A stationary click has no movement to trace, so give it a short dab
    // in a random direction rather than leaving nothing behind.
    var angle = rand(0, Math.PI * 2);
    var len = rand(16, 36);
    spawnSmear(e.clientX, e.clientY, e.clientX + Math.cos(angle) * len, e.clientY + Math.sin(angle) * len, performance.now());
  }

  function handlePointerMove(e) {
    if (!isPointerDown) {
      return;
    }
    var dx = e.clientX - lastDragX;
    var dy = e.clientY - lastDragY;
    if (dx * dx + dy * dy < DRAG_MIN_DIST * DRAG_MIN_DIST) {
      return;
    }
    spawnSmear(lastDragX, lastDragY, e.clientX, e.clientY, performance.now());
    lastDragX = e.clientX;
    lastDragY = e.clientY;
  }

  function handlePointerUp() {
    isPointerDown = false;
  }

  var lastWheelTrailTime = 0;

  function handleWheel(e) {
    var now = performance.now();
    if (now - lastWheelTrailTime < TRAIL_WHEEL_INTERVAL) {
      return;
    }
    var dy = Math.max(-40, Math.min(40, e.deltaY)) * 1.8;
    var dx = Math.max(-20, Math.min(20, e.deltaX)) * 1.8;
    if (Math.abs(dy) + Math.abs(dx) < 4) {
      return;
    }
    lastWheelTrailTime = now;
    spawnSmear(e.clientX, e.clientY, e.clientX + dx, e.clientY + dy, now);
  }

  document.addEventListener("pointerdown", handlePointerDown, { passive: true });
  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("pointerup", handlePointerUp, { passive: true });
  document.addEventListener("pointercancel", handlePointerUp, { passive: true });
  document.addEventListener("wheel", handleWheel, { passive: true });

  document.addEventListener("pointerdown", markActivity, { passive: true });
  document.addEventListener("pointermove", markActivity, { passive: true });
  document.addEventListener("wheel", markActivity, { passive: true });
  document.addEventListener("scroll", markActivity, { passive: true });
  document.addEventListener("keydown", markActivity, { passive: true });

  var rafId = null;
  var lastFrameTime = 0;
  var FRAME_INTERVAL = 1000 / 30;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (now - lastFrameTime < FRAME_INTERVAL) {
      return;
    }
    var dt = lastFrameTime === 0 ? FRAME_INTERVAL : Math.min(now - lastFrameTime, 250);
    lastFrameTime = now;

    ctx.clearRect(0, 0, width, height);
    updateAndDrawFog(now, dt);
    for (var i = trail.length - 1; i >= 0; i--) {
      if (now - trail[i].spawnTime >= TRAIL_LIFETIME) {
        trail.splice(i, 1);
      } else {
        updateAndDrawSmear(trail[i], now);
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
