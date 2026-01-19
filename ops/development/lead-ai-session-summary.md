# Lead-AI Housefinder - Session Summary
**Datum:** 17.-18. Januar 2026

---

## Server & Deployment

| Service | Server | Port | Status |
|---------|--------|------|--------|
| MCP Backend | 46.224.147.155 | stdio | online |
| Frontend | 46.224.147.155 | 3010 | online |

**Frontend URL:** http://46.224.147.155:3010

---

## GitHub Repos

| Repo | URL | Visibility |
|------|-----|------------|
| MCP Server | https://github.com/dsactivi-2/lead-ai-mcp | PUBLIC |
| Full Project | https://github.com/dsactivi-2/Lead-aIi-Hoiusefinder--merge | PUBLIC |

---

## Login-Daten

**MCP Server Auth:**
| Username | Passwort | Rolle |
|----------|----------|-------|
| admin | Admin2026! | admin |
| denis | Denis2026! | admin |

**SSH Zugang:**
```bash
ssh -i ~/.ssh/id_ed25519_cloudagents root@46.224.147.155
```

---

## Konfigurierte API Keys (.env auf Server)

| Provider | Variable | Status |
|----------|----------|--------|
| Vonage | VONAGE_API_KEY | â |
| Sipgate | SIPGATE_TOKEN | â |
| OpenAI | OPENAI_API_KEY | â |
| Claude | ANTHROPIC_API_KEY | â |
| ElevenLabs | ELEVENLABS_API_KEY | â |
| Google TTS | GOOGLE_TTS_API_KEY | â |

---

## MCP Backend Tools (68 Total)

### AUTH (6)
- auth_login, auth_logout, auth_status
- auth_create_user, auth_delete_user, auth_list_users

### AI AGENT (9)
- ai_config - Provider Status
- ai_tts_generate - TTS generieren (OpenAI/ElevenLabs/Google/Vonage)
- ai_chat - LLM Chat (OpenAI/Claude)
- ai_conversation - Multi-Turn Dialog mit History
- ai_conversation_clear - Dialog lÃ¶schen
- ai_respond - Komplette Pipeline (LLM â TTS)
- ai_voices - VerfÃ¼gbare Stimmen
- ai_prompts - System Prompts
- ai_test - AI Pipeline testen

### CALL SYSTEM (13)
- trigger_create, trigger_list, trigger_toggle
- queue_add, queue_list, queue_process_next
- history_add, history_update, history_list, history_stats
- retry_rule_create, retry_rule_list, queue_handle_result

### CALL TOOLS (8)
- call_config - Telefon-Konfiguration
- call_vonage_sms, call_vonage_dial, call_vonage_balance
- call_sipgate_dial, call_sipgate_sms, call_sipgate_info
- call_make_trigger - Make.com Webhook

### HOUSECALL (11)
- housecall_tts_call - TTS Anruf starten
- housecall_ivr_call - IVR MenÃ¼ Anruf
- housecall_script_call - Skript-basierter Anruf
- housecall_call_info - Call Info abrufen
- housecall_hangup - Auflegen
- housecall_mute - Stumm schalten
- housecall_transfer - Weiterleiten
- housecall_send_dtmf - DTMF TÃ¶ne senden
- housecall_speak - WÃ¤hrend Call sprechen
- housecall_stop_speak - Sprechen stoppen
- housecall_voices - Vonage Stimmen

### SCRAPER (6)
- scraper_portals, scraper_housing, scraper_jobs
- scraper_login, scraper_custom, scraper_close

### LEAD BUILDER (10)
- lb_health, lb_stats
- lb_campaigns, lb_campaign_create, lb_campaign_stats
- lb_leads, lb_lead_create
- lb_communications, lb_sources, lb_templates

### CLOUD AGENTS (7)
- ca_health, ca_agents_status, ca_tasks_list
- ca_chat_send, ca_brain_search, ca_brain_ingest, ca_brain_stats

### OPS (3)
- ops_pm2_status, ops_pm2_logs, ops_server_stats

---

## Frontend Seiten (6)

| Seite | URL |
|-------|-----|
| Home | http://46.224.147.155:3010/ |
| Candidates | http://46.224.147.155:3010/candidates |
| Deals | http://46.224.147.155:3010/deals |
| Housing | http://46.224.147.155:3010/housing |
| Lead Builder | http://46.224.147.155:3010/lead-builder |
| Negotiations | http://46.224.147.155:3010/negotiations |

---

## MCP Client Konfiguration

FÃ¼r Claude Desktop (`~/.config/claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "lead-ai": {
      "command": "ssh",
      "args": [
        "-i", "~/.ssh/id_ed25519_cloudagents",
        "root@46.224.147.155",
        "cd /root/lead-ai-mcp && npx tsx src/server.ts"
      ]
    }
  }
}
```

---

## Dateien auf Server

```
/root/lead-ai-mcp/          # MCP Backend
âââ src/
â   âââ server.ts           # Hauptserver v2.3.0
â   âââ ai-agent-tools.ts   # AI Chat, TTS, Conversations
â   âââ llm-providers.ts    # OpenAI, Claude, Azure
â   âââ tts-providers.ts    # Multi-Provider TTS
â   âââ housecall-tools.ts  # Vonage Voice, IVR
â   âââ call-system.ts      # Triggers, Queue, History
â   âââ call-tools.ts       # Vonage, Sipgate, Make
â   âââ auth-tools.ts       # Login System
â   âââ scraper-tools.ts    # Web Scraper
â   âââ users.ts            # User Management
âââ data/
â   âââ users.json          # User Datenbank
âââ .env                    # API Keys

/root/lead-ai-frontend/     # Next.js Frontend
âââ src/
â   âââ app/                # Seiten
â   âââ components/         # UI Komponenten
â   âââ lib/                # API Client
âââ package.json
```

---

## Was wurde gemacht (Chronologisch)

### Tag 1 (17. Januar)
1. MCP Server aufgesetzt auf 46.224.147.155
2. Vonage VoIP Integration (SMS + Voice mit JWT)
3. Sipgate Integration
4. Git Repo erstellt und gepusht

### Tag 2 (18. Januar)
1. Call System gebaut (Triggers, Queue, History, Retry)
2. Housecall Agent Tools (TTS, IVR, DTMF, Scripts)
3. Multi-Provider TTS integriert (OpenAI, Azure, Google, ElevenLabs)
4. Multi-Provider LLM integriert (OpenAI GPT-4, Claude, Azure)
5. AI Agent Tools erstellt (ai_chat, ai_respond, ai_conversation)
6. Alle API Keys konfiguriert
7. Frontend deployed auf Port 3010
8. GitHub Repos public gemacht
9. Neue Login-Daten erstellt

---

## NÃ¤chste Schritte (Optional)

- [ ] AI Pipeline testen mit echten Calls
- [ ] Webhooks fÃ¼r eingehende Anrufe einrichten
- [ ] Frontend mit Backend verbinden
- [ ] Weitere Scraper-Quellen hinzufÃ¼gen

---

*Erstellt: 18. Januar 2026*
