#!/usr/bin/env node
// Mirrors the harness repo's documentation into src/content/docs/.
// The mirrored set is exactly the pages docs/README.md links to — the repo
// curates its own index and the site obeys it (site spec, section 05).
//
// Sources: the GitHub repo at ORPHUS_REF (default main), or a local checkout
// when ORPHUS_LOCAL points at one. Run `npm run sync` and commit the result;
// never edit the mirrored files by hand.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const REPO = 'kelvincushman/orphus';
const REF = process.env.ORPHUS_REF ?? 'main';
const LOCAL = process.env.ORPHUS_LOCAL; // path to a local checkout, optional
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}`;
const BLOB = `https://github.com/${REPO}/blob/${REF}`;

const OUT_DOCS = path.join(process.cwd(), 'src/content/docs');
const OUT_HOME = path.join(process.cwd(), 'src/content/docs-home.md');
const OUT_INDEX = path.join(process.cwd(), 'src/data/docs-index.json');

// repo path → site slug. Every page docs/README.md's index tables link to.
const MIRROR = {
  'docs/getting-started.md': 'getting-started',
  'docs/troubleshooting.md': 'troubleshooting',
  'docs/roundtable-tool.md': 'roundtable-tool',
  'docs/roles.md': 'roles',
  'docs/memory.md': 'memory',
  'packages/coding-agent/docs/fleet.md': 'fleet',
  'packages/coding-agent/docs/subagents.md': 'subagents',
  'packages/coding-agent/docs/skills.md': 'skills',
  'docs/orca-integration.md': 'orca-integration',
  'docs/workflow-playbook.md': 'workflow-playbook',
  'docs/refine.md': 'refine',
  'docs/repl.md': 'repl',
  'packages/coding-agent/docs/browser.md': 'browser',
  'packages/coding-agent/docs/transcribe.md': 'transcribe',
  'packages/coding-agent/docs/tui-backend.md': 'tui-backend',
  'docs/architecture.md': 'architecture',
  'packages/coding-agent/docs/harness.md': 'harness',
  'packages/roundtable/DESIGN.md': 'design-decisions',
  'docs/self-improvement-loop.md': 'self-improvement-loop',
  'docs/rlm-security-posture.md': 'rlm-security-posture',
  'AGENTS.md': 'agents',
  'CONTRIBUTING.md': 'contributing',
  'DEV_SETUP.md': 'dev-setup',
  'docs/ci.md': 'ci',
  'evals/longcontext/README.md': 'long-context-baseline',
};

// repo files that live on the site as their own pages
const SPECIAL = {
  'SECURITY.md': '/security',
  'LICENSE': '/legal/licence',
  'RELEASE_NOTES.md': '/changelog',
};

async function read(repoPath) {
  if (LOCAL) return readFile(path.join(LOCAL, repoPath), 'utf8');
  const res = await fetch(`${RAW}/${repoPath}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${RAW}/${repoPath}`);
  return res.text();
}

/** Resolve a relative markdown link target against its source file's directory. */
function resolveTarget(target, srcPath) {
  const [file, anchor = ''] = target.split('#');
  const hash = anchor ? `#${anchor}` : '';
  if (file === '') return hash; // pure in-page anchor
  const resolved = path.posix
    .normalize(path.posix.join(path.posix.dirname(srcPath), file))
    .replace(/^(\.\.\/)+/, '');
  if (MIRROR[resolved]) return `/docs/${MIRROR[resolved]}${hash}`;
  if (SPECIAL[resolved]) return `${SPECIAL[resolved]}${hash}`;
  return `${BLOB}/${resolved}${hash}`;
}

/** Rewrite [text](target) links outside fenced code blocks and inline code. */
function rewriteLinks(md, srcPath) {
  const fences = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|(?<!`)`[^`\n]+`(?!`))/);
  return fences
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // code — leave untouched
      return seg.replace(
        /\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
        (m, text, target, title) => {
          if (/^(https?:|mailto:)/.test(target)) return m;
          return `[${text}](${resolveTarget(target, srcPath)}${title ?? ''})`;
        },
      );
    })
    .join('');
}

function firstH1(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/[`*_]/g, '').trim() : null;
}

function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ── parse docs/README.md into the four sidebar groups ───────────────────────
function parseIndex(readme) {
  const groups = [];
  let current = null;
  for (const line of readme.split('\n')) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      current = /^A note/.test(h2[1]) ? null : { group: h2[1].trim(), items: [] };
      if (current) groups.push(current);
      continue;
    }
    if (!current) continue;
    const row = line.match(/^\|\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*\|\s*(.+?)\s*\|\s*$/);
    if (!row) continue;
    const [, title, target, desc] = row;
    const href = resolveTarget(target, 'docs/README.md');
    const slug = href.startsWith('/docs/') ? href.slice('/docs/'.length).split('#')[0] : null;
    current.items.push({ title, desc: desc.replace(/\s+/g, ' ').trim(), href, slug });
  }
  return groups;
}

// ── run ─────────────────────────────────────────────────────────────────────
await rm(OUT_DOCS, { recursive: true, force: true });
await mkdir(OUT_DOCS, { recursive: true });
await mkdir(path.dirname(OUT_INDEX), { recursive: true });

const readme = await read('docs/README.md');
const groups = parseIndex(readme);
const flat = groups.flatMap((g) => g.items.filter((it) => it.slug));
const meta = new Map(flat.map((it) => [it.slug, it]));

let order = 0;
const orderOf = new Map(flat.map((it) => [it.slug, order++]));

for (const [repoPath, slug] of Object.entries(MIRROR)) {
  const raw = await read(repoPath);
  const body = rewriteLinks(raw, repoPath);
  const info = meta.get(slug);
  const fm = [
    '---',
    `title: ${yamlQuote(info?.title ?? firstH1(raw) ?? slug)}`,
    `description: ${yamlQuote(info?.desc ?? '')}`,
    `group: ${yamlQuote(groups.find((g) => g.items.some((it) => it.slug === slug))?.group ?? 'Reference')}`,
    `order: ${orderOf.get(slug) ?? 999}`,
    `sourcePath: ${yamlQuote(repoPath)}`,
    `editUrl: ${yamlQuote(`${BLOB}/${repoPath}`)}`,
    '---',
    '',
  ].join('\n');
  await writeFile(path.join(OUT_DOCS, `${slug}.md`), fm + body);
  console.log(`synced ${repoPath} → src/content/docs/${slug}.md`);
}

// docs home: docs/README.md rendered as-is (minus its H1 — the page adds its own
// header), links rewritten
const homeBody = rewriteLinks(readme, 'docs/README.md').replace(/^#\s+.+\n/, '');
await writeFile(OUT_HOME, homeBody);
console.log('synced docs/README.md → src/content/docs-home.md');

await writeFile(OUT_INDEX, JSON.stringify({ ref: REF, groups }, null, 2) + '\n');
console.log(`wrote src/data/docs-index.json (${groups.length} groups, ${flat.length} mirrored pages)`);
