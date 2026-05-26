import type { Browser, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Step-by-step Playwright scraper for immobiliare.it listings.
 * Accepts a pre-configured browser instance (proxy already applied in main.ts).
 * Collects all listing URLs and stores them in the shared data dictionary.
 */

/**
 * Check if the page contains a captcha indicator script.
 */
export async function checkCaptcha(page: Page): Promise<boolean> {
  try {
    const content = await page.content();
    return content.includes('ct.captcha-delivery.com');
  } catch {
    return false;
  }
}

/**
 * Take a full-page screenshot and save to the specified path.
 * Creates directories as needed.
 */
export async function takeScreenshot(page: Page, filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.screenshot({ path: filePath, fullPage: true, timeout: 60000, animations: "disabled" });
  } catch (err) {
    console.warn(`[screenshot] Failed to take screenshot: ${err}`);
  }
}

export async function scrapeImmobiliare({
  browser,
  citta,
  quartiere,
  data,
}: {
  browser: Browser;
  citta: string;
  quartiere: string;
  data: Record<string, Record<string, string[]>>;
}): Promise<void> {
  // Ensure screenshot directory exists
  const screenshotDir = path.join('logs', citta, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  // Build the entry URL
  const taskUrl = `https://www.immobiliare.it/vendita-case/${encodeURIComponent(citta)}/${encodeURIComponent(quartiere)}/?criterio=rilevanza&tipoProprieta=1&noAste=1`;

  // Create a new page (browser already has proxy)
  const page = await browser.newPage();

  try {
    // Navigate to the listing page
    await page.goto(taskUrl,  { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Initial wait to let content render
    await page.waitForTimeout(15000);

    // --- Captcha detection ---
    if (await checkCaptcha(page)) {
      const screenshotPath = path.join(screenshotDir, 'ip-block.png');
      await takeScreenshot(page, screenshotPath);
      throw new Error('Captcha detected – stopping to avoid IP block');
    }

    // --- Screenshot: page loaded successfully ---
    const loadedPath = path.join(screenshotDir, 'page-loaded.png');
    await takeScreenshot(page, loadedPath);
    console.log(`[${citta}/${quartiere}] Screenshot pagina caricata salvata: ${loadedPath}`);

    // --- Extract result count ---
    let totalExpected: number | undefined;
    try {
      const resultText = await page.evaluate(() => {
        const div = document.querySelector('div');
        if (!div) return '';
        // Find the div containing "risultat" text
        const candidates = Array.from(document.querySelectorAll('div'));
        for (const d of candidates) {
          if (d.textContent && /risultat/i.test(d.textContent)) {
            return d.textContent;
          }
        }
        return '';
      });

      const match = resultText.match(/(\d+)\s*risultat/i);
      if (match) {
        totalExpected = parseInt(match[1], 10);
        console.log(`[${citta}/${quartiere}] Risultati trovati: ${totalExpected}`);
      }
    } catch {
      // Result count extraction failed – try to refresh once
      console.log(`[${citta}/${quartiere}] Impossibile estrarre conteggio, refresh in corso...`);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(5000);

      // Try again
      const retryText = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('div'));
        for (const d of candidates) {
          if (d.textContent && /risultat/i.test(d.textContent)) {
            return d.textContent;
          }
        }
        return '';
      });
      const retryMatch = retryText.match(/(\d+)\s*risultat/i);
      if (retryMatch) {
        totalExpected = parseInt(retryMatch[1], 10);
        console.log(`[${citta}/${quartiere}] Risultati dopo refresh: ${totalExpected}`);
      } else {
        // Still no result count – take screenshot and continue
        const failPath = path.join(screenshotDir, 'no-data.png');
        await takeScreenshot(page, failPath);
        console.log(`[${citta}/${quartiere}] Impossibile trovare conteggio risultati. Screenshot salvato.`);
      }
    }

    // --- Cookie banner ---
    try {
      await page.click('.didomi-continue-without-agreeing', { timeout: 5000 });
      console.log(`[${citta}/${quartiere}] Banner cookie chiuso`);
    } catch {
      // Banner not present – continue silently
    }

    // --- Pagination loop ---
    const allLinks: string[] = [];
    let pageNum = 1;

    while (true) {
      console.log(`[${citta}/${quartiere}] Elaborazione pagina ${pageNum}`);

      // Random scroll
      const scrollY = pageNum === 1
        ? Math.floor(Math.random() * (9500 - 7500 + 1)) + 7500
        : Math.floor(Math.random() * (11500 - 9500 + 1)) + 9500;

      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(Math.floor(Math.random() * (1500 - 500 + 1)) + 500);

      // Extract listing links
      const links = await page.evaluate(() => {
        const cards = document.querySelectorAll('a[class*="Title"]');
        return Array.from(cards).map(card => (card as HTMLAnchorElement).href);
      });

      allLinks.push(...links);
      console.log(`[${citta}/${quartiere}] Link estratti da pagina ${pageNum}: ${links.length} (totale: ${allLinks.length})`);

      // Check for next page button
      const nextBtn = await page.$('div[data-cy="pagination-next"] a');
      if (!nextBtn) {
        console.log(`[${citta}/${quartiere}] Nessun pulsante 'avanti' trovato – fine paginazione`);
        break;
      }

      // Check if next button is disabled
      const isDisabled = await nextBtn.evaluate(el => {
        const parent = el.closest('div');
        return parent?.getAttribute('aria-disabled') === 'true' || parent?.classList.contains('disabled');
      });
      if (isDisabled) {
        console.log(`[${citta}/${quartiere}] Pulsante 'avanti' disabilitato – fine paginazione`);
        break;
      }

      // Scroll before clicking next
      const preScrollY = Math.floor(Math.random() * (7500 - 1500 + 1)) + 1500;
      await page.evaluate((y) => window.scrollTo(0, y), preScrollY);
      await page.waitForTimeout(800);

      // Click next
      await nextBtn.click();

      // Try to close popup if it appears
      try {
        await page.click('.nd-dialogFrame__close', { timeout: 2000 });
      } catch {
        // No popup – continue
      }

      // Wait for new content to load
      try {
        await page.waitForSelector('a[class*="Title"]', { timeout: 10000 });
      } catch {
        // New content didn't load within timeout – take screenshot and break
        const errorPath = path.join(screenshotDir, `pagination-error-${pageNum}.png`);
        await takeScreenshot(page, errorPath);
        console.log(`[${citta}/${quartiere}] Timeout caricamento pagina ${pageNum + 1}. Screenshot salvato.`);
        break;
      }

      pageNum++;
    }

    // --- Log warning if expected count doesn't match ---
    if (totalExpected && allLinks.length < totalExpected * 0.9) {
      console.warn(`[${citta}/${quartiere}] Attenzione: link raccolti (${allLinks.length}) < attesi (${totalExpected}). Controllare eventuali blocchi o pagine mancanti.`);
    }

    // --- Update shared dictionary ---
    if (!data[citta]) data[citta] = {};
    if (!data[citta][quartiere]) data[citta][quartiere] = [];
    data[citta][quartiere].push(...allLinks);

    console.log(`[${citta}/${quartiere}] Completato. Link totali memorizzati: ${allLinks.length}`);
  } finally {
    await page.close();
  }
}