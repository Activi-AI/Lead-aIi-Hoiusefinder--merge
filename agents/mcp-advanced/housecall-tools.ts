import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireAuth } from "./users.js";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

// ============================================
// CONFIGURATION
// ============================================

const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID ?? "";
const VONAGE_PRIVATE_KEY = process.env.VONAGE_PRIVATE_KEY ?? "";
const VONAGE_FROM_NUMBER = process.env.VONAGE_FROM_NUMBER ?? "";

// Webhook Base URL (for callbacks)
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL ?? "https://your-server.com";

// ============================================
// AUTH CHECK
// ============================================

function authCheck(): { content: { type: "text"; text: string }[] } | null {
  const auth = requireAuth();
  if (!auth.authenticated) {
    return { content: [{ type: "text", text: `Auth required: ${auth.message}` }] };
  }
  return null;
}

function getUsername(): string {
  const auth = requireAuth();
  return auth.user?.username || "unknown";
}

// ============================================
// VONAGE JWT GENERATION
// ============================================

function generateVonageJWT(): string {
  if (!VONAGE_APPLICATION_ID || !VONAGE_PRIVATE_KEY) {
    throw new Error("Vonage Application ID oder Private Key nicht konfiguriert");
  }

  const privateKey = readFileSync(VONAGE_PRIVATE_KEY, "utf8");

  const payload = {
    application_id: VONAGE_APPLICATION_ID,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
  };

  return jwt.sign(payload, privateKey, { algorithm: "RS256", expiresIn: "1h" });
}

// ============================================
// VONAGE VOICE API HELPERS
// ============================================

