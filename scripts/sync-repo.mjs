#!/usr/bin/env node
// Mirrors the legal/policy/changelog files from kelvincushman/orphus into
// src/content/repo/ and refreshes repo metadata (stars, latest release).
// The harness repo is the single source of truth — run `npm run sync` and
// commit the result; never edit the mirrored files by hand.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO = 'kelvincushman/orphus';
const REF = process.env.ORPHUS_REF ?? 'main';
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}`;
const OUT = path.join(process.cwd(), 'src/content/repo');

const FILES = [
  { from: 'RELEASE_NOTES.md', to: 'release-notes.md' },
  { from: 'SECURITY.md', to: 'security.md' },
  { from: 'LICENSE', to: 'license.txt' },
];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

await mkdir(OUT, { recursive: true });

let releaseNotes = '';
for (const { from, to } of FILES) {
  const body = await fetchText(`${RAW}/${from}`);
  if (from === 'RELEASE_NOTES.md') releaseNotes = body;
  await writeFile(path.join(OUT, to), body);
  console.log(`synced ${from} → src/content/repo/${to}`);
}

// The banner and the changelog note used to hand-type the version and its
// tagline, so the site announced "v2.1 coming soon" for a month after v2.1.2
// shipped. Both are now read from here, and here is parsed from the release
// notes we just mirrored — no API call, because the API is exactly what fails
// silently below.
function readRelease(markdown) {
  const version = /^#\s+Orphus\s+(\S+)/mu.exec(markdown)?.[1];
  const headline = markdown
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !block.startsWith('#'));
  return { version, headline };
}

// Everything the site actually renders comes from the release notes above, so
// it is written whether or not the API answers. Stars are the only field that
// needs the API, and losing them must not take the version down with it.
const committed = JSON.parse(await readFile(path.join(OUT, 'meta.json'), 'utf8').catch(() => '{}'));
const { version, headline } = readRelease(releaseNotes);
const meta = {
  ...committed,
  syncedAt: new Date().toISOString(),
  ref: REF,
  ...(version === undefined ? {} : { latestRelease: `v${version.replace(/^v/u, '')}` }),
  ...(headline === undefined ? {} : { releaseHeadline: headline }),
};

// A 403 — which is what an unauthenticated call gets from behind a proxy —
// leaves `res.ok` false and throws nothing, so the old `if (res.ok)` with no
// `else` and a `catch` that could not fire printed NOTHING: no success line and
// no warning. `meta.json` sat a month stale and the sync looked clean every
// time. Say which field went unrefreshed, and why.
try {
  const res = await fetch(`https://api.github.com/repos/${REPO}`);
  if (res.ok) meta.stars = (await res.json()).stargazers_count;
  else console.warn(`warning: GitHub API ${res.status} — \`stars\` keeps its committed value (${meta.stars ?? '?'})`);
} catch (error) {
  console.warn(`warning: GitHub API unreachable (${error.message}) — \`stars\` keeps its committed value (${meta.stars ?? '?'})`);
}

await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`synced meta.json (release: ${meta.latestRelease ?? '?'}, stars: ${meta.stars ?? '?'})`);
