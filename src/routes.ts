import { createPlaywrightRouter } from '@crawlee/playwright';
import type { Page } from 'playwright';

export const router = createPlaywrightRouter();

// ─── DataDome helpers ───────────────────────────────────────────────

/**
 * Detects if the current page is a DataDome challenge (captcha-delivery.com).
 * Returns true if the page URL or body contains DataDome indicators.
 */
async function isDataDomeChallenge(page: Page): Promise<boolean> {
    const url = page.url();
    if (url.includes('captcha-delivery.com') || url.includes('datadome')) {
        return true;
    }
    // Check for DataDome script injection in page body
    try {
        const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) ?? '');
        if (bodyText.includes('var dd=') || bodyText.includes('captcha-delivery.com')) {
            return true;
        }
    } catch {
        // Page might not be ready yet
    }
    return false;
}

/**
 * Waits for DataDome challenge to resolve.
 * Strategy:
 *  - If headful mode: wait for the CAPTCHA iframe and let the user solve it (for debugging)
 *  - In any case: poll for the datadome cookie or URL change
 *
 * @returns true if the challenge was resolved (cookie set / navigated away), false if still blocked
 */
async function waitForDataDomeResolution(page: Page, log: { info: (msg: string) => void; warning: (msg: string) => void }, timeoutMs = 90_000): Promise<boolean> {
    const start = Date.now();

    log.info('🔒 DataDome challenge detected — waiting for resolution...');

    while (Date.now() - start < timeoutMs) {
        // Check if we navigated away from captcha-delivery
        const currentUrl = page.url();
        if (!currentUrl.includes('captcha-delivery.com')) {
            // Check if we got a datadome cookie
            const cookies = await page.context().cookies();
            const ddCookie = cookies.find(c => c.name === 'datadome');
            if (ddCookie) {
                log.info(`✅ DataDome passed! Cookie datadome = ${ddCookie.value.slice(0, 20)}...`);
                return true;
            }
            // Might have navigated to the real page
            if (currentUrl.includes('immobiliare.it')) {
                log.info('✅ DataDome resolved — back on immobiliare.it');
                return true;
            }
        }

        // If there's a CAPTCHA iframe, log it (user may need to solve in headful mode)
        const captchaFrame = page.frameLocator('iframe[src*="captcha-delivery"], iframe[title*="captcha"], iframe[title*="DataDome"]');
        try {
            const captchaVisible = await captchaFrame.locator('body').first().isVisible({ timeout: 1000 });
            if (captchaVisible) {
                log.warning('🧩 DataDome CAPTCHA iframe is visible — waiting for manual solve or auto-pass...');
            }
        } catch {
            // No captcha iframe found — that's fine
        }

        // Poll every 2 seconds
        await page.waitForTimeout(2000);
    }

    log.warning('⏰ DataDome resolution timed out');
    return false;
}

/**
 * Simulates human-like scroll and mouse movements on a page.
 */
async function performHumanInteractions(page: any): Promise<void> {
    // Scroll down slowly in steps
    for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(500 + Math.random() * 500);
    }

    // Random mouse movements
    await page.mouse.move(100, 200);
    await page.waitForTimeout(200 + Math.random() * 300);
    await page.mouse.move(400, 500);
    await page.waitForTimeout(200 + Math.random() * 300);

    // Small wait to simulate reading
    await page.waitForTimeout(1500 + Math.random() * 1500);
}

/**
 * Attempts to accept cookie consent banners with various common selectors.
 */
async function acceptCookieConsent(page: any): Promise<boolean> {
    const cookieSelectors = [
        'button[aria-label="Accetta"]',
        'button[aria-label="Accept"]',
        'button[aria-label="Accetta tutti"]',
        'button[aria-label="Accept all"]',
        '#cookiescript_accept',
        '#onetrust-accept-btn-handler',
        '.cookie-consent button',
        '.cookie-banner button',
        '[id*="cookie"] button',
        'button[class*="cookie"]',
    ];

    for (const selector of cookieSelectors) {
        try {
            const count = await page.locator(selector).count();
            if (count > 0) {
                await page.locator(selector).first().click({ timeout: 3000 });
                await page.waitForTimeout(1000 + Math.random() * 2000);
                return true;
            }
        } catch {
            // Selector didn't match or click failed, try next
        }
    }
    return false;
}

/**
 * Navigates to intermediate pages of the target domain to simulate real browsing behavior.
 */
