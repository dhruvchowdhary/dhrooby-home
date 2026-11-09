# dhrooby.com homepage

Static landing page for [dhrooby.com](https://www.dhrooby.com/) with links to the games. `vercel.json` proxies `/unique-words/` and `/color-sphere/` to their Vercel deployments.

The hub is the front door to everything: the **Games** section (Unique Words, Color Sphere, Ghost Pilots) and the **Apps** section (Whensday, with its full description in real text — Google's OAuth reviewers reach dhrooby.com as Whensday's authorized domain, so that copy must stay). Each game card has its own look: letter tiles for Unique Words, a CSS sphere for Color Sphere, a dark feature card for Ghost Pilots. All copy is the games' own words (Unique Words' "claim unique words" line, Color Sphere's "create amazing color themes", Ghost Pilots' "lose your ship, keep fighting as a ghost").

The Ghost Pilots page (`ghostpilots/`) has no App Store button right now: the listing is currently unavailable while the game is updated for the latest iOS, so the page says that instead of linking to a 404. Do not re-add a store link until it resolves.

## Checks

No build step — the site is static HTML — but routing and links are tested:

```bash
node tests/proxy-check.js   # vercel.json rules in a local reverse proxy vs the live upstreams
node tests/link-check.js    # every href/src in every page resolves
```

CI (`.github/workflows/ci.yml`) runs both, plus `npm install` and a local serve smoke test, on every push and PR.

## Local dev

```bash
npm install
npm run dev
```

Opens at http://localhost:5180 (homepage only — subpath proxies need production or `vercel dev`).

## Routing (why the `vercel.json` rewrites differ per game)

The two games are deployed differently upstream, so they need different
proxy rules:

- **Unique Words** is served from its own app *under a `/unique-words/` base
  path* (`unique-words.vercel.app/unique-words/`), so the rewrites keep the
  prefix: `/unique-words/:match*` → `unique-words.vercel.app/unique-words/:match*`.
- **Color Sphere** is a Next.js app served from *its own root*
  (`color-sphere.vercel.app/` returns the game; `/color-sphere/` 404s
  there). The old rewrite kept the prefix
  (`→ color-sphere.vercel.app/color-sphere/:match*`), which 404'd on the
  live site — the Color Sphere card on dhrooby.com was a dead link. The
  fix drops the prefix: `/color-sphere/:match*` →
  `color-sphere.vercel.app/:match*`.
- The Color Sphere page also references root-absolute asset paths
  (`/_next/static/...`, `/_next/image`, `/icon.png`), so those paths are
  proxied to the same upstream too. Without them the page shell loads but
  its JS/CSS do not.

Verify routing without deploying with `node tests/proxy-check.js` (no
dependencies). It runs this file's rules in a local reverse proxy against
the live upstream apps and checks the homepage, both games, and one JS +
one CSS asset. Against the old `vercel.json` it fails on `/color-sphere/`;
against this one it passes.

## Deploy

1. Import this repo in Vercel (framework: **Other**, no build command).
2. Add **`dhrooby.com`** and **`www.dhrooby.com`** to this project.
3. Remove those domains from the **color-sphere** project (only one Vercel project should own the apex).
4. Optionally remove the `/unique-words` proxy rewrites from **color-sphere**’s `vercel.json` — this project handles routing at the domain root.
