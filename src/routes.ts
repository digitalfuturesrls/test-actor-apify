import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

router.addDefaultHandler(async ({ request, page, enqueueLinks, log }) => {
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

        // Enqueue the target URL with label 'list' (no goto — crawler will navigate to it via list handler)
        log.info(`Enqueuing target URL with label 'list': ${targetUrl}`);
        await enqueueLinks({
            urls: [targetUrl],
            label: 'list',
        });

        log.info('Warmup complete, target URL enqueued with label \'list\'');
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


    // piccola attesa iniziale (simula lettura pagina)
    await page.waitForTimeout(2000 + Math.random() * 2000);

    // scroll leggero (simula utente che esplora)
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(1500 + Math.random() * 1500);

    const title = await page.title();
    log.info("Avviata analisi lista");
    log.info(`${title}`, { url: request.loadedUrl });

    //console.log(await page.textContent('body'));
    await pushData({
        url: request.loadedUrl,
        title,
    });

    await page.waitForTimeout(1000 + Math.random() * 2000);
});
