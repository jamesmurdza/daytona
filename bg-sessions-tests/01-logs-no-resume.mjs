import { sleep, report, runStandalone } from './lib.mjs'

// BULLET: getSessionCommandLogs() can't resume after a disconnect. There is no
// offset/cursor parameter — the method is (sessionId, commandId[, onStdout,
// onStderr]). Every read returns the log from byte 0. We prove it: a second
// read a few seconds later re-returns everything from the first read plus the
// new output. A dropped stream can therefore only restart from the beginning.
export async function test(sandbox) {
  console.log('TEST 01 — getSessionCommandLogs cannot resume: every read starts from the beginning')
  const sid = 'logs-test'
  await sandbox.process.createSession(sid)

  const { cmdId } = await sandbox.process.executeSessionCommand(sid, {
    command: 'for i in $(seq 1 8); do echo "line $i"; sleep 1; done',
    runAsync: true,
  })

  await sleep(2500)
  const r1 = await sandbox.process.getSessionCommandLogs(sid, cmdId)
  const out1 = r1.stdout || r1.output || ''

  await sleep(3000)
  const r2 = await sandbox.process.getSessionCommandLogs(sid, cmdId)
  const out2 = r2.stdout || r2.output || ''

  const n1 = out1.trim().split('\n').filter(Boolean).length
  const n2 = out2.trim().split('\n').filter(Boolean).length
  const secondIsFullReread = out2.startsWith(out1) && out2.length > out1.length

  console.log(`  read #1 (t=2.5s): ${n1} lines`)
  console.log(`  read #2 (t=5.5s): ${n2} lines`)
  console.log(`  read #2 re-includes read #1 from the start (no offset/cursor): ${secondIsFullReread}`)
  console.log('  method signature: getSessionCommandLogs(sessionId, commandId[, onStdout, onStderr]) — no "since"/offset param')

  await sandbox.process.deleteSession(sid)

  // Desired: logs are resumable — a follow-up read (after a disconnect) returns
  // only new output, not the whole log from byte 0.
  const pass = !secondIsFullReread
  return report(
    pass,
    'resumable logs — a reconnect fetches only new output (offset/cursor)',
    'every read restarts from byte 0; a dropped stream forces re-fetching the whole log',
  )
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
