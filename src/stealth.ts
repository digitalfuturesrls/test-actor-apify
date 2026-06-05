/**
 * Stealth module for Crawlee + Patchright actor.
 *
 * Provides fingerprint rotation utilities, pre-navigation hooks for
 * Crawlee's PlaywrightCrawler, and human simulation helpers (Bézier mouse
 * movement, variable-speed scroll). Designed to be framework-agnostic
 * (no direct dependency on `@crawlee/playwright`).
 */

import type { Page } from 'patchright-core';

// ============================================================================
// FINGERPRINT POOL
// ============================================================================

/** A single fingerprint profile describing a complete browser persona. */
export interface FingerprintProfile {
    viewport: { width: number; height: number };
    userAgent: string;
    timezone: string;
    locale: string;
    geolocation: { latitude: number; longitude: number; accuracy: number };
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number;
    vendor: string;
}

/**
 * Pool of pre-built fingerprint profiles that can be rotated.
 * Each profile impersonates a different browser / OS combination.
 */
/**
 * Pool of pre-built fingerprint profiles.
 *
 * **All profiles are Italian** — every locale, timezone, and geolocation is
 * anchored in Italy.  User agents still impersonate different OS / browser
 * combinations for diversity, but the fingerprint consistently identifies as
 * a user browsing from Italy (matching Italian residential proxies).
 */