async function vonageVoiceRequest(endpoint: string, method: string, body?: object) {
  const url = `https://api.nexmo.com/v1${endpoint}`;
  const token = generateVonageJWT();

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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
// NCCO BUILDER HELPERS
// ============================================

interface NCCOAction {
  action: string;
  [key: string]: any;
}

function buildTalkAction(text: string, options?: {
  voiceName?: string;
  language?: string;
  style?: number;
  premium?: boolean;
  loop?: number;
  level?: number;
  bargeIn?: boolean;
}): NCCOAction {
  return {
    action: "talk",
    text,
    voiceName: options?.voiceName || "Marlene", // German female voice
    language: options?.language || "de-DE",
    style: options?.style || 0,
    premium: options?.premium ?? true,
    loop: options?.loop || 1,
    level: options?.level || 0,
    bargeIn: options?.bargeIn ?? false,
  };
}

function buildRecordAction(options?: {
  format?: "mp3" | "wav" | "ogg";
  beepStart?: boolean;
  endOnSilence?: number;
  endOnKey?: string;
  timeOut?: number;
  eventUrl?: string[];
}): NCCOAction {
  return {
    action: "record",
    format: options?.format || "mp3",
    beepStart: options?.beepStart ?? true,
    endOnSilence: options?.endOnSilence || 3,
    endOnKey: options?.endOnKey || "#",
    timeOut: options?.timeOut || 60,
    eventUrl: options?.eventUrl || [`${WEBHOOK_BASE_URL}/vonage/recording`],
  };
}

function buildInputAction(options?: {
  type?: ("dtmf" | "speech")[];
  dtmf?: {
    maxDigits?: number;
    timeOut?: number;
    submitOnHash?: boolean;
  };
  speech?: {
    language?: string;
    endOnSilence?: number;
    context?: string[];
  };
  eventUrl?: string[];
}): NCCOAction {
  return {
    action: "input",
    type: options?.type || ["dtmf"],
    dtmf: options?.dtmf || {
      maxDigits: 1,
      timeOut: 10,
      submitOnHash: false,
    },
    speech: options?.speech,
    eventUrl: options?.eventUrl || [`${WEBHOOK_BASE_URL}/vonage/input`],
  };
}

function buildConnectAction(number: string, options?: {
  from?: string;
  machineDetection?: "continue" | "hangup";
  eventUrl?: string[];
  timeout?: number;
  limit?: number;
  ringbackTone?: string;
}): NCCOAction {
  return {
    action: "connect",
    from: options?.from || VONAGE_FROM_NUMBER,
    endpoint: [{
      type: "phone",
      number,
    }],
    machineDetection: options?.machineDetection || "continue",
    eventUrl: options?.eventUrl || [`${WEBHOOK_BASE_URL}/vonage/events`],
    timeout: options?.timeout || 45,
    limit: options?.limit || 3600,
    ringbackTone: options?.ringbackTone,
  };
}

// ============================================
// REGISTER HOUSECALL TOOLS
// ============================================

export function registerHousecallTools(server: McpServer) {

  // ============================================
  // TOOL: TTS Call (mit Text-to-Speech Ansage)
  // ============================================
  server.tool(
    "housecall_tts_call",
    {
      to: z.string().describe("Telefonnummer (E.164 Format)"),
      text: z.string().describe("Text der gesprochen werden soll"),
      voice: z.string().optional().describe("Stimme (Marlene, Hans, Vicki, etc.)"),
      language: z.string().optional().describe("Sprache (de-DE, en-US, etc.)"),
      record: z.boolean().optional().describe("Anruf aufnehmen?"),
    },
    async ({ to, text, voice, language, record }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!VONAGE_APPLICATION_ID || !VONAGE_PRIVATE_KEY) {
        return { content: [{ type: "text", text: "Vonage Voice nicht konfiguriert." }] };
      }

      try {
        const ncco: NCCOAction[] = [];

        // TTS Ansage
        ncco.push(buildTalkAction(text, {
          voiceName: voice || "Marlene",
          language: language || "de-DE",
        }));

        // Optional: Recording
        if (record) {
          ncco.push(buildRecordAction());
        }

        const result = await vonageVoiceRequest("/calls", "POST", {
          to: [{ type: "phone", number: to }],
          from: { type: "phone", number: VONAGE_FROM_NUMBER },
          ncco,
          event_url: [`${WEBHOOK_BASE_URL}/vonage/events`],
        });

        if (result.ok) {
          return {
            content: [{
              type: "text",
              text: `TTS-Anruf gestartet!
   An: ${to}
   Text: "${text.substring(0, 50)}..."
   Stimme: ${voice || "Marlene"}
   Call UUID: ${result.data?.uuid || "N/A"}
   Recording: ${record ? "Ja" : "Nein"}
   (von: ${getUsername()})`,
            }],
          };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: IVR Call (mit Menu-Optionen)
  // ============================================
  server.tool(
    "housecall_ivr_call",
    {
      to: z.string().describe("Telefonnummer (E.164 Format)"),
      greeting: z.string().describe("BegrÃ¼Ãungstext"),
      menu_prompt: z.string().describe("MenÃ¼-Text (z.B. 'DrÃ¼cken Sie 1 fÃ¼r...')"),
      voice: z.string().optional().describe("Stimme"),
      max_digits: z.number().optional().describe("Max. DTMF Ziffern"),
    },
    async ({ to, greeting, menu_prompt, voice, max_digits }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!VONAGE_APPLICATION_ID || !VONAGE_PRIVATE_KEY) {
        return { content: [{ type: "text", text: "Vonage Voice nicht konfiguriert." }] };
      }

      try {
        const ncco: NCCOAction[] = [
          // BegrÃ¼Ãung
          buildTalkAction(greeting, {
            voiceName: voice || "Marlene",
            language: "de-DE",
          }),
          // MenÃ¼-Prompt mit DTMF Input
          buildTalkAction(menu_prompt, {
            voiceName: voice || "Marlene",
            language: "de-DE",
            bargeIn: true,
          }),
          // DTMF Input sammeln
          buildInputAction({
            type: ["dtmf"],
            dtmf: {
              maxDigits: max_digits || 1,
              timeOut: 10,
              submitOnHash: false,
            },
          }),
        ];

        const result = await vonageVoiceRequest("/calls", "POST", {
          to: [{ type: "phone", number: to }],
          from: { type: "phone", number: VONAGE_FROM_NUMBER },
          ncco,
          event_url: [`${WEBHOOK_BASE_URL}/vonage/events`],
        });

        if (result.ok) {
          return {
            content: [{
              type: "text",
              text: `IVR-Anruf gestartet!
   An: ${to}
   BegrÃ¼Ãung: "${greeting.substring(0, 30)}..."
   MenÃ¼: "${menu_prompt.substring(0, 30)}..."
   Call UUID: ${result.data?.uuid || "N/A"}
   (von: ${getUsername()})`,
            }],
          };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Housecall Script Call (kompletter Workflow)
  // ============================================
  server.tool(
    "housecall_script_call",
    {
      to: z.string().describe("Telefonnummer (E.164 Format)"),
      contact_name: z.string().describe("Name des Kontakts"),
      company_name: z.string().optional().describe("Firmenname"),
      appointment_date: z.string().optional().describe("Vorgeschlagener Termin"),
      script_type: z.enum(["intro", "followup", "reminder", "confirmation"]).describe("Script-Typ"),
      voice: z.string().optional().describe("Stimme"),
      record: z.boolean().optional().describe("Anruf aufnehmen?"),
    },
    async ({ to, contact_name, company_name, appointment_date, script_type, voice, record }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (!VONAGE_APPLICATION_ID || !VONAGE_PRIVATE_KEY) {
        return { content: [{ type: "text", text: "Vonage Voice nicht konfiguriert." }] };
      }

      // Vordefinierte Scripts
      const scripts: Record<string, string> = {
        intro: `Guten Tag ${contact_name}, hier spricht die automatische Terminvermittlung${company_name ? ` von ${company_name}` : ""}. Wir mÃ¶chten Ihnen einen Besichtigungstermin anbieten. DrÃ¼cken Sie die 1 wenn Sie interessiert sind, oder die 2 um einen RÃ¼ckruf zu erhalten.`,
        followup: `Guten Tag ${contact_name}, wir hatten uns kÃ¼rzlich bezÃ¼glich eines Besichtigungstermins gemeldet. Sind Sie noch interessiert? DrÃ¼cken Sie die 1 fÃ¼r Ja, oder die 2 fÃ¼r Nein.`,
        reminder: `Guten Tag ${contact_name}, dies ist eine Erinnerung an Ihren Termin${appointment_date ? ` am ${appointment_date}` : ""}. DrÃ¼cken Sie die 1 um zu bestÃ¤tigen, oder die 2 um umzubuchen.`,
        confirmation: `Guten Tag ${contact_name}, Ihr Termin${appointment_date ? ` am ${appointment_date}` : ""} wurde bestÃ¤tigt. Wir freuen uns auf Sie. Auf WiederhÃ¶ren.`,
      };

      const scriptText = scripts[script_type] || scripts.intro;

      try {
        const ncco: NCCOAction[] = [];

        // Script sprechen
        ncco.push(buildTalkAction(scriptText, {
          voiceName: voice || "Marlene",
          language: "de-DE",
          bargeIn: script_type !== "confirmation",
        }));

        // DTMF Input (auÃer bei BestÃ¤tigung)
        if (script_type !== "confirmation") {
          ncco.push(buildInputAction({
            type: ["dtmf"],
            dtmf: {
              maxDigits: 1,
              timeOut: 15,
              submitOnHash: false,
            },
          }));
        }

        // Optional: Recording
        if (record) {
          ncco.unshift(buildRecordAction({ beepStart: false }));
        }

        const result = await vonageVoiceRequest("/calls", "POST", {
          to: [{ type: "phone", number: to }],
          from: { type: "phone", number: VONAGE_FROM_NUMBER },
          ncco,
          event_url: [`${WEBHOOK_BASE_URL}/vonage/events`],
        });

        if (result.ok) {
          return {
            content: [{
              type: "text",
              text: `Housecall-Script gestartet!
   An: ${to}
   Kontakt: ${contact_name}
   Script: ${script_type}
   Recording: ${record ? "Ja" : "Nein"}
   Call UUID: ${result.data?.uuid || "N/A"}
   (von: ${getUsername()})`,
            }],
          };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Get Call Info
  // ============================================
  server.tool(
    "housecall_call_info",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
    },
    async ({ call_uuid }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const result = await vonageVoiceRequest(`/calls/${call_uuid}`, "GET");

        if (result.ok) {
          const call = result.data;
          return {
            content: [{
              type: "text",
              text: `=== CALL INFO ===
   UUID: ${call.uuid}
   Status: ${call.status}
   Direction: ${call.direction}
   From: ${call.from?.number || "N/A"}
   To: ${call.to?.number || "N/A"}
   Duration: ${call.duration || 0}s
   Start: ${call.start_time || "N/A"}
   End: ${call.end_time || "N/A"}
   Rate: ${call.rate || "N/A"}
   Price: ${call.price || "N/A"}`,
            }],
          };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Hangup Call
  // ============================================
  server.tool(
    "housecall_hangup",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
    },
    async ({ call_uuid }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const result = await vonageVoiceRequest(`/calls/${call_uuid}`, "PUT", {
          action: "hangup",
        });

        if (result.ok || result.status === 204) {
          return { content: [{ type: "text", text: `Anruf ${call_uuid} beendet.` }] };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Mute/Unmute Call
  // ============================================
  server.tool(
    "housecall_mute",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
      mute: z.boolean().describe("true = muten, false = unmuten"),
    },
    async ({ call_uuid, mute }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const result = await vonageVoiceRequest(`/calls/${call_uuid}`, "PUT", {
          action: mute ? "mute" : "unmute",
        });

        if (result.ok || result.status === 204) {
          return { content: [{ type: "text", text: `Anruf ${call_uuid} ${mute ? "stummgeschaltet" : "Stummschaltung aufgehoben"}.` }] };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Transfer Call (NCCO Ã¤ndern)
  // ============================================
  server.tool(
    "housecall_transfer",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
      transfer_to: z.string().describe("Telefonnummer fÃ¼r Transfer"),
      announce_text: z.string().optional().describe("Ansage vor Transfer"),
    },
    async ({ call_uuid, transfer_to, announce_text }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const ncco: NCCOAction[] = [];

        if (announce_text) {
          ncco.push(buildTalkAction(announce_text, {
            voiceName: "Marlene",
            language: "de-DE",
          }));
        }

        ncco.push(buildConnectAction(transfer_to));

        const result = await vonageVoiceRequest(`/calls/${call_uuid}`, "PUT", {
          action: "transfer",
          destination: { type: "ncco", ncco },
        });

        if (result.ok || result.status === 204) {
          return { content: [{ type: "text", text: `Anruf ${call_uuid} wird an ${transfer_to} weitergeleitet.` }] };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Send DTMF to Call
  // ============================================
  server.tool(
    "housecall_send_dtmf",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
      digits: z.string().describe("DTMF Ziffern (0-9, *, #)"),
    },
    async ({ call_uuid, digits }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const result = await vonageVoiceRequest(`/calls/${call_uuid}/dtmf`, "PUT", {
          digits,
        });

        if (result.ok || result.status === 204) {
          return { content: [{ type: "text", text: `DTMF "${digits}" an Anruf ${call_uuid} gesendet.` }] };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: TTS wÃ¤hrend Anruf
  // ============================================
  server.tool(
    "housecall_speak",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
      text: z.string().describe("Text der gesprochen werden soll"),
      voice: z.string().optional().describe("Stimme"),
      loop: z.number().optional().describe("Anzahl Wiederholungen"),
    },
    async ({ call_uuid, text, voice, loop }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const result = await vonageVoiceRequest(`/calls/${call_uuid}/talk`, "PUT", {
          text,
          voice_name: voice || "Marlene",
          loop: loop || 1,
        });

        if (result.ok || result.status === 204) {
          return { content: [{ type: "text", text: `TTS "${text.substring(0, 30)}..." an Anruf ${call_uuid} gesendet.` }] };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: Stop TTS
  // ============================================
  server.tool(
    "housecall_stop_speak",
    {
      call_uuid: z.string().describe("Vonage Call UUID"),
    },
    async ({ call_uuid }) => {
      const authError = authCheck();
      if (authError) return authError;

      try {
        const result = await vonageVoiceRequest(`/calls/${call_uuid}/talk`, "DELETE");

        if (result.ok || result.status === 204) {
          return { content: [{ type: "text", text: `TTS fÃ¼r Anruf ${call_uuid} gestoppt.` }] };
        }

        return { content: [{ type: "text", text: `Fehler: ${JSON.stringify(result.data)}` }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Fehler: ${error instanceof Error ? error.message : "Unknown"}` }] };
      }
    }
  );

  // ============================================
  // TOOL: VerfÃ¼gbare Stimmen auflisten
  // ============================================
  server.tool(
    "housecall_voices",
    {
      language: z.string().optional().describe("Filter nach Sprache (de-DE, en-US, etc.)"),
    },
    async ({ language }) => {
      const authError = authCheck();
      if (authError) return authError;

      // Vonage Premium Stimmen
      const voices = [
        { name: "Marlene", language: "de-DE", gender: "female", style: "Standard" },
        { name: "Hans", language: "de-DE", gender: "male", style: "Standard" },
        { name: "Vicki", language: "de-DE", gender: "female", style: "Neural" },
        { name: "Daniel", language: "de-DE", gender: "male", style: "Neural" },
        { name: "Amy", language: "en-GB", gender: "female", style: "Standard" },
        { name: "Brian", language: "en-GB", gender: "male", style: "Standard" },
        { name: "Emma", language: "en-GB", gender: "female", style: "Neural" },
        { name: "Joanna", language: "en-US", gender: "female", style: "Standard" },
        { name: "Matthew", language: "en-US", gender: "male", style: "Standard" },
        { name: "Ivy", language: "en-US", gender: "female", style: "Neural" },
        { name: "Celine", language: "fr-FR", gender: "female", style: "Standard" },
        { name: "Mathieu", language: "fr-FR", gender: "male", style: "Standard" },
        { name: "Lucia", language: "es-ES", gender: "female", style: "Standard" },
        { name: "Enrique", language: "es-ES", gender: "male", style: "Standard" },
      ];

      const filtered = language
        ? voices.filter(v => v.language === language)
        : voices;

      const text = filtered.map(v =>
        `${v.name} (${v.language}) - ${v.gender} - ${v.style}`
      ).join("\n");

      return {
        content: [{
          type: "text",
          text: `=== VERFÃGBARE STIMMEN ===\n${text}`,
        }],
      };
    }
  );
}
