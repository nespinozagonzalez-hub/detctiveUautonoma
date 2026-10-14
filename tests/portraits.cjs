const { webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:8765/';
const output = process.env.TEST_OUTPUT || '/workspace/scratch/7af249ed7f53/tmp/qa';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    for (const width of [320, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(baseURL);
      await page.locator('[data-action="start-story"]').click();
      await page.locator('[data-action="skip-story"]').click();
      await page.locator('#identity-name').fill('Verificación Safari');
      await page.getByRole('button', { name: 'Comenzar la investigación' }).click();
      await page.locator('[data-action="tab"][data-tab="suspects"]').first().click();
      const cards = page.locator('.suspect-card');
      assert.equal(await cards.count(), 6);
      for (let i = 0; i < 6; i++) {
        const card = cards.nth(i);
        const portrait = card.locator('.portrait');
        const img = portrait.locator('img');
        assert.equal(await img.getAttribute('loading'), 'eager');
        await img.evaluate(image => image.complete && image.naturalWidth > 0 ? Promise.resolve() : new Promise((resolve, reject) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', () => reject(new Error('No se pudo cargar el retrato')), { once: true }); }));
        assert(await img.evaluate(image => image.complete && image.naturalWidth > 0));
        assert.equal(await card.locator('dd').count(), 5);
        const bytes = await portrait.screenshot({ path: path.join(output, `safari-${width}-retrato-${i + 1}.png`) });
        assert(bytes.length > 3000, `Retrato vacío o sin detalle: ${width}px / ${i + 1}`);
      }
      await page.getByRole('heading', { name: 'Seis historias. Una verdad.' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `safari-${width}-seis-sospechosos.png`), fullPage: true });
      await page.reload();
      await page.locator('[data-action="resume"]').click();
      await page.locator('[data-action="tab"][data-tab="suspects"]').first().click();
      const loaded = await page.locator('.portrait img').evaluateAll(images => images.every(image => image.loading === 'eager' && image.complete && image.naturalWidth > 0));
      assert(loaded, `Los seis retratos deben reaparecer al recargar (${width}px)`);
      assert.equal(errors.length, 0, errors.join('\n'));
      await context.close();
    }
    console.log('PASS: seis miniaturas con imagen visible y cinco atributos, en WebKit móvil de 320/390/430px, antes de abrir fichas y después de recargar.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
