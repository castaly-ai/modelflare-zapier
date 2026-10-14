// Validates the built app the way `zapier validate` does: compile it, replace
// functions with placeholders, then check it against Zapier's schema.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { compileApp, validateApp } = require('zapier-platform-core/src/tools/schema')
const app = require('./dist/index.js')

const errors = validateApp(compileApp(app))
if (errors.length > 0) {
  for (const error of errors) console.error(`${error.property}: ${error.message}`)
  process.exit(1)
}
console.log(`App definition is valid: ${Object.keys(app.creates).length} creates, ${Object.keys(app.searches).length} searches, ${Object.keys(app.triggers).length} triggers`)
