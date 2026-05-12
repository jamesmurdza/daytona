/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end test of the OpenCode Daytona plugin flow.
 * This simulates exactly what the plugin does when creating a workspace.
 *
 * Run with: npx tsx test/plugin-flow.test.ts
 *
 * Requires DAYTONA_API_KEY environment variable.
 */

import { Daytona } from '@daytona/sdk'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'

// Constants matching the plugin
const REPO_PATH = '/home/daytona/workspace/repo'
const ROOT_PATH = '/home/daytona/workspace'
const SERVER_PORT = 3096
const HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/global/health`

function sh(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function spawnAsync(cmd: string[], options: { cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `Exit code ${code}`))
    })
    proc.on('error', reject)
  })
}

async function createTestRepo(baseDir: string): Promise<string> {
  const repoDir = join(baseDir, 'test-project')
  await mkdir(repoDir, { recursive: true })

  // Create some test files
  await writeFile(
    join(repoDir, 'README.md'),
    '# Test Project\n\nThis is a test project for the OpenCode Daytona plugin.\n',
  )
  await writeFile(join(repoDir, 'index.ts'), 'console.log("Hello from test project!");\n')
  await writeFile(
    join(repoDir, 'package.json'),
    JSON.stringify(
      {
        name: 'test-project',
        version: '1.0.0',
        main: 'index.ts',
      },
      null,
      2,
    ),
  )

  // Create subdirectory with files
  await mkdir(join(repoDir, 'src'))
  await writeFile(join(repoDir, 'src', 'app.ts'), 'export const app = () => "Hello!";\n')
  await writeFile(join(repoDir, 'src', 'utils.ts'), 'export const add = (a: number, b: number) => a + b;\n')

  // Initialize git repo
  await spawnAsync(['git', 'init'], { cwd: repoDir })
  await spawnAsync(['git', 'config', 'user.email', 'test@test.com'], { cwd: repoDir })
  await spawnAsync(['git', 'config', 'user.name', 'Test User'], { cwd: repoDir })
  await spawnAsync(['git', 'add', '-A'], { cwd: repoDir })
  await spawnAsync(['git', 'commit', '-m', 'Initial commit'], { cwd: repoDir })

  return repoDir
}

interface TestResult {
  step: string
  success: boolean
  details: string
}

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    console.error('Error: DAYTONA_API_KEY environment variable is required')
    process.exit(1)
  }

  const results: TestResult[] = []
  const testDir = join(tmpdir(), `plugin-test-${Date.now()}`)
  let sandbox: Awaited<ReturnType<Daytona['create']>> | null = null
  const d = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })

  try {
    // Step 1: Create test repo
    console.log('\n=== Step 1: Create test repo ===')
    await mkdir(testDir, { recursive: true })
    const worktree = await createTestRepo(testDir)
    const files = await readdir(worktree)
    console.log(`Created test repo at: ${worktree}`)
    console.log(`Files: ${files.join(', ')}`)
    results.push({
      step: 'Create test repo',
      success: true,
      details: `Created at ${worktree} with ${files.length} files`,
    })

    // Step 2: Create sandbox
    console.log('\n=== Step 2: Create sandbox ===')
    sandbox = await d.create({ name: `plugin-test-${Date.now()}` })
    console.log(`Sandbox created: ${sandbox.id}`)
    const workDir = await sandbox.getWorkDir()
    console.log(`Working directory: ${workDir}`)
    results.push({ step: 'Create sandbox', success: true, details: `ID: ${sandbox.id}, workDir: ${workDir}` })

    // Step 3: Clone and create tarball (like plugin)
    console.log('\n=== Step 3: Clone and create tarball ===')
    const temp = join(testDir, 'temp')
    await mkdir(temp, { recursive: true })
    const dir = join(temp, 'repo')
    const tar = join(temp, 'repo.tgz')
    const source = `file://${worktree}`

    console.log(`Cloning from: ${source}`)
    await spawnAsync(['git', 'clone', '--depth', '1', '--no-local', source, dir], { cwd: tmpdir() })

    const clonedFiles = await readdir(dir)
    console.log(`Cloned files: ${clonedFiles.join(', ')}`)

    await spawnAsync(['tar', '--exclude=repo/.opencode', '-czf', tar, '-C', temp, 'repo'])
    const tarSize = statSync(tar).size
    console.log(`Tarball size: ${tarSize} bytes`)
    results.push({
      step: 'Clone and tarball',
      success: true,
      details: `Cloned ${clonedFiles.length} files, tarball ${tarSize} bytes`,
    })

    // Step 4: Upload tarball
    console.log('\n=== Step 4: Upload tarball ===')
    await sandbox.fs.uploadFile(tar, 'repo.tgz')
    const uploadCheck = await sandbox.process.executeCommand('ls -la $HOME/repo.tgz 2>&1')
    console.log(`Upload result: ${uploadCheck.result?.trim()}`)
    const uploadSuccess = uploadCheck.exitCode === 0
    results.push({ step: 'Upload tarball', success: uploadSuccess, details: uploadCheck.result?.trim() || 'Failed' })

    // Step 5: Extract tarball (like plugin)
    console.log('\n=== Step 5: Extract tarball ===')
    const extractCmd = `rm -rf ${sh(REPO_PATH)} && mkdir -p ${sh(ROOT_PATH)} && tar -xzf "$HOME/repo.tgz" -C "$HOME/workspace" && rm "$HOME/repo.tgz"`
    console.log(`Running: ${extractCmd}`)
    const extractResult = await sandbox.process.executeCommand(extractCmd)
    console.log(`Exit code: ${extractResult.exitCode}`)
    if (extractResult.result) console.log(`Output: ${extractResult.result}`)
    results.push({
      step: 'Extract tarball',
      success: extractResult.exitCode === 0,
      details: `Exit code: ${extractResult.exitCode}`,
    })

    // Step 6: Verify files
    console.log('\n=== Step 6: Verify extracted files ===')
    const verifyFiles = await sandbox.process.executeCommand(`ls -la ${REPO_PATH}`)
    console.log(verifyFiles.result)

    const verifyGit = await sandbox.process.executeCommand(`cd ${REPO_PATH} && git log --oneline -1 2>&1`)
    console.log(`Git log: ${verifyGit.result?.trim()}`)

    const verifySrc = await sandbox.process.executeCommand(`ls ${REPO_PATH}/src/ 2>&1`)
    console.log(`src/ contents: ${verifySrc.result?.trim()}`)

    const hasFiles = verifyFiles.exitCode === 0 && verifyGit.exitCode === 0
    results.push({
      step: 'Verify files',
      success: hasFiles,
      details: `Git: ${verifyGit.result?.trim()}, src/: ${verifySrc.result?.trim()}`,
    })

    // Step 7: Upload plugin files (like plugin does)
    console.log('\n=== Step 7: Upload plugin files ===')
    const projectId = 'test-project-id'
    await sandbox.fs.uploadFile(Buffer.from(`${projectId}\n`), `${REPO_PATH}/.git/opencode`)

    const instructions = `# Test Instructions\nThis is a test sandbox.\nRepo path: ${REPO_PATH}\n`
    await sandbox.process.executeCommand(`mkdir -p ${REPO_PATH}/.opencode/instructions`)
    await sandbox.fs.uploadFile(Buffer.from(instructions), `${REPO_PATH}/.opencode/instructions/daytona.md`)

    const opencodeConfig = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        instructions: ['.opencode/instructions/daytona.md'],
      },
      null,
      2,
    )
    await sandbox.fs.uploadFile(Buffer.from(opencodeConfig), `${REPO_PATH}/opencode.json`)

    const configCheck = await sandbox.process.executeCommand(`cat ${REPO_PATH}/opencode.json`)
    console.log(`opencode.json: ${configCheck.result?.trim()}`)
    results.push({
      step: 'Upload plugin files',
      success: configCheck.exitCode === 0,
      details: 'Uploaded .git/opencode, instructions, opencode.json',
    })

    // Step 8: Install opencode
    console.log('\n=== Step 8: Install opencode ===')
    const installCmd = `mkdir -p "$HOME/.opencode/bin" && OPENCODE_INSTALL_DIR="$HOME/.opencode/bin" curl -fsSL https://opencode.ai/install | bash`
    console.log('Installing opencode (this may take a minute)...')
    const installResult = await sandbox.process.executeCommand(installCmd)
    console.log(`Install exit code: ${installResult.exitCode}`)
    results.push({
      step: 'Install opencode',
      success: installResult.exitCode === 0,
      details: `Exit code: ${installResult.exitCode}`,
    })

    // Step 9: Start opencode server
    console.log('\n=== Step 9: Start opencode server ===')
    const startCmd = `cd ${sh(REPO_PATH)} && nohup "$HOME/.opencode/bin/opencode" serve --hostname 0.0.0.0 --port ${SERVER_PORT} >/tmp/opencode.log 2>&1 </dev/null &`
    await sandbox.process.executeCommand(startCmd)
    console.log('Server starting, waiting for health check...')

    let serverReady = false
    for (let i = 0; i < 30; i++) {
      const health = await sandbox.process.executeCommand(`curl -fsS ${sh(HEALTH_URL)}`)
      if (health.exitCode === 0) {
        console.log(`Health check passed: ${health.result?.trim()}`)
        serverReady = true
        break
      }
      await sleep(1000)
      process.stdout.write('.')
    }
    console.log('')

    if (!serverReady) {
      const log = await sandbox.process.executeCommand('cat /tmp/opencode.log 2>&1 | tail -20')
      console.log('Server log:', log.result)
    }
    results.push({ step: 'Start server', success: serverReady, details: serverReady ? 'Health check passed' : 'Failed' })

    // Step 10: Test preview URL
    console.log('\n=== Step 10: Get preview URL ===')
    const preview = await sandbox.getPreviewLink(SERVER_PORT)
    console.log(`Preview URL: ${preview.url}`)
    results.push({ step: 'Preview URL', success: !!preview.url, details: preview.url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('\n!!! Error:', message)
    results.push({ step: 'Error', success: false, details: message })
  } finally {
    // Cleanup
    console.log('\n=== Cleanup ===')
    if (sandbox) {
      console.log('Deleting sandbox...')
      await d.delete(sandbox)
    }
    console.log('Removing test directory...')
    await rm(testDir, { recursive: true, force: true }).catch(() => {})
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('TEST RESULTS SUMMARY')
  console.log('='.repeat(60))
  for (const r of results) {
    const status = r.success ? '✓' : '✗'
    console.log(`${status} ${r.step}: ${r.details.slice(0, 60)}${r.details.length > 60 ? '...' : ''}`)
  }
  console.log('='.repeat(60))
  const passed = results.filter((r) => r.success).length
  const total = results.length
  console.log(`${passed}/${total} steps passed`)

  process.exit(passed === total ? 0 : 1)
}

main().catch(console.error)
