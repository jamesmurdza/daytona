import { describeError, printError, report, runStandalone } from './lib.mjs'

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
  // Desired: a network failure should be a typed/classified error, not an
  // opaque generic 500 whose only signal is the message string.
  const isGeneric500 = d.statusCode === 500 && d.class === 'DaytonaError'
  const pass = !!err && !isGeneric500
  return report(
    pass,
    'a typed/classified error for network failures',
    `network failure surfaced as generic ${d.class}/${d.statusCode} — only the message string identifies it`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
