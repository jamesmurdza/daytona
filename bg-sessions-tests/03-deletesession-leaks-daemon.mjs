import { sleep, sh, lines, runStandalone } from './lib.mjs'

// BULLET: deleteSession leaks any process that detaches (dev servers, DBs, pm2,
// headless browsers all setsid + double-fork). deleteSession signals the
// process group and walks the session shell's child tree, but a process that
// creates a new session AND reparents to init escapes both. We prove it: the
// foreground command dies, the detached daemon (ppid 1) keeps running.
export async function test(sandbox) {
  console.log('TEST 03 — deleteSession leaks detached processes')
  const root = await sandbox.getUserRootDir()
  const hbMain = `${root}/leak-main.txt`
  const hbDaemon = `${root}/leak-daemon.txt`
  const sid = 'leak-test'
  await sandbox.process.executeCommand(`rm -f ${hbMain} ${hbDaemon}`)
  await sandbox.process.createSession(sid)

  // MAIN: foreground loop in the session's process group.
  // DAEMON: double-forked + setsid -> reparents to init, own session/group.
  const command = `
bash -c 'setsid bash -c "while true; do echo x >> ${hbDaemon}; sleep 1; done" </dev/null >/dev/null 2>&1 &'
while true; do echo x >> ${hbMain}; sleep 1; done
`
  await sandbox.process.executeSessionCommand(sid, { command, runAsync: true })
  await sleep(4000)

  const ps = (await sh(sandbox, `ps -eo pid,ppid,pgid,sid,args | grep ${hbDaemon} | grep -v grep | head -1`)).out
  console.log('  daemon process (pid ppid pgid sid args):')
  console.log('   ', ps, ' <- ppid=1 means it reparented to init')

  console.log('  BEFORE deleteSession:', { main: await lines(sandbox, hbMain), daemon: await lines(sandbox, hbDaemon) })

  console.log('  >>> deleteSession(leak-test)')
  await sandbox.process.deleteSession(sid)

  await sleep(2000)
  const mid = { main: await lines(sandbox, hbMain), daemon: await lines(sandbox, hbDaemon) }
  await sleep(3000)
  const after = { main: await lines(sandbox, hbMain), daemon: await lines(sandbox, hbDaemon) }
  console.log('  AFTER +2s:', mid, ' AFTER +5s:', after)

  const mainDead = after.main === mid.main
  const daemonAlive = after.daemon > mid.daemon
  console.log(`  foreground command killed: ${mainDead};  detached daemon still running: ${daemonAlive}`)

  const problem = mainDead && daemonAlive
  console.log(`  PROBLEM SHOWN: ${problem}  (deleteSession killed the session but leaked the daemon; a cgroup kill would catch it)\n`)
  return problem
}

if (import.meta.url === `file://${process.argv[1]}`) runStandalone(test)
