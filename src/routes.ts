import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

/**
 * Shared logic for processing a listing page.
 * Used by both the warmup default handler (after direct goto) and the 'list' handler.
 */
async function handleListPage(page: any, log: any, pushData: any, loadedUrl: string) {
    // piccola attesa iniziale (simula lettura pagina)
    await page.waitForTimeout(2000 + Math.random() * 2000);

    // scroll leggero (simula utente che esplora)
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(1500 + Math.random() * 1500);

    const title = await page.title();


    log.info('Avviata analisi lista');
    log.info(`${title}`, { url: loadedUrl });


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

        // Scroll down slowly in steps
        for (let i = 0; i < 3; i++) {
            await page.mouse.wheel(0, 300);
            await page.waitForTimeout(500 + Math.random() * 500);
        }

        // Random mouse movements
        await page.mouse.move(100, 200);
        await page.waitForTimeout(200 + Math.random() * 300);
        await page.mouse.move(400, 500);

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
