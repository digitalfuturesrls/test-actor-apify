/**
 * Stealth script to mask browser automation characteristics.
 * Injects JavaScript before page loads to override detection properties.
 */

export const stealthScript = `
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'permissions', {
        get: () => ({
            query: (params) => Promise.resolve({ state: 'granted' })
        })
    });
`;
