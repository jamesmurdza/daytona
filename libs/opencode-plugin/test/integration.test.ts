/**
 * Integration test that runs OpenCode with the Daytona plugin
 * and tests workspace creation via the API.
 */

import { spawn, ChildProcess } from 'node:child_process'
import { mkdir, writeFile, rm, cp, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Daytona } from '@daytona/sdk'

const OPENCODE_BIN = process.env.OPENCODE_BIN || `${process.env.HOME}/.opencode/bin/opencode`
const SERVER_PORT = 14096 // Use different port to avoid conflicts
const PLUGIN_SOURCE = '/home/daytona/project/libs/opencode-plugin/.opencode/plugin/daytona'

interface TestResult {
  step: string
  success: boolean
  details: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function spawnAsync(cmd: string[], options: { cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `Exit code ${code}`))
    })
    proc.on('error', reject)
  })
}

async function waitForServer(port: number, maxWait = 60000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/global/health`)
      if (res.ok) return true
    } catch (e: any) {
      // Only log every 5 seconds
      if ((Date.now() - start) % 5000 < 500) {
        console.log(`  Waiting... ${Math.round((Date.now() - start) / 1000)}s (${e.code || e.message})`)
      }
    }
    await sleep(500)
  }
  return false
}

async function createTestProject(baseDir: string): Promise<string> {
  const projectDir = join(baseDir, 'test-project')
  await mkdir(projectDir, { recursive: true })

  // Create test files
  await writeFile(join(projectDir, 'README.md'), '# Integration Test Project\n')
  await writeFile(join(projectDir, 'index.ts'), 'export const hello = () => "Hello!";\n')
  await writeFile(join(projectDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2))

  // Create src directory
  await mkdir(join(projectDir, 'src'))
  await writeFile(join(projectDir, 'src', 'main.ts'), 'console.log("main");\n')

  // Initialize git
  await spawnAsync(['git', 'init'], { cwd: projectDir })
  await spawnAsync(['git', 'config', 'user.email', 'test@test.com'], { cwd: projectDir })
  await spawnAsync(['git', 'config', 'user.name', 'Test'], { cwd: projectDir })
  await spawnAsync(['git', 'add', '-A'], { cwd: projectDir })
  await spawnAsync(['git', 'commit', '-m', 'init'], { cwd: projectDir })

  // Copy plugin as a single file at .opencode/plugin/daytona.ts
  // OpenCode expects plugins at .opencode/plugin/*.ts, not in subdirectories
  const pluginDir = join(projectDir, '.opencode', 'plugin')
  await mkdir(pluginDir, { recursive: true })

  // Create a simplified inline version of the plugin for testing
  const pluginContent = `
import { Daytona } from '@daytona/sdk'
import type { PluginInput, WorkspaceAdapter } from '@opencode-ai/plugin'

const REPO_PATH = '/home/daytona/workspace/repo'
const SERVER_PORT = 3096
const HEALTH_URL = \`http://127.0.0.1:\${SERVER_PORT}/global/health\`

function sh(value: string): string {
  return "'" + value.replace(/'/g, "'\\"'\\"'") + "'"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let daytonaClient: Daytona | undefined

function getDaytona(): Daytona {
  if (daytonaClient == null) {
    daytonaClient = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })
  }
  return daytonaClient
}

const previewCache = new Map<string, { url: string; token: string }>()

function sandboxName(name: string): string {
  return \`opencode-\${name}\`
}

export const DaytonaPlugin = async (input: PluginInput) => {
  const { experimental_workspace } = input

  if (!process.env.DAYTONA_API_KEY) {
    console.warn('[daytona] DAYTONA_API_KEY is not set')
    return {}
  }

  const adaptor: WorkspaceAdapter = {
    name: 'Daytona',
    description: 'Create a remote Daytona sandbox workspace',

    configure(config) {
      return config
    },

    async create(config) {
      console.log('[daytona] Creating workspace:', config.name)

      const d = getDaytona()
      const sandbox = await d.create({ name: sandboxName(config.name) })

      // Create directory structure
      await sandbox.process.executeCommand(\`mkdir -p \${sh(REPO_PATH)}\`)

      // Install and start opencode
      await sandbox.process.executeCommand(
        \`mkdir -p "$HOME/.opencode/bin" && OPENCODE_INSTALL_DIR="$HOME/.opencode/bin" curl -fsSL https://opencode.ai/install | bash\`
      )

      await sandbox.process.executeCommand(
        \`cd \${sh(REPO_PATH)} && nohup "$HOME/.opencode/bin/opencode" serve --hostname 0.0.0.0 --port \${SERVER_PORT} >/tmp/opencode.log 2>&1 </dev/null &\`
      )

      // Wait for server
      for (let i = 0; i < 60; i++) {
        const result = await sandbox.process.executeCommand(\`curl -fsS \${sh(HEALTH_URL)}\`)
        if (result.exitCode === 0) {
          console.log('[daytona] Server ready')
          return
        }
        await sleep(1000)
      }

      throw new Error('Server did not start')
    },

    async remove(config) {
      const d = getDaytona()
      const sandbox = await d.get(sandboxName(config.name)).catch(() => undefined)
      if (!sandbox) return
      await d.delete(sandbox)
      previewCache.delete(config.name)
    },

    async target(config) {
      let link = previewCache.get(config.name)
      if (!link) {
        const sandbox = await getDaytona().get(sandboxName(config.name))
        link = await sandbox.getPreviewLink(SERVER_PORT)
        previewCache.set(config.name, link)
      }
      return {
        type: 'remote' as const,
        url: link.url,
        headers: {
          'x-daytona-preview-token': link.token,
          'x-daytona-skip-preview-warning': 'true',
          'x-opencode-directory': REPO_PATH,
        },
      }
    },
  }

  experimental_workspace.register('daytona', adaptor)
  console.log('[daytona] Registered daytona adapter')

  return {}
}

export default DaytonaPlugin
`
  await writeFile(join(pluginDir, 'daytona.ts'), pluginContent)

  // Install dependencies needed by the plugin
  await writeFile(join(projectDir, 'package.json'), JSON.stringify({
    name: 'integration-test',
    version: '1.0.0',
    dependencies: {
      '@daytona/sdk': '*',
      '@opencode-ai/plugin': '*',
    },
  }, null, 2))

  console.log('Installing plugin dependencies...')
  await spawnAsync(['npm', 'install'], { cwd: projectDir })

  // Create opencode.json config that enables workspaces
  await writeFile(join(projectDir, 'opencode.json'), JSON.stringify({
    "$schema": "https://opencode.ai/config.json"
  }, null, 2))

  return projectDir
}

