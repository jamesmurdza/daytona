/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { Daytona } from '@daytona/sdk'
import { createOpencode } from '@opencode-ai/sdk/v2'

const PLUGIN_PATH = resolve(import.meta.dir, '../.opencode/plugin/index.ts')
const PLUGIN_SPEC = `file://${PLUGIN_PATH}`

const HAS_DAYTONA_KEY = Boolean(process.env.DAYTONA_API_KEY)

describe('opencode-plugin', () => {
  test('registers the daytona workspace adapter', async () => {
    const { client, server } = await createOpencode({
      timeout: 30_000,
      config: { plugin: [PLUGIN_SPEC] },
    })
    try {
      const { data, error } = await client.experimental.workspace.adapter.list()
      expect(error).toBeUndefined()
      expect(data?.some((a) => a.type === 'daytona')).toBe(true)
    } finally {
      server.close()
    }
  })

  describe.skipIf(!HAS_DAYTONA_KEY)('partial-create cleanup (requires DAYTONA_API_KEY)', () => {
    const name = `e2e-cleanup-${Date.now()}`
    const sandboxName = `opencode-${name}`
    let daytona: Daytona

    beforeAll(() => {
      daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY })
    })

    // Belt-and-suspenders: if the plugin leaked a sandbox, tear it down here
    // so we don't pay rent on it forever.
    afterAll(async () => {
      const leaked = await daytona.get(sandboxName).catch(() => undefined)
      if (leaked) await daytona.delete(leaked).catch(() => undefined)
    })

    test('removes sandbox when create() fails partway', async () => {
      const { client, server } = await createOpencode({
        timeout: 30_000,
        config: { plugin: [PLUGIN_SPEC] },
      })

      try {
        // The bad branch makes the host-side `git clone --branch ...` fail;
        // by then the plugin has already created the Daytona sandbox.
        const { error } = await client.experimental.workspace.create({
          id: name,
          type: 'daytona',
          branch: `does-not-exist-${Date.now()}`,
          extra: null,
        })

        expect(error).toBeDefined()

        // Sandbox must be gone — leaving it would silently burn money.
        const leaked = await daytona.get(sandboxName).catch(() => undefined)
        expect(leaked).toBeUndefined()
      } finally {
        server.close()
      }
    })
  })
})
