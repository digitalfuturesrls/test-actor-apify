// @ts-check
import { readFileSync } from 'node:fs';

/**
 * Check that the installed patchright version is compatible with
 * the pre-installed Playwright browsers from the base Docker image.
 * The base image `apify/actor-node-playwright-chrome:24-1.60.0`
 * ships browsers for Playwright 1.60.x, which is wire-compatible
 * with patchright 1.60.x (same protocol revision).
 *
 * This script is run during Docker build to warn if versions diverge.
 */
const pkg = readFileSync('node_modules/patchright/package.json', 'utf-8');
const { version } = JSON.parse(pkg);
const majorMinor = version.split('.').slice(0, 2).join('.');

// Base image ships with browsers for Playwright 1.60
const expectedMajorMinor = process.env.PATCHRIGHT_EXPECTED_VERSION || '1.60';

if (majorMinor !== expectedMajorMinor) {
    console.warn(
        `WARNING: Installed patchright version ${version} (${majorMinor}.x) ` +
        `may not be fully compatible with browsers from Playwright ${expectedMajorMinor}.x ` +
        `pre-installed in this Docker image.`,
    );
} else {
    console.log(`✓ patchright ${version} is compatible with base image browsers (Playwright ${expectedMajorMinor}.x)`);
}