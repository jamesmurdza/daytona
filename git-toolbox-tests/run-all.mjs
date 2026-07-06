import { daytona } from './lib.mjs'
import { test as t01 } from './01-network-failure.mjs'
import { test as t02 } from './02-non-fast-forward.mjs'
import { test as t03 } from './03-hook-rejection.mjs'
import { test as t04 } from './04-classified-control.mjs'

// Reuse one sandbox for all tests (they are independent and use distinct dirs).
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
for (const [name, ok] of results) {
  const label = name.startsWith('04') ? (ok ? 'classified (expected)' : 'NOT classified') : ok ? 'PROBLEM SHOWN' : 'not shown'
  console.log(`  ${name.padEnd(22)} ${label}`)
}
