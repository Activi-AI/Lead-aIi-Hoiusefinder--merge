// Re-export all scraper functionality
export { getBrowser, createPage, closeBrowser, randomDelay, saveCredentials, getCredentials, hasCredentials } from './browser.js';
export { PORTALS, scrapePortal, getAvailablePortals, type ScrapeResult, type ScrapeResponse, type PortalConfig } from './portals.js';