import { writeFileSync, mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, "../data/audio");

// Ensure audio directory exists
if (!existsSync(AUDIO_DIR)) {
  mkdirSync(AUDIO_DIR, { recursive: true });
}

// ============================================
// CONFIGURATION
// ============================================

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

// Azure Speech
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY ?? "";
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION ?? "westeurope";

// Google Cloud TTS
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY ?? "";

// ElevenLabs
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";

// Audio hosting URL (for Vonage to fetch)
const AUDIO_BASE_URL = process.env.AUDIO_BASE_URL ?? "https://your-server.com/audio";

// ============================================
// TYPES
// ============================================

export type TTSProvider = "vonage" | "openai" | "azure" | "google" | "elevenlabs";

export interface TTSOptions {
  provider: TTSProvider;
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
}

export interface TTSResult {
  success: boolean;
  audioUrl?: string;
  localPath?: string;
  error?: string;
  provider: TTSProvider;
  duration?: number;
}

// ============================================
// VOICE MAPPINGS
// ============================================

export const VOICES = {
  openai: {
    alloy: { name: "alloy", gender: "neutral", description: "Neutral, balanced" },
    echo: { name: "echo", gender: "male", description: "Warm, conversational" },
    fable: { name: "fable", gender: "male", description: "British, expressive" },
    onyx: { name: "onyx", gender: "male", description: "Deep, authoritative" },
    nova: { name: "nova", gender: "female", description: "Friendly, upbeat" },
    shimmer: { name: "shimmer", gender: "female", description: "Clear, professional" },
  },
  azure: {
    // German voices
    "de-DE-KatjaNeural": { name: "de-DE-KatjaNeural", gender: "female", language: "de-DE" },
    "de-DE-ConradNeural": { name: "de-DE-ConradNeural", gender: "male", language: "de-DE" },
    "de-DE-AmalaNeural": { name: "de-DE-AmalaNeural", gender: "female", language: "de-DE" },
    "de-DE-BerndNeural": { name: "de-DE-BerndNeural", gender: "male", language: "de-DE" },
    "de-DE-ChristophNeural": { name: "de-DE-ChristophNeural", gender: "male", language: "de-DE" },
    "de-DE-ElkeNeural": { name: "de-DE-ElkeNeural", gender: "female", language: "de-DE" },
    // English voices
    "en-US-JennyNeural": { name: "en-US-JennyNeural", gender: "female", language: "en-US" },
    "en-US-GuyNeural": { name: "en-US-GuyNeural", gender: "male", language: "en-US" },
    "en-GB-SoniaNeural": { name: "en-GB-SoniaNeural", gender: "female", language: "en-GB" },
    "en-GB-RyanNeural": { name: "en-GB-RyanNeural", gender: "male", language: "en-GB" },
  },
  google: {
    // German voices
    "de-DE-Neural2-A": { name: "de-DE-Neural2-A", gender: "female", language: "de-DE" },
    "de-DE-Neural2-B": { name: "de-DE-Neural2-B", gender: "male", language: "de-DE" },
    "de-DE-Neural2-C": { name: "de-DE-Neural2-C", gender: "female", language: "de-DE" },
    "de-DE-Neural2-D": { name: "de-DE-Neural2-D", gender: "male", language: "de-DE" },
    "de-DE-Wavenet-A": { name: "de-DE-Wavenet-A", gender: "female", language: "de-DE" },
    "de-DE-Wavenet-B": { name: "de-DE-Wavenet-B", gender: "male", language: "de-DE" },
    // English voices
    "en-US-Neural2-A": { name: "en-US-Neural2-A", gender: "male", language: "en-US" },
    "en-US-Neural2-C": { name: "en-US-Neural2-C", gender: "female", language: "en-US" },
    "en-US-Neural2-D": { name: "en-US-Neural2-D", gender: "male", language: "en-US" },
    "en-US-Neural2-E": { name: "en-US-Neural2-E", gender: "female", language: "en-US" },
  },
  elevenlabs: {
    rachel: { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", description: "Calm, young" },
    domi: { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", description: "Strong, confident" },
    bella: { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", gender: "female", description: "Soft, gentle" },
    antoni: { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", description: "Well-rounded" },
    elli: { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female", description: "Emotional range" },
    josh: { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", description: "Deep, narrative" },
    arnold: { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", gender: "male", description: "Crisp, professional" },
    adam: { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", description: "Deep, authoritative" },
    sam: { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", gender: "male", description: "Raspy, dynamic" },
  },
  vonage: {
    Marlene: { name: "Marlene", gender: "female", language: "de-DE" },
    Hans: { name: "Hans", gender: "male", language: "de-DE" },
    Vicki: { name: "Vicki", gender: "female", language: "de-DE" },
    Daniel: { name: "Daniel", gender: "male", language: "de-DE" },
  },
};

// ============================================
// OPENAI TTS
// ============================================

async function openaiTTS(text: string, voice: string = "nova", speed: number = 1.0): Promise<TTSResult> {
  if (!OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY nicht konfiguriert", provider: "openai" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        input: text,
        voice: voice.toLowerCase(),
        speed,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `OpenAI Error: ${error}`, provider: "openai" };
    }

    const audioBuffer = await response.arrayBuffer();
    const filename = `openai_${randomUUID()}.mp3`;
    const localPath = path.join(AUDIO_DIR, filename);

    writeFileSync(localPath, Buffer.from(audioBuffer));

    return {
      success: true,
      localPath,
      audioUrl: `${AUDIO_BASE_URL}/${filename}`,
      provider: "openai",
    };
  } catch (error) {
    return { success: false, error: `OpenAI Error: ${error}`, provider: "openai" };
  }
}

// ============================================
// AZURE SPEECH TTS
// ============================================

async function azureTTS(text: string, voice: string = "de-DE-KatjaNeural", language: string = "de-DE"): Promise<TTSResult> {
  if (!AZURE_SPEECH_KEY) {
    return { success: false, error: "AZURE_SPEECH_KEY nicht konfiguriert", provider: "azure" };
  }

  try {
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}">
        <voice name="${voice}">
          ${text}
        </voice>
      </speak>
    `;

    const response = await fetch(
      `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        },
        body: ssml,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Azure Error: ${error}`, provider: "azure" };
    }

    const audioBuffer = await response.arrayBuffer();
    const filename = `azure_${randomUUID()}.mp3`;
    const localPath = path.join(AUDIO_DIR, filename);

    writeFileSync(localPath, Buffer.from(audioBuffer));

    return {
      success: true,
      localPath,
      audioUrl: `${AUDIO_BASE_URL}/${filename}`,
      provider: "azure",
    };
  } catch (error) {
    return { success: false, error: `Azure Error: ${error}`, provider: "azure" };
  }
}

// ============================================
// GOOGLE CLOUD TTS
// ============================================

async function googleTTS(text: string, voice: string = "de-DE-Neural2-A", language: string = "de-DE"): Promise<TTSResult> {
  if (!GOOGLE_TTS_API_KEY) {
    return { success: false, error: "GOOGLE_TTS_API_KEY nicht konfiguriert", provider: "google" };
  }

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: language,
            name: voice,
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.0,
            pitch: 0,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Google Error: ${error}`, provider: "google" };
    }

    const data = await response.json();
    const audioBuffer = Buffer.from(data.audioContent, "base64");
    const filename = `google_${randomUUID()}.mp3`;
    const localPath = path.join(AUDIO_DIR, filename);

    writeFileSync(localPath, audioBuffer);

    return {
      success: true,
      localPath,
      audioUrl: `${AUDIO_BASE_URL}/${filename}`,
      provider: "google",
    };
  } catch (error) {
    return { success: false, error: `Google Error: ${error}`, provider: "google" };
  }
}

// ============================================
// ELEVENLABS TTS
// ============================================

async function elevenlabsTTS(text: string, voice: string = "rachel"): Promise<TTSResult> {
  if (!ELEVENLABS_API_KEY) {
    return { success: false, error: "ELEVENLABS_API_KEY nicht konfiguriert", provider: "elevenlabs" };
  }

  try {
    // Get voice ID from name
    const voiceConfig = VOICES.elevenlabs[voice.toLowerCase() as keyof typeof VOICES.elevenlabs];
    const voiceId = voiceConfig?.id || voice; // Use voice as ID if not found in mapping

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `ElevenLabs Error: ${error}`, provider: "elevenlabs" };
    }

    const audioBuffer = await response.arrayBuffer();
    const filename = `elevenlabs_${randomUUID()}.mp3`;
    const localPath = path.join(AUDIO_DIR, filename);

    writeFileSync(localPath, Buffer.from(audioBuffer));

    return {
      success: true,
      localPath,
      audioUrl: `${AUDIO_BASE_URL}/${filename}`,
      provider: "elevenlabs",
    };
  } catch (error) {
    return { success: false, error: `ElevenLabs Error: ${error}`, provider: "elevenlabs" };
  }
}

// ============================================
// MAIN TTS FUNCTION
// ============================================

export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
  const { provider, text, voice, language, speed } = options;

  switch (provider) {
    case "openai":
      return openaiTTS(text, voice || "nova", speed || 1.0);

    case "azure":
      return azureTTS(text, voice || "de-DE-KatjaNeural", language || "de-DE");

    case "google":
      return googleTTS(text, voice || "de-DE-Neural2-A", language || "de-DE");

    case "elevenlabs":
      return elevenlabsTTS(text, voice || "rachel");

    case "vonage":
    default:
      // Vonage TTS is handled directly in NCCO, return placeholder
      return {
        success: true,
        provider: "vonage",
        audioUrl: undefined, // Will use NCCO talk action instead
      };
  }
}

