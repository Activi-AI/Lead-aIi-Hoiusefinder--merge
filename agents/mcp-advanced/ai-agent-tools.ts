import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireAuth } from "./users.js";
import { generateTTS, getTTSProviderStatus, listVoices, TTSProvider, VOICES } from "./tts-providers.js";
import { generateLLMResponse, getLLMProviderStatus, ConversationManager, SYSTEM_PROMPTS, LLMProvider } from "./llm-providers.js";

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
// CONVERSATION MANAGERS (per Agent)
// ============================================

const conversationManagers: Map<string, ConversationManager> = new Map();

function getOrCreateConversation(
  agentId: string,
  provider: LLMProvider,
  systemPrompt: string
): ConversationManager {
  const key = `${agentId}_${provider}`;
  if (!conversationManagers.has(key)) {
    conversationManagers.set(key, new ConversationManager(provider, systemPrompt));
  }
  return conversationManagers.get(key)!;
}

// ============================================
// REGISTER AI AGENT TOOLS
// ============================================

export function registerAIAgentTools(server: McpServer) {

  // ============================================
  // TOOL: AI Provider Status
  // ============================================
  server.tool(
    "ai_config",
    {},
    async () => {
      const authError = authCheck();
      if (authError) return authError;

      const ttsStatus = getTTSProviderStatus();
      const llmStatus = getLLMProviderStatus();

      const text = `=== AI PROVIDER STATUS ===

ð¢ TTS (Text-to-Speech):
   Vonage:     ${ttsStatus.vonage.configured ? "â" : "â"} (built-in)
   OpenAI:     ${ttsStatus.openai.configured ? "â " + ttsStatus.openai.keyPreview : "â nicht konfiguriert"}
   Azure:      ${ttsStatus.azure.configured ? "â " + ttsStatus.azure.keyPreview : "â nicht konfiguriert"}
   Google:     ${ttsStatus.google.configured ? "â " + ttsStatus.google.keyPreview : "â nicht konfiguriert"}
   ElevenLabs: ${ttsStatus.elevenlabs.configured ? "â " + ttsStatus.elevenlabs.keyPreview : "â nicht konfiguriert"}

ð§  LLM (Language Model):
   OpenAI:     ${llmStatus.openai.configured ? "â " + llmStatus.openai.keyPreview : "â nicht konfiguriert"}
   Claude:     ${llmStatus.claude.configured ? "â " + llmStatus.claude.keyPreview : "â nicht konfiguriert"}
   Azure:      ${llmStatus.azure.configured ? "â " + llmStatus.azure.keyPreview : "â nicht konfiguriert"}

ð Konfiguration in .env:
   OPENAI_API_KEY, ANTHROPIC_API_KEY, AZURE_SPEECH_KEY,
   AZURE_OPENAI_KEY, GOOGLE_TTS_API_KEY, ELEVENLABS_API_KEY`;

      return { content: [{ type: "text", text }] };
    }
  );

  // ============================================
  // TOOL: TTS Generate (nur Audio generieren)
  // ============================================
  server.tool(
    "ai_tts_generate",
    {
      text: z.string().describe("Text der in Sprache umgewandelt werden soll"),
      provider: z.enum(["vonage", "openai", "azure", "google", "elevenlabs"]).optional().describe("TTS Provider"),
      voice: z.string().optional().describe("Stimme"),
      language: z.string().optional().describe("Sprache (de-DE, en-US)"),
    },
    async ({ text, provider, voice, language }) => {
      const authError = authCheck();
      if (authError) return authError;

      const ttsProvider = (provider || "openai") as TTSProvider;

      const result = await generateTTS({
        provider: ttsProvider,
        text,
        voice,
        language,
      });

      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `â Audio generiert!
   Provider: ${result.provider}
   Audio URL: ${result.audioUrl || "N/A"}
   Local Path: ${result.localPath || "N/A"}
   (von: ${getUsername()})`,
          }],
        };
      }

      return { content: [{ type: "text", text: `â Fehler: ${result.error}` }] };
    }
  );

  // ============================================
  // TOOL: LLM Chat (Einzelne Anfrage)
  // ============================================
  server.tool(
    "ai_chat",
    {
      message: z.string().describe("Nachricht an das LLM"),
      provider: z.enum(["openai", "claude", "azure"]).optional().describe("LLM Provider"),
      model: z.string().optional().describe("Model (gpt-4, claude-3-5-sonnet, etc.)"),
      context: z.enum(["housecall_default", "housecall_appointment", "housecall_followup", "housecall_support"]).optional().describe("Kontext/System-Prompt"),
      temperature: z.number().optional().describe("KreativitÃ¤t (0-1)"),
    },
    async ({ message, provider, model, context, temperature }) => {
      const authError = authCheck();
      if (authError) return authError;

      const llmProvider = (provider || "openai") as LLMProvider;
      const systemPrompt = SYSTEM_PROMPTS[context as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.housecall_default;

      const result = await generateLLMResponse({
        provider: llmProvider,
        model,
        messages: [{ role: "user", content: message }],
        systemPrompt,
        temperature,
        maxTokens: 200,
      });

      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `ð¤ ${result.provider} (${result.model}):

${result.content}

ð Tokens: ${result.usage?.totalTokens || "N/A"}`,
          }],
        };
      }

      return { content: [{ type: "text", text: `â Fehler: ${result.error}` }] };
    }
  );

  // ============================================
  // TOOL: Conversation Chat (mit History)
  // ============================================
  server.tool(
    "ai_conversation",
    {
      conversation_id: z.string().describe("Eindeutige Conversation ID (z.B. call_uuid)"),
      message: z.string().describe("Nachricht des Anrufers"),
      provider: z.enum(["openai", "claude", "azure"]).optional().describe("LLM Provider"),
      context: z.enum(["housecall_default", "housecall_appointment", "housecall_followup", "housecall_support"]).optional().describe("Kontext"),
    },
    async ({ conversation_id, message, provider, context }) => {
      const authError = authCheck();
      if (authError) return authError;

      const llmProvider = (provider || "openai") as LLMProvider;
      const systemPrompt = SYSTEM_PROMPTS[context as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.housecall_default;

      const manager = getOrCreateConversation(conversation_id, llmProvider, systemPrompt);
      const result = await manager.chat(conversation_id, message);

      if (result.success) {
        const history = manager.getHistory(conversation_id);
        return {
          content: [{
            type: "text",
            text: `ð¤ Agent Response:

${result.content}

ð History: ${history.length} Nachrichten
ð Tokens: ${result.usage?.totalTokens || "N/A"}`,
          }],
        };
      }

      return { content: [{ type: "text", text: `â Fehler: ${result.error}` }] };
    }
  );

  // ============================================
  // TOOL: Clear Conversation
  // ============================================
  server.tool(
    "ai_conversation_clear",
    {
      conversation_id: z.string().describe("Conversation ID"),
    },
    async ({ conversation_id }) => {
      const authError = authCheck();
      if (authError) return authError;

      // Clear from all providers
      for (const [key, manager] of conversationManagers) {
        if (key.startsWith(conversation_id)) {
          manager.clearHistory(conversation_id);
        }
      }

      return { content: [{ type: "text", text: `â Conversation ${conversation_id} gelÃ¶scht.` }] };
    }
  );

  // ============================================
  // TOOL: Full AI Response (LLM + TTS)
  // ============================================
  server.tool(
    "ai_respond",
    {
      conversation_id: z.string().describe("Conversation ID"),
      user_input: z.string().describe("Was der Anrufer gesagt hat"),
      llm_provider: z.enum(["openai", "claude", "azure"]).optional().describe("LLM Provider"),
      tts_provider: z.enum(["vonage", "openai", "azure", "google", "elevenlabs"]).optional().describe("TTS Provider"),
      tts_voice: z.string().optional().describe("Stimme fÃ¼r TTS"),
      context: z.enum(["housecall_default", "housecall_appointment", "housecall_followup", "housecall_support"]).optional().describe("Agent-Kontext"),
    },
    async ({ conversation_id, user_input, llm_provider, tts_provider, tts_voice, context }) => {
      const authError = authCheck();
      if (authError) return authError;

      const llm = (llm_provider || "openai") as LLMProvider;
      const tts = (tts_provider || "openai") as TTSProvider;
      const systemPrompt = SYSTEM_PROMPTS[context as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.housecall_default;

      // 1. Generate LLM Response
      const manager = getOrCreateConversation(conversation_id, llm, systemPrompt);
      const llmResult = await manager.chat(conversation_id, user_input);

      if (!llmResult.success || !llmResult.content) {
        return { content: [{ type: "text", text: `â LLM Fehler: ${llmResult.error}` }] };
      }

      // 2. Generate TTS Audio
      const ttsResult = await generateTTS({
        provider: tts,
        text: llmResult.content,
        voice: tts_voice,
        language: "de-DE",
      });

      return {
        content: [{
          type: "text",
          text: `=== AI RESPONSE ===

ð¥ User Input: "${user_input}"

ð¤ Agent Response:
${llmResult.content}

ð TTS Status: ${ttsResult.success ? "â Audio generiert" : "â " + ttsResult.error}
   Provider: ${ttsResult.provider}
   Audio URL: ${ttsResult.audioUrl || "N/A (use Vonage TTS)"}

ð LLM: ${llmResult.provider} | Tokens: ${llmResult.usage?.totalTokens || "N/A"}`,
        }],
      };
    }
  );

  // ============================================
  // TOOL: List Available Voices
  // ============================================
  server.tool(
    "ai_voices",
    {
      provider: z.enum(["vonage", "openai", "azure", "google", "elevenlabs"]).optional().describe("TTS Provider"),
    },
    async ({ provider }) => {
      const authError = authCheck();
      if (authError) return authError;

      if (provider) {
        const voices = listVoices(provider as TTSProvider);
        const text = voices.map(v =>
          `${v.name} (${v.gender})${v.language ? ` [${v.language}]` : ""}${v.description ? ` - ${v.description}` : ""}`
        ).join("\n");

        return { content: [{ type: "text", text: `=== ${provider.toUpperCase()} STIMMEN ===\n\n${text}` }] };
      }

      // List all providers
      const allVoices: string[] = [];
      for (const p of ["vonage", "openai", "azure", "google", "elevenlabs"] as TTSProvider[]) {
        const voices = listVoices(p);
        if (voices.length > 0) {
          allVoices.push(`\n=== ${p.toUpperCase()} ===`);
          allVoices.push(...voices.map(v => `  ${v.name} (${v.gender})`));
        }
      }

      return { content: [{ type: "text", text: allVoices.join("\n") }] };
    }
  );

  // ============================================
  // TOOL: List System Prompts
  // ============================================
  server.tool(
    "ai_prompts",
    {},
    async () => {
      const authError = authCheck();
      if (authError) return authError;

      const prompts = Object.entries(SYSTEM_PROMPTS).map(([key, value]) =>
        `ð ${key}:\n${value.substring(0, 150)}...`
      ).join("\n\n");

      return { content: [{ type: "text", text: `=== VERFÃGBARE SYSTEM PROMPTS ===\n\n${prompts}` }] };
    }
  );

  // ============================================
  // TOOL: Test AI Pipeline
  // ============================================
  server.tool(
    "ai_test",
    {
      llm_provider: z.enum(["openai", "claude", "azure"]).optional().describe("LLM zu testen"),
      tts_provider: z.enum(["openai", "azure", "google", "elevenlabs"]).optional().describe("TTS zu testen"),
    },
    async ({ llm_provider, tts_provider }) => {
      const authError = authCheck();
      if (authError) return authError;

      const results: string[] = ["=== AI PIPELINE TEST ===\n"];

      // Test LLM
      if (llm_provider) {
        results.push(`\nð§  Testing LLM: ${llm_provider}`);
        const llmResult = await generateLLMResponse({
          provider: llm_provider as LLMProvider,
          messages: [{ role: "user", content: "Sage 'Test erfolgreich' auf Deutsch." }],
          maxTokens: 50,
        });
        results.push(llmResult.success
          ? `   â OK: "${llmResult.content}"`
          : `   â Fehler: ${llmResult.error}`);
      }

      // Test TTS
      if (tts_provider) {
        results.push(`\nð Testing TTS: ${tts_provider}`);
        const ttsResult = await generateTTS({
          provider: tts_provider as TTSProvider,
          text: "Dies ist ein Test.",
        });
        results.push(ttsResult.success
          ? `   â OK: ${ttsResult.audioUrl || ttsResult.localPath}`
          : `   â Fehler: ${ttsResult.error}`);
      }

      if (!llm_provider && !tts_provider) {
        results.push("\nâ ï¸ Bitte llm_provider oder tts_provider angeben.");
      }

      return { content: [{ type: "text", text: results.join("\n") }] };
    }
  );
}
