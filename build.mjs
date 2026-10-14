import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))

await build({
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(root, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  // Zapier loads the app definition with require().
  format: 'cjs',
  target: 'node20',
  external: ['zapier-platform-core'],
  alias: { '@modelflare/core': path.join(root, './shared/core-ts/src/index.ts') },
  define: { __MODELFLARE_PLUGIN_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
})
