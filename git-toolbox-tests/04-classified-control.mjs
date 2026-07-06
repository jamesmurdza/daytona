import { describeError, printError, runStandalone } from './lib.mjs'

// CONTROL (context, not a bug): this shows what the May 2026 change DID fix.
// Auth and missing-repo failures ARE classified into typed errors with a real
// status code (401/404), unlike tests 01-03. Included so the contrast is
// explicit: "reaching the repo" is classified; "the operation was rejected" or
// "the network failed" is not.
export async function test(sandbox) {
  console.log('TEST 04 — CONTROL: auth / missing-repo ARE classified (401/404)')
  const root = await sandbox.getUserRootDir()

  let err
  try {
    // GitHub returns "authentication required" for a nonexistent repo (it will
    // not reveal existence without auth), which go-git maps to a 401.
    await sandbox.git.clone('https://github.com/daytonaio/definitely-does-not-exist-xyz.git', `${root}/missing`)
  } catch (e) {
    err = e
  }
  printError('clone a nonexistent GitHub repo ->', err)

  const d = describeError(err) || {}
  const classified = [401, 403, 404].includes(d.statusCode) && d.class !== 'DaytonaError'
  console.log(
    `  CLASSIFIED: ${classified}  (typed ${d.class} / ${d.statusCode} — contrast with the generic 500s in tests 01-03)\n`,
  )
  return classified
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
