// Runs `claude plugin validate` and fails on anything it reports, except the
// missing version. The manifest has no version on purpose, so Claude Code
// uses the commit SHA and every push to master ships. validate has no flag to
// drop one warning, so this reads the JSON report and drops it here.
import { spawnSync } from 'node:child_process';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const run = spawnSync('claude', ['plugin', 'validate', '--json', '.'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (run.error?.code === 'ENOENT') {
  console.error('validate: claude is not installed, so skipping plugin validate.');
  process.exit(0);
}
if (run.error) {
  console.error(`validate: could not run claude: ${run.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`validate: claude plugin validate did not return JSON (exit ${run.status}).`);
  if (run.stdout) console.error(run.stdout.trimEnd());
  if (run.stderr) console.error(run.stderr.trimEnd());
  process.exit(1);
}

const isMissingVersion = (w) =>
  w.path === 'version' && w.message.startsWith('No version specified');

const problems = [];
const where = (file) => (file ? relative(root, file) : '?');

function addIssues(result, keepWarning) {
  if (!result) return;
  for (const e of result.errors ?? []) {
    problems.push(`error   ${where(result.file)} ${e.path}: ${e.message}`);
  }
  for (const w of (result.warnings ?? []).filter(keepWarning)) {
    problems.push(`warning ${where(result.file)} ${w.path}: ${w.message}`);
  }
}

addIssues(report.manifest, (w) => !isMissingVersion(w));
for (const result of report.contents ?? []) addIssues(result, () => true);

for (const a of report.advice ?? []) {
  problems.push(`advice  ${JSON.stringify(a)}`);
}

const dir = report.directory ?? {};
for (const f of dir.findings ?? []) {
  const at = [f.file, f.field].filter(Boolean).join(' ');
  problems.push(`${f.severity.padEnd(7)} ${at}: ${f.title} (${f.code}). ${f.message}`);
  if (f.fix) problems.push(`        Fix: ${f.fix}`);
}
for (const u of dir.undecided ?? []) {
  problems.push(`undecided directory check: ${JSON.stringify(u)}`);
}
if (dir.failure) problems.push(`directory checks failed: ${JSON.stringify(dir.failure)}`);
if (dir.incomplete) problems.push('directory checks did not finish.');

if (!report.success || run.status !== 0) {
  problems.push(`claude plugin validate failed (exit ${run.status}).`);
}
if (problems.length === 0) process.exit(0);

console.error('validate: claude plugin validate found problems:');
for (const p of problems) console.error(`  ${p}`);
process.exit(1);
