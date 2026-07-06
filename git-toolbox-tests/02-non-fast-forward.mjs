import { sh, describeError, printError, report, runStandalone } from './lib.mjs'

// BULLET / BUG: a non-fast-forward push should map to 409 Conflict, but falls
// through to 500. classifyGitError checks errors.Is(err, ErrNonFastForwardUpdate),
// yet go-git returns a plain fmt.Errorf("non-fast-forward update: %s") on push
// that does not wrap the sentinel, so the check never matches -> generic 500.
//
// Reproduced entirely locally: one bare repo, two clones, divergent commits,
// then push the stale clone.
const setup = (root) => `
set -e
cd ${root}
rm -rf nff-origin.git nffA nffB
git init --bare nff-origin.git >/dev/null
git clone nff-origin.git nffA >/dev/null 2>&1
cd nffA
git config user.email a@a.com; git config user.name A
git checkout -b main >/dev/null 2>&1
echo one > f.txt; git add .; git commit -m one >/dev/null
git push origin main >/dev/null 2>&1
cd ${root}
git clone nff-origin.git nffB >/dev/null 2>&1
# advance origin through nffA
cd nffA
echo two >> f.txt; git commit -am two >/dev/null
git push origin main >/dev/null 2>&1
# nffB makes a divergent commit on a now-stale base
cd ${root}/nffB
git config user.email b@b.com; git config user.name B
git checkout main >/dev/null 2>&1 || git checkout -b main >/dev/null 2>&1
echo other > g.txt; git add .; git commit -m other >/dev/null
echo SETUP_OK
`

export async function test(sandbox) {
  console.log('TEST 02 — non-fast-forward push falls through to 500 (bug: should be 409)')
  const root = await sandbox.getUserRootDir()

  const s = await sh(sandbox, setup(root))
  if (!s.out.includes('SETUP_OK')) {
    console.log('  SETUP FAILED:', s.out, '\n')
    return false
  }

  let err
  try {
    await sandbox.git.push(`${root}/nffB`)
  } catch (e) {
    err = e
  }
  printError('push stale branch to diverged remote ->', err)

  const d = describeError(err) || {}
  // Desired: a non-fast-forward rejection should map to 409 Conflict
  // (classifyGitError lists ErrNonFastForwardUpdate in its 409 bucket).
  const pass = d.statusCode === 409
  return report(
    pass,
    '409 Conflict (DaytonaConflictError) for a non-fast-forward push',
    `rejected as non-fast-forward but reported ${d.class}/${d.statusCode} instead of 409`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
