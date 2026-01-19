import type { Browser, Page } from 'puppeteer';

// Dynamic imports for puppeteer-extra (ESM compatibility)
let puppeteer: any;
let browserInstance: Browser | null = null;

async function initPuppeteer() {
  if (!puppeteer) {
    const puppeteerExtra = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');

    puppeteer = puppeteerExtra.default;
    puppeteer.use(StealthPlugin.default());
    // Skip adblocker - causes TypeScript issues and not critical for scraping
  }
  return puppeteer;
}

// ============================================
// ANTI-DETECTION CONFIGURATION
// ============================================

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ============================================
// BROWSER MANAGEMENT
// ============================================

export async function getBrowser(): Promise<Browser> {
  if (browserInstance) return browserInstance;

  const ppt = await initPuppeteer();

  const launched = await ppt.launch({
    headless: true,
    executablePath: '/snap/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
  });

  browserInstance = launched as Browser;
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function createPage(): Promise<Page> {
  const b = await getBrowser();
  const page = await b.newPage();

  // Set random user agent
  await page.setUserAgent(getRandomUserAgent());

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Override webdriver detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['de-DE', 'de', 'en-US', 'en'] });

    // @ts-ignore
    window.chrome = { runtime: {} };

    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });

  // Add extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  });

  return page;
}

// ============================================
// CREDENTIALS MANAGEMENT
// ============================================

interface Credentials {
  site: string;
  username: string;
  password: string;
}

const credentialsStore: Map<string, Credentials> = new Map();

export function saveCredentials(creds: Credentials): void {
  credentialsStore.set(creds.site.toLowerCase(), creds);
}

export function getCredentials(site: string): Credentials | undefined {
  return credentialsStore.get(site.toLowerCase());
}

export function hasCredentials(site: string): boolean {
  return credentialsStore.has(site.toLowerCase());
}

export function clearCredentials(site: string): void {
  credentialsStore.delete(site.toLowerCase());
}
