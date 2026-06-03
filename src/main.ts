/**
 * This template is a production ready boilerplate for developing with `PlaywrightCrawler`.
 * Use this to bootstrap your projects using the most up-to-date code.
 * If you're looking for examples or want to learn more, see README.
 */

// For more information, see https://crawlee.dev
import { PlaywrightCrawler } from '@crawlee/playwright';
// For more information, see https://docs.apify.com/sdk/js
import { Actor, log } from 'apify';


// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
import { router } from './routes.js';

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

// Validate that exactly two URLs are provided: first for warmup, second as target
if (!startUrls || startUrls.length < 2) {
    log.error('startUrls must contain exactly two URLs: first for warmup, second as target');
    throw new Error('startUrls must contain exactly two URLs: first for warmup, second as target');
}

const warmupUrl = startUrls[0].url;
const targetUrl = startUrls[1].url;
log.info(`Warmup URL: ${warmupUrl}`);
log.info(`Target URL: ${targetUrl}`);

const startRequest = {
    url: warmupUrl,
    userData: {
        role: 'warmup',
        targetUrl,
    },
};

// `checkAccess` flag ensures the proxy credentials are valid, but the check can take a few hundred milliseconds.
// Disable it for short runs if you are sure your proxy configuration is correct
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    countryCode: 'IT',
    checkAccess: true
});

//console.log(await proxyConfiguration?.newUrl());

const crawler = new PlaywrightCrawler({

    proxyConfiguration,
    maxRequestsPerCrawl,
    maxRequestRetries: 3, // Retry on DataDome blocks — new session each retry
    requestHandlerTimeoutSecs: 180, // Extended timeout for DataDome challenge resolution

    preNavigationHooks: [
        async ({ page }) => {
            try {
                // Imposta timezone, locale e geolocation sul contesto del browser
                const context = page.context();
                await context.setExtraHTTPHeaders({
                    'Accept-Language': 'it-IT,it;q=0.9',
                });

                // Imposta geolocation per Roma
                await context.setGeolocation({
                    latitude: 41.9028,
                    longitude: 12.4964,
                });

                // Concedi permessi di geolocalizzazione
                await context.grantPermissions(['geolocation']);

                // Override fingerprint prima della navigazione
                await page.addInitScript(() => {
                    // Timezone Europe/Rome spoofing via getTimezoneOffset override
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (Date.prototype as any).getTimezoneOffset = () => -120;

                    // Override Intl.DateTimeFormat resolvedOptions for timezone
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const OrigDateTimeFormat = (Intl as any).DateTimeFormat;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (Intl as any).DateTimeFormat = function (...args: unknown[]) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const instance = new (OrigDateTimeFormat as any)(...(args as unknown[]));
                        const origResolved = instance.resolvedOptions.bind(instance);
                        instance.resolvedOptions = () => ({ ...origResolved(), timeZone: 'Europe/Rome' });
                        return instance;
                    };
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (Intl as any).DateTimeFormat.prototype = OrigDateTimeFormat.prototype;

                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['it-IT', 'it', 'en-US', 'en'],
                    });
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => {
                            // Proxy per simulare PluginArray con metodi item/namedItem/refresh
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const plugins = new Proxy([
                                {
                                    name: 'Chrome PDF Plugin',
                                    description: 'Portable Document Format',
                                    filename: 'internal-pdf-viewer',
                                },
                                {
                                    name: 'Chrome PDF Viewer',
                                    description: '',
                                    filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                                },
                                {
                                    name: 'Native Client',
                                    description: '',
                                    filename: 'internal-nacl-plugin',
                                },
                            ] as unknown as object, {
                                get(target, prop) {
                                    if (prop === 'item') return (index: number) => (target as Record<string, unknown>[])[index] ?? null;
                                    if (prop === 'namedItem') return (name: string) => (target as Array<{ name: string }>).find((p) => p.name === name) ?? null;
                                    if (prop === 'refresh') return () => { };
                                    return (target as Record<string, unknown>)[prop as string];
                                },
                            });
                            return plugins;
                        },
                        configurable: true,
                    });
                    Object.defineProperty(navigator, 'hardwareConcurrency', {
                        get: () => 4,
                        configurable: true,
                    });
                    // deviceMemory è disponibile solo in Chrome (64GB max)
                    Object.defineProperty(navigator, 'deviceMemory', {
                        get: () => 8,
                        configurable: true,
                    });
                    // Desktop: zero touch points
                    Object.defineProperty(navigator, 'maxTouchPoints', {
                        get: () => 0,
                        configurable: true,
                    });
                    // WebGL fingerprint: vendor e renderer realistici su canvas
                    const applyWebGLOverride = () => {
                        const canvas = document.createElement('canvas');
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as any as WebGLRenderingContext | null;
                        if (!gl) return;
                        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                        if (!debugInfo) return;
                        const origGetParameter = gl.getParameter.bind(gl);
                        gl.getParameter = (pname: number) => {
                            if (pname === debugInfo.UNMASKED_VENDOR_WEBGL) {
                                return 'Google Inc. (Intel)';
                            }
                            if (pname === debugInfo.UNMASKED_RENDERER_WEBGL) {
                                return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)';
                            }
                            return origGetParameter(pname);
                        };
                    };
                    applyWebGLOverride();
                    // window.chrome object simulato per evitare rilevamento
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (!(window as any).chrome) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (window as any).chrome = {
                            runtime: {},
                            loadTimes: () => ({}),
                            csi: () => ({}),
                        };
                    }
                });
            } catch (e) {
                log.warning('Init script failed', { error: e });
            }
        },
    ],

    async requestHandler(context) {
        const { page, request, ...rest } = context;

        await router(context);
    },

    useSessionPool: true,
    persistCookiesPerSession: true,
    launchContext: {
        // userAgent will be applied automatically - no need for useChrome
        useChrome: true,
        launchOptions: {
            viewport: { width: 1920, height: 1080 },
            headless: false,
            args: [
                '--disable-gpu', // Mitigates the "crashing GPU process" issue in Docker containers
                '--disable-dev-shm-usage', // Avoids /dev/shm memory issues in Linux containers (no effect on Windows)
                '--disable-blink-features=AutomationControlled', // Hides navigator.webdriver to avoid bot detection
                '--disable-features=site-per-process', // Helps avoid iframe-based bot detection
            ],
        },
    },
});

await crawler.run([startRequest]);

// Exit successfully
await Actor.exit();
