import type { Page } from 'puppeteer';
import { createPage, randomDelay, getCredentials, hasCredentials } from './browser.js';

// ============================================
// PORTAL CONFIGURATION
// ============================================

export interface PortalConfig {
  name: string;
  baseUrl: string;
  requiresLogin: boolean;
  type: 'housing' | 'job';
  selectors: {
    searchInput?: string;
    priceFilter?: string;
    cityFilter?: string;
    searchButton?: string;
    resultList: string;
    resultItem: string;
    title: string;
    price: string;
    location: string;
    size?: string;
    rooms?: string;
    link: string;
    nextPage?: string;
    loginForm?: {
      username: string;
      password: string;
      submit: string;
    };
  };
}

export const PORTALS: Record<string, PortalConfig> = {
  // === WOHNUNGSPORTALE ===
  'immobilienscout24': {
    name: 'ImmobilienScout24',
    baseUrl: 'https://www.immobilienscout24.de',
    requiresLogin: false,
    type: 'housing',
    selectors: {
      resultList: '.result-list__listing',
      resultItem: 'article.result-list__listing',
      title: '.result-list-entry__brand-title-container h2',
      price: '.result-list-entry__criteria .criteria-group span:first-child',
      location: '.result-list-entry__address',
      size: '.result-list-entry__primary-criterion:nth-child(1)',
      rooms: '.result-list-entry__primary-criterion:nth-child(2)',
      link: 'a.result-list-entry__brand-title-container',
      nextPage: '[data-testid=\"paging-button-next\"]',
    },
  },
  'wg-gesucht': {
    name: 'WG-Gesucht',
    baseUrl: 'https://www.wg-gesucht.de',
    requiresLogin: false,
    type: 'housing',
    selectors: {
      resultList: '.wgg_card',
      resultItem: '.wgg_card',
      title: '.card_headline',
      price: '.detail-size-price-wrapper .col-xs-3:last-child',
      location: '.card_headline + span',
      size: '.detail-size-price-wrapper .col-xs-3:first-child',
      link: 'a.card_image',
      nextPage: '.pagination a:last-child',
    },
  },
  'ebay-kleinanzeigen': {
    name: 'eBay Kleinanzeigen',
    baseUrl: 'https://www.kleinanzeigen.de',
    requiresLogin: true,
    type: 'housing',
    selectors: {
      resultList: '#srchrslt-adtable',
      resultItem: 'article.aditem',
      title: '.aditem-main h2 a',
      price: '.aditem-main--middle--price-shipping p',
      location: '.aditem-main--top--left',
      link: '.aditem-main h2 a',
      nextPage: '.pagination-next',
      loginForm: {
        username: '#login-email',
        password: '#login-password',
        submit: '#login-submit',
      },
    },
  },
  'monteurzimmer': {
    name: 'Monteurzimmer.de',
    baseUrl: 'https://www.monteurzimmer.de',
    requiresLogin: false,
    type: 'housing',
    selectors: {
      resultList: '.listing-list',
      resultItem: '.listing-item',
      title: '.listing-title',
      price: '.listing-price',
      location: '.listing-location',
      link: '.listing-item a',
      nextPage: '.pagination .next',
    },
  },
  // === JOB PORTALE ===
  'indeed': {
    name: 'Indeed',
    baseUrl: 'https://de.indeed.com',
    requiresLogin: false,
    type: 'job',
    selectors: {
      resultList: '#mosaic-provider-jobcards',
      resultItem: '.job_seen_beacon',
      title: '.jobTitle a span',
      price: '.salary-snippet-container',
      location: '.companyLocation',
      link: '.jobTitle a',
      nextPage: '[data-testid=\"pagination-page-next\"]',
    },
  },
  'stepstone': {
    name: 'StepStone',
    baseUrl: 'https://www.stepstone.de',
    requiresLogin: false,
    type: 'job',
    selectors: {
      resultList: '[data-testid=\"job-list\"]',
      resultItem: 'article[data-testid=\"job-item\"]',
      title: '[data-testid=\"job-item-title\"]',
      price: '[data-testid=\"job-item-salary\"]',
      location: '[data-testid=\"job-item-location\"]',
      link: '[data-testid=\"job-item-title\"] a',
      nextPage: '[data-testid=\"pagination-next\"]',
    },
  },
  'linkedin-jobs': {
    name: 'LinkedIn Jobs',
    baseUrl: 'https://www.linkedin.com/jobs',
    requiresLogin: true,
    type: 'job',
    selectors: {
      resultList: '.jobs-search-results-list',
      resultItem: '.job-card-container',
      title: '.job-card-list__title',
      price: '.job-card-container__salary-info',
      location: '.job-card-container__metadata-item',
      link: '.job-card-list__title a',
      loginForm: {
        username: '#username',
        password: '#password',
        submit: 'button[type=\"submit\"]',
      },
    },
  },
};

// ============================================
// SCRAPING RESULT TYPES
// ============================================

export interface ScrapeResult {
  title: string;
  price: string;
  location: string;
  size?: string;
  rooms?: string;
  link: string;
  portal: string;
  scrapedAt: string;
}

export interface ScrapeResponse {
  success: boolean;
  portal: string;
  query: Record<string, unknown>;
  results: ScrapeResult[];
  totalFound: number;
  error?: string;
  requiresLogin?: boolean;
  loginUrl?: string;
}

// ============================================
// SCRAPER FUNCTIONS
// ============================================

