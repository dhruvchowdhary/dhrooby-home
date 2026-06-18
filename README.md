# dhrooby.com homepage

Static landing page for [dhrooby.com](https://www.dhrooby.com/) with links to the games. `vercel.json` proxies `/unique-words/` and `/color-sphere/` to their Vercel deployments.

## Local dev

```bash
npm install
npm run dev
```

Opens at http://localhost:5180 (homepage only — subpath proxies need production or `vercel dev`).

## Deploy

1. Import this repo in Vercel (framework: **Other**, no build command).
2. Add **`dhrooby.com`** and **`www.dhrooby.com`** to this project.
3. Remove those domains from the **color-sphere** project (only one Vercel project should own the apex).
4. Optionally remove the `/unique-words` proxy rewrites from **color-sphere**’s `vercel.json` — this project handles routing at the domain root.
