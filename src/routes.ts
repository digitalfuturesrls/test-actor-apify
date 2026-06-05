import { createPlaywrightRouter } from '@crawlee/playwright';
import { humanizeMouseMove, humanizeScroll } from './stealth.js';

export const router = createPlaywrightRouter();

/**
 * Shared logic for processing a listing page.
 * Used by both the warmup default handler (after direct goto) and the 'list' handler.
 */
async function handleListPage(page: any, log: any, pushData: any, loadedUrl: string) {
    // Human-like initial delay (simulates reading the page)
    await page.waitForTimeout(1500 + Math.random() * 2000);

    // Human-like scroll with Bézier curve motion
    const viewportSize = page.viewportSize() ?? { width: 1920, height: 1080 };
    await humanizeMouseMove(
        page,
        { x: viewportSize.width / 2, y: viewportSize.height - 100 },
        { x: viewportSize.width / 2, y: 100 },
        20
    );
    await humanizeScroll(page, 800, 1800);

    const title = await page.title();


    log.info('Avviata analisi lista');
    log.info(`${title}`, { url: loadedUrl });

    const body = await page.textContent('body');
    log.info(body ?? 'Body vuoto');

    // =========================
    // 🔎 ESTRAZIONE HREF
    // =========================
    const hrefs = await page
        .locator('xpath=//a[@href]')
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
}

router.addDefaultHandler(async ({ request, page, log, pushData }) => {
    if (request.userData?.role === 'warmup') {
        const targetUrl = request.userData.targetUrl as string;
        log.info(`Warmup request detected, performing human-like interactions on: ${request.url}`);

        // Simulate human-like behavior on warmup page
        await page.waitForTimeout(2000 + Math.random() * 2000);

        // Human-like scroll simulation with variable speed
        await humanizeScroll(page, 900, 2500);
        await page.waitForTimeout(300 + Math.random() * 200);

        // Human-like mouse movement simulation
        await humanizeMouseMove(page, { x: 100, y: 200 }, { x: 400, y: 500 }, 25);

        // Navigazione diretta al target URL e processazione della lista
        log.info(`Navigating directly to target URL: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle' });
        await handleListPage(page, log, pushData, targetUrl);

        log.info('Warmup + list processing complete');
        return;
    }

    log.info('enqueueing new URLs');
    /*await enqueueLinks({
        globs: ['https://apify.com/*'],
        label: 'detail',
    });*/
});

router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });

    await pushData({
        url: request.loadedUrl,
        title,
    });
});


router.addHandler('list', async ({ request, page, log, pushData }) => {
    await handleListPage(page, log, pushData, request.loadedUrl!);
});
