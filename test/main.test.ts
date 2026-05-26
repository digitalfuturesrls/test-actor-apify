import { describe, expect, it, vi, beforeEach } from 'vitest';
import { checkCaptcha, takeScreenshot } from '../src/immobiliare-scraper.js';

// Mock Playwright Page
function createMockPage(options: { html?: string; screenshotError?: boolean } = {}) {
  return {
    content: vi.fn().mockResolvedValue(options.html ?? '<html><body></body></html>'),
    screenshot: options.screenshotError
      ? vi.fn().mockRejectedValue(new Error('screenshot failed'))
      : vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(''),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(null),
  } as any;
}

// Mock fs – single shared mock instance for both default and named imports
const { mockMkdirSync } = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: { mkdirSync: mockMkdirSync },
  mkdirSync: mockMkdirSync,
}));

describe('checkCaptcha', () => {
  it('should return true when captcha script is present', async () => {
    const page = createMockPage({
      html: '<html><head><script src="https://ct.captcha-delivery.com/captcha"></script></head></html>',
    });
    const result = await checkCaptcha(page);
    expect(result).toBe(true);
  });

  it('should return false when no captcha script is present', async () => {
    const page = createMockPage({
      html: '<html><body><h1>Normal page</h1></body></html>',
    });
    const result = await checkCaptcha(page);
    expect(result).toBe(false);
  });

  it('should return false when page.content() throws', async () => {
    const page = createMockPage();
    (page.content as any).mockRejectedValue(new Error('page crashed'));
    const result = await checkCaptcha(page);
    expect(result).toBe(false);
  });
});

describe('takeScreenshot', () => {
  it('should create directory and take a full-page screenshot', async () => {
    mockMkdirSync.mockClear();
    const page = createMockPage();
    const filePath = 'logs/roma/screenshots/ip-block.png';

    await takeScreenshot(page, filePath);

    expect(mockMkdirSync).toHaveBeenCalledWith('logs/roma/screenshots', { recursive: true });
    expect(page.screenshot).toHaveBeenCalledWith({ path: filePath, fullPage: true, timeout: 60000, animations: "disabled" });
  });

  it('should not throw when screenshot fails', async () => {
    const page = createMockPage({ screenshotError: true });

    await expect(takeScreenshot(page, 'logs/test/error.png')).resolves.not.toThrow();
  });
});


