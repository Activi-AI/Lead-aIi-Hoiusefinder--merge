import type { Browser, Page } from 'puppeteer';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Dynamic imports for puppeteer-extra (ESM compatibility)
let puppeteer: any;
let browserInstance: Browser | null = null;

async function initPuppeteer() {
  if (!puppeteer) {
    const puppeteerExtra = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');

    puppeteer = puppeteerExtra.default;
    puppeteer.use(StealthPlugin.default());
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

  await page.setUserAgent(getRandomUserAgent());
  await page.setViewport({ width: 1920, height: 1080 });

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

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  });

  return page;
}

// ============================================
// ENCRYPTED CREDENTIALS MANAGEMENT
// ============================================

interface Credentials {
  site: string;
  username: string;
  password: string;
}

interface EncryptedData {
  iv: string;
  salt: string;
  data: string;
  tag: string;
}

// Credentials file path
const DATA_DIR = '/root/lead-ai-mcp/data';
const CREDENTIALS_FILE = join(DATA_DIR, 'credentials.enc');

// Encryption key derived from machine-specific data
function getEncryptionKey(): Buffer {
  // Use a combination of factors for the key
  const secret = process.env.SCRAPER_SECRET || 'lead-ai-housefinder-scraper-2024';
  const machineId = process.env.HOSTNAME || 'default-host';
  return scryptSync(secret + machineId, 'lead-ai-salt', 32);
}

function encrypt(data: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const salt = randomBytes(16);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    data: encrypted,
    tag: tag.toString('hex'),
  };
}

function decrypt(encrypted: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// In-memory cache
const credentialsCache: Map<string, Credentials> = new Map();
let cacheLoaded = false;

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadCredentials(): void {
  if (cacheLoaded) return;

  try {
    if (existsSync(CREDENTIALS_FILE)) {
      const fileContent = readFileSync(CREDENTIALS_FILE, 'utf8');
      const encrypted: EncryptedData = JSON.parse(fileContent);
      const decrypted = decrypt(encrypted);
      const credentials: Credentials[] = JSON.parse(decrypted);

      for (const cred of credentials) {
        credentialsCache.set(cred.site.toLowerCase(), cred);
      }
      console.log(`[Credentials] ${credentials.length} Zugangsdaten geladen`);
    }
  } catch (error) {
    console.error('[Credentials] Fehler beim Laden:', error);
  }

  cacheLoaded = true;
}

function persistCredentials(): void {
  try {
    ensureDataDir();

    const credentials = Array.from(credentialsCache.values());
    const jsonData = JSON.stringify(credentials);
    const encrypted = encrypt(jsonData);

    writeFileSync(CREDENTIALS_FILE, JSON.stringify(encrypted, null, 2));
    console.log(`[Credentials] ${credentials.length} Zugangsdaten gespeichert`);
  } catch (error) {
    console.error('[Credentials] Fehler beim Speichern:', error);
  }
}

export function saveCredentials(creds: Credentials): void {
  loadCredentials();
  credentialsCache.set(creds.site.toLowerCase(), creds);
  persistCredentials();
}

export function getCredentials(site: string): Credentials | undefined {
  loadCredentials();
  return credentialsCache.get(site.toLowerCase());
}

export function hasCredentials(site: string): boolean {
  loadCredentials();
  return credentialsCache.has(site.toLowerCase());
}

export function clearCredentials(site: string): void {
  loadCredentials();
  credentialsCache.delete(site.toLowerCase());
  persistCredentials();
}

export function listCredentials(): { site: string; username: string }[] {
  loadCredentials();
  return Array.from(credentialsCache.values()).map(c => ({
    site: c.site,
    username: c.username,
  }));
}