async function visitIntermediatePages(
    page: any,
    targetUrl: string,
    log: any
): Promise<void> {
    // Extract domain from target URL
    let targetOrigin = '';
    try {
        targetOrigin = new URL(targetUrl).origin;
    } catch {
        log.warning(`Could not parse target URL: ${targetUrl}`);
        return;
    }

    // Define intermediate pages - typically listing/search pages to simulate real browsing
    const intermediatePaths = [
        '/offerte/',
        '/vendita-case/',
        '/affitto-appartamenti/',
    ];

    // Pick one random intermediate path
    const randomPath = intermediatePaths[Math.floor(Math.random() * intermediatePaths.length)];
    const intermediateUrl = `${targetOrigin}${randomPath}`;

    try {
        log.info(`Navigating to intermediate page: ${intermediateUrl}`);
        await page.goto(intermediateUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await performHumanInteractions(page);
        log.info(`Intermediate page visited successfully`);
    } catch (err) {
        log.warning(`Intermediate page failed to load: ${intermediateUrl} - ${err}`);
        // Continue even if intermediate page fails
    }
}

router.addDefaultHandler(async ({ request, page, log, pushData }) => {
    if (request.userData?.role === 'warmup') {
        const targetUrl = request.userData.targetUrl as string;
        log.info(`Warmup request detected, performing human-like interactions on: ${request.url}`);

        // Load the warmup page
        await page.goto(request.url, { waitUntil: 'networkidle', timeout: 30000 });

        // ─── DataDome check #1: after warmup page load ───────────
        if (await isDataDomeChallenge(page)) {
            const resolved = await waitForDataDomeResolution(page, log);
            if (!resolved) {
                log.warning('❌ DataDome blocked on warmup page — aborting');
                return;
            }
            // Reload the page now that we have the datadome cookie
            await page.goto(request.url, { waitUntil: 'networkidle', timeout: 30000 });
        }

        // Wait a bit after page load (simulates reading/loading)
        await page.waitForTimeout(2000 + Math.random() * 2000);

        // Attempt to accept cookie consent if present
        const cookieAccepted = await acceptCookieConsent(page);
        if (cookieAccepted) {
            log.info('Cookie consent banner accepted');
        } else {
            log.info('No cookie consent banner found or could not be accepted');
        }

        // Perform human-like interactions on warmup page
        await performHumanInteractions(page);

        // Visit intermediate pages of the target domain
        await visitIntermediatePages(page, targetUrl, log);

        // ─── DataDome check #2: after intermediate page ──────────
        if (await isDataDomeChallenge(page)) {
            const resolved = await waitForDataDomeResolution(page, log);
            if (!resolved) {
                log.warning('❌ DataDome blocked on intermediate page — aborting');
                return;
            }
        }

        // Navigate directly to target URL (reuse warmup session — avoids anti-bot detection)
        log.info(`Navigating to target URL: ${targetUrl}`);
        try {
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        } catch (err) {
            log.warning(`Failed to navigate to target URL: ${targetUrl} - ${err}`);
            return;
        }

        // ─── DataDome check #3: after target page load ───────────
        if (await isDataDomeChallenge(page)) {
            const resolved = await waitForDataDomeResolution(page, log, 120_000);
            if (!resolved) {
                log.warning('❌ DataDome blocked on target page — aborting');
                return;
            }
            // Reload target after resolution
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        }

        log.info('Warmup complete, processing target page inline');

        // ========================================
        // INLINE LIST PROCESSING (same session, same page, no re-enqueue)
        // ========================================

        const loadedUrl = page.url();

        // piccola attesa iniziale (simula lettura pagina)
        await page.waitForTimeout(2000 + Math.random() * 2000);

        // scroll leggero (simula utente che esplora)
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(1500 + Math.random() * 1500);

        const title = await page.title();

        log.info('Avviata analisi lista');
        log.info(`${title}`, { url: loadedUrl });

        const body = await page.textContent('body');
        log.info(body ?? 'Body vuoto');

        // =========================
        // 🔎 ESTRAZIONE HREF
        // =========================
        const hrefs = await page
            .locator("xpath=//a[contains(@href, 'annunci')]")
            .evaluateAll((elements: any[]) =>
                elements
                    .map(el => el.getAttribute('href'))
                    .filter(Boolean)
            );

        // =========================
        // 🌐 NORMALIZZAZIONE URL
        // =========================
        const urls = hrefs.map((href: string) =>
            new URL(href, loadedUrl).toString()
        );

        log.info(`Trovati ${urls.length} annunci`);

        await pushData({
            url: loadedUrl,
            title,
            results: urls,
        });

        await page.waitForTimeout(1000 + Math.random() * 2000);
        return;
    }

    log.warning(`Unexpected default request: ${request.url}`);
});

router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });

    await pushData({
        url: request.loadedUrl,
        title,
    });
});