export const FINGERPRINT_POOL: FingerprintProfile[] = [
    {
        // Rome — Windows / Chrome (desktop)
        viewport: { width: 1920, height: 1080 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        geolocation: { latitude: 41.9028, longitude: 12.4964, accuracy: 15 },
        platform: 'Win32',
        hardwareConcurrency: 8,
        deviceMemory: 8,
        vendor: 'Google Inc.',
    },
    {
        // Milan — macOS / Safari
        viewport: { width: 1440, height: 900 },
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        geolocation: { latitude: 45.4642, longitude: 9.19, accuracy: 20 },
        platform: 'MacIntel',
        hardwareConcurrency: 10,
        deviceMemory: 16,
        vendor: 'Apple Computer, Inc.',
    },
    {
        // Naples — Linux / Firefox
        viewport: { width: 1536, height: 864 },
        userAgent:
            'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        geolocation: { latitude: 40.8518, longitude: 14.2681, accuracy: 25 },
        platform: 'Linux x86_64',
        hardwareConcurrency: 6,
        deviceMemory: 4,
        vendor: '',
    },
    {
        // Turin — Windows / Edge
        viewport: { width: 1366, height: 768 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        geolocation: { latitude: 45.0703, longitude: 7.6869, accuracy: 30 },
        platform: 'Win32',
        hardwareConcurrency: 4,
        deviceMemory: 4,
        vendor: 'Google Inc.',
    },
    {
        // Palermo — macOS / Chrome
        viewport: { width: 1280, height: 720 },
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        timezone: 'Europe/Rome',
        locale: 'it-IT',
        geolocation: { latitude: 38.1157, longitude: 13.3615, accuracy: 20 },
        platform: 'MacIntel',
        hardwareConcurrency: 12,
        deviceMemory: 32,
        vendor: 'Google Inc.',
    },
];

// ============================================================================
// PROFILE SELECTION
// ============================================================================

/**
 * Returns a random fingerprint profile from the pool.
 */
export function getRandomProfile(): FingerprintProfile {
    return FINGERPRINT_POOL[Math.floor(Math.random() * FINGERPRINT_POOL.length)];
}

// ============================================================================
// LAUNCH OPTIONS
// ============================================================================

/**
 * Creates launch options for the patchright browser with randomized
 * fingerprint parameters. The returned object can be merged into Crawlee's
 * `launchContext.launchOptions`.
 *
 * @param options - Optional overrides.
 * @param options.forceProfile - Force a specific fingerprint profile instead of a random one.
 */
export function createStealthLaunchOptions(options?: {
    forceProfile?: FingerprintProfile;
}): Record<string, unknown> {
    const profile = options?.forceProfile ?? getRandomProfile();

    // Randomize viewport slightly (±20px) so every launch looks different
    const vpJitter = randomInt(-20, 20);
    const viewport = {
        width: profile.viewport.width + vpJitter,
        height: profile.viewport.height + vpJitter,
    };

    const args: string[] = [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-gpu',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-save-password-bubble',
        '--disable-translate',
        '--disable-dev-shm-usage',
        `--window-size=${viewport.width},${viewport.height}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--metrics-recording-only',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-default-apps',
        '--mute-audio',
        '--no-sandbox',
        '--disable-setuid-sandbox',
    ];

    return {
        viewport,
        headless: false,
        args,
    };
}

// ============================================================================
// NAVIGATION HOOKS
// ============================================================================

/**
 * Minimal crawling context consumed by navigation hooks.
 * Compatible with Crawlee's `CrawlingContext` — only the fields actually
 * used are declared.
 */
export interface NavigationHookContext {
    page: Page;
    request: { url: string; userData?: Record<string, unknown> };
}

/**
 * Returns an array of pre-navigation hooks that apply anti-fingerprinting
 * scripts and randomize browser properties before each page navigation.
 *
 * **Usage with Crawlee:**
 * ```ts
 * const crawler = new PlaywrightCrawler({
 *   preNavigationHooks: createNavigationHooks(),
 *   // ...
 * });
 * ```
 */
export function createNavigationHooks(): Array<(ctx: NavigationHookContext) => Promise<void>> {
    const profile = getRandomProfile();

    const hooks: Array<(ctx: NavigationHookContext) => Promise<void>> = [];

    // -----------------------------
    // Hook 1 — Canvas / WebGL / WebRTC / AudioContext spoofing
    // -----------------------------
    hooks.push(async ({ page }: NavigationHookContext) => {
        await page.addInitScript(() => {
            // ---- Canvas fingerprint noise ----
            const origGetContext = HTMLCanvasElement.prototype.getContext.bind(HTMLCanvasElement.prototype);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (HTMLCanvasElement.prototype as any).getContext = function (
                ...args: Parameters<HTMLCanvasElement['getContext']>
            ) {
                const context = origGetContext(...args) as CanvasRenderingContext2D | null;
                if (args[0] === '2d' && context) {
                    const origFillText = context.fillText.bind(context);
                    context.fillText = function (...textArgs: Parameters<CanvasRenderingContext2D['fillText']>) {
                        context.shadowBlur = Math.random() * 0.5;
                        return origFillText(...textArgs);
                    };
                }
                return context;
            };

            // ---- WebGL vendor / renderer spoof ----
            const getParameterProxy = (origFn: WebGLRenderingContext['getParameter']) => {
                return new Proxy(origFn, {
                    apply(
                        target: WebGLRenderingContext['getParameter'],
                        thisArg: WebGLRenderingContext,
                        args: [GLenum],
                    ) {
                        const param = args[0];
                        if (param === 37445) {
                            // UNMASKED_VENDOR_WEBGL
                            return 'Google Inc. (Intel)';
                        }
                        if (param === 37446) {
                            // UNMASKED_RENDERER_WEBGL
                            return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
                        }
                        return Reflect.apply(target, thisArg, [param]);
                    },
                });
            };

            try {
                // eslint-disable-next-line @typescript-eslint/unbound-method
                WebGLRenderingContext.prototype.getParameter = getParameterProxy(
                    WebGLRenderingContext.prototype.getParameter,
                );
            } catch {
                /* Silently ignore — may fail in non-WebGL environments */
            }

            // ---- AudioContext fingerprint noise ----
            const origCreateAnalyser = AudioContext.prototype.createAnalyser.bind(AudioContext.prototype);
            AudioContext.prototype.createAnalyser = function (this: AudioContext) {
                const analyser = origCreateAnalyser.call(this);
                const origGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (analyser as any).getFloatFrequencyData = function (array: any) {
                    origGetFloatFrequencyData(array);
                    for (let i = 0; i < array.length; i++) {
                        array[i] += (Math.random() - 0.5) * 1e-7;
                    }
                };
                return analyser;
            };

            // ---- WebRTC IP leak prevention ----
            /* eslint-disable no-eval, @typescript-eslint/no-eval */
            try {
                if (typeof RTCPeerConnection !== 'undefined') {
                    const OrigRTCPeerConnection = eval('RTCPeerConnection') as typeof RTCPeerConnection;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (self as unknown as Record<string, any>).RTCPeerConnection = function (...pcArgs: unknown[]) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const pc: any = new OrigRTCPeerConnection(...(pcArgs as []));
                        const origCreateOffer = pc.createOffer.bind(pc);
                        pc.createOffer = async function (options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
                            const offer = await origCreateOffer(options) as RTCSessionDescriptionInit;
                            if (offer?.sdp) {
                                offer.sdp = offer.sdp.replace(
                                    /(candidate:\d+ \d+ (?:udp|tcp) \d+ )[\d.]+( \d+ typ host)/g,
                                    '$10.0.0.1$2',
                                );
                            }
                            return offer;
                        };
                        return pc;
                    } as unknown as typeof RTCPeerConnection;
                }
            } catch {
                /* Non-critical — RTCPeerConnection not available */
            }
            /* eslint-enable no-eval, @typescript-eslint/no-eval */
        });
    });

    // -----------------------------
    // Hook 2 — navigator properties + viewport + HTTP headers
    // -----------------------------
    hooks.push(async ({ page }: NavigationHookContext) => {
        await page.addInitScript((fp: FingerprintProfile) => {
            const localeShort = fp.locale.split('-')[0];

            Object.defineProperties(navigator, {
                hardwareConcurrency: { get: () => fp.hardwareConcurrency },
                deviceMemory: { get: () => fp.deviceMemory },
                platform: { get: () => fp.platform },
                vendor: { get: () => fp.vendor },
                vendorSub: { get: () => '' },
                productSub: { get: () => '20030107' },
                webdriver: { get: () => undefined },
                languages: { get: () => [fp.locale, localeShort] },
                maxTouchPoints: { get: () => 0 },
            });

            Object.defineProperties(screen, {
                width: { get: () => fp.viewport.width },
                height: { get: () => fp.viewport.height + 80 },
                availWidth: { get: () => fp.viewport.width },
                availHeight: { get: () => fp.viewport.height },
                colorDepth: { get: () => 24 },
                pixelDepth: { get: () => 24 },
            });
        }, profile);

        await page.setViewportSize(profile.viewport);

        await page.setExtraHTTPHeaders({
            'Accept-Language': `${profile.locale},${profile.locale.split('-')[0]};q=0.9`,
        });
    });

    return hooks;
}

// ============================================================================
// FINGERPRINT APPLICATION
// ============================================================================

/**
 * Applies a single fingerprint profile (or a random one from the pool) to a
 * given page.  Safe to call before every navigation.
 *
 * @param page   - The Playwright / Patchright Page instance.
 * @param profile - Fingerprint profile to apply.  Random when omitted.
 */
export async function randomizeFingerprint(
    page: Page,
    profile?: FingerprintProfile,
): Promise<void> {
    const fp = profile ?? getRandomProfile();

    await page.setViewportSize(fp.viewport);

    await page.setExtraHTTPHeaders({
        'User-Agent': fp.userAgent,
        'Accept-Language': `${fp.locale},${fp.locale.split('-')[0]};q=0.9`,
    });

    // Timezone — works on BrowserContext, but patchright may also expose on page
    const context = page.context();
    try {
        (context as unknown as { emulateTimezone?(tz: string): Promise<void> }).emulateTimezone?.(
            fp.timezone,
        );
    } catch {
        // Fallback: override Intl.DateTimeFormat in page
        await page.evaluate((tz: string) => {
            const OrigDTF = Intl.DateTimeFormat;
            (Intl as unknown as Record<string, unknown>).DateTimeFormat = function (
                ...args: unknown[]
            ) {
                const locales = args[0];
                const opts = (args[1] ?? {}) as Intl.DateTimeFormatOptions;
                return new OrigDTF(locales as string | string[] | undefined, { ...opts, timeZone: tz });
            };
        }, fp.timezone);
    }

    // Geolocation
    try {
        await context.setGeolocation(fp.geolocation);
    } catch {
        /* Non-critical — geolocation permission may not be granted */
    }

    // Locale override (patchright / modern Playwright)
    try {
        const ctxExt = context as unknown as { setLocale?(locale: string): Promise<void> };
        if (typeof ctxExt.setLocale === 'function') {
            await ctxExt.setLocale(fp.locale);
        }
    } catch {
        /* Non-critical */
    }

    // Grant permissions so geolocation works
    try {
        await context.grantPermissions(['geolocation'], { origin: '*' });
    } catch {
        /* Permissions may not be supported in all environments */
    }
}

// ============================================================================
// HUMAN SIMULATION HELPERS
// ============================================================================

/** Simple 2-D point. */
export interface Point {
    x: number;
    y: number;
}

/**
 * Simulates a smooth cubic-Bézier mouse movement from `start` to `end`.
 * Adds slight jitter to mimic human hand tremor.
 *
 * @param page  - The Playwright / Patchright Page instance.
 * @param start - Starting coordinates.
 * @param end   - Target coordinates.
 * @param steps - Number of interpolation steps (default: 25).
 */
export async function humanizeMouseMove(
    page: Page,
    start: Point,
    end: Point,
    steps = 25,
): Promise<void> {
    // Generate two random control points for the cubic Bézier curve
    const cp1: Point = {
        x: start.x + (end.x - start.x) * (0.3 + Math.random() * 0.4),
        y: start.y + (end.y - start.y) * (-0.2 + Math.random() * 0.4),
    };
    const cp2: Point = {
        x: start.x + (end.x - start.x) * (0.5 + Math.random() * 0.3),
        y: start.y + (end.y - start.y) * (0.2 + Math.random() * 0.6),
    };

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Cubic Bézier: B(t) = (1−t)³P₀ + 3(1−t)²t·P₁ + 3(1−t)t²·P₂ + t³P₃
        const mt = 1 - t;
        const x =
            mt * mt * mt * start.x +
            3 * mt * mt * t * cp1.x +
            3 * mt * t * t * cp2.x +
            t * t * t * end.x;
        const y =
            mt * mt * mt * start.y +
            3 * mt * mt * t * cp1.y +
            3 * mt * t * t * cp2.y +
            t * t * t * end.y;

        // Human tremor jitter (±1.5px) except at exact start / end
        const jitterX = i > 0 && i < steps ? (Math.random() - 0.5) * 3 : 0;
        const jitterY = i > 0 && i < steps ? (Math.random() - 0.5) * 3 : 0;

        await page.mouse.move(x + jitterX, y + jitterY, { steps: 1 });

        // Variable delay: slow at start/end, faster in the middle
        const progress = t;
        const delay = 8 + Math.sin(progress * Math.PI) * 15 + Math.random() * 5;
        await page.waitForTimeout(delay);
    }
}

/**
 * Simulates a scroll with variable speed (ease-in-out acceleration /
 * deceleration).
 *
 * @param page     - The Playwright / Patchright Page instance.
 * @param distance - Total scroll distance in pixels (positive = down).
 * @param duration - Total duration in milliseconds (default: 2000).
 */
export async function humanizeScroll(
    page: Page,
    distance: number,
    duration = 2000,
): Promise<void> {
    // Never scroll less than 1 pixel
    if (distance === 0) return;

    const steps = 20;
    const stepDuration = duration / steps;

    let previousScroll = 0;

    for (let i = 1; i <= steps; i++) {
        const raw = i / steps;
        // Ease-in-out quadratic
        const eased = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw;

        const currentScroll = Math.round(distance * eased);
        const deltaY = currentScroll - previousScroll;

        if (deltaY !== 0) {
            await page.mouse.wheel(0, deltaY);
        }

        previousScroll = currentScroll;

        const jitter = (Math.random() - 0.5) * 30;
        const delay = Math.max(5, stepDuration + jitter);
        await page.waitForTimeout(delay);
    }
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Returns a random integer between `min` and `max` (both inclusive).
 */
function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}