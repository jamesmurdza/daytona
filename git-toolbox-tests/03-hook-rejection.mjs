import { sh, describeError, printError, runStandalone } from './lib.mjs'

// BULLET: remote-side rejections (branch protection, pre-receive hooks,
// size/quota limits) -> generic 500. Here we reproduce the most portable one:
// a bare repo with a pre-receive hook that rejects every push. This stands in
// for the whole family (GitHub branch protection / size limits behave the same
// way: the server rejects after the connection succeeds, and go-git surfaces
// the rejection as an unclassified error -> 500).
const setup = (root) => `
set -e
cd ${root}
rm -rf hook-origin.git hookclone
git init --bare hook-origin.git >/dev/null
printf '#!/bin/sh\\necho "remote: rejected by pre-receive policy" >&2\\nexit 1\\n' > hook-origin.git/hooks/pre-receive
chmod +x hook-origin.git/hooks/pre-receive
git clone hook-origin.git hookclone >/dev/null 2>&1
cd hookclone
git config user.email a@a.com; git config user.name A
git checkout -b main >/dev/null 2>&1
echo hi > f.txt; git add .; git commit -m init >/dev/null
echo SETUP_OK
`

export async function test(sandbox) {
  console.log('TEST 03 — server-side hook rejection is not classified (expect generic 500)')
  const root = await sandbox.getUserRootDir()

  const s = await sh(sandbox, setup(root))
  if (!s.out.includes('SETUP_OK')) {
    console.log('  SETUP FAILED:', s.out, '\n')
    return false
  }

  let err
  try {
    await sandbox.git.push(`${root}/hookclone`)
  } catch (e) {
    err = e
  }
  printError('push to repo whose pre-receive hook rejects ->', err)

  const d = describeError(err) || {}
  const problem = !!err && d.statusCode === 500
  const note = !err
    ? '  (NOTE: push unexpectedly succeeded — go-git local transport did not run the server hook; see README)'
    : ''
  console.log(`  PROBLEM SHOWN: ${problem}${note}\n`)
  return problem
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
