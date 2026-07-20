(function () {
  "use strict";

  function setupSubscribe() {
    var form = document.getElementById("subscribe-form");
    var confirmation = document.getElementById("subscribe-confirmation");
    if (!form || !confirmation) {
      return;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      form.classList.add("is-fading");

      window.setTimeout(function () {
        form.setAttribute("hidden", "");
        confirmation.textContent = "Спасибо. Мы дадим знать тихо, без спешки.";
        confirmation.classList.add("is-visible");
      }, 400);
    });
  }

  document.addEventListener("DOMContentLoaded", setupSubscribe);
})();
