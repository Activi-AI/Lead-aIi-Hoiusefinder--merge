import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import type { Browser, Page } from 'puppeteer';

// Anti-Detection Plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// Random User Agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// Random delay to appear human
export function randomDelay(min = 1000, max = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Get random user agent
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Browser instance cache
let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: '/snap/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });
  }
  return browserInstance;
}

export async function createPage(): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // Set random user agent
  await page.setUserAgent(getRandomUserAgent());
  
  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Set language
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  });
  
  // Override webdriver detection
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['de-DE', 'de', 'en-US', 'en'] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });
  
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// Credentials storage (in-memory, should be persisted)
export interface Credentials {
  site: string;
  username: string;
  password: string;
}

const credentialsStore: Map<string, Credentials> = new Map();

export function saveCredentials(creds: Credentials): void {
  credentialsStore.set(creds.site, creds);
}

export function getCredentials(site: string): Credentials | undefined {
  return credentialsStore.get(site);
}

export function hasCredentials(site: string): boolean {
  return credentialsStore.has(site);
}