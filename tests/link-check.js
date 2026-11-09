// Link audit for dhrooby-home: every href/src in every *.html file must
// resolve. Internal links must exist as files in this repo; external links
// must answer 2xx/3xx. mailto: links are skipped (nothing to fetch).
// Proxy paths (/unique-words/, /color-sphere/) are NOT checked here — they
// are covered by tests/proxy-check.js against the live upstreams.
//
// Run: node tests/link-check.js   (exit 0 = all links resolve)
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");

const REPO = process.env.DHROOBY_ROOT || path.join(__dirname, "..");

function* htmlFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

function collectLinks() {
  const links = [];
  for (const file of htmlFiles(REPO)) {
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      links.push({ file: path.relative(REPO, file), url: m[1] });
    }
  }
  return links;
}

// Some sites reject HEAD requests (or drop automated ones). Try HEAD first;
// on a network error or timeout, retry once with GET before calling it a
// failure. Only a 4xx/5xx (or two failed attempts) fails the check.
function checkExternal(url) {
  const headers = { "user-agent": "Mozilla/5.0 (dhrooby link-check)" };
  const attempt = (method) =>
    new Promise((resolve) => {
      const lib = url.startsWith("https://") ? https : http;
      const req = lib.request(url, { method, headers, timeout: 15000 }, (res) => {
        // Drain the body on GET so the socket closes cleanly.
        res.resume();
        resolve({ ok: res.statusCode < 400, status: res.statusCode });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: "timeout" });
      });
      req.on("error", (e) => resolve({ ok: false, status: e.message }));
      req.end();
    });
  return attempt("HEAD").then((r) =>
    r.ok || (typeof r.status === "number" && r.status >= 400) ? r : attempt("GET")
  );
}

(async () => {
  const links = collectLinks();
  let failures = 0;
  const seen = new Set();
  for (const { file, url } of links) {
    const key = url;
    if (seen.has(key)) continue;
    seen.add(key);
    if (url.startsWith("mailto:") || url.startsWith("#") || url.startsWith("data:")) continue;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      // The old Ghost Pilots App Store link 404s and must never come back;
      // anything else external must resolve.
      const r = await checkExternal(url);
      console.log(`${r.ok ? "PASS  " : "FAIL  "} ${url} — ${r.status} (from ${file})`);
      if (!r.ok) failures++;
      continue;
    }
    // Internal: strip query strings, resolve against the repo root.
    const clean = url.split("?")[0].split("#")[0];
    let target = clean === "/" ? "index.html" : clean.replace(/^\//, "");
    if (target.endsWith("/")) target += "index.html";
    const exists = fs.existsSync(path.join(REPO, target));
    // Proxy paths are served by rewrites, not files; proxy-check owns them.
    const isProxy = target.startsWith("unique-words") || target.startsWith("color-sphere");
    console.log(`${exists || isProxy ? "PASS  " : "FAIL  "} ${url} (from ${file})${isProxy ? " — proxy path, see proxy-check" : ""}`);
    if (!exists && !isProxy) failures++;
  }
  console.log(failures === 0 ? `\nAll ${seen.size} links resolve.` : `\n${failures} link(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
