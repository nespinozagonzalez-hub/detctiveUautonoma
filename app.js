'use strict';
const STORAGE_KEY = 'elmsworth-evans-v2';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const freshState = () => ({ version: 2, identity: null, chapter: 0, clues: [false, false, false, false], selected: [null, null, null, null], codes: ['', '', '', ''], attempts: [0, 0, 0, 0], hints: [0, 0, 0, 0], discarded: {}, reasons: {}, notes: '', locationSolved: false, opened: [], letterFound: false, cipherSolved: false, cipherHints: 0, cipherAttempts: 0, finalAttempts: 0, finished: false, deduction: { suspect: '', room: '', weapon: '', reason: '' }, reflection: '' });
function maxChapter(s = state) {
  const next = s.clues.findIndex(c => !c);
  if (next !== -1) return next;
  if (!s.letterFound) return 4;
  if (!s.cipherSolved) return 5;
  return s.finished ? 7 : 6;
}
function sanitizeState(raw) {
  if (!raw || raw.version !== 2 || typeof raw !== 'object') throw new Error('Formato de expediente no compatible.');
  const s = freshState();
  const text = (v, n = 8000) => typeof v === 'string' ? v.slice(0, n) : '';
  const count = v => Number.isInteger(v) ? Math.max(0, Math.min(v, 9999)) : 0;
  if (raw.identity && typeof raw.identity.name === 'string' && raw.identity.name.trim()) {
    s.identity = { mode: raw.identity.mode === 'team' ? 'team' : 'solo', name: text(raw.identity.name, 50).trim(), members: text(raw.identity.members, 150).trim() };
  }
  let previous = true;
  s.clues = s.clues.map((_, i) => { const valid = Boolean(previous && raw.clues?.[i] === true); previous = valid; return valid; });
  s.selected = s.selected.map((_, i) => Number.isInteger(raw.selected?.[i]) && raw.selected[i] >= 0 && raw.selected[i] <= 3 ? raw.selected[i] : null);
  s.codes = s.codes.map((_, i) => text(raw.codes?.[i], 8));
  s.attempts = s.attempts.map((_, i) => count(raw.attempts?.[i]));
  s.hints = s.hints.map((_, i) => Math.min(2, count(raw.hints?.[i])));
  CASE_DATA.suspects.forEach(p => { s.discarded[p.id] = raw.discarded?.[p.id] === true; s.reasons[p.id] = text(raw.reasons?.[p.id], 400); });
  s.notes = text(raw.notes);
  s.locationSolved = s.clues.every(Boolean) && raw.locationSolved === true;
  s.opened = s.locationSolved && Array.isArray(raw.opened) ? [...new Set(raw.opened.filter(i => Number.isInteger(i) && i >= 0 && i < 6))] : [];
  s.letterFound = s.locationSolved && raw.letterFound === true;
  s.cipherSolved = s.letterFound && raw.cipherSolved === true;
  s.cipherHints = Math.min(2, count(raw.cipherHints));
  s.cipherAttempts = count(raw.cipherAttempts);
  s.finalAttempts = count(raw.finalAttempts);
  ['suspect', 'room', 'weapon', 'reason'].forEach(k => { s.deduction[k] = text(raw.deduction?.[k], k === 'reason' ? 2000 : 50); });
  s.finished = s.cipherSolved && raw.finished === true && s.deduction.suspect === CASE_DATA.solution.suspect && normalizeAnswer(s.deduction.room) === CASE_DATA.solution.room && normalizeAnswer(s.deduction.weapon) === CASE_DATA.solution.weapon && s.deduction.reason.trim().length >= 20;
  s.reflection = text(raw.reflection, 4000);
  s.chapter = Math.min(maxChapter(s), Math.max(0, count(raw.chapter)));
  if (!s.identity) return freshState();
  return s;
}
let state = freshState();
let storageNotice = false;
try { const stored = localStorage.getItem(STORAGE_KEY); if (stored) state = sanitizeState(JSON.parse(stored)); } catch (_) { storageNotice = true; }
let view = 'landing';
let tab = 'investigation';
let scene = 0;
let mode = 'solo';
let feedback = null;
let cabinetMessage = '';
let toastTimer;
let lastModalFocus;
let audioContext = null;
let ambientSource = null;
let ambientGain = null;
let soundOn = false;

