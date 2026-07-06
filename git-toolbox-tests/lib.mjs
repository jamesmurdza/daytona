import { Daytona } from '@daytonaio/sdk'

export const daytona = new Daytona()
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Run a shell command in the sandbox, return { code, out }.
export async function sh(sandbox, command, cwd) {
  const r = await sandbox.process.executeCommand(command, cwd)
  return { code: r.exitCode, out: (r.result || '').trim() }
}

export function describeError(err) {
  if (!err) return null
  return {
    class: err?.constructor?.name,
    statusCode: err?.statusCode,
    errorCode: err?.errorCode,
    message: err?.message,
  }
}

export function printError(label, err) {
  console.log(`  ${label}`)
  const d = describeError(err)
  if (!d) {
    console.log('    (no error thrown)')
    return
  }
  console.log('    class     :', d.class)
  console.log('    statusCode:', d.statusCode)
  console.log('    errorCode :', d.errorCode)
  console.log('    message   :', JSON.stringify(d.message))
}

// A test asserts the DESIRED behavior. It PASSES only when Daytona behaves
// correctly; while the bug is present it FAILS (that is how it demonstrates the
// problem). Returns the pass boolean.
export function report(pass, expected, failObservation) {
  if (pass) {
    console.log(`  RESULT: PASS — ${expected}`)
  } else {
    console.log(`  RESULT: FAIL (bug present) — ${failObservation}`)
    console.log(`          expected: ${expected}`)
  }
  console.log('')
  return pass
}

// Create a throwaway sandbox, run the test, always clean up. Exits non-zero
// when the assertion fails, so this behaves like a normal test.
export async function runStandalone(test) {
  const sandbox = await daytona.create()
  console.log('sandbox:', sandbox.id, '\n')
  let pass = false
  try {
    pass = await test(sandbox)
  } finally {
    await daytona.delete(sandbox)
    console.log('sandbox deleted')
  }
  process.exit(pass ? 0 : 1)
}
