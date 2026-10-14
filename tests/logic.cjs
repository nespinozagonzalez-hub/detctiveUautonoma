const assert = require('node:assert/strict');
const { CASE_DATA, normalizeAnswer, codeForAnswer, checkLock, suspectsMatching } = require('../case-data.js');
assert.deepEqual([0, 1, 2, 3, 4].map(n => suspectsMatching(n).length), [6, 4, 3, 2, 1]);
assert.deepEqual(suspectsMatching(4).map(s => s.id), ['green']);
CASE_DATA.missions.forEach((m, i) => {
  assert(checkLock(i, m.correct, codeForAnswer(m.correct)));
  assert(!checkLock(i, m.correct, ''));
  assert(!checkLock(i, m.correct, '20x'));
  assert(!checkLock(i, (m.correct + 1) % 4, codeForAnswer((m.correct + 1) % 4)));
  assert(!checkLock(i, m.correct, codeForAnswer((m.correct + 1) % 4)));
  assert(!checkLock(i, null, codeForAnswer(m.correct)));
});
assert.equal(normalizeAnswer('  EN EL COMEDOR, CON UNA LÁMPARA.  '), CASE_DATA.secretMessage);
assert.equal(normalizeAnswer('El CASILLERO.'), 'el casillero');
assert(!checkLock(8, 1, '20'));
console.log('PASS: eliminación 6→4→3→2→1, candados, respuestas incorrectas y normalización.');
