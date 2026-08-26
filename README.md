# orphus.dev

The public website for [kelvincushman/orphus](https://github.com/kelvincushman/orphus) —
the open-source multi-agent harness whose agents deliberate in rooms outside their
context windows.

Matrix green on pure black, ASCII as the visual language, and the harness repo's own
documentation as the single source of truth. Layout and feel adapted from
[herdr.dev/compare](https://herdr.dev/compare/) per the site spec (purple → `#00ff41`,
ground → `#000`).

## Stack

- [Astro](https://astro.build) — fully static output, zero client JS except the matrix
  rain canvas and copy-to-clipboard buttons
- Self-hosted fonts via Fontsource (Archivo · Inter · JetBrains Mono) — no third-party
  requests, which keeps [/legal/privacy](https://orphus.dev/legal/privacy) three
  paragraphs long
- Hosted on Cloudflare Pages at [orphus.dev](https://orphus.dev)

## Pages

| Route | Contents |
| --- | --- |
| `/` | Landing: thesis, the context-window contract, the 32% number, tier-1 quickstart, docs index, requirements |
| `/install` | What the install script does, verified: platform detection, checksum verification, `--ref` pinning |
| `/changelog` | `RELEASE_NOTES.md`, rendered from the repo |
| `/security` | `SECURITY.md`, rendered from the repo |
| `/legal/licence` | The MIT licence, verbatim from `LICENSE` |
| `/legal/privacy` | Static site, no cookies, no analytics — the whole notice |

`/install.sh` redirects to the repo's raw `install.sh` (see `public/_redirects`), so
`curl -fsSL orphus.dev/install.sh | sh` always serves the repository's own script.

## The repo is the source of truth

Nothing under `src/content/repo/` is hand-edited. It mirrors files from
`kelvincushman/orphus` — refresh and commit with:

```bash
npm run sync   # pulls RELEASE_NOTES.md, SECURITY.md, LICENSE + repo metadata
```

Docs links point at the repo on GitHub for now; the full docs mirror (`/docs`) is
phase 2 of the site spec.

## Develop

```bash
npm install
npm run dev      # localhost:4321
npm run build    # static output in dist/
npm run preview  # serve the built site
```

## Deploy

Cloudflare Pages, build command `npm run build`, output directory `dist`, custom
domain `orphus.dev`. `public/_redirects` carries the redirect rules.
