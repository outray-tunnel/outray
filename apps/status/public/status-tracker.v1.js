/* OutRay Status tracker v1. Public page ID only; no cookies or credentials. */
(function () {
  "use strict";
  try {
    var script = document.currentScript;
    var pageId = script && script.getAttribute("data-page-id");
    if (!pageId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pageId)) return;
    var endpoint = new URL("/api/v1/pages/" + encodeURIComponent(pageId) + "/analytics", script.src).href;
    var state = window.__outrayStatusTrackerV1;
    if (!state) {
      state = window.__outrayStatusTrackerV1 = { pages: Object.create(null), listeners: [] };
      var notify = function () { state.listeners.forEach(function (listener) { listener(); }); };
      ["pushState", "replaceState"].forEach(function (method) {
        var original = window.history[method];
        window.history[method] = function () {
          var result = original.apply(this, arguments);
          notify();
          return result;
        };
      });
      window.addEventListener("popstate", notify);
    }
    if (state.pages[pageId]) return;
    state.pages[pageId] = true;
    var lastPath = null;
    var hasTracked = false;
    function track() {
      try {
        if (document.visibilityState !== "visible" || document.prerendering || navigator.doNotTrack === "1" ||
            navigator.globalPrivacyControl || navigator.webdriver) return;
        var path = window.location.pathname;
        if (path === lastPath) return;
        var referrer = "";
        if (!hasTracked && document.referrer) {
          try { referrer = new URL(document.referrer).origin; } catch (_) { /* No referrer. */ }
        }
        var body = JSON.stringify({ eventId: crypto.randomUUID(), path: path, referrer: referrer });
        lastPath = path;
        hasTracked = true;
        void fetch(endpoint, { method: "POST", body: body, headers: { "Content-Type": "text/plain" },
          credentials: "omit", mode: "cors", keepalive: true }).catch(function () {});
      } catch (_) { /* Tracking must never interrupt the customer's application. */ }
    }
    state.listeners.push(track);
    document.addEventListener("visibilitychange", track);
    document.addEventListener("prerenderingchange", track);
    window.addEventListener("pageshow", function (event) { if (event.persisted) { lastPath = null; track(); } });
    track();
  } catch (_) { /* Optional analytics must fail silently. */ }
}());
