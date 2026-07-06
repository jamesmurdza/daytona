import { sleep, lines, runStandalone } from './lib.mjs'

// BULLET: no reliable way to tell if a process is running. No PID is exposed,
// and the only status signal is exitCode. This test shows both failures:
//   Part A — getSessionCommand exposes no PID (only id, command, exitCode).
//   Part B — a command that launches a detached daemon reports exitCode 0
//            ("finished") almost immediately, while the real work keeps running.
//            So exitCode says "done" but the process is very much alive, and
//            there is no PID to check what is actually running.
// (The mirror case — a killed process whose exitCode is never written, so it
//  looks "running" forever — is demonstrated in test 03.)
export async function test(sandbox) {
  console.log('TEST 02 — no reliable way to tell if a process is running (no PID; exitCode misreports)')
  const root = await sandbox.getUserRootDir()
  const hb = `${root}/live-daemon.txt`
  const sid = 'live-test'
  await sandbox.process.executeCommand(`rm -f ${hb}`)
  await sandbox.process.createSession(sid)

  // Part A: no PID
  const q = await sandbox.process.executeSessionCommand(sid, { command: 'echo hello' })
  const cmd = await sandbox.process.getSessionCommand(sid, q.cmdId)
  const keys = Object.keys(cmd)
  console.log('  getSessionCommand fields:', JSON.stringify(keys), '-> exposes a PID:', keys.includes('pid'))

  // Part B: async command that spawns a detached daemon, then returns.
  const { cmdId } = await sandbox.process.executeSessionCommand(sid, {
    command: `bash -c 'setsid bash -c "while true; do echo x >> ${hb}; sleep 1; done" </dev/null >/dev/null 2>&1 &'`,
    runAsync: true,
  })

  let exit
  for (let i = 0; i < 6; i++) {
    const c = await sandbox.process.getSessionCommand(sid, cmdId)
    exit = c.exitCode
    if (exit !== undefined && exit !== null) break
    await sleep(1000)
  }

  const before = await lines(sandbox, hb)
  await sleep(3000)
  const after = await lines(sandbox, hb)

  console.log(`  command reported exitCode: ${JSON.stringify(exit)}  (getSessionCommand says FINISHED)`)
  console.log(`  detached daemon heartbeat: ${before} -> ${after} lines  (still running: ${after > before})`)

  await sandbox.process.deleteSession(sid)

  const noPid = !keys.includes('pid')
  const reportedDone = exit !== undefined && exit !== null
  const stillRunning = after > before
  const problem = noPid && reportedDone && stillRunning
  console.log(`  PROBLEM SHOWN: ${problem}  (exitCode says done, work is still running, and there is no PID to check)\n`)
  return problem
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
