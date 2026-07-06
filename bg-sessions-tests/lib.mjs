import { Daytona } from '@daytonaio/sdk'

export const daytona = new Daytona()
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Run a shell command in the sandbox, return { code, out }.
export async function sh(sandbox, command, cwd) {
  const r = await sandbox.process.executeCommand(command, cwd)
  return { code: r.exitCode, out: (r.result || '').trim() }
}

export async function lines(sandbox, file) {
  const r = await sh(sandbox, `wc -l < ${file} 2>/dev/null || echo 0`)
  return parseInt(r.out || '0', 10)
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
