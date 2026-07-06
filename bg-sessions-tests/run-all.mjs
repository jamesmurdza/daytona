import { daytona } from './lib.mjs'
import { test as t01 } from './01-logs-no-resume.mjs'
import { test as t02 } from './02-liveness-unreliable.mjs'
import { test as t03 } from './03-deletesession-leaks-daemon.mjs'

// Reuse one sandbox for all tests (they are independent and use distinct dirs/sessions).
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
for (const [name, ok] of results) {
  console.log(`  ${name.padEnd(24)} ${ok ? 'PROBLEM SHOWN' : 'not shown'}`)
}
