import { PlaywrightCrawler, purgeDefaultStorages } from '@crawlee/playwright';
import { beforeAll, describe, expect, it } from 'vitest';

import { router } from '../src/routes.js';

describe('PlaywrightCrawler', () => {
    beforeAll(async () => {
        await purgeDefaultStorages();
    });

    it('should crawl with warmup flow and push data to dataset', async () => {
        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl: 10,
            requestHandler: router,
        });

        const warmupUrl = 'https://apify.com';
        const targetUrl = 'https://apify.com/store';

        await crawler.run([{
            url: warmupUrl,
            userData: {
                role: 'warmup',
                targetUrl,
            },
        }]);

        expect(crawler.stats.state.requestsFinished).toBeGreaterThan(0);

        const { items } = await crawler.getData();
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].url).toBeDefined();
        expect(items[0].title).toBeDefined();
    }, 120_000);
});