function toast(message) {
  const t = $('#toast'); t.textContent = message; t.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 4200);
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (_) { if (!storageNotice) { storageNotice = true; toast('El navegador no permite guardar. Usa «Guardar copia» para conservar tu expediente.'); } }
}
function actionButton(action, label, type = 'primary', extra = '') { return `<button class="${type}" data-action="${action}" ${extra}>${label}</button>`; }
function feedbackHTML() { return feedback ? `<div class="feedback ${feedback.kind || ''}" role="status">${escapeHTML(feedback.text)}</div>` : ''; }
function evidenceIcon(kind) {
  const paths = { hair: '<path d="M7 19c10-17 19-13 10-4S4 32 23 30M12 8c12-7 18 4 4 16"/>', ash: '<path d="M7 27h22M9 24l4-8 4 8 5-6 5 6M15 11c-5-5 7-6 3-11"/>', height: '<path d="M12 4v28M8 8l4-4 4 4M8 28l4 4 4-4M25 5v26M21 8h4m-4 6h4m-4 6h4m-4 6h4"/>', silk: '<path d="M6 8c8-10 15 12 24 0v23c-9 12-17-10-24 0Z M12 11v13M20 17v12"/>', lock: '<rect x="9" y="16" width="20" height="16" rx="3"/><path d="M13 16V9a6 6 0 0 1 12 0v7M19 23v4"/>' };
  return `<svg viewBox="0 0 38 38" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.lock}</svg>`;
}
function render(options = {}) {
  const scroll = options.scroll !== false;
  const y = window.scrollY;
  $('#main').innerHTML = view === 'landing' ? landingHTML() : view === 'story' ? storyHTML() : view === 'setup' ? setupHTML() : gameHTML();
  if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); $('#main').focus({ preventScroll: true }); }
  else window.scrollTo({ top: y, behavior: 'instant' });
  if (options.focus) document.getElementById(options.focus)?.focus({ preventScroll: true });
  document.title = view === 'game' ? `${state.finished ? 'Caso resuelto' : 'Investigación'} · El caso Dorothy Evans` : 'El caso Dorothy Evans · Archivo de detectives';
}
function landingHTML() {
  const resume = state.identity ? `<div class="save-banner"><span>Expediente de <strong>${escapeHTML(state.identity.name)}</strong><br><span class="small">${state.finished ? 'Caso resuelto' : `${state.clues.filter(Boolean).length} de 4 evidencias reunidas`}</span></span>${actionButton('resume', state.finished ? 'Ver resolución' : 'Retomar', 'secondary')}</div>` : '';
  return `<section class="landing"><img class="hero-image" src="assets/mansion.webp" alt="La mansión Evans bajo la lluvia nocturna de Elmsworth" fetchpriority="high"><div class="hero-copy"><span class="badge">EXPEDIENTE 001 · ABIERTO</span><p class="eyebrow">UN MISTERIO. SEIS SOSPECHOSOS. TU INVESTIGACIÓN.</p><h1>El caso<em>Dorothy Evans</em></h1><p class="lede">Una mansión en silencio. Una nota inquietante. Cuatro evidencias que pueden cambiarlo todo.<br>El próximo movimiento está en tus manos.</p>${resume}<div class="button-row">${actionButton(state.identity ? 'new-confirm' : 'start-story', state.identity ? 'Nueva investigación <span aria-hidden="true">↗</span>' : 'Abrir el expediente <span aria-hidden="true">↗</span>')}${actionButton('help', 'Cómo se juega', 'quiet')}</div><div class="hero-meta"><span><b>06</b> sospechosos</span><span><b>04</b> evidencias</span><span><b>01</b> caso por resolver</span></div></div><div class="hero-corner">Ciudad de Elmsworth<span>El pasado deja huellas.</span></div></section><section class="overview" aria-label="La experiencia"><div><p class="eyebrow">EL OFICIO DE INVESTIGAR</p><h2>No basta con sospechar.</h2></div><div class="overview-item"><span>01</span><h3>Resuelve los desafíos</h3><p>Abre los informes y aprende sobre gamificación mientras investigas.</p></div><div class="overview-item"><span>02</span><h3>Conecta las evidencias</h3><p>Compara atributos, registra hipótesis y descarta con criterio.</p></div><div class="overview-item"><span>03</span><h3>Reconstruye el caso</h3><p>Descifra la carta y presenta una acusación fundamentada.</p></div></section>`;
}
function storyHTML() {
  const s = CASE_DATA.story[scene];
  return `<section class="story-screen enter" aria-label="Prólogo del caso"><img class="story-image" src="assets/${s.image}.webp" alt="${escapeHTML(s.title)}"><div class="story-top"><span class="scene-counter">ARCHIVO 001 / ESCENA ${scene + 1} DE 4</span>${actionButton('skip-story', 'Omitir prólogo →', 'quiet')}</div><div class="story-caption"><p class="eyebrow">${s.eyebrow}</p><h1>${s.title}</h1>${s.quote ? `<blockquote>«${s.quote}»</blockquote>` : ''}<p>${s.text}</p></div><div class="story-controls"><div class="scene-dots" aria-label="Escena ${scene + 1} de 4">${CASE_DATA.story.map((_, i) => `<span class="${i === scene ? 'active' : ''}"></span>`).join('')}</div><div class="button-row">${actionButton('previous-story', scene === 0 ? 'Portada' : '← Anterior', 'secondary')}${actionButton('next-story', scene === 3 ? 'Tomar el caso →' : 'Continuar →')}</div></div></section>`;
}
function setupHTML() {
  return `<section class="setup-screen"><div class="setup-heading"><p class="eyebrow">ANTES DE CRUZAR LA PUERTA</p><h1>Todo expediente necesita un detective.</h1><p>Investiga por tu cuenta o comparte la partida con tu pareja o equipo.</p></div><div class="setup-layout"><div class="setup-art"><img src="assets/expediente.webp" alt="Mesa de investigación con un expediente abierto"><div class="setup-art-caption"><p class="eyebrow">TU MISIÓN</p><h2>Observa. Conecta.<br>Demuestra.</h2><p>El expediente registra tus pistas y tus hipótesis. La solución se construye paso a paso.</p></div></div><form id="identity-form" class="paper"><p class="eyebrow dark">CREDENCIAL DE INVESTIGACIÓN</p><h2>¿Cómo vas a investigar?</h2><div class="mode-options"><label class="mode-option"><input type="radio" name="mode" value="solo" ${mode === 'solo' ? 'checked' : ''}>Individual</label><label class="mode-option"><input type="radio" name="mode" value="team" ${mode === 'team' ? 'checked' : ''}>Pareja o equipo</label></div><div class="field"><label id="identity-label" for="identity-name">${mode === 'team' ? 'Nombre de la pareja o equipo' : 'Tu alias de detective'}</label><input id="identity-name" name="name" maxlength="50" autocomplete="off" required placeholder="${mode === 'team' ? 'Ej.: Los rastreadores' : 'Ej.: Detective Espinoza'}"></div><div class="field" id="members-field" ${mode === 'solo' ? 'hidden' : ''}><label for="identity-members">Integrantes</label><input id="identity-members" name="members" maxlength="150" autocomplete="off" placeholder="Alias de quienes investigan"><small>Compartan una misma partida y conversen antes de responder.</small></div><p class="form-message" id="identity-message" role="status"></p><div class="button-row"><button class="primary" type="submit">Comenzar la investigación →</button>${actionButton('back-story', 'Volver', 'quiet')}</div><p class="privacy-note">El avance se guarda en este navegador. Puedes descargar una copia del expediente para retomarlo en otro dispositivo.</p></form></div></section>`;
}
function gameHTML() {
  const unlocked = maxChapter();
  const count = state.clues.filter(Boolean).length;
  const remaining = CASE_DATA.suspects.filter(s => !state.discarded[s.id]).length;
  const chapters = [...CASE_DATA.missions.map(m => m.short), 'El informante', 'La carta cifrada', 'La acusación'];
  const content = tab === 'suspects' ? suspectsHTML() : tab === 'notes' ? notesHTML() : state.chapter === 7 && state.finished ? victoryHTML() : state.chapter < 4 ? missionHTML(state.chapter) : state.chapter === 4 ? informantHTML() : state.chapter === 5 ? cipherHTML() : accusationHTML();
  return `<div class="game-shell"><aside class="case-sidebar" aria-label="Navegación del expediente"><p class="eyebrow">ARCHIVO CENTRAL · 001</p><h2>El caso Evans</h2><div class="identity-card"><strong>${escapeHTML(state.identity.name)}</strong><span>${state.identity.mode === 'team' ? 'PAREJA O EQUIPO' : 'DETECTIVE INDEPENDIENTE'}</span>${state.identity.members ? `<span>${escapeHTML(state.identity.members)}</span>` : ''}</div><div class="mobile-summary"><strong>${escapeHTML(state.identity.name)}</strong><span>${count}/4 evidencias</span></div><div class="progress-line" role="progressbar" aria-label="Evidencias reunidas" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="4"><span style="width:${count * 25}%"></span></div><div class="progress-label"><span>Evidencias reunidas</span><span>${count} / 4</span></div><nav class="chapter-nav" aria-label="Etapas del caso">${chapters.map((name, i) => `<button class="chapter-button ${i === state.chapter && tab === 'investigation' ? 'current' : ''} ${i < unlocked ? 'done' : ''}" data-action="chapter" data-index="${i}" ${i > unlocked ? 'disabled' : ''} ${i === state.chapter && tab === 'investigation' ? 'aria-current="step"' : ''}><span class="number">${i < unlocked ? '✓' : i + 1}</span><span>${name}</span></button>`).join('')}</nav><nav class="sidebar-tabs" aria-label="Herramientas de investigación"><button data-action="tab" data-tab="investigation" class="${tab === 'investigation' ? 'active' : ''}" ${tab === 'investigation' ? 'aria-current="page"' : ''}>Investigación <span class="count">↗</span></button><button data-action="tab" data-tab="suspects" class="${tab === 'suspects' ? 'active' : ''}" ${tab === 'suspects' ? 'aria-current="page"' : ''}>Sospechosos <span class="count">${remaining}</span></button><button data-action="tab" data-tab="notes" class="${tab === 'notes' ? 'active' : ''}" ${tab === 'notes' ? 'aria-current="page"' : ''}>Cuaderno <span class="count">${count}</span></button></nav><div class="sidebar-bottom"><button data-action="backup">Guardar copia</button><button data-action="import">Cargar copia</button><button data-action="new-confirm">Nuevo caso</button></div></aside><section class="workspace"><div class="workspace-top"><span>ELMSWORTH / EXPEDIENTE 001</span><span class="badge">${state.finished ? 'CASO RESUELTO' : 'INVESTIGACIÓN EN CURSO'}</span></div>${content}<div class="mobile-tabbar button-row" style="margin-top:25px">${actionButton('backup', 'Guardar copia', 'quiet')}${actionButton('import', 'Cargar copia', 'quiet')}${actionButton('new-confirm', 'Nuevo caso', 'quiet')}</div></section></div>`;
}
function clueHTML(index) {
  const m = CASE_DATA.missions[index];
  return `<article class="evidence-card"><span class="eyebrow">EVIDENCIA ${index + 1} · ${m.source}</span><div class="evidence-icon" style="margin-top:13px">${evidenceIcon(m.icon)}</div><h3>${m.clueTitle}</h3><p>${m.clue}</p><div class="evidence-footer">Añadida al cuaderno de investigación</div></article>`;
}
function missionHTML(index) {
  const m = CASE_DATA.missions[index]; const solved = state.clues[index];
  return `<p class="eyebrow">CAPÍTULO ${index + 1} / INVESTIGACIÓN</p><h1>${m.title}</h1><p class="workspace-lede">${m.intro}</p><div class="investigation-grid"><div><article class="paper question-paper"><p class="eyebrow dark">DOCUMENTO DE FORMACIÓN · ${m.concept}</p><h2>${m.question}</h2><div class="answers" role="group" aria-label="Alternativas de respuesta">${m.options.map((a, i) => `<button class="answer-option ${state.selected[index] === i ? 'selected' : ''}" id="answer-${i}" data-action="answer" data-index="${i}" aria-pressed="${state.selected[index] === i}" ${solved ? 'disabled' : ''}><span class="answer-letter" aria-hidden="true">${'ABCD'[i]}</span><span>${escapeHTML(a)}</span></button>`).join('')}</div>${!solved ? `<form id="lock-form" class="lock-card"><h3>El candado del informe</h3><p>Convierte la letra de tu respuesta en un número y abre el documento.</p><div class="code-map" aria-label="A equivale a 10; B a 20; C a 30; D a 40">${['A = 10', 'B = 20', 'C = 30', 'D = 40'].map(v => `<span>${v}</span>`).join('')}</div><label class="small" for="lock-code">Código numérico</label><div class="code-entry"><input id="lock-code" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="— —" autocomplete="off" value="${escapeHTML(state.codes[index])}" aria-label="Código numérico del candado"><button class="primary" type="submit">Abrir informe</button></div><div class="hint-row"><button data-action="hint" type="button">Solicitar una orientación</button><span>${state.hints[index] ? `${state.hints[index]} orientación(es)` : 'Puedes volver a intentarlo'}</span></div></form>` : `<div class="feedback success"><strong>✓ Informe abierto.</strong> La evidencia ya está disponible.</div>`}${feedbackHTML()}</article>${solved ? `<div class="concept-card"><strong>Lo que acabas de aplicar</strong>${m.success}</div>` : ''}</div><aside aria-label="Informe del caso"><div class="dossier-art"><img src="assets/${index === 3 ? 'nota' : 'estudio'}.webp" alt="El expediente de la mansión Evans"><div class="dossier-art-caption"><span>INFORME ${String(index + 1).padStart(2, '0')}</span><strong>${solved ? 'Evidencia disponible' : 'Documento sellado'}</strong></div></div>${solved ? clueHTML(index) : `<div class="evidence-card locked"><div class="evidence-icon">${evidenceIcon('lock')}</div><h3>Una nueva pieza del caso.</h3><p>El informe permanece sellado. Resuelve el desafío y abre el candado para conocer la evidencia.</p></div>`}</aside></div><div class="continue-row">${actionButton('tab', 'Consultar sospechosos', 'secondary', 'data-tab="suspects"')}${solved ? actionButton('advance', index === 3 ? 'Seguir al informante →' : 'Continuar la investigación →') : '<span class="muted">El siguiente capítulo se abre con esta evidencia.</span>'}</div>`;
}
function unlockedTagsHTML() {
  return state.clues.some(Boolean) ? `<div class="evidence-strip">${CASE_DATA.missions.map((m, i) => state.clues[i] ? `<span class="evidence-tag"><span>${i + 1}</span>${m.clueTitle}</span>` : '').join('')}</div>` : '<p class="workspace-lede">Aún no hay evidencias. Abre el primer informe antes de sacar conclusiones.</p>';
}
function suspectsHTML() {
  return `<p class="eyebrow">FICHERO DE PERSONAS BAJO SOSPECHA</p><h1>Seis historias. Una verdad.</h1><p class="workspace-lede">Contrasta las características con las evidencias. Puedes descartar y recuperar sospechosos; cada decisión sigue siendo tuya.</p>${unlockedTagsHTML()}<div class="suspect-grid">${CASE_DATA.suspects.map((s, i) => `<article class="suspect-card ${state.discarded[s.id] ? 'discarded' : ''}" style="--sus-color:${s.color}">${state.discarded[s.id] ? '<span class="discard-stamp">DESCARTADO</span>' : ''}<div class="suspect-visual"><div class="portrait" style="--px:${-s.x / 92 * 100}%;--py:${-s.y / 173 * 100}%"><img src="assets/sospechosos.webp" alt="Retrato de ${s.name}" loading="lazy"></div><div class="suspect-name"><p class="eyebrow">FICHA ${String(i + 1).padStart(2, '0')}</p><h2>${s.name}</h2><p>${state.discarded[s.id] ? 'Hipótesis descartada' : 'Bajo investigación'}</p></div></div><div class="suspect-details"><dl><dt>Ropa</dt><dd>${s.fabric}</dd><dt>Estatura</dt><dd>${s.height.toFixed(2).replace('.', ',')} m</dd><dt>Sexo</dt><dd>${s.gender}</dd><dt>Pelo</dt><dd>${s.hair}</dd><dt>Fuma</dt><dd>${s.smoker ? 'Sí' : 'No'}</dd></dl><button class="discard-button" data-action="discard" data-id="${s.id}" aria-pressed="${Boolean(state.discarded[s.id])}">${state.discarded[s.id] ? 'Recuperar sospecha' : 'Descartar sospechoso'}</button>${state.discarded[s.id] ? `<label class="small" for="reason-${s.id}" style="display:block;margin-top:8px;font-size:9px;color:var(--muted)">¿Qué evidencia lo descarta?</label><textarea id="reason-${s.id}" class="reason-input" data-reason="${s.id}" maxlength="400" placeholder="Anota tu razonamiento…">${escapeHTML(state.reasons[s.id])}</textarea>` : ''}</div></article>`).join('')}</div><div class="continue-row">${actionButton('original-sheet', 'Ver tabla original', 'quiet')}${actionButton('tab', 'Volver a la investigación →', 'primary', 'data-tab="investigation"')}</div>`;
}
function notesHTML() {
  const count = state.clues.filter(Boolean).length;
  return `<p class="eyebrow">CUADERNO PERSONAL DEL CASO</p><h1>Las hipótesis también dejan huella.</h1><p class="workspace-lede">Tus evidencias y anotaciones permanecen disponibles durante toda la investigación.</p><div class="notebook-grid"><div class="notebook-evidence">${count ? CASE_DATA.missions.map((_, i) => state.clues[i] ? clueHTML(i) : '').join('') : '<div class="empty-state">Tu primera evidencia llegará al abrir el informe inicial.</div>'}${state.cipherSolved ? '<div class="success-callout"><p class="eyebrow">CARTA DESCIFRADA</p><p>«En el comedor con una lámpara».</p></div>' : ''}</div><article class="paper notebook-paper"><p class="eyebrow dark">OBSERVACIONES DEL DETECTIVE</p><h2>Tu libreta de hipótesis</h2><div class="field"><label for="case-notes">¿Qué conexiones estás encontrando?</label><textarea id="case-notes" maxlength="8000" placeholder="Compara atributos, registra contradicciones y construye tu teoría…">${escapeHTML(state.notes)}</textarea></div><p class="note-save" id="notes-status" role="status">Las notas se guardan mientras escribes.</p><div class="button-row">${actionButton('backup', 'Guardar copia', 'secondary')}</div></article></div>${CASE_DATA.suspects.some(s => state.discarded[s.id]) ? `<div class="note-reasons"><h2>Registro de descartes</h2><ul>${CASE_DATA.suspects.filter(s => state.discarded[s.id]).map(s => `<li><b>${s.name}:</b> ${escapeHTML(state.reasons[s.id] || 'Sin justificación escrita todavía.')}</li>`).join('')}</ul></div>` : ''}<div class="continue-row">${actionButton('tab', 'Volver a la investigación →', 'primary', 'data-tab="investigation"')}</div>`;
}
function informantHTML() {
  return `<p class="eyebrow">CAPÍTULO 05 / EL ÚLTIMO TESTIMONIO</p><h1>Todavía faltan dos piezas.</h1><p class="workspace-lede">Las cuatro evidencias permiten identificar a la persona responsable. Para cerrar el expediente necesitamos también el lugar y el arma.</p><div class="informant-banner"><img src="assets/informante.webp" alt="Un informante anónimo habla por teléfono"><div class="informant-dialogue"><p class="eyebrow">UNA LLAMADA INESPERADA</p><h2>«Les he dejado una carta».</h2><p>Un informante asegura tener la información que falta. Ha ocultado su mensaje en el pasillo del archivo y nos entrega un acertijo para encontrarlo.</p></div></div><div class="riddle-layout"><article class="paper riddle-paper"><p class="eyebrow dark">EL ESCONDITE</p><h2>Descubre dónde buscar.</h2><blockquote>«${CASE_DATA.riddle}»</blockquote>${!state.locationSolved ? `<form id="riddle-form"><div class="field"><label for="riddle-answer">¿En qué tipo de lugar se guarda la carta?</label><input id="riddle-answer" name="place" maxlength="80" autocomplete="off" placeholder="Escribe el escondite…"></div><button class="primary" type="submit">Comprobar el escondite →</button></form><div class="hint-row"><button data-action="riddle-hint" type="button">Necesito una orientación</button></div>` : '<div class="feedback success">✓ El escondite es un casillero. Explora las puertas del archivo para recuperar la carta.</div>'}${feedbackHTML()}</article><div><div class="cabinet-scene" aria-label="Seis casilleros para explorar"><img src="assets/casilleros.webp" alt="Casilleros de madera junto a la biblioteca del archivo">${Array.from({ length: 6 }, (_, i) => `<button class="cabinet-door ${state.opened.includes(i) ? 'opened' : ''}" style="--col:${i % 3};--row:${Math.floor(i / 3)}" data-action="cabinet" data-index="${i}" aria-label="Explorar casillero ${i + 1}" ${!state.locationSolved || state.letterFound ? 'disabled' : ''}><span>${state.opened.includes(i) ? '✓' : i + 1}</span></button>`).join('')}</div><p class="cabinet-message" role="status">${state.letterFound ? 'La carta ya está en tu expediente.' : escapeHTML(cabinetMessage || (state.locationSolved ? 'El informante eligió una de estas seis puertas. Explora el archivo.' : 'Resuelve el acertijo para comenzar la búsqueda.'))}</p>${state.letterFound ? '<div class="letter-discovered"><p class="eyebrow dark">MENSAJE RECUPERADO</p><h3>Una carta. Un código.</h3><p>El informante ha utilizado un alfabeto de símbolos. La siguiente etapa te permitirá descifrar el lugar y el arma.</p></div>' : ''}</div></div><div class="continue-row">${actionButton('tab', 'Revisar mis evidencias', 'secondary', 'data-tab="notes"')}${state.letterFound ? actionButton('advance', 'Descifrar la carta →') : ''}</div>`;
}
const cipherShapes = [
  { letters: 'AB', path: 'M5 31H31V5' }, { letters: 'CD', path: 'M5 5V31H31V5' }, { letters: 'EF', path: 'M5 5V31H31' },
  { letters: 'GH', path: 'M5 5H31V31H5' }, { letters: 'IJ', path: 'M5 5H31V31H5Z' }, { letters: 'KL', path: 'M31 5H5V31H31' },
  { letters: 'MN', path: 'M5 5H31V31' }, { letters: 'ÑO', path: 'M5 31V5H31V31' }, { letters: 'PQ', path: 'M5 31V5H31' },
  { letters: 'RS', path: 'M5 5L18 31L31 5' }, { letters: 'TU', path: 'M5 5L31 18L5 31' }, { letters: 'VZ', path: 'M31 5L5 18L31 31' },
  { letters: 'XY', path: 'M5 31L18 5L31 31' }, { letters: 'W', path: 'M5 31H31', singleDot: true }
];
function cipherSVG(letter, label) {
  const shape = cipherShapes.find(s => s.letters.includes(letter.toUpperCase()));
  if (!shape) return '';
  const dot = shape.singleDot || shape.letters.indexOf(letter.toUpperCase()) === 1;
  return `<svg class="cipher-symbol" viewBox="0 0 36 36" role="img" aria-label="${escapeHTML(label)}"><path d="${shape.path}" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="square"/>${dot ? '<circle cx="18" cy="18" r="2.1" fill="currentColor"/>' : ''}</svg>`;
}
function cipherHTML() {
  let n = 0;
  const encoded = CASE_DATA.secretMessage.split(' ').map(word => `<span class="cipher-word">${Array.from(word).map(letter => cipherSVG(letter, `Símbolo ${++n}`)).join('')}</span>`).join('');
  const alphabet = Array.from('ABCDEFGHIJKLMNÑOPQRSTUVWXYZ');
  return `<p class="eyebrow">CAPÍTULO 06 / LA CARTA CIFRADA</p><h1>Lee lo que otros no pueden ver.</h1><p class="workspace-lede">Cada símbolo representa una letra. Usa la clave del informante para reconstruir el mensaje completo.</p><div class="cipher-layout"><article class="paper cipher-letter"><p class="eyebrow dark">CORRESPONDENCIA CONFIDENCIAL</p><h2>El mensaje del informante</h2><p class="small muted">La carta contiene el lugar del crimen y el instrumento utilizado.</p><div class="cipher-message" aria-label="Mensaje cifrado del informante">${encoded}</div>${state.cipherSolved ? '<div class="feedback success"><strong>Mensaje descifrado:</strong><br>«En el comedor con una lámpara».</div>' : `<form id="cipher-form"><div class="field"><label for="cipher-answer">Escribe el mensaje completo</label><input id="cipher-answer" name="message" maxlength="120" autocomplete="off" placeholder="Reconstruye aquí las palabras…"><small>Se aceptan mayúsculas, minúsculas y palabras con o sin tilde.</small></div><button class="primary" type="submit">Comprobar el mensaje →</button></form><div class="hint-row"><button data-action="cipher-hint" type="button">Solicitar una orientación</button><span>${state.cipherHints ? `${state.cipherHints} orientación(es)` : 'Observa los puntos dentro de los símbolos'}</span></div>`}${feedbackHTML()}</article><aside class="alphabet-panel"><p class="eyebrow">LA CLAVE DE LOS SÍMBOLOS</p><h2>Alfabeto del informante</h2><p>La forma y la presencia de un punto cambian la letra. Compara ambos detalles.</p><div class="cipher-alphabet">${alphabet.map(letter => `<div class="alphabet-cell">${cipherSVG(letter, `Símbolo correspondiente a ${letter}`)}<span>${letter}</span></div>`).join('')}</div></aside></div><div class="continue-row">${actionButton('tab', 'Consultar el cuaderno', 'secondary', 'data-tab="notes"')}${state.cipherSolved ? actionButton('advance', 'Presentar la acusación →') : ''}</div>`;
}
function accusationHTML() {
  if (!state.cipherSolved) return '<div class="empty-state">Completa la carta cifrada para presentar tu acusación.</div>';
  const options = (items, value) => items.map(([id, label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join('');
  return `<p class="eyebrow">CAPÍTULO 07 / EL VEREDICTO</p><h1>Una acusación necesita evidencias.</h1><p class="workspace-lede">La investigación está completa. Revisa tus conclusiones y reconstruye el caso antes de entregar el expediente.</p><div class="accusation-layout"><form id="accusation-form" class="paper accusation-paper"><p class="eyebrow dark">ACTA DE RESOLUCIÓN</p><h2>Presenta tu hipótesis final.</h2><div class="field"><label for="accuse-suspect">¿Quién es la persona responsable?</label><select id="accuse-suspect" name="suspect" required><option value="">Selecciona una persona</option>${options(CASE_DATA.suspects.map(s => [s.id, s.name]), state.deduction.suspect)}</select></div><div class="select-row"><div class="field"><label for="accuse-room">¿Dónde ocurrió?</label><select id="accuse-room" name="room" required><option value="">Selecciona el lugar</option>${options([['estudio', 'Estudio'], ['biblioteca', 'Biblioteca'], ['comedor', 'Comedor'], ['salon', 'Salón']], state.deduction.room)}</select></div><div class="field"><label for="accuse-weapon">¿Qué arma se utilizó?</label><select id="accuse-weapon" name="weapon" required><option value="">Selecciona el arma</option>${options([['candelabro', 'Candelabro'], ['lampara', 'Lámpara'], ['cuerda', 'Cuerda'], ['baston', 'Bastón']], state.deduction.weapon)}</select></div></div><div class="field"><label for="accuse-reason">¿Cómo llegaste a esta conclusión?</label><textarea id="accuse-reason" name="reason" minlength="20" maxlength="2000" required placeholder="Relaciona al menos dos evidencias con las características de la persona y explica qué reveló la carta…">${escapeHTML(state.deduction.reason)}</textarea><small>La explicación se conserva en tu informe; su calidad se conversa al cerrar la actividad.</small></div><button class="primary" type="submit">Entregar el expediente →</button>${feedbackHTML()}</form><aside class="final-requirements"><p class="eyebrow">ANTES DE FIRMAR</p><h2>Revisa el expediente.</h2><ul><li>¿La persona coincide con <strong>las cuatro evidencias</strong>?</li><li>¿El lugar aparece en <strong>la carta descifrada</strong>?</li><li>¿El arma coincide con <strong>el mensaje del informante</strong>?</li><li>¿Puedes explicar <strong>por qué descartaste a las demás personas</strong>?</li></ul><div class="button-row">${actionButton('tab', 'Ver sospechosos', 'secondary', 'data-tab="suspects"')}${actionButton('tab', 'Abrir cuaderno', 'quiet', 'data-tab="notes"')}</div></aside></div>`;
}
function victoryHTML() {
  const attempts = state.attempts.reduce((a, b) => a + b, 0) + state.cipherAttempts + state.finalAttempts;
  const hints = state.hints.reduce((a, b) => a + b, 0) + state.cipherHints;
  return `<section class="victory-screen"><div class="victory-hero"><div class="victory-seal" aria-hidden="true"><span>✓</span></div><p class="eyebrow">EXPEDIENTE 001 · RESOLUCIÓN CONFIRMADA</p><h1>Caso resuelto.</h1><p>${escapeHTML(state.identity.name)}, conectaste las evidencias y reconstruiste lo ocurrido. El expediente de Dorothy Evans puede cerrarse.</p></div><article class="paper case-verdict"><p class="eyebrow dark">LA RECONSTRUCCIÓN</p><h2>Las piezas encajan.</h2><div class="verdict-grid"><div><small>PERSONA RESPONSABLE</small><strong>Sr. Green</strong></div><div><small>LUGAR DEL CRIMEN</small><strong>Comedor</strong></div><div><small>ARMA UTILIZADA</small><strong>Lámpara</strong></div></div><ol class="deduction-chain"><li>El pelo blanco descarta al Sr. Violeta y a la Sra. Red.</li><li>Las cenizas señalan a una persona fumadora: la Sra. White queda descartada.</li><li>La estatura superior a 1,70 m descarta al Sr. Golden. Quedan el Sr. Green y la Sra. Blue.</li><li>La prenda de seda corresponde al Sr. Green, mientras la Sra. Blue viste lino.</li><li>La carta indica: «En el comedor con una lámpara».</li></ol><div class="line"></div><p class="small"><strong>Tu justificación:</strong><br>${escapeHTML(state.deduction.reason)}</p></article><div class="stats-grid"><div><b>4 / 4</b><span>Evidencias reunidas</span></div><div><b>${attempts}</b><span>Comprobaciones realizadas</span></div><div><b>${hints}</b><span>Orientaciones consultadas</span></div></div><article class="debrief"><p class="eyebrow">DEL MISTERIO AL DISEÑO EDUCATIVO</p><h2>Ahora investiguemos la experiencia.</h2><ol><li>¿Cómo influyó la narrativa en tu disposición a participar?</li><li>¿Qué reglas, desafíos y formas de retroalimentación guiaron tus decisiones?</li><li>¿Qué cambiarías para que esta actividad aportara más al aprendizaje de tu grupo?</li></ol><label for="reflection" class="small">Reflexión personal o del equipo</label><textarea id="reflection" maxlength="4000" placeholder="Registra las ideas que quieras llevar a la conversación final…">${escapeHTML(state.reflection)}</textarea></article><div class="victory-actions">${actionButton('report', 'Descargar mi informe')}${actionButton('tab', 'Volver al cuaderno', 'secondary', 'data-tab="notes"')}${actionButton('new-confirm', 'Nueva investigación', 'quiet')}</div></section>`;
}
function setChapter(index) {
  if (!Number.isInteger(index) || index < 0 || index > maxChapter()) return;
  state.chapter = index; tab = 'investigation'; feedback = null; save(); render();
}
function openModal(title, html) {
  lastModalFocus = document.activeElement; $('#modal-title').textContent = title; $('#modal-content').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() { $('#modal').close(); lastModalFocus?.focus?.({ preventScroll: true }); }
function help() {
  openModal('Cómo investigar', `<p>Tu misión es descubrir <strong>quién</strong> asesinó a Dorothy Evans, <strong>dónde</strong> ocurrió y <strong>qué arma</strong> se utilizó.</p><ol><li><strong>Abre los cuatro informes.</strong> Elige una respuesta y convierte su letra en el código numérico. Puedes volver a intentarlo y solicitar orientaciones.</li><li><strong>Contrasta las pistas.</strong> Consulta el fichero de sospechosos y registra tus descartes. Puedes recuperar una sospecha en cualquier momento.</li><li><strong>Escucha al informante.</strong> Resuelve su acertijo, encuentra la carta y descifra el mensaje con el alfabeto.</li><li><strong>Presenta la acusación.</strong> Completa persona, lugar y arma, y escribe tu justificación.</li></ol><p>En pareja o equipo, compartan una misma partida y conversen antes de decidir. El avance se guarda en este navegador; «Guardar copia» permite trasladar el expediente.</p><p class="muted small">La búsqueda de la carta ocurre dentro de la experiencia. No necesitas salir a buscar un escondite físico.</p>`);
}
function confirmNew() {
  openModal('Abrir una nueva investigación', `<p>La nueva partida reemplazará el avance que está guardado en este navegador. Puedes conservarlo descargando una copia.</p><div class="dialog-actions">${actionButton('backup', 'Guardar copia', 'secondary')}${actionButton('reset-confirmed', 'Comenzar de nuevo')}${actionButton('close-modal', 'Cancelar', 'quiet')}</div>`);
}
function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function backup() { if (!state.identity) return toast('Primero crea tu credencial de investigación.'); downloadFile('expediente-evans.json', JSON.stringify(state, null, 2), 'application/json'); toast('Copia del expediente descargada.'); }
function report() {
  if (!state.finished) return;
  const lines = [`EL CASO DOROTHY EVANS · INFORME DE INVESTIGACIÓN`, `Detective / equipo: ${state.identity.name}`, state.identity.members ? `Integrantes: ${state.identity.members}` : '', '', 'RESOLUCIÓN', 'Persona responsable: Sr. Green', 'Lugar: comedor', 'Arma: lámpara', '', 'JUSTIFICACIÓN', state.deduction.reason, '', 'EVIDENCIAS', ...CASE_DATA.missions.map((m, i) => `${i + 1}. ${m.clue}`), '', 'NOTAS DEL EXPEDIENTE', state.notes || 'Sin notas adicionales.', '', 'DESCARTES REGISTRADOS', ...CASE_DATA.suspects.filter(s => state.discarded[s.id]).map(s => `${s.name}: ${state.reasons[s.id] || 'Sin justificación escrita.'}`), '', 'REFLEXIÓN SOBRE LA EXPERIENCIA', state.reflection || 'Pendiente de conversación.', '', 'Esta actividad es formativa. La justificación y la reflexión se revisan durante el cierre.'];
  downloadFile('informe-caso-evans.txt', lines.filter(v => v !== null).join('\n'), 'text/plain;charset=utf-8');
}
function playChime() {
  if (!soundOn || !audioContext) return;
  try { [523, 659, 784].forEach((frequency, i) => { const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'sine'; gain.gain.setValueAtTime(0, audioContext.currentTime + i * .12); gain.gain.linearRampToValueAtTime(.045, audioContext.currentTime + i * .12 + .02); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + i * .12 + .5); oscillator.connect(gain).connect(audioContext.destination); oscillator.start(audioContext.currentTime + i * .12); oscillator.stop(audioContext.currentTime + i * .12 + .55); }); } catch (_) { /* The visual feedback remains available. */ }
}
async function toggleSound() {
  try {
    if (soundOn) { ambientGain.gain.setTargetAtTime(0, audioContext.currentTime, .05); soundOn = false; }
    else {
      if (!audioContext) { const AudioClass = window.AudioContext || window.webkitAudioContext; if (!AudioClass) throw new Error(); audioContext = new AudioClass(); const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate); const channel = buffer.getChannelData(0); for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * .45; ambientSource = audioContext.createBufferSource(); ambientSource.buffer = buffer; ambientSource.loop = true; const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1000; ambientGain = audioContext.createGain(); ambientGain.gain.value = 0; ambientSource.connect(filter).connect(ambientGain).connect(audioContext.destination); ambientSource.start(); }
      await audioContext.resume(); ambientGain.gain.setTargetAtTime(.055, audioContext.currentTime, .15); soundOn = true;
    }
    $('#sound-button').setAttribute('aria-pressed', String(soundOn)); $('#sound-label').textContent = `Sonido: ${soundOn ? 'sí' : 'no'}`; $('#sound-button').title = soundOn ? 'Apagar el sonido ambiental' : 'Activar el sonido ambiental';
  } catch (_) { toast('El sonido no está disponible en este navegador. Puedes continuar investigando.'); }
}
function updateFullscreen() { const active = Boolean(document.fullscreenElement || document.body.classList.contains('theater')); $('#fullscreen-label').textContent = active ? 'Restaurar' : 'Ampliar'; $('#fullscreen-button').setAttribute('aria-pressed', String(active)); $('#fullscreen-button').title = active ? 'Restaurar la vista' : 'Ampliar la vista'; }
async function toggleFullscreen() {
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (_) {} updateFullscreen(); return; }
  if (document.body.classList.contains('theater')) { document.body.classList.remove('theater'); updateFullscreen(); return; }
  try { if (!document.documentElement.requestFullscreen || !document.fullscreenEnabled) throw new Error('Use expanded view'); await document.documentElement.requestFullscreen(); }
  catch (_) { document.body.classList.add('theater'); toast('Vista ampliada. Usa «Restaurar» para volver.'); }
  updateFullscreen();
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'start-story') { scene = 0; view = 'story'; render(); }
  else if (action === 'next-story') { if (scene < 3) scene++; else view = 'setup'; render(); }
  else if (action === 'previous-story') { if (scene > 0) scene--; else view = 'landing'; render(); }
  else if (action === 'skip-story') { view = 'setup'; render(); }
  else if (action === 'back-story') { view = 'story'; scene = 3; render(); }
  else if (action === 'resume') { view = 'game'; tab = 'investigation'; state.chapter = state.finished ? 7 : state.chapter; feedback = null; render(); }
  else if (action === 'help') help();
  else if (action === 'tab') { tab = button.dataset.tab; feedback = null; render(); }
  else if (action === 'chapter') setChapter(Number(button.dataset.index));
  else if (action === 'advance') setChapter(Math.min(state.chapter + 1, maxChapter()));
  else if (action === 'answer') { const i = Number(button.dataset.index); if (state.chapter < 4 && !state.clues[state.chapter]) { state.selected[state.chapter] = i; feedback = null; save(); render({ scroll: false, focus: `answer-${i}` }); } }
  else if (action === 'hint' && state.chapter < 4) { const i = state.chapter; state.hints[i] = Math.min(2, state.hints[i] + 1); feedback = { kind: 'hint', text: CASE_DATA.missions[i].hints[state.hints[i] - 1] }; save(); render({ scroll: false }); }
  else if (action === 'discard') { const id = button.dataset.id; if (!CASE_DATA.suspects.some(s => s.id === id)) return; state.discarded[id] = !state.discarded[id]; save(); render({ scroll: false, focus: state.discarded[id] ? `reason-${id}` : null }); }
  else if (action === 'original-sheet') openModal('Tabla original de sospechosos', '<img class="original-sheet" src="assets/sospechosos.webp" alt="Tabla de los seis sospechosos originales; los mismos atributos están disponibles en las fichas de la investigación.">');
  else if (action === 'riddle-hint') { feedback = { kind: 'hint', text: 'Piensa en un pequeño compartimento del pasillo donde se guardan libros, mochilas u objetos personales.' }; render({ scroll: false }); }
  else if (action === 'cabinet' && state.locationSolved && !state.letterFound) { const i = Number(button.dataset.index); if (!Number.isInteger(i) || i < 0 || i > 5) return; if (!state.opened.includes(i)) state.opened.push(i); const letterDoor = (state.identity.name.length + 3) % 6; if (i === letterDoor) { state.letterFound = true; cabinetMessage = 'La carta del informante está aquí.'; playChime(); toast('Carta recuperada. El siguiente capítulo ya está disponible.'); } else cabinetMessage = 'Solo hay libros y objetos del archivo. La carta debe estar en otro casillero.'; save(); render({ scroll: false }); }
  else if (action === 'cipher-hint') { state.cipherHints = Math.min(2, state.cipherHints + 1); feedback = { kind: 'hint', text: state.cipherHints === 1 ? 'El mensaje primero indica un lugar y después el objeto utilizado. Presta atención al punto de cada símbolo.' : 'Las dos primeras palabras forman «EN EL». Continúa comparando cada símbolo con el alfabeto.' }; save(); render({ scroll: false }); }
  else if (action === 'backup') backup();
  else if (action === 'import') $('#backup-input').click();
  else if (action === 'report') report();
  else if (action === 'new-confirm') confirmNew();
  else if (action === 'reset-confirmed') { state = freshState(); mode = 'solo'; feedback = null; cabinetMessage = ''; save(); closeModal(); scene = 0; view = 'story'; render(); }
  else if (action === 'close-modal') closeModal();
});
document.addEventListener('input', event => {
  const e = event.target;
  if (e.id === 'lock-code' && state.chapter < 4) { state.codes[state.chapter] = e.value; save(); }
  if (e.id === 'case-notes') { state.notes = e.value; save(); $('#notes-status').textContent = 'Anotaciones guardadas en este navegador.'; }
  if (e.dataset.reason && CASE_DATA.suspects.some(s => s.id === e.dataset.reason)) { state.reasons[e.dataset.reason] = e.value; save(); }
  if (e.id === 'reflection') { state.reflection = e.value; save(); }
  if (e.closest('#accusation-form')) { const key = e.name; if (Object.hasOwn(state.deduction, key)) { state.deduction[key] = e.value; save(); } }
});
document.addEventListener('change', event => {
  if (event.target.name === 'mode') { mode = event.target.value === 'team' ? 'team' : 'solo'; $('#members-field').hidden = mode !== 'team'; $('#identity-label').textContent = mode === 'team' ? 'Nombre de la pareja o equipo' : 'Tu alias de detective'; $('#identity-name').placeholder = mode === 'team' ? 'Ej.: Los rastreadores' : 'Ej.: Detective Espinoza'; }
});
document.addEventListener('submit', event => {
  const form = event.target; if (!['identity-form', 'lock-form', 'riddle-form', 'cipher-form', 'accusation-form'].includes(form.id)) return;
  event.preventDefault(); const data = new FormData(form);
  if (form.id === 'identity-form') { const name = String(data.get('name') || '').trim(); const members = String(data.get('members') || '').trim(); if (!name) { $('#identity-message').textContent = 'Escribe un alias o nombre para abrir tu expediente.'; return; } state.identity = { mode, name: name.slice(0, 50), members: mode === 'team' ? members.slice(0, 150) : '' }; view = 'game'; tab = 'investigation'; state.chapter = 0; save(); render(); }
  if (form.id === 'lock-form') { const i = state.chapter; if (i > 3 || state.clues[i]) return; const selected = state.selected[i]; const code = String(data.get('code') || ''); state.codes[i] = code; if (selected === null) { feedback = { text: 'Selecciona una alternativa antes de convertirla en un código.' }; render({ scroll: false }); return; } state.attempts[i]++; if (checkLock(i, selected, code)) { state.clues[i] = true; feedback = null; playChime(); toast('Informe abierto. Nueva evidencia añadida a tu cuaderno.'); } else feedback = { text: selected !== CASE_DATA.missions[i].correct ? `${CASE_DATA.missions[i].explanations[selected]} Revisa las opciones y vuelve a intentarlo.` : 'Tu respuesta va por buen camino. Revisa la tabla de conversión de letras a números y vuelve a comprobar el código.' }; save(); render({ scroll: false, focus: state.clues[i] ? null : 'lock-code' }); }
  if (form.id === 'riddle-form') { const answer = normalizeAnswer(data.get('place')); if (/\b(casillero|casilleros|taquilla|taquillas|locker|lockers)\b/.test(answer)) { state.locationSolved = true; feedback = null; playChime(); toast('Escondite identificado. Ya puedes explorar los casilleros.'); } else feedback = { text: 'Piensa en un espacio del pasillo para guardar libros y objetos personales. Puedes volver a intentarlo.' }; save(); render({ scroll: false, focus: state.locationSolved ? null : 'riddle-answer' }); }
  if (form.id === 'cipher-form') { if (!state.letterFound) return; state.cipherAttempts++; if (normalizeAnswer(data.get('message')) === CASE_DATA.secretMessage) { state.cipherSolved = true; feedback = null; playChime(); toast('Mensaje descifrado. Ya puedes presentar la acusación.'); } else feedback = { text: 'El mensaje aún no coincide. Comprueba cada símbolo, sus puntos y los espacios entre palabras.' }; save(); render({ scroll: false, focus: state.cipherSolved ? null : 'cipher-answer' }); }
  if (form.id === 'accusation-form') { if (!state.cipherSolved) return; ['suspect', 'room', 'weapon', 'reason'].forEach(k => state.deduction[k] = String(data.get(k) || '').trim()); if (state.deduction.reason.length < 20) { feedback = { text: 'Añade una justificación de al menos 20 caracteres que conecte tus evidencias.' }; render({ scroll: false }); return; } state.finalAttempts++; const d = state.deduction; if (d.suspect === CASE_DATA.solution.suspect && normalizeAnswer(d.room) === CASE_DATA.solution.room && normalizeAnswer(d.weapon) === CASE_DATA.solution.weapon) { state.finished = true; state.chapter = 7; feedback = null; playChime(); } else feedback = { text: d.suspect !== CASE_DATA.solution.suspect ? 'La persona elegida no coincide con todas las evidencias. Contrasta pelo, hábito de fumar, estatura y ropa antes de acusar de nuevo.' : 'La persona coincide con las evidencias. Revisa el lugar y el arma que aparecen en la carta del informante.' }; save(); render(); }
});
$('#home-button').addEventListener('click', () => { view = 'landing'; feedback = null; render(); });
$('#help-button').addEventListener('click', help);
$('#sound-button').addEventListener('click', toggleSound);
$('#fullscreen-button').addEventListener('click', toggleFullscreen);
$('#close-modal').addEventListener('click', closeModal);
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const box = $('#modal').getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeModal(); } });
$('#modal').addEventListener('close', () => lastModalFocus?.focus?.({ preventScroll: true }));
$('#backup-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 1000000) throw new Error('El expediente es demasiado grande.'); const incoming = sanitizeState(JSON.parse(await file.text())); if (!incoming.identity) throw new Error('La copia no contiene una credencial válida.'); openModal('Retomar un expediente', `<p>Se cargará el expediente de <strong>${escapeHTML(incoming.identity.name)}</strong> con ${incoming.clues.filter(Boolean).length} evidencias. Reemplazará el avance guardado en este navegador.</p><div class="dialog-actions">${actionButton('backup', 'Guardar mi avance actual', 'secondary')}<button id="confirm-import" class="primary">Cargar este expediente</button>${actionButton('close-modal', 'Cancelar', 'quiet')}</div>`); $('#confirm-import').addEventListener('click', () => { state = incoming; feedback = null; view = 'game'; tab = 'investigation'; save(); closeModal(); render(); toast('Expediente recuperado.'); }); }
  catch (error) { toast(`No se pudo cargar la copia. ${error.message}`); }
  event.target.value = '';
});
document.addEventListener('fullscreenchange', updateFullscreen);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('theater')) { document.body.classList.remove('theater'); updateFullscreen(); } });
document.addEventListener('visibilitychange', () => { if (audioContext && ambientGain && soundOn) ambientGain.gain.setTargetAtTime(document.hidden ? 0 : .055, audioContext.currentTime, .1); });
window.addEventListener('beforeunload', save);
render();
if (storageNotice) toast('No se pudo recuperar el guardado anterior. Puedes abrir un nuevo expediente o cargar una copia.');
