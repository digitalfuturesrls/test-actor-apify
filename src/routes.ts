import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

router.addDefaultHandler(async ({ enqueueLinks, log }) => {
    log.info(`enqueueing new URLs`);
    await enqueueLinks({
        globs: ['https://apify.com/*'],
        label: 'detail',
    });
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

    console.log(await page.textContent('body'));

    await pushData({
        url: request.loadedUrl,
        title,
    });

    await page.waitForTimeout(1000 + Math.random() * 2000);
});
