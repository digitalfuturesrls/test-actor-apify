/**
 * Apify Actor entry point for immobiliare.it scraping.
 * 
 * Reads `citta` (city) and `quartiere` (neighborhood) from input and extracts
 * all listing URLs using a step-by-step Playwright approach with manual pagination.
 * Results are pushed to the Apify Dataset.
 * 
 * Proxy support is enabled via Actor.createProxyConfiguration().
 * Screenshots are saved to logs/{citta}/screenshots/ on errors.
 */

import { Actor } from 'apify';
import { chromium } from 'playwright';
import { scrapeImmobiliare } from './immobiliare-scraper.js';

// Initialize the Apify SDK
await Actor.init();

interface Input {
  citta: string;
  quartiere: string;
}

// Read input
const input = await Actor.getInput<Input>();
if (!input) {
  throw new Error('No input provided. Expected { citta: string, quartiere: string }');
}

const { citta, quartiere } = input;

// Validate required fields
if (!citta || typeof citta !== 'string' || citta.trim().length === 0) {
  throw new Error('Input must contain a non-empty "citta" string (city name, lowercase, no accents).');
}
if (!quartiere || typeof quartiere !== 'string' || quartiere.trim().length === 0) {
  throw new Error('Input must contain a non-empty "quartiere" string (neighborhood name).');
}

// Normalize: remove accents and convert to lowercase
const normalize = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const cittaNorm = normalize(citta.trim());
const quartiereNorm = normalize(quartiere.trim());

console.log(`[main] Starting scraping for ${cittaNorm}/${quartiereNorm}`);

// Ensure log directory exists
import { mkdirSync } from 'node:fs';
const logDir = `logs/${cittaNorm}`;
mkdirSync(logDir, { recursive: true });
console.log(`[main] Log directory: ${logDir}`);

// Proxy configuration
const proxyConfig = await Actor.createProxyConfiguration({
  // Disable access check for faster startup (assume valid config)
  checkAccess: false,
});

let proxyUrl: string | undefined;
if (proxyConfig) {
  try {
    proxyUrl = await proxyConfig.newUrl();
    console.log(`[main] Using proxy: ${proxyUrl}`);
  } catch {
    console.warn('[main] Could not get proxy URL, proceeding without proxy');
  }
}

// Launch browser with proxy support
const launchOptions: Parameters<typeof chromium.launch>[0] = {
  headless: true,
  args: [
    '--disable-gpu',                    // Mitigates GPU crashes in Docker
    '--disable-blink-features=Automation', // Avoid bot detection
  ],
};

if (proxyUrl) {
  launchOptions.proxy = { server: proxyUrl };
}

console.log('[main] Launching Chromium browser...');
const browser = await chromium.launch(launchOptions);

// Shared data dictionary (populated by scraper)
const data: Record<string, Record<string, string[]>> = {};

try {
  // Call the step-by-step scraper
  await scrapeImmobiliare({ browser, citta: cittaNorm, quartiere: quartiereNorm, data });

  // Collect results from the shared dictionary
  const links = data[cittaNorm]?.[quartiereNorm] ?? [];

  // Push final results to dataset
  await Actor.pushData({
    zona: cittaNorm,
    quartiere: quartiereNorm,
    links,
    count: links.length,
    scrapedAt: new Date().toISOString(),
  });

  console.log(`[main] Completed. Pushed ${links.length} URLs to dataset.`);
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`[main] Scraper failed: ${errorMessage}`);

  // Fail the actor with error details
  await Actor.fail({ statusMessage: errorMessage });
} finally {
  // Always close the browser cleanly
  await browser.close();
  console.log('[main] Browser closed.');
}

// Exit successfully
await Actor.exit();