// ============================================
// LLM PROVIDERS - OpenAI, Claude, Azure OpenAI
// ============================================

// ============================================
// CONFIGURATION
// ============================================

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

// Anthropic Claude
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// Azure OpenAI
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY ?? "";
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4";

// ============================================
// TYPES
// ============================================

export type LLMProvider = "openai" | "claude" | "azure";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  provider: LLMProvider;
  model?: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMResult {
  success: boolean;
  content?: string;
  error?: string;
  provider: LLMProvider;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================
// SYSTEM PROMPTS FOR HOUSECALL AGENT
// ============================================

export const SYSTEM_PROMPTS = {
  // Allgemeiner Housecall-Agent
  housecall_default: `Du bist ein freundlicher und professioneller Telefonassistent fÃ¼r Immobilienbesichtigungen.

WICHTIGE REGELN:
- Antworte IMMER auf Deutsch
- Halte deine Antworten KURZ (max. 2-3 SÃ¤tze)
- Sei hÃ¶flich aber effizient
- Frage nach konkreten Terminen
- BestÃ¤tige immer wichtige Informationen

DEINE AUFGABEN:
1. BegrÃ¼Ãe den Anrufer freundlich
2. Frage nach dem gewÃ¼nschten Besichtigungstermin
3. Notiere Name und Kontaktdaten
4. BestÃ¤tige den Termin

Bei Fragen auÃerhalb deines Bereichs: "Das kann ich leider nicht beantworten. MÃ¶chten Sie mit einem Mitarbeiter sprechen?"`,

  // Termin-Vereinbarung
  housecall_appointment: `Du bist ein Terminassistent fÃ¼r Hausbesichtigungen.

KONTEXT:
- Du rufst potenzielle Interessenten an
- Du mÃ¶chtest einen Besichtigungstermin vereinbaren
- VerfÃ¼gbare Zeiten: Montag-Freitag 9-18 Uhr, Samstag 10-14 Uhr

GESPRÃCHSABLAUF:
1. BegrÃ¼Ãung mit Namen des Kontakts
2. Kurze Vorstellung des Objekts
3. Terminvorschlag machen
4. Bei Interesse: Termin bestÃ¤tigen
5. Bei Ablehnung: HÃ¶flich verabschieden

ANTWORTE IMMER AUF DEUTSCH UND KURZ (max. 2 SÃ¤tze).`,

  // Follow-Up Call
  housecall_followup: `Du bist ein Follow-Up Assistent.

KONTEXT:
- Der Kontakt wurde bereits kontaktiert
- Du mÃ¶chtest nachfragen ob noch Interesse besteht

GESPRÃCHSABLAUF:
1. HÃ¶fliche Erinnerung an vorherigen Kontakt
2. Frage ob noch Interesse besteht
3. Bei Ja: Neuen Termin anbieten
4. Bei Nein: HÃ¶flich verabschieden

ANTWORTE IMMER AUF DEUTSCH UND KURZ.`,

  // Kunden-Support
  housecall_support: `Du bist ein Kundenservice-Assistent.

DEINE FÃHIGKEITEN:
- Fragen zu Objekten beantworten
- Termine umbuchen
- Beschwerden aufnehmen
- An Mitarbeiter weiterleiten

Bei komplexen Anfragen: "Ich verbinde Sie gerne mit einem Kollegen."

ANTWORTE IMMER AUF DEUTSCH UND KURZ.`,
};

// ============================================
// OPENAI GPT
// ============================================

async function openaiChat(options: LLMOptions): Promise<LLMResult> {
  if (!OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY nicht konfiguriert", provider: "openai" };
  }

  try {
    const model = options.model || "gpt-4-turbo-preview";

    const messages = options.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }, ...options.messages]
      : options.messages;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 150,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `OpenAI Error: ${error}`, provider: "openai" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return {
      success: true,
      content,
      provider: "openai",
      model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    return { success: false, error: `OpenAI Error: ${error}`, provider: "openai" };
  }
}

// ============================================
// ANTHROPIC CLAUDE
// ============================================

async function claudeChat(options: LLMOptions): Promise<LLMResult> {
  if (!ANTHROPIC_API_KEY) {
    return { success: false, error: "ANTHROPIC_API_KEY nicht konfiguriert", provider: "claude" };
  }

  try {
    const model = options.model || "claude-3-5-sonnet-20241022";

    // Convert messages format for Claude
    const claudeMessages = options.messages.map(m => ({
      role: m.role === "system" ? "user" : m.role,
      content: m.content,
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 150,
        system: options.systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Claude Error: ${error}`, provider: "claude" };
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    return {
      success: true,
      content,
      provider: "claude",
      model,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  } catch (error) {
    return { success: false, error: `Claude Error: ${error}`, provider: "claude" };
  }
}

// ============================================
// AZURE OPENAI
// ============================================

async function azureOpenaiChat(options: LLMOptions): Promise<LLMResult> {
  if (!AZURE_OPENAI_KEY || !AZURE_OPENAI_ENDPOINT) {
    return { success: false, error: "AZURE_OPENAI_KEY oder AZURE_OPENAI_ENDPOINT nicht konfiguriert", provider: "azure" };
  }

  try {
    const deployment = options.model || AZURE_OPENAI_DEPLOYMENT;

    const messages = options.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }, ...options.messages]
      : options.messages;

    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": AZURE_OPENAI_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 150,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Azure OpenAI Error: ${error}`, provider: "azure" };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return {
      success: true,
      content,
      provider: "azure",
      model: deployment,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    return { success: false, error: `Azure OpenAI Error: ${error}`, provider: "azure" };
  }
}

// ============================================
// MAIN LLM FUNCTION
// ============================================

export async function generateLLMResponse(options: LLMOptions): Promise<LLMResult> {
  const { provider } = options;

  switch (provider) {
    case "openai":
      return openaiChat(options);

    case "claude":
      return claudeChat(options);

    case "azure":
      return azureOpenaiChat(options);

    default:
      return { success: false, error: `Unbekannter Provider: ${provider}`, provider };
  }
}

// ============================================
// PROVIDER STATUS CHECK
// ============================================

export function getLLMProviderStatus(): Record<LLMProvider, { configured: boolean; keyPreview?: string }> {
  return {
    openai: {
      configured: !!OPENAI_API_KEY,
      keyPreview: OPENAI_API_KEY ? `${OPENAI_API_KEY.slice(0, 8)}...` : undefined,
    },
    claude: {
      configured: !!ANTHROPIC_API_KEY,
      keyPreview: ANTHROPIC_API_KEY ? `${ANTHROPIC_API_KEY.slice(0, 8)}...` : undefined,
    },
    azure: {
      configured: !!(AZURE_OPENAI_KEY && AZURE_OPENAI_ENDPOINT),
      keyPreview: AZURE_OPENAI_KEY ? `${AZURE_OPENAI_KEY.slice(0, 8)}...` : undefined,
    },
  };
}

// ============================================
// CONVERSATION MANAGER
// ============================================

export class ConversationManager {
  private conversations: Map<string, Message[]> = new Map();
  private provider: LLMProvider;
  private systemPrompt: string;
  private model?: string;

  constructor(provider: LLMProvider, systemPrompt: string, model?: string) {
    this.provider = provider;
    this.systemPrompt = systemPrompt;
    this.model = model;
  }

  async chat(conversationId: string, userMessage: string): Promise<LLMResult> {
    // Get or create conversation history
    let messages = this.conversations.get(conversationId) || [];

    // Add user message
    messages.push({ role: "user", content: userMessage });

    // Generate response
    const result = await generateLLMResponse({
      provider: this.provider,
      model: this.model,
      messages,
      systemPrompt: this.systemPrompt,
      temperature: 0.7,
      maxTokens: 150,
    });

    // Add assistant response to history
    if (result.success && result.content) {
      messages.push({ role: "assistant", content: result.content });
      this.conversations.set(conversationId, messages);
    }

    return result;
  }

  getHistory(conversationId: string): Message[] {
    return this.conversations.get(conversationId) || [];
  }

  clearHistory(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  clearAll(): void {
    this.conversations.clear();
  }
}

// ============================================
// QUICK RESPONSE GENERATOR
// ============================================

export async function quickResponse(
  text: string,
  context: string = "housecall_default",
  provider: LLMProvider = "openai"
): Promise<string> {
  const systemPrompt = SYSTEM_PROMPTS[context as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.housecall_default;

  const result = await generateLLMResponse({
    provider,
    messages: [{ role: "user", content: text }],
    systemPrompt,
    maxTokens: 100,
  });

  return result.content || "Entschuldigung, ich konnte keine Antwort generieren.";
}
