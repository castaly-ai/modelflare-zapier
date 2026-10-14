// Zapier's CommonJS runtime wrapper always loads index.js from the package
// root and ignores package.json "main", so the compiled app is re-exported here.
module.exports = require('./dist/index.js')
