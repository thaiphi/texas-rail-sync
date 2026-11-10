// ZC-07 Task 4 (issue #43): the on-call engineer subagent, the incident-response skill and the team docs that name them.
// Text checks only. The agent's permission rules deny it reading test/oncall-*, so the answer-key literals below stay
// out of its reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(root + rel, 'utf8');
const AGENT = '.claude/agents/on-call-engineer.md';
const SKILL = '.claude/skills/incident-response/SKILL.md';

function parse(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, 'file must start with a --- frontmatter block');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return { fields, body: text.slice(match[0].length) };
}

// The text of the section whose heading contains `word`, up to the next heading of the same or a higher level.
function section(body, word) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line) && line.includes(word));
  assert.ok(start >= 0, `needs a heading containing "${word}"`);
  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const heading = line.match(/^(#+)\s/);
    return heading && heading[1].length <= level;
  });
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

test('on-call engineer agent: frontmatter, procedure and branch names', () => {
  const { fields, body } = parse(read(AGENT));
  assert.equal(fields.name, 'on-call-engineer');
  assert.ok(fields.description, 'description must be non-empty');
  for (const text of ['incident-response', 'oncall-fix/', 'oncall-demo/']) assert.ok(body.includes(text), `agent body mentions ${text}`);
});

test('on-call engineer agent: the Never section names every hard limit', () => {
  const never = section(parse(read(AGENT)).body, 'Never');
  for (const text of ['merge', 'main', 'force', 'Analytics', '.env', 'gh auth']) assert.ok(never.includes(text), `Never section mentions ${text}`);
});

test('incident-response skill: frontmatter, commands, report and forbidden paths', () => {
  const { fields, body } = parse(read(SKILL));
  assert.equal(fields.name, 'incident-response');
  assert.match(fields.description ?? '', /alert/);
  for (const text of ['scripts/collect-fixture.mjs', 'npm test', 'gh pr create --base', 'report.md', '127.0.0.1:3000'])
    assert.ok(body.includes(text), `skill body mentions ${text}`);
  for (const path of ['scripts/oncall/', 'docs/evidence/']) assert.ok(body.includes(path), `skill forbids ${path}`);
});

test('no answer key in the agent or the skill', () => {
  for (const file of [AGENT, SKILL]) {
    const text = read(file);
    for (const key of ['1_000_000', '10_000_000', 'sourceFetch', 'SOURCE_LIMIT']) assert.ok(!text.includes(key), `${file} must not contain ${key}`);
  }
});

test('agent-team.md has the On-call engineer row', () => {
  const row = read('docs/agent-team.md').split(/\r?\n/).find((line) => line.startsWith('| **On-call engineer**'));
  assert.ok(row, 'needs a row starting | **On-call engineer**');
  assert.ok(row.includes('oncall-fix/'), 'row mentions oncall-fix/');
  assert.match(row, /never merges/i);
});

test('AGENTS.md points to the project agents and skills', () => {
  const agents = read('AGENTS.md');
  for (const text of ['.claude/agents/', '.claude/skills/', 'on-call-engineer']) assert.ok(agents.includes(text), `AGENTS.md mentions ${text}`);
});

test('README documents the on-call agent demo without the answer key', () => {
  const readme = read('README.md');
  for (const text of ['npm run oncall:break', 'npm run oncall:responder', 'npm run oncall:trigger', 'npm run oncall:verify', 'npm run oncall:reset', 'GH_TOKEN=$(gh auth token -u'])
    assert.ok(readme.includes(text), `README mentions ${text}`);
  for (const key of ['1_000_000', '10_000_000', 'sourceFetch', 'SOURCE_LIMIT', 'Tighten source download cap']) assert.ok(!readme.includes(key), `README must not contain ${key}`);
});
