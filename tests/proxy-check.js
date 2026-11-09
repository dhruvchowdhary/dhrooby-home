// Verifies dhrooby-home's vercel.json routing end to end WITHOUT deploying:
// spins up a local server that implements the file's redirects + rewrites
// (same first-match-wins semantics as Vercel) against the LIVE upstream
// Vercel apps, and serves this repo's static files for everything else.
//
// Usage:
//   node tests/proxy-check.js [path/to/vercel.json]
// Defaults to ./vercel.json. Exit 0 = all checks pass.
//
// What it proves: with the OLD config, /color-sphere/ never returns the
// game (live site: Vercel 404). With the NEW config it returns the game
// shell plus its JS/CSS assets through the proxy, and /unique-words/
// keeps working (regression check).
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const REPO = path.join(__dirname, "..");
const CONFIG = process.argv[2] || path.join(REPO, "vercel.json");
const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "PASS  " : "FAIL  "} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

function matchSource(source, pathname) {
  // Supports exact matches and a trailing ":match*" wildcard.
  if (source.endsWith("/:match*")) {
    const prefix = source.slice(0, -"/:match*".length);
    if (pathname === prefix) return "";
    if (pathname.startsWith(prefix + "/")) return pathname.slice(prefix.length + 1);
    return null;
  }
  return pathname === source ? "" : null;
}

function applyRewrite(rule, pathname, search) {
  const m = matchSource(rule.source, pathname);
  if (m === null) return null;
  let dest = rule.destination.replace(":match*", m);
  if (search) dest += search;
  return dest;
}

function proxyTo(url, res) {
  const u = new URL(url);
  https
    .get({ hostname: u.hostname, path: u.pathname + u.search, headers: { "user-agent": "dhrooby-proxy-check" } }, (up) => {
      const chunks = [];
      up.on("data", (c) => chunks.push(c));
      up.on("end", () => {
        const body = Buffer.concat(chunks);
        res.writeHead(up.statusCode, { "content-type": up.headers["content-type"] || "text/html" });
        res.end(body);
      });
    })
    .on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy error: " + e.message);
    });
}

function serveStatic(pathname, res) {
  let file = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  if (file.endsWith("/")) file += "index.html";
  const full = path.join(REPO, file);
  if (!full.startsWith(REPO) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("The page could not be found\n\nNOT_FOUND");
    return;
  }
  const ext = path.extname(full);
  const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const pathname = u.pathname;
  for (const r of config.redirects || []) {
    if (matchSource(r.source, pathname) !== null) {
      res.writeHead(r.permanent ? 308 : 307, { location: r.destination });
      res.end();
      return;
    }
  }
  for (const rule of config.rewrites || []) {
    const dest = applyRewrite(rule, pathname, u.search);
    if (dest) {
      proxyTo(dest, res);
      return;
    }
  }
  serveStatic(pathname, res);
});

function get(port, p) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "127.0.0.1", port, path: p }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString("utf8") }));
      })
      .on("error", reject);
  });
}

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  try {
    const home = await get(port, "/");
    check("GET / serves the homepage", home.status === 200 && home.body.includes("dhrooby"), `status=${home.status}`);

    const uw = await get(port, "/unique-words/");
    check("GET /unique-words/ serves the game (regression check)", uw.status === 200 && uw.body.includes("Unique Words"), `status=${uw.status}`);

    const cs = await get(port, "/color-sphere/");
    const csOk = cs.status === 200 && cs.body.includes("/_next/static/");
    check("GET /color-sphere/ serves the game shell", csOk, `status=${cs.status}`);
    if (csOk) {
      // The shell is useless without its JS: fetch the first chunk the HTML
      // references, through the same proxy, and confirm it arrives.
      const m = cs.body.match(/\/_next\/static\/chunks\/[A-Za-z0-9._/-]+\.js/);
      if (m) {
        const asset = await get(port, m[0]);
        check(`GET ${m[0]} loads through the proxy`, asset.status === 200 && asset.body.length > 1000, `status=${asset.status} bytes=${asset.body.length}`);
      } else {
        check("game shell references a JS chunk", false, "no /_next/static chunk found in HTML");
      }
      const css = cs.body.match(/\/_next\/static\/css\/[A-Za-z0-9._/-]+\.css/);
      if (css) {
        const asset = await get(port, css[0]);
        check(`GET ${css[0]} loads through the proxy`, asset.status === 200 && asset.body.length > 100, `status=${asset.status} bytes=${asset.body.length}`);
      }
    }

    const redir = await get(port, "/color-sphere");
    check("GET /color-sphere redirects to /color-sphere/", redir.status === 308 && redir.headers.location === "/color-sphere/", `status=${redir.status} location=${redir.headers.location}`);
  } catch (e) {
    console.log("ERROR " + e.message);
    failures++;
  } finally {
    server.close();
    console.log(failures === 0 ? "\nAll proxy checks passed." : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  }
});
