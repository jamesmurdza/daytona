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
