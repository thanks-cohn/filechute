import "./service-worker.js";

// The shipping receiver is declared once in manifest.json for normal web pages.
// Do not inject a second copy at runtime: duplicate receiver ownership was one
// of the Windows drag bugs identified during diagnostics.