// ============================================
// PROVIDER STATUS CHECK
// ============================================

export function getTTSProviderStatus(): Record<TTSProvider, { configured: boolean; keyPreview?: string }> {
  return {
    vonage: { configured: true }, // Always available via Vonage Voice API
    openai: {
      configured: !!OPENAI_API_KEY,
      keyPreview: OPENAI_API_KEY ? `${OPENAI_API_KEY.slice(0, 8)}...` : undefined,
    },
    azure: {
      configured: !!AZURE_SPEECH_KEY,
      keyPreview: AZURE_SPEECH_KEY ? `${AZURE_SPEECH_KEY.slice(0, 8)}...` : undefined,
    },
    google: {
      configured: !!GOOGLE_TTS_API_KEY,
      keyPreview: GOOGLE_TTS_API_KEY ? `${GOOGLE_TTS_API_KEY.slice(0, 8)}...` : undefined,
    },
    elevenlabs: {
      configured: !!ELEVENLABS_API_KEY,
      keyPreview: ELEVENLABS_API_KEY ? `${ELEVENLABS_API_KEY.slice(0, 8)}...` : undefined,
    },
  };
}

// ============================================
// LIST VOICES FOR PROVIDER
// ============================================

export function listVoices(provider: TTSProvider): { name: string; gender: string; description?: string; language?: string }[] {
  const providerVoices = VOICES[provider];
  if (!providerVoices) return [];

  return Object.values(providerVoices).map((v: any) => ({
    name: v.name || v.id,
    gender: v.gender,
    description: v.description,
    language: v.language,
  }));
}
