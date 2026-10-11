/* Corre las pruebas de js/tests.js con Node (sin navegador):
     node tests/run-node.js            todas
     node tests/run-node.js Attempt    solo las que contengan "Attempt"
   Requiere Node 18 o más reciente (usa crypto.subtle). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'js');
for (const file of ['core.js', 'models.js', 'db.js', 'seed.js', 'api.js', 'tests.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}
globalThis.QT.test(process.argv[2] || '').then(({ failed }) => process.exit(failed ? 1 : 0));
