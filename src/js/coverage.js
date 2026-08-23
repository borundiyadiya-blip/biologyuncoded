// Reading-progress rail. Fills a coverage-track style bar as the post scrolls.
(function () {
  var fill = document.getElementById("coverage-fill");
  if (!fill) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var horizontal = window.matchMedia("(max-width: 60rem)");
  var ticking = false;

  function update() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) * 100 : 0;
    if (horizontal.matches) {
      fill.style.width = pct + "%";
      fill.style.height = "100%";
    } else {
      fill.style.height = pct + "%";
      fill.style.width = "100%";
    }
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    reduced ? update() : window.requestAnimationFrame(update);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
