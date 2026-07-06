import { daytona } from './lib.mjs'
import { test as t01 } from './01-network-failure.mjs'
import { test as t02 } from './02-non-fast-forward.mjs'
import { test as t03 } from './03-hook-rejection.mjs'
import { test as t04 } from './04-classified-control.mjs'

// Each test asserts the DESIRED behavior: it PASSES only if Daytona behaves
// correctly, and FAILS while the bug is present. So this suite is expected to
// have failures today — those failures ARE the demonstrated bugs. It turns all
// green once the issues are fixed.
const sandbox = await daytona.create()
console.log('sandbox:', sandbox.id, '\n')
const results = []
try {
  for (const [name, t] of [
    ['01 network-failure', t01],
    ['02 non-fast-forward', t02],
    ['03 hook-rejection', t03],
    ['04 classified-control', t04],
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
