(function () {
  "use strict";

  function renderActsNav() {
    var root = document.getElementById("acts-nav");
    var acts = window.ACTS;
    if (!root || !Array.isArray(acts)) {
      return;
    }

    var currentAct = document.body.getAttribute("data-act");

    acts.forEach(function (act) {
      var isActive = act.status === "active";
      var isCurrent = act.id === currentAct;
      var el = document.createElement(isActive ? "a" : "span");

      el.className = "acts-nav__item " + (isActive ? "acts-nav__item--active" : "acts-nav__item--locked");
      el.setAttribute("aria-label", act.label + (isActive ? "" : " (скоро)"));
      el.textContent = isActive ? "●" : "○";

      if (isActive) {
        el.href = isCurrent ? "#top" : (act.href || "#top");
        if (isCurrent) {
          el.setAttribute("aria-current", "page");
        }
      } else {
        el.setAttribute("aria-disabled", "true");
      }

      root.appendChild(el);
    });
  }

  document.addEventListener("DOMContentLoaded", renderActsNav);
})();
