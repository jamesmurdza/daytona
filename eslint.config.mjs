import nx from '@nx/eslint-plugin'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'apps/docs/**',
      'libs/*api-client*/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    // Override or add rules here
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-useless-escape': 'off',
    },
  },
  {
    files: ['src/migrations/**/*.ts'],
    rules: {
      quotes: 'off',
    },
  },
  {
    // The SDK runtime-test fixtures intentionally import from '@daytona/sdk'
    // (the packed published package) instead of the workspace source — that's
    // the whole point of the tests. Disable the enforce-module-boundaries
    // auto-fix that rewrites those imports to relative source paths.
    files: ['libs/sdk-typescript/runtime-tests/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // pi-plugin imports the PUBLISHED '@daytona/sdk' (statically in agent code,
    // dynamically via jiti in scripts/*.mjs); nx would otherwise rewrite those
    // imports to workspace source. Disabled tree-wide on purpose: pi-plugin is a
    // standalone published leaf, so the boundary checks lost on SDK-free files
    // (auth/util/github/smoke) carry no real value here, and a per-file glob
    // would just be a maintenance tripwire.
    files: ['libs/pi-plugin/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
]
