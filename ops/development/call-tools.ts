import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireAuth } from './users.js';

// ============================================
// CONFIGURATION
// ============================================

// Vonage (ex-Nexmo)
const VONAGE_API_KEY = process.env.VONAGE_API_KEY ?? '';
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET ?? '';
const VONAGE_FROM_NUMBER = process.env.VONAGE_FROM_NUMBER ?? '';
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID ?? '';

// Sipgate
const SIPGATE_TOKEN = process.env.SIPGATE_TOKEN ?? '';
const SIPGATE_TOKEN_ID = process.env.SIPGATE_TOKEN_ID ?? '';

// Make.com
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL ?? '';

// ============================================
// AUTH CHECK
// ============================================

function authCheck(): { content: { type: 'text'; text: string }[] } | null {
  const auth = requireAuth();
  if (!auth.authenticated) {
    return { content: [{ type: 'text', text: `ð ${auth.message}` }] };
  }
  return null;
}

function getUsername(): string {
  const auth = requireAuth();
  return auth.user?.username || 'unknown';
}

// ============================================
// VONAGE API HELPERS
// ============================================

async function vonageRequest(endpoint: string, method: string, body?: object) {
  const url = `https://api.nexmo.com${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Basic Auth for most endpoints
  const auth = Buffer.from(`${VONAGE_API_KEY}:${VONAGE_API_SECRET}`).toString('base64');
  headers['Authorization'] = `Basic ${auth}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: { raw: text } };
  }
}

async function vonageSMS(to: string, text: string) {
  return vonageRequest('/sms/json', 'POST', {
    api_key: VONAGE_API_KEY,
    api_secret: VONAGE_API_SECRET,
    from: VONAGE_FROM_NUMBER,
    to,
    text,
  });
}

async function vonageVoiceCall(to: string, answerUrl: string) {
  // Voice API uses JWT auth, but we can use the REST API for simple calls
  const url = 'https://api.nexmo.com/v1/calls';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${VONAGE_API_KEY}:${VONAGE_API_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({
      to: [{ type: 'phone', number: to }],
      from: { type: 'phone', number: VONAGE_FROM_NUMBER },
      answer_url: [answerUrl],
    }),
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: { raw: text } };
  }
}

// ============================================
// SIPGATE API HELPERS
// ============================================

async function sipgateRequest(endpoint: string, method: string, body?: object) {
  const url = `https://api.sipgate.com/v2${endpoint}`;

  const auth = Buffer.from(`${SIPGATE_TOKEN_ID}:${SIPGATE_TOKEN}`).toString('base64');

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: { raw: text } };
  }
}

// ============================================
// MAKE.COM WEBHOOK
// ============================================

