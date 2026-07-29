(function () {
  "use strict";

  var DIVIDER_GLYPH = "〜";

  function renderStory() {
    var actKey = document.body.getAttribute("data-act") || "act-one";
    var data = window.ACT_CONTENT && window.ACT_CONTENT[actKey];
    if (!data) {
      return;
    }

    var epigraphEl = document.getElementById("epigraph");
    if (epigraphEl && data.epigraph) {
      epigraphEl.textContent = data.epigraph;
    }

    var scenesRoot = document.getElementById("scenes");
    if (!scenesRoot || !Array.isArray(data.scenes)) {
      return;
    }

    data.scenes.forEach(function (scene, index) {
      var sceneEl = document.createElement("section");
      sceneEl.className = "scene";

      if (index > 0) {
        var divider = document.createElement("span");
        divider.className = "scene__divider";
        divider.setAttribute("aria-hidden", "true");
        divider.textContent = DIVIDER_GLYPH;
        sceneEl.appendChild(divider);
      }

      (scene.paragraphs || []).forEach(function (paragraph) {
        var p = document.createElement("p");
        p.className = "story__line";
        p.textContent = paragraph;
        sceneEl.appendChild(p);
      });

      scenesRoot.appendChild(sceneEl);
    });
  }

  function setupReveal() {
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var targets = document.querySelectorAll(".story__line, .scene__divider");

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderStory();
    setupReveal();
  });
})();
