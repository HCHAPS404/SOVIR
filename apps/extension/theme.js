(function () {
  var key = "sovir-theme";
  try {
    var q = new URLSearchParams(location.search).get("theme");
    var stored = q === "light" || q === "dark" ? q : localStorage.getItem(key);
    if (q === "light" || q === "dark") localStorage.setItem(key, q);
    if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
  } catch (e) {}

  function apply(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  }

  function current() {
    return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function mark() {
    var active = current();
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-theme-choice") === active ? "true" : "false");
    });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-theme-choice]");
    if (!button) return;
    var theme = button.getAttribute("data-theme-choice");
    localStorage.setItem(key, theme);
    apply(theme);
    mark();
  });

  document.addEventListener("DOMContentLoaded", mark);
  mark();
})();