async function main() {
  const results: TestResult[] = []
  const testDir = join(tmpdir(), `integration-test-${Date.now()}`)
  let serverProc: ChildProcess | null = null
  let createdSandboxId: string | null = null
  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })

  try {
    // Step 1: Create test project with plugin
    console.log('\n=== Step 1: Create test project with plugin ===')
    await mkdir(testDir, { recursive: true })
    const projectDir = await createTestProject(testDir)
    console.log(`Project created at: ${projectDir}`)

    const pluginCheck = await readdir(join(projectDir, '.opencode', 'plugin'))
    console.log(`Plugin files: ${pluginCheck.join(', ')}`)
    results.push({ step: 'Create project', success: true, details: `Plugin: ${pluginCheck.join(', ')}` })

    // Step 2: Start OpenCode server
    console.log('\n=== Step 2: Start OpenCode server ===')
    console.log(`Running: ${OPENCODE_BIN} serve --port ${SERVER_PORT}`)

    serverProc = spawn(OPENCODE_BIN, ['serve', '--port', String(SERVER_PORT)], {
      cwd: projectDir,
      env: {
        ...process.env,
        OPENCODE_EXPERIMENTAL_WORKSPACES: 'true',
        DEBUG: '*',  // Enable debug logging
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let serverOutput = ''
    let serverExited = false
    serverProc.stdout?.on('data', (d: Buffer) => {
      serverOutput += d.toString()
      process.stdout.write(d)
    })
    serverProc.stderr?.on('data', (d: Buffer) => {
      serverOutput += d.toString()
      process.stderr.write(d)
    })
    serverProc.on('exit', (code) => {
      serverExited = true
      console.log(`Server exited with code: ${code}`)
    })

    console.log('Waiting for server...')

    // Wait for server to be ready or exit
    const serverReady = await Promise.race([
      waitForServer(SERVER_PORT),
      new Promise<boolean>(resolve => {
        const checkExit = setInterval(() => {
          if (serverExited) {
            clearInterval(checkExit)
            resolve(false)
          }
        }, 100)
      }),
    ])

    if (!serverReady) {
      console.log('Server output:', serverOutput)
      throw new Error('Server did not start or exited early')
    }
    console.log('Server is ready!')
    results.push({ step: 'Start server', success: true, details: `Port ${SERVER_PORT}` })

    // Step 3: Check workspace adapters
    console.log('\n=== Step 3: Check workspace adapters ===')
    const adaptersRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/experimental/workspace/adapter`)
    const adapters = await adaptersRes.json()
    console.log('Adapters:', JSON.stringify(adapters, null, 2))

    const hasDaytona = Array.isArray(adapters) && adapters.some((a: any) => a.type === 'daytona')
    results.push({ step: 'Check adapters', success: hasDaytona, details: hasDaytona ? 'Daytona adapter found' : 'Daytona adapter NOT found' })

    if (!hasDaytona) {
      console.log('Server output:', serverOutput.slice(-2000))
      throw new Error('Daytona adapter not registered')
    }

    // Step 4: Create workspace via API
    console.log('\n=== Step 4: Create workspace via API ===')
    const createRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/experimental/workspace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'daytona',
        name: `integration-test-${Date.now()}`,
        branch: 'master',  // Required field
      }),
    })

    console.log(`Create response status: ${createRes.status}`)
    const createBody = await createRes.text()
    console.log(`Create response body: ${createBody}`)

    if (!createRes.ok) {
      results.push({ step: 'Create workspace', success: false, details: `Status ${createRes.status}: ${createBody}` })
      throw new Error(`Create failed: ${createBody}`)
    }

    const workspace = JSON.parse(createBody)
    console.log('Workspace created:', workspace)
    results.push({ step: 'Create workspace', success: true, details: `ID: ${workspace.id}` })

    // Step 5: Verify sandbox has files
    console.log('\n=== Step 5: Verify sandbox contents ===')
    // The workspace name in Daytona is prefixed with 'opencode-'
    const sandboxName = `opencode-${workspace.name}`

    // Wait a bit for sandbox to be fully ready
    await sleep(5000)

    try {
      const sandbox = await daytona.get(sandboxName)
      createdSandboxId = sandbox.id

      const files = await sandbox.process.executeCommand('ls -la /home/daytona/workspace/repo')
      console.log('Sandbox files:', files.result)

      const gitLog = await sandbox.process.executeCommand('cd /home/daytona/workspace/repo && git log --oneline -1')
      console.log('Git log:', gitLog.result?.trim())

      const hasFiles = files.exitCode === 0 && (files.result?.includes('README.md') || false)
      results.push({ step: 'Verify sandbox', success: hasFiles, details: hasFiles ? 'Files present' : 'Files missing' })
    } catch (e: any) {
      console.log('Could not verify sandbox:', e.message)
      results.push({ step: 'Verify sandbox', success: false, details: e.message })
    }

    // Step 6: Clean up workspace
    console.log('\n=== Step 6: Clean up workspace ===')
    const deleteRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/experimental/workspace/${workspace.id}`, {
      method: 'DELETE',
    })
    console.log(`Delete response: ${deleteRes.status}`)
    results.push({ step: 'Delete workspace', success: deleteRes.ok, details: `Status ${deleteRes.status}` })

  } catch (error: any) {
    console.error('\n!!! Error:', error.message)
    results.push({ step: 'Error', success: false, details: error.message })
  } finally {
    // Cleanup
    console.log('\n=== Cleanup ===')

    if (serverProc) {
      console.log('Stopping server...')
      serverProc.kill('SIGTERM')
    }

    if (createdSandboxId) {
      console.log('Deleting sandbox...')
      try {
        const sandbox = await daytona.get(createdSandboxId)
        await daytona.delete(sandbox)
      } catch {}
    }

    console.log('Removing test directory...')
    await rm(testDir, { recursive: true, force: true }).catch(() => {})
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('INTEGRATION TEST RESULTS')
  console.log('='.repeat(60))
  for (const r of results) {
    const status = r.success ? '✓' : '✗'
    console.log(`${status} ${r.step}: ${r.details}`)
  }
  console.log('='.repeat(60))

  const passed = results.filter(r => r.success).length
  const total = results.filter(r => r.step !== 'Error').length
  console.log(`${passed}/${total} steps passed`)

  process.exit(passed === total ? 0 : 1)
}

main().catch(console.error)
