/**
 * This template is a production ready boilerplate for developing with `PlaywrightCrawler`.
 * Use this to bootstrap your projects using the most up-to-date code.
 * If you're looking for examples or want to learn more, see README.
 */

// For more information, see https://crawlee.dev
import { PlaywrightCrawler } from '@crawlee/playwright';
// For more information, see https://docs.apify.com/sdk/js
import { Actor } from 'apify';

// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
import { router } from './routes.js';
import { stealthScript } from './stealth.js';

interface Input {

    startUrls: {
        url: string;
        method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';
        headers?: Record<string, string>;
        userData: Record<string, unknown>;
    }[];

    maxRequestsPerCrawl: number;
}

// Initialize the Apify SDK
await Actor.init();

// Structure of input is defined in input_schema.json
const { startUrls = [{ url: 'https://www.google.com' }], maxRequestsPerCrawl = 100 } =
    (await Actor.getInput<Input>()) ?? ({} as Input);

// `checkAccess` flag ensures the proxy credentials are valid, but the check can take a few hundred milliseconds.
// Disable it for short runs if you are sure your proxy configuration is correct
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    countryCode: 'IT',
    checkAccess: true
});

console.log(await proxyConfiguration?.newUrl());

const crawler = new PlaywrightCrawler({

    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler(context) {
         const { page, request, ...rest } = context;


        await page.context().addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => ['it-IT', 'it'],
            });

            (window as any).chrome = { runtime: {} };
        });

        await page.goto(request.url, {
            waitUntil: 'domcontentloaded',
        });

        await router(context);
    },
    
    useSessionPool: true,
    persistCookiesPerSession: true,


    launchContext: {
        // userAgent will be applied automatically - no need for useChrome
        useChrome: true,
        launchOptions: {
            viewport: { width: 1280, height: 800 },
            headless: false,
            args: [
                '--disable-gpu', // Mitigates the "crashing GPU process" issue in Docker containers
                '--disable-notifications', // Blocca tutte le richieste di notifica push dei siti. Perché serve: I popup di notifica interferirebbero con lo scraper coprendo elementi cliccabili.
                '--disable-popup-blocking', // Permette l'apertura di popup. Perché serve: Alcuni siti aprono link in nuove finestre/popup. Bloccarli impedirebbe la navigazione.
                '--remote-debugging-port=0', // Abilita il debugging remoto su una porta casuale. Perché serve: Necessario per il funzionamento di undetected_chromedriver (il driver si collega al browser via protocollo DevTools). =0 evita conflitti di porta.
                '--disable-save-password-bubble', // Disabilita il prompt "salva password?". Perché serve: Quel banner si sovrapporrebbe agli elementi della pagina rompendo i selettori XPath.
                '--disable-translate', // Disabilita la barra di traduzione automatica. Perché serve: La barra di traduzione è un elemento DOM aggiuntivo che può interferire con i clic e i selettori.
                '--disable-infobars', // Nasconde il banner "Chrome is being controlled by automated test software". Perché serve: Quel banner è un chiaro segnale ai siti che il browser è automatizzato. Nasconderlo aiuta a passare inosservati.
                '--disable-logging', // Disabilita i log interni di Chrome. Perché serve: Riduce rumore su console e performance overhead.
                '--log-level=3', // Imposta il livello di log al minimo (solo errori fatali, 3 = FATAL). Perché serve: Lascia solo errori critici, riducendo output spazzatura.
                '--disable-dev-shm-usage', //Evita l'uso di /dev/shm per la memoria condivisa. Perché serve: Su Linux in ambienti containerizzati (Docker), /dev/shm è spesso troppo piccolo (64MB). Disabilitandolo Chrome usa la memoria normale, prevenendo crash. Su Windows non ha effetto ma è portato per compatibilità.
                '--disable-blink-features=AutomationControlled', //Disabilita la feature Blink AutomationControlled, che è ciò che fa sì che navigator.webdriver sia true. Perché serve: Questa è l'impostazione più importante per l'evasione. Normalmente Selenium imposta navigator.webdriver = true, e i siti usano questa proprietà per rilevare bot. Disabilitando la feature, navigator.webdriver diventa undefined o false, come in un browser normale.
            ],
        },
    },
});

await crawler.run(startUrls);
console.log(`Entrypoint  crawler :${JSON.stringify(startUrls)}`);

// Exit successfully
await Actor.exit();
