import { describeError, printError, runStandalone } from './lib.mjs'

// BULLET: Network / DNS / TLS failures -> generic 500 DaytonaError.
// A clone against an unresolvable host fails at the transport layer. go-git's
// error carries a useful message, but it is NOT classified: it comes back as
// the base DaytonaError with statusCode 500 (INTERNAL_SERVER_ERROR).
export async function test(sandbox) {
  console.log('TEST 01 — network/DNS failure is not classified (expect generic 500)')
  const root = await sandbox.getUserRootDir()

  let err
  try {
    await sandbox.git.clone('https://nonexistent.invalid/x.git', `${root}/net-test`)
  } catch (e) {
    err = e
  }
  printError('clone https://nonexistent.invalid/x.git ->', err)

  const d = describeError(err) || {}
  const problem = d.statusCode === 500 && d.class === 'DaytonaError'
  console.log(
    `  PROBLEM SHOWN: ${problem}  (network failure surfaces as generic 500 DaytonaError; only the message string tells you what happened)\n`,
  )
  return problem
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
