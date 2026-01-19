import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireAuth } from './users.js';

// Scraper wird dynamisch importiert
let scraperModule: typeof import('./scraper/index.js') | null = null;

async function getScraper() {
  if (!scraperModule) {
    scraperModule = await import('./scraper/index.js');
  }
  return scraperModule;
}

// Auth-Check Helper
function authCheck() {
  const auth = requireAuth();
  if (!auth.authenticated) {
    return {
      success: false,
      content: [{ type: 'text' as const, text: `ð ${auth.message}` }],
    };
  }
  return { success: true, user: auth.user };
}

export function registerScraperTools(server: McpServer) {

  // ============================================
  // TOOL: Liste verfÃ¼gbare Portale
  // ============================================
  server.tool(
    'scraper_portals',
    { type: z.enum(['housing', 'job', 'all']).optional().describe('Filter nach Typ') },
    async ({ type }) => {
      const auth = authCheck();
      if (!auth.success) return auth;

      const scraper = await getScraper();
      let portals = scraper.getAvailablePortals();

      if (type && type !== 'all') {
        portals = portals.filter(p => p.type === type);
      }

      const text = [
        `=== VERFÃGBARE PORTALE === (User: ${auth.user?.username})`,
        '',
        'ð  WOHNUNGSPORTALE:',
        ...portals.filter(p => p.type === 'housing').map(p =>
          `  â¢ ${p.name} (${p.key}) ${p.requiresLogin ? 'ð Login erforderlich' : 'â Ohne Login'}`
        ),
        '',
        'ð¼ JOB PORTALE:',
        ...portals.filter(p => p.type === 'job').map(p =>
          `  â¢ ${p.name} (${p.key}) ${p.requiresLogin ? 'ð Login erforderlich' : 'â Ohne Login'}`
        ),
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  // ============================================
  // TOOL: Wohnungen scrapen
  // ============================================
  server.tool(
    'scraper_housing',
    {
      portal: z.string().describe('Portal-Key (z.B. immobilienscout24, wg-gesucht, ebay-kleinanzeigen, monteurzimmer)'),
      city: z.string().optional().describe('Stadt (z.B. MÃ¼nchen, Berlin)'),
      max_price: z.number().optional().describe('Maximaler Preis in Euro'),
      min_size: z.number().optional().describe('MindestgrÃ¶Ãe in qm'),
      rooms: z.number().optional().describe('Anzahl Zimmer'),
      max_pages: z.number().optional().describe('Maximale Anzahl Seiten (default: 3)'),
    },
    async ({ portal, city, max_price, min_size, rooms, max_pages }) => {
      const auth = authCheck();
      if (!auth.success) return auth;

      const scraper = await getScraper();

      const result = await scraper.scrapePortal(portal, {
        city,
        maxPrice: max_price,
        minSize: min_size,
        rooms,
        maxPages: max_pages,
      });

      if (!result.success) {
        if (result.requiresLogin) {
          return {
            content: [{
              type: 'text',
              text: `â ${result.portal} erfordert Login!\n\nBitte Zugangsdaten mit 'scraper_login' Tool eingeben:\n  Portal: ${portal}\n  Login-URL: ${result.loginUrl}`
            }]
          };
        }
        return { content: [{ type: 'text', text: `â Fehler: ${result.error}` }] };
      }

      const text = [
        `â ${result.portal} - ${result.totalFound} Ergebnisse gefunden`,
        `   (Gesucht von: ${auth.user?.username})`,
        '',
        '=== ERGEBNISSE ===',
        ...result.results.slice(0, 20).map((r, i) => [
          `\n[${i + 1}] ${r.title}`,
          `    ð° ${r.price}`,
          `    ð ${r.location}`,
          r.size ? `    ð ${r.size}` : '',
          r.rooms ? `    ðª ${r.rooms}` : '',
          `    ð ${r.link}`,
        ].filter(Boolean).join('\n')),
        '',
        result.results.length > 20 ? `... und ${result.results.length - 20} weitere` : '',
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  // ============================================
  // TOOL: Jobs scrapen
  // ============================================
  server.tool(
    'scraper_jobs',
    {
      portal: z.string().describe('Portal-Key (z.B. indeed, stepstone, linkedin-jobs)'),
      keyword: z.string().describe('Suchbegriff (z.B. SHK, Elektriker, IT)'),
      city: z.string().optional().describe('Stadt (z.B. MÃ¼nchen, Berlin)'),
      max_pages: z.number().optional().describe('Maximale Anzahl Seiten (default: 3)'),
    },
    async ({ portal, keyword, city, max_pages }) => {
      const auth = authCheck();
      if (!auth.success) return auth;

      const scraper = await getScraper();

      const result = await scraper.scrapePortal(portal, {
        keyword,
        city,
        maxPages: max_pages,
      });

      if (!result.success) {
        if (result.requiresLogin) {
          return {
            content: [{
              type: 'text',
              text: `â ${result.portal} erfordert Login!\n\nBitte Zugangsdaten mit 'scraper_login' Tool eingeben.`
            }]
          };
        }
        return { content: [{ type: 'text', text: `â Fehler: ${result.error}` }] };
      }

      const text = [
        `â ${result.portal} - ${result.totalFound} Jobs gefunden`,
        `   Suche: ${keyword} in ${city || 'Deutschland'}`,
        `   (Gesucht von: ${auth.user?.username})`,
        '',
        '=== STELLENANGEBOTE ===',
        ...result.results.slice(0, 20).map((r, i) => [
          `\n[${i + 1}] ${r.title}`,
          r.price ? `    ð° ${r.price}` : '',
          `    ð ${r.location}`,
          `    ð ${r.link}`,
        ].filter(Boolean).join('\n')),
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  // ============================================
  // TOOL: Login-Daten speichern
  // ============================================
  server.tool(
    'scraper_login',
    {
      portal: z.string().describe('Portal-Key (z.B. ebay-kleinanzeigen, linkedin-jobs)'),
      username: z.string().describe('Benutzername oder E-Mail'),
      password: z.string().describe('Passwort'),
    },
    async ({ portal, username, password }) => {
      const auth = authCheck();
      if (!auth.success) return auth;

      const scraper = await getScraper();

      scraper.saveCredentials({
        site: portal,
        username,
        password,
      });

      return {
        content: [{
          type: 'text',
          text: `â Login-Daten fÃ¼r ${portal} gespeichert.\n\nDu kannst jetzt mit 'scraper_housing' oder 'scraper_jobs' scrapen.`
        }]
      };
    }
  );

  // ============================================
  // TOOL: Custom URL scrapen
  // ============================================
  server.tool(
    'scraper_custom',
    {
      url: z.string().describe('URL der zu scrapenden Seite'),
      item_selector: z.string().describe('CSS-Selektor fÃ¼r ein einzelnes Ergebnis-Element'),
      title_selector: z.string().describe('CSS-Selektor fÃ¼r den Titel (relativ zum Item)'),
      price_selector: z.string().optional().describe('CSS-Selektor fÃ¼r den Preis'),
      location_selector: z.string().optional().describe('CSS-Selektor fÃ¼r den Ort'),
      link_selector: z.string().describe('CSS-Selektor fÃ¼r den Link'),
      max_items: z.number().optional().describe('Maximale Anzahl Items (default: 50)'),
    },
    async ({ url, item_selector, title_selector, price_selector, location_selector, link_selector, max_items }) => {
      const auth = authCheck();
      if (!auth.success) return auth;

      const scraper = await getScraper();
      const page = await scraper.createPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await scraper.randomDelay(2000, 4000);

        const results = await page.evaluate((selectors: {
          item: string;
          title: string;
          price?: string;
          location?: string;
          link: string;
          maxItems: number;
        }) => {
          const items = document.querySelectorAll(selectors.item);
          return Array.from(items).slice(0, selectors.maxItems).map(item => {
            const getTextContent = (sel: string) => {
              const el = item.querySelector(sel);
              return el?.textContent?.trim() || '';
            };
            const getHref = (sel: string) => {
              const el = item.querySelector(sel) as HTMLAnchorElement;
              return el?.href || '';
            };
            return {
              title: getTextContent(selectors.title),
              price: selectors.price ? getTextContent(selectors.price) : '',
              location: selectors.location ? getTextContent(selectors.location) : '',
              link: getHref(selectors.link),
            };
          }).filter(r => r.title);
        }, {
          item: item_selector,
          title: title_selector,
          price: price_selector,
          location: location_selector,
          link: link_selector,
          maxItems: max_items || 50,
        });

        const text = [
          `â Custom Scrape - ${results.length} Ergebnisse`,
          `   URL: ${url}`,
          `   (Gescrapt von: ${auth.user?.username})`,
          '',
          ...results.map((r, i) => [
            `[${i + 1}] ${r.title}`,
            r.price ? `    ð° ${r.price}` : '',
            r.location ? `    ð ${r.location}` : '',
            `    ð ${r.link}`,
          ].filter(Boolean).join('\n')),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `â Fehler: ${error instanceof Error ? error.message : 'Unknown'}` }] };
      } finally {
        await page.close();
      }
    }
  );

  // ============================================
  // TOOL: Browser schlieÃen (Cleanup)
  // ============================================
  server.tool(
    'scraper_close',
    {},
    async () => {
      const auth = authCheck();
      if (!auth.success) return auth;

      const scraper = await getScraper();
      await scraper.closeBrowser();
      return { content: [{ type: 'text', text: 'â Browser geschlossen. Ressourcen freigegeben.' }] };
    }
  );
}
