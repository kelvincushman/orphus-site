#!/usr/bin/env node
// Mirrors the legal/policy/changelog files from kelvincushman/orphus into
// src/content/repo/ and refreshes repo metadata (stars, latest release).
// The harness repo is the single source of truth — run `npm run sync` and
// commit the result; never edit the mirrored files by hand.
import { mkdir, writeFile } from 'node:fs/promises';
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

for (const { from, to } of FILES) {
  const body = await fetchText(`${RAW}/${from}`);
  await writeFile(path.join(OUT, to), body);
  console.log(`synced ${from} → src/content/repo/${to}`);
}

try {
  const res = await fetch(`https://api.github.com/repos/${REPO}`);
  if (res.ok) {
    const data = await res.json();
    const meta = {
      stars: data.stargazers_count,
      syncedAt: new Date().toISOString(),
      ref: REF,
    };
    const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (rel.ok) meta.latestRelease = (await rel.json()).tag_name;
    await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(`synced meta.json (stars: ${meta.stars}, release: ${meta.latestRelease ?? '?'})`);
  }
} catch {
  console.warn('warning: could not refresh meta.json — keeping the committed copy');
}