export async function scrapePortal(
  portalKey: string,
  searchParams: {
    city?: string;
    maxPrice?: number;
    minSize?: number;
    rooms?: number;
    keyword?: string;
    maxPages?: number;
  }
): Promise<ScrapeResponse> {
  const portal = PORTALS[portalKey];
  if (!portal) {
    return {
      success: false,
      portal: portalKey,
      query: searchParams,
      results: [],
      totalFound: 0,
      error: \`Unbekanntes Portal: \${portalKey}. VerfÃ¼gbare: \${Object.keys(PORTALS).join(', ')}\`,
    };
  }

  // Check login requirement
  if (portal.requiresLogin && !hasCredentials(portalKey)) {
    return {
      success: false,
      portal: portal.name,
      query: searchParams,
      results: [],
      totalFound: 0,
      error: \`\${portal.name} erfordert Login. Bitte Zugangsdaten eingeben.\`,
      requiresLogin: true,
      loginUrl: portal.baseUrl,
    };
  }

  const page = await createPage();
  const results: ScrapeResult[] = [];
  const maxPages = searchParams.maxPages || 3;

  try {
    // Login if required
    if (portal.requiresLogin) {
      await performLogin(page, portal);
    }

    // Build search URL
    const searchUrl = buildSearchUrl(portal, searchParams);
    console.log(\`[Scraper] Navigiere zu: \${searchUrl}\`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000, 4000);

    // Scrape pages
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(\`[Scraper] Scrape Seite \${pageNum}...\`);
      
      // Wait for results
      try {
        await page.waitForSelector(portal.selectors.resultItem, { timeout: 10000 });
      } catch {
        console.log(\`[Scraper] Keine Ergebnisse auf Seite \${pageNum}\`);
        break;
      }

      // Extract results
      const pageResults = await page.evaluate((selectors) => {
        const items = document.querySelectorAll(selectors.resultItem);
        return Array.from(items).map(item => {
          const getTextContent = (selector: string) => {
            const el = item.querySelector(selector);
            return el?.textContent?.trim() || '';
          };
          const getHref = (selector: string) => {
            const el = item.querySelector(selector) as HTMLAnchorElement;
            return el?.href || '';
          };
          return {
            title: getTextContent(selectors.title),
            price: getTextContent(selectors.price),
            location: getTextContent(selectors.location),
            size: selectors.size ? getTextContent(selectors.size) : undefined,
            rooms: selectors.rooms ? getTextContent(selectors.rooms) : undefined,
            link: getHref(selectors.link),
          };
        }).filter(r => r.title && r.link);
      }, portal.selectors);

      results.push(...pageResults.map(r => ({
        ...r,
        portal: portal.name,
        scrapedAt: new Date().toISOString(),
      })));

      // Check for next page
      if (pageNum < maxPages && portal.selectors.nextPage) {
        const hasNextPage = await page.$(portal.selectors.nextPage);
        if (hasNextPage) {
          await hasNextPage.click();
          await randomDelay(2000, 4000);
        } else {
          break;
        }
      }
    }

    return {
      success: true,
      portal: portal.name,
      query: searchParams,
      results,
      totalFound: results.length,
    };
  } catch (error) {
    return {
      success: false,
      portal: portal.name,
      query: searchParams,
      results,
      totalFound: results.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    await page.close();
  }
}

async function performLogin(page: Page, portal: PortalConfig): Promise<void> {
  if (!portal.selectors.loginForm) return;
  
  const creds = getCredentials(portal.name.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  if (!creds) throw new Error('Keine Zugangsdaten gefunden');

  await page.goto(portal.baseUrl + '/login', { waitUntil: 'networkidle2' });
  await randomDelay(1000, 2000);

  await page.type(portal.selectors.loginForm.username, creds.username, { delay: 50 });
  await randomDelay(500, 1000);
  await page.type(portal.selectors.loginForm.password, creds.password, { delay: 50 });
  await randomDelay(500, 1000);
  await page.click(portal.selectors.loginForm.submit);
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await randomDelay(1000, 2000);
}

function buildSearchUrl(portal: PortalConfig, params: Record<string, unknown>): string {
  const { city, maxPrice, keyword } = params;
  
  switch (portal.name) {
    case 'ImmobilienScout24':
      let url = \`\${portal.baseUrl}/Suche/de/\${city || 'muenchen'}/wohnung-mieten\`;
      if (maxPrice) url += \`?price=-\${maxPrice}\`;
      return url;
    
    case 'WG-Gesucht':
      return \`\${portal.baseUrl}/wohnungen-in-\${(city || 'Muenchen').replace(/Ã¼/g, 'ue')}.8.0.1.0.html\`;
    
    case 'eBay Kleinanzeigen':
      return \`\${portal.baseUrl}/s-wohnung-mieten/\${city || 'muenchen'}/anzeige:angebote/c203\${maxPrice ? '+preis:' + maxPrice : ''}\`;
    
    case 'Monteurzimmer.de':
      return \`\${portal.baseUrl}/\${city || 'muenchen'}/\`;
    
    case 'Indeed':
      return \`\${portal.baseUrl}/jobs?q=\${encodeURIComponent(keyword || 'SHK')}&l=\${city || 'MÃ¼nchen'}\`;
    
    case 'StepStone':
      return \`\${portal.baseUrl}/jobs/\${encodeURIComponent(keyword || 'SHK')}/in-\${city || 'muenchen'}\`;
    
    default:
      return portal.baseUrl;
  }
}

// Get available portals
export function getAvailablePortals(): { key: string; name: string; type: string; requiresLogin: boolean }[] {
  return Object.entries(PORTALS).map(([key, config]) => ({
    key,
    name: config.name,
    type: config.type,
    requiresLogin: config.requiresLogin,
  }));
}