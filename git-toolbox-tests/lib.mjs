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

// Create a throwaway sandbox, run the test, always clean up.
export async function runStandalone(test) {
  const sandbox = await daytona.create()
  console.log('sandbox:', sandbox.id, '\n')
  try {
    await test(sandbox)
  } finally {
    await daytona.delete(sandbox)
    console.log('\nsandbox deleted')
  }
}
