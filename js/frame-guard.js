// Clickjacking guard. GitHub Pages cannot send the X-Frame-Options or frame-ancestors headers
// (and browsers ignore frame-ancestors in a <meta> CSP), so the hosted page hides itself when
// it is shown inside a frame. Pages hosted elsewhere, such as a local copy, are left alone.
(function () {
  'use strict';
  var framed;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (!framed || !/(^|\.)github\.io$/i.test(location.hostname)) return;
  document.documentElement.style.display = 'none';
})();