async function triggerMakeWebhook(data: object) {
  if (!MAKE_WEBHOOK_URL) {
    return { ok: false, error: 'MAKE_WEBHOOK_URL nicht konfiguriert' };
  }

  const response = await fetch(MAKE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return { ok: response.ok, status: response.status };
}

// ============================================
// REGISTER CALL TOOLS
// ============================================

export function registerCallTools(server: McpServer) {

  // ============================================
  // TOOL: Call Config Status
  // ============================================
  server.tool(
    'call_config',
    {},
    async () => {
      const authError = authCheck();
      if (authError) return authError;

      const config = {
        vonage: {
          configured: !!(VONAGE_API_KEY && VONAGE_API_SECRET),
          apiKey: VONAGE_API_KEY ? `${VONAGE_API_KEY.slice(0, 4)}****` : 'â nicht gesetzt',
          fromNumber: VONAGE_FROM_NUMBER || 'â nicht gesetzt',
        },
        sipgate: {
          configured: !!(SIPGATE_TOKEN && SIPGATE_TOKEN_ID),
          tokenId: SIPGATE_TOKEN_ID ? `${SIPGATE_TOKEN_ID.slice(0, 4)}****` : 'â nicht gesetzt',
        },
        make: {
          configured: !!MAKE_WEBHOOK_URL,
          webhookUrl: MAKE_WEBHOOK_URL ? 'â gesetzt' : 'â nicht gesetzt',
        },
      };

      const text = [
        '=== CALL CONFIGURATION ===',
        '',
        'ð VONAGE:',
        `   API Key: ${config.vonage.apiKey}`,
        `   From Number: ${config.vonage.fromNumber}`,
        `   Status: ${config.vonage.configured ? 'â Konfiguriert' : 'â Nicht konfiguriert'}`,
        '',
        'ð± SIPGATE:',
        `   Token ID: ${config.sipgate.tokenId}`,
        `   Status: ${config.sipgate.configured ? 'â Konfiguriert' : 'â Nicht konfiguriert'}`,
        '',
        'ð MAKE.COM:',
        `   Webhook: ${config.make.webhookUrl}`,
        `   Status: ${config.make.configured ? 'â Konfiguriert' : 'â Nicht konfiguriert'}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );

  // ============================================
  // TOOL: Vonage SMS senden
  // ============================================
  server.tool(
    'call_vonage_sms',
    {
      to: z.string().describe('Telefonnummer (E.164 Format, z.B. 4917612345678)'),
      message: z.string().describe('SMS Text'),
    },
    async ({ to, message }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
        return { content: [{ type: 'text', text: 'â Vonage nicht konfiguriert. Bitte VONAGE_API_KEY und VONAGE_API_SECRET in .env setzen.' }] };
      }

      const result = await vonageSMS(to, message);

      if (result.ok && result.data?.messages?.[0]?.status === '0') {
        return {
          content: [{
            type: 'text',
            text: `â SMS gesendet!\n   An: ${to}\n   Message ID: ${result.data.messages[0]['message-id']}\n   (von: ${getUsername()})`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `â SMS fehlgeschlagen: ${JSON.stringify(result.data, null, 2)}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: Vonage Voice Call
  // ============================================
  server.tool(
    'call_vonage_dial',
    {
      to: z.string().describe('Telefonnummer (E.164 Format, z.B. 4917612345678)'),
      answer_url: z.string().optional().describe('NCCO Answer URL (optional, default: TTS Ansage)'),
    },
    async ({ to, answer_url }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!VONAGE_API_KEY || !VONAGE_API_SECRET || !VONAGE_FROM_NUMBER) {
        return { content: [{ type: 'text', text: 'â Vonage nicht vollstÃ¤ndig konfiguriert. Bitte API Key, Secret und From Number in .env setzen.' }] };
      }

      // Default answer URL with simple TTS
      const defaultAnswerUrl = 'https://raw.githubusercontent.com/nexmo-community/ncco-examples/main/first_call_talk.json';
      const nccoUrl = answer_url || defaultAnswerUrl;

      const result = await vonageVoiceCall(to, nccoUrl);

      if (result.ok) {
        return {
          content: [{
            type: 'text',
            text: [
              'â Anruf gestartet!',
              `   An: ${to}`,
              `   Von: ${VONAGE_FROM_NUMBER}`,
              `   Call UUID: ${result.data?.uuid || 'N/A'}`,
              `   Status: ${result.data?.status || 'initiated'}`,
              `   (gestartet von: ${getUsername()})`,
            ].join('\n'),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `â Anruf fehlgeschlagen: ${JSON.stringify(result.data, null, 2)}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: Vonage Account Balance
  // ============================================
  server.tool(
    'call_vonage_balance',
    {},
    async () => {
      const authError = authCheck();
      if (authError) return authError;

      if (!VONAGE_API_KEY || !VONAGE_API_SECRET) {
        return { content: [{ type: 'text', text: 'â Vonage nicht konfiguriert.' }] };
      }

      const url = `https://rest.nexmo.com/account/get-balance?api_key=${VONAGE_API_KEY}&api_secret=${VONAGE_API_SECRET}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        return {
          content: [{
            type: 'text',
            text: `ð° Vonage Guthaben: â¬${parseFloat(data.value).toFixed(2)}`,
          }],
        };
      }

      return { content: [{ type: 'text', text: `â Fehler: ${JSON.stringify(data)}` }] };
    }
  );

  // ============================================
  // TOOL: Sipgate Anruf
  // ============================================
  server.tool(
    'call_sipgate_dial',
    {
      to: z.string().describe('Telefonnummer'),
      caller: z.string().optional().describe('Caller ID (SIP User ID, z.B. w0)'),
    },
    async ({ to, caller }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!SIPGATE_TOKEN || !SIPGATE_TOKEN_ID) {
        return { content: [{ type: 'text', text: 'â Sipgate nicht konfiguriert. Bitte SIPGATE_TOKEN_ID und SIPGATE_TOKEN in .env setzen.' }] };
      }

      const result = await sipgateRequest('/sessions/calls', 'POST', {
        caller: caller || 'w0',
        callee: to,
        callerId: '', // Use default
      });

      if (result.ok) {
        return {
          content: [{
            type: 'text',
            text: [
              'â Sipgate Anruf gestartet!',
              `   An: ${to}`,
              `   Session ID: ${result.data?.sessionId || 'N/A'}`,
              `   (gestartet von: ${getUsername()})`,
            ].join('\n'),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `â Sipgate Fehler: ${JSON.stringify(result.data, null, 2)}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: Sipgate SMS
  // ============================================
  server.tool(
    'call_sipgate_sms',
    {
      to: z.string().describe('Telefonnummer'),
      message: z.string().describe('SMS Text'),
      smsId: z.string().optional().describe('SMS Extension ID (z.B. s0)'),
    },
    async ({ to, message, smsId }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!SIPGATE_TOKEN || !SIPGATE_TOKEN_ID) {
        return { content: [{ type: 'text', text: 'â Sipgate nicht konfiguriert.' }] };
      }

      const result = await sipgateRequest('/sessions/sms', 'POST', {
        smsId: smsId || 's0',
        recipient: to,
        message,
      });

      if (result.ok) {
        return {
          content: [{
            type: 'text',
            text: `â Sipgate SMS gesendet an ${to}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `â Sipgate SMS Fehler: ${JSON.stringify(result.data, null, 2)}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: Sipgate Account Info
  // ============================================
  server.tool(
    'call_sipgate_info',
    {},
    async () => {
      const authError = authCheck();
      if (authError) return authError;

      if (!SIPGATE_TOKEN || !SIPGATE_TOKEN_ID) {
        return { content: [{ type: 'text', text: 'â Sipgate nicht konfiguriert.' }] };
      }

      const [account, devices] = await Promise.all([
        sipgateRequest('/account', 'GET'),
        sipgateRequest('/devices', 'GET'),
      ]);

      if (account.ok) {
        const text = [
          '=== SIPGATE ACCOUNT ===',
          `   Company: ${account.data?.company || 'N/A'}`,
          `   Account ID: ${account.data?.accountId || 'N/A'}`,
          '',
          '=== DEVICES ===',
          ...(devices.data?.items || []).map((d: any) =>
            `   â¢ ${d.alias || d.id} (${d.type})`
          ),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      }

      return { content: [{ type: 'text', text: `â Fehler: ${JSON.stringify(account.data)}` }] };
    }
  );

  // ============================================
  // TOOL: Make.com Webhook triggern
  // ============================================
  server.tool(
    'call_make_trigger',
    {
      event: z.string().describe('Event Name (z.B. call_completed, lead_created)'),
      data: z.string().optional().describe('JSON Daten als String'),
    },
    async ({ event, data }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!MAKE_WEBHOOK_URL) {
        return { content: [{ type: 'text', text: 'â Make.com Webhook URL nicht konfiguriert. Bitte MAKE_WEBHOOK_URL in .env setzen.' }] };
      }

      let payload: object;
      try {
        payload = {
          event,
          timestamp: new Date().toISOString(),
          triggeredBy: getUsername(),
          data: data ? JSON.parse(data) : {},
        };
      } catch {
        return { content: [{ type: 'text', text: 'â UngÃ¼ltiges JSON in data Parameter' }] };
      }

      const result = await triggerMakeWebhook(payload);

      if (result.ok) {
        return {
          content: [{
            type: 'text',
            text: `â Make.com Webhook getriggert!\n   Event: ${event}\n   Status: ${result.status}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `â Make.com Webhook Fehler: Status ${result.status}`,
        }],
      };
    }
  );
}
