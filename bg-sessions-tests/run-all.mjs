import { daytona } from './lib.mjs'
import { test as t01 } from './01-logs-no-resume.mjs'
import { test as t02 } from './02-liveness-unreliable.mjs'
import { test as t03 } from './03-deletesession-leaks-daemon.mjs'

// Each test asserts the DESIRED behavior: it PASSES only if Daytona behaves
// correctly, and FAILS while the bug is present. So this suite is expected to
// have failures today — those failures ARE the demonstrated bugs. It turns all
// green once the issues are fixed.
const sandbox = await daytona.create()
console.log('sandbox:', sandbox.id, '\n')
const results = []
try {
  for (const [name, t] of [
    ['01 logs-no-resume', t01],
    ['02 liveness-unreliable', t02],
    ['03 deletesession-leaks', t03],
  ]) {
    results.push([name, await t(sandbox)])
  }
} finally {
  await daytona.delete(sandbox)
  console.log('sandbox deleted\n')
}

console.log('=== SUMMARY ===')
for (const [name, pass] of results) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`)
}
const failed = results.filter(([, pass]) => !pass).length
console.log(`\n${failed} failing / ${results.length} total` + (failed ? '  (failures = demonstrated bugs)' : ''))
process.exit(failed ? 1 : 0)
