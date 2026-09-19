import { execFileSync } from 'node:child_process';
import { writeFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// No GitHub Actions and no network writes. Produce a checked static artifact locally.
const root = resolve(import.meta.dirname, '..');
const run = (args, env = {}) =>
  execFileSync('npm', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
run(['run', 'typecheck']);
run(['test']);
run(['run', 'build'], {
  GITHUB_REPOSITORY:
    process.env.GITHUB_REPOSITORY || 'Takayuki-Minagawa/PolyBool2D',
});
const output = resolve(root, '.pages-artifact');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(resolve(root, 'dist'), output, { recursive: true });
writeFileSync(resolve(output, '.nojekyll'), '');
writeFileSync(
  resolve(output, 'build-info.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      sourceHasUncommittedChanges: Boolean(
        execFileSync('git', ['status', '--porcelain'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
      ),
    },
    null,
    2,
  ),
);
console.log(
  `Prepared ${output}. Review it, then publish only this directory to the pages-artifact branch.`,
);
