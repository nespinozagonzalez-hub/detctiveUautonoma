const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const listeners = {};
const elements = new Map();
const storage = new Map();
const classes = new Set();
function element(id) {
  if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', open: false, classList: { add() {}, remove() {} }, style: {}, attrs: {}, files: [], setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this[k] = fn; }, focus() {}, click() {}, close() { this.open = false; }, showModal() { this.open = true; }, getBoundingClientRect() { return { left: 0, top: 0, right: 500, bottom: 500 }; } });
  return elements.get(id);
}
const ctx = vm.createContext({
  console, setTimeout: () => 1, clearTimeout() {},
  window: { scrollY: 0, innerWidth: 1440, scrollTo() {}, addEventListener() {} },
  document: { querySelector: element, getElementById: element, addEventListener(k, fn) { listeners[k] = fn; }, fullscreenEnabled: false, body: { classList: { add(k) { classes.add(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); } }, appendChild() {} }, documentElement: {}, createElement() { return { click() {}, remove() {} }; } },
  localStorage: { getItem: k => storage.get(k) || null, setItem(k, v) { storage.set(k, v); } },
  FormData: class { constructor(form) { this.data = form.data; } get(k) { return this.data[k] || null; } },
  Blob: class { constructor(parts, options) { this.parts = parts; this.options = options; } },
  URL: { createObjectURL: () => 'blob:local-test', revokeObjectURL() {} }
});
vm.runInContext(fs.readFileSync(require.resolve('../case-data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(require.resolve('../app.js'), 'utf8'), ctx);
const read = expression => vm.runInContext(expression, ctx);
function click(action, data = {}) { const b = { dataset: { action, ...data }, disabled: false }; listeners.click({ target: { closest: () => b } }); }
function submit(id, data) { listeners.submit({ target: { id, data }, preventDefault() {} }); }
submit('identity-form', { name: '<Equipo de prueba>', members: '' });
assert.equal(read('state.identity.name'), '<Equipo de prueba>');
assert(element('#main').innerHTML.includes('&lt;Equipo de prueba&gt;'));
assert(!element('#main').innerHTML.includes('<Equipo de prueba>'));
click('chapter', { index: '6' });
assert.equal(read('state.chapter'), 0);
submit('lock-form', { code: '20' });
assert.equal(read('state.clues[0]'), false);
click('answer', { index: '0' });
submit('lock-form', { code: '10' });
assert.equal(read('state.clues[0]'), false);
click('answer', { index: '1' });
submit('lock-form', { code: '10' });
assert.equal(read('state.clues[0]'), false);
submit('lock-form', { code: '20' });
assert.equal(read('state.clues[0]'), true);
click('discard', { id: 'violeta' });
assert.equal(read('state.discarded.violeta'), true);
click('discard', { id: 'violeta' });
assert.equal(read('state.discarded.violeta'), false);
listeners.input({ target: { id: 'case-notes', value: 'Notas que se guardan.', dataset: {}, closest: () => null } });
assert.equal(JSON.parse(storage.get('elmsworth-evans-v2')).notes, 'Notas que se guardan.');
click('advance');
for (const [answer, code] of [['1', '20'], ['0', '10'], ['0', '10']]) { click('answer', { index: answer }); submit('lock-form', { code }); click('advance'); }
assert.equal(read('state.chapter'), 4);
submit('riddle-form', { place: 'biblioteca' });
assert.equal(read('state.locationSolved'), false);
submit('riddle-form', { place: 'el casillero' });
assert.equal(read('state.locationSolved'), true);
for (let i = 0; i < 6 && !read('state.letterFound'); i++) click('cabinet', { index: String(i) });
assert.equal(read('state.letterFound'), true);
click('advance');
assert.equal(read('state.chapter'), 5);
assert.equal((element('#main').innerHTML.match(/class="alphabet-cell"/g) || []).length, 27);
submit('cipher-form', { message: 'texto incorrecto' });
assert.equal(read('state.cipherSolved'), false);
submit('cipher-form', { message: 'EN EL COMEDOR CON UNA LÁMPARA.' });
assert.equal(read('state.cipherSolved'), true);
click('advance');
submit('accusation-form', { suspect: 'golden', room: 'comedor', weapon: 'lampara', reason: 'Coincide con el pelo blanco, el tabaco, la estatura y la seda.' });
assert.equal(read('state.finished'), false);
submit('accusation-form', { suspect: 'green', room: 'comedor', weapon: 'lampara', reason: 'Coincide con el pelo blanco, el tabaco, la estatura y la seda.' });
assert.equal(read('state.finished'), true);
assert.equal(read('state.chapter'), 7);
assert(element('#main').innerHTML.includes('Caso resuelto.'));
const sanitized = read('sanitizeState(JSON.parse(JSON.stringify(state)))');
assert.equal(sanitized.finished, true);
assert.equal(sanitized.notes, 'Notas que se guardan.');
assert.equal(read('sanitizeState({...state, chapter:9999}).chapter'), 7);
assert.equal(read('sanitizeState({...state, clues:[false,true,true,true]}).cipherSolved'), false);
assert.equal(read('sanitizeState({...state, deduction:{suspect:"golden",room:"comedor",weapon:"lampara",reason:"una justificación suficientemente extensa"}}).finished'), false);
assert.throws(() => read('sanitizeState({version:1})'));
read('toggleFullscreen()');
assert(classes.has('theater'));
read('toggleFullscreen()');
assert(!classes.has('theater'));
console.log('PASS: flujo completo de eventos, progreso, descartes, notas, navegación bloqueada, cifrado, resolución, restauración validada, escape de texto y alternativa de pantalla completa.');
