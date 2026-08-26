#!/usr/bin/env node
// Mirrors the skills that ship in the kelvincushman/orphus repo into
// src/data/skills.json — name and description straight from each SKILL.md's
// frontmatter (the Agent Skills standard). Run via `npm run sync`; the repo
// is the source of truth and nothing here is hand-edited.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO = 'kelvincushman/orphus';
const REF = process.env.ORPHUS_REF ?? 'main';
const LOCAL = process.env.ORPHUS_LOCAL;
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}`;
const BLOB = `https://github.com/${REPO}/blob/${REF}`;
const OUT = path.join(process.cwd(), 'src/data/skills.json');

// Where shipped skills live. Test fixtures and examples are deliberately
// out of scope — only these roots are scanned.
const GROUPS = [
  {
    group: 'In the box',
    note: 'Loaded automatically with the packages that carry them.',
    roots: [
      { dir: 'packages/roundtable/skills', pkg: '@orphus/roundtable' },
      { dir: 'packages/fleet/skills', pkg: '@orphus/fleet' },
      { dir: 'packages/intercom/skills', pkg: '@orphus/intercom' },
      { dir: 'packages/subagents/skills', pkg: '@orphus/subagents' },
      { dir: 'packages/workflows/skills', pkg: '@orphus/workflows' },
    ],
  },
  {
    group: 'For working on the repo',
    note: 'Loaded from .agents/skills/ when an agent works on the Orphus repository itself.',
    roots: [{ dir: '.agents/skills', pkg: 'repo' }],
  },
];

async function listSkillFiles(rootDir) {
  if (LOCAL) {
    const base = path.join(LOCAL, rootDir);
    const out = [];
    async function walk(dir) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // root absent at this ref — fine
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.name === 'SKILL.md') out.push(path.relative(LOCAL, p));
      }
    }
    await walk(base);
    return out.sort();
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`);
  if (!res.ok) throw new Error(`git tree: ${res.status} ${res.statusText}`);
  const { tree, truncated } = await res.json();
  if (truncated) console.warn('warning: git tree truncated — skill listing may be incomplete');
  return tree
    .filter((t) => t.type === 'blob' && t.path.startsWith(`${rootDir}/`) && t.path.endsWith('/SKILL.md'))
    .map((t) => t.path)
    .sort();
}

async function read(repoPath) {
  if (LOCAL) return readFile(path.join(LOCAL, repoPath), 'utf8');
  const res = await fetch(`${RAW}/${repoPath}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${RAW}/${repoPath}`);
  return res.text();
}

function frontmatterField(fm, key) {
  const lines = fm.split('\n');
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i === -1) return null;
  let v = lines[i].slice(key.length + 1).trim();
  if (/^[|>][+-]?$/.test(v)) {
    // block scalar — collect the indented lines that follow
    const block = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') { block.push(''); continue; }
      if (!/^[ \t]/.test(lines[j])) break;
      block.push(lines[j].trim());
    }
    return block.join(' ').replace(/\s+/g, ' ').trim() || null;
  }
  if (/^["']/.test(v)) {
    try {
      v = JSON.parse(v.replace(/^'(.*)'$/s, '"$1"'));
    } catch {
      v = v.slice(1, -1);
    }
  }
  return v || null;
}

const groups = [];
for (const { group, note, roots } of GROUPS) {
  const skills = [];
  for (const { dir, pkg } of roots) {
    for (const file of await listSkillFiles(dir)) {
      const src = await read(file);
      const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
      const fm = fmMatch ? fmMatch[1] : '';
      const name = frontmatterField(fm, 'name') ?? path.basename(path.dirname(file));
      const description = frontmatterField(fm, 'description');
      if (!description) console.warn(`warning: ${file} has no description`);
      skills.push({
        name,
        description: description ?? '',
        version: frontmatterField(fm, 'version'),
        pkg,
        path: file,
        url: `${BLOB}/${file}`,
      });
    }
  }
  groups.push({ group, note, skills });
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ ref: REF, groups }, null, 2) + '\n');
const total = groups.reduce((n, g) => n + g.skills.length, 0);
console.log(`wrote src/data/skills.json (${total} skills in ${groups.length} groups)`);
