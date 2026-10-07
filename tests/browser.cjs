const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
fs.mkdirSync('test-results', {recursive: true});
const pages = ['', 'duet/', 'petr/', 'natalia/', 'privacy/'];
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [320, 390, 768, 1440]) {
      for (const path of pages) {
        const page = await browser.newPage({viewport: {width, height: 900}});
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('response', (response) => {
          if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        await page.goto(base + path);
        assert.equal(await page.locator('h1').count(), 1);
        console.log(`Layout ${path || '/'} at ${width}`);
        assert(await page.locator('h1').isVisible());
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert(!overflow, `Horizontal overflow: ${path} at ${width}`);
        const broken = await page.locator('img').evaluateAll((images) => images.filter((img) => img.complete && !img.naturalWidth).map((img) => img.src));
        assert.deepEqual(broken, [], `Broken images: ${path}`);
        if (path !== 'privacy/') {
          await page.locator('#leadForm').scrollIntoViewIfNeeded();
          assert(await page.locator('#leadForm').isVisible());
          await page.locator('#galleryNext').scrollIntoViewIfNeeded();
          await page.locator('#galleryNext').click();
          await page.waitForFunction(() => document.querySelector('#galleryTrack').scrollLeft > 0);
          await page.locator('#reviewsNext').scrollIntoViewIfNeeded();
          await page.locator('#reviewsNext').click();
          await page.waitForFunction(() => document.querySelector('#reviewsTrack').scrollLeft > 0);
          if (width === 390) {
            // Decode video metadata; no external contact or message is sent.
            for (const video of await page.locator('video').all()) {
              await video.evaluate((element) => {element.preload = 'metadata'; element.load();});
              await page.waitForFunction((src) => [...document.querySelectorAll('video')].some((v) => v.querySelector('source').src === src && v.readyState >= 1 && v.videoWidth > 0), await video.locator('source').getAttribute('src').then((src) => new URL(src, page.url()).href));
            }
          }
        }
        assert.deepEqual(errors, [], `Runtime/network errors: ${path} at ${width}`);
        if (width === 390 && ['', 'petr/', 'natalia/'].includes(path)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({path: `test-results/${path ? path.replace('/', '') : 'duet'}-mobile.png`});
        }
        await page.close();
      }
    }
    for (const path of pages.slice(0, 4)) {
      const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
      const page = await context.newPage();
      await page.goto(base + path);
      assert(await page.locator('.section-title').first().isVisible(), `Hidden content without JS: ${path}`);
      assert.equal(await page.locator('.section-title').first().evaluate((e) => getComputedStyle(e).opacity), '1');
      assert(!(await page.locator('#leadForm').isVisible()), `Unsafe form without JS: ${path}`);
      assert(await page.locator('noscript p').isVisible());
      await context.close();
    }
    for (const path of pages.slice(0, 4)) {
      for (const recipient of ['petr', 'natalia']) {
        if (path === 'petr/' && recipient === 'natalia' || path === 'natalia/' && recipient === 'petr') continue;
        for (const channel of ['whatsapp', 'telegram', 'call']) {
          const page = await browser.newPage({reducedMotion: 'reduce'});
          const navigations = [];
          // Intercept all outgoing contact navigation, including tel:, in page scope.
          await page.addInitScript(() => {
            window.__contact = [];
            window.addEventListener('beforeunload', () => {});
          });
          await page.route('https://wa.me/**', (route) => {navigations.push(route.request().url()); return route.fulfill({body: '<p>Test navigation intercepted</p>'});});
          await page.route('https://t.me/**', (route) => {navigations.push(route.request().url()); return route.fulfill({body: '<p>Test navigation intercepted</p>'});});
          await page.goto(base + path);
          console.log(`Form ${path || '/'} ${recipient} ${channel}`);
          await page.locator('#name').fill('Тестовая заявка');
          await page.locator('#phone').fill('не телефон');
          await page.locator('#city').fill('Тестовая площадка');
          if (path === '' || path === 'duet/') await page.locator('#recipient').selectOption(recipient);
          await page.locator(`.channel-option:has(input[value="${channel}"]) span`).click();
          await page.locator('[type="submit"]').click();
          assert.equal(navigations.length, 0, 'Consent is required');
          await page.locator('[name="consent"]').check();
          await page.locator('[type="submit"]').click();
          assert.equal(navigations.length, 0);
          assert(!(await page.locator('#phone').evaluate((e) => e.checkValidity())));
          await page.locator('#phone').fill('+7 (999) 000-00-00');
          if (channel === 'call') {
            // Tel handlers are OS-dependent; inspect the attempted navigation locally.
            const requests = [];
            page.on('request', (r) => requests.push(r.url()));
            await page.locator('[type="submit"]').click();
            assert.equal(navigations.length, 0);
            assert(page.url().startsWith(base));
          } else {
            await page.locator('[type="submit"]').click();
            await page.waitForURL((url) => ['wa.me', 't.me'].includes(url.hostname));
            const url = new URL(navigations[0]);
            assert.equal(url.hostname, channel === 'telegram' ? 't.me' : 'wa.me');
            assert.equal(url.pathname.slice(1), channel === 'telegram' ? (recipient === 'petr' ? 'p_demidov' : 'demi_nata') : (recipient === 'petr' ? '79260676601' : '79055239530'));
            assert(url.searchParams.get('text').includes('Город или площадка: Тестовая площадка'));
          }
          await page.close();
        }
      }
    }
    console.log('OK: desktop/mobile layouts, carousels, video metadata, no-JS fallback and contact forms');
  } finally {
    await browser.close();
  }
})().catch((error) => {console.error(error); process.exitCode = 1;});
