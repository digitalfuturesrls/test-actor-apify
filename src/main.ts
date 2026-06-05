/**
 * This template is a production ready boilerplate for developing with `PlaywrightCrawler`.
 * Use this to bootstrap your projects using the most up-to-date code.
 * If you're looking for examples or want to learn more, see README.
 */

// For more information, see https://crawlee.dev
import { PlaywrightCrawler } from '@crawlee/playwright';
// For more information, see https://docs.apify.com/sdk/js
import { Actor, log } from 'apify';
import path from 'path';
import fs from 'fs';

// Stealth module with fingerprint rotation and anti-detection
import {
    createStealthLaunchOptions,
    createNavigationHooks,
    getRandomProfile,
    randomizeFingerprint,
} from './stealth.js';


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

// Detect patchright Chromium binary path
function getPatchrightExecutable(): string | undefined {
    const candidates = [
        path.resolve(process.cwd(), 'node_modules', 'patchright', 'chromium'),
        path.resolve(__dirname, '..', 'node_modules', 'patchright', 'chromium'),
    ];

    for (const candidate of candidates) {
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            log.info(`Using patchright browser at: ${candidate}`);
            return candidate;
        } catch {
            // Binary not found at this path, try next
        }
    }

    log.warning('Patchright browser binary not found; falling back to default Playwright Chromium');
    return undefined;
}

const patchrightExecutable = getPatchrightExecutable();

// Generate session-specific fingerprint profile
const fingerprint = getRandomProfile();
const stealthLaunchOptions = createStealthLaunchOptions({ forceProfile: fingerprint });

const crawler = new PlaywrightCrawler({

    proxyConfiguration,
    maxRequestsPerCrawl,

    async requestHandler(context) {
        // Apply fingerprint randomization for this session
        await randomizeFingerprint(context.page, fingerprint);

        await router(context);
    },

    useSessionPool: true,
    persistCookiesPerSession: true,
    launchContext: {
        useChrome: true,
        launchOptions: {
            ...stealthLaunchOptions,
            executablePath: patchrightExecutable,
        },
    },
    preNavigationHooks: createNavigationHooks(),
    postNavigationHooks: [
        async ({ page }) => {
            // Verify webdriver is hidden after navigation
            const isHidden = await page.evaluate(() => {
                return Object.getOwnPropertyDescriptor(navigator, 'webdriver')?.get?.() === undefined;
            });
            if (!isHidden) {
                log.warning('navigator.webdriver may not be properly hidden');
            }
        },
    ],
});

await crawler.run([startRequest]);

// Exit successfully
await Actor.exit();
