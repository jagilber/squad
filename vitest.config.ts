import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Force vitest to resolve @bradygaster/squad-sdk from the workspace root,
    // not from a duplicate copy under packages/squad-cli/node_modules/.
    // Without this, vi.mock('@bradygaster/squad-sdk') targets the root copy
    // but the code under test imports from the duplicate — bypassing the mock.
    dedupe: ['@bradygaster/squad-sdk'],
    alias: {
      // vscode-jsonrpc has no ESM exports map, so `import 'vscode-jsonrpc/node'`
      // fails under ESM because Node requires explicit `.js` extension for
      // subpath imports when there's no exports field. This alias fixes the
      // resolution for tests that transitively pull in @github/copilot-sdk.
      'vscode-jsonrpc/node': 'vscode-jsonrpc/node.js',
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Inline @github/copilot-sdk so Vite's resolver (with our alias above)
    // handles its import of 'vscode-jsonrpc/node' instead of Node's native
    // ESM loader which requires the explicit .js extension.
    deps: {
      inline: ['@github/copilot-sdk'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
    },
  },
});
