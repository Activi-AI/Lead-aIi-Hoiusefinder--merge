# Brain MCP Server

MCP-Server fÃ¼r Master-Brain Memory API - funktioniert mit **Claude Code** und **OpenAI Codex**.

## Tools

| Tool | Beschreibung |
|------|--------------|
| `brain_search` | Suche im Memory nach Tags oder Text |
| `brain_append` | Neues Wissen speichern |
| `brain_recent` | Letzte EintrÃ¤ge abrufen |
| `brain_stats` | Statistiken abrufen |

## Installation

### Claude Code

```bash
# MCP-Server registrieren
claude mcp add brain-memory ~/activi-dev-repos/brain-mcp-server/index.js \
  -e BRAIN_API_TOKEN=<TOKEN> \
  -e BRAIN_API_URL=https://brain.activi.io \
  --scope user

# PrÃ¼fen
claude mcp list
```

### OpenAI Codex

FÃ¼r Codex die Tool-Definitionen aus `openai-tools.json` verwenden:

```javascript
const tools = require('./openai-tools.json').tools;

// In OpenAI API Call
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [...],
  tools: tools,
  tool_choice: "auto"
});
```

Dann die Tool-Calls gegen die Brain API ausfÃ¼hren:

```bash
# Beispiel: brain_search
curl -X GET "https://brain.activi.io/memory/search?q=policy" \
  -H "Authorization: Bearer <TOKEN>"

# Beispiel: brain_append
curl -X POST "https://brain.activi.io/memory/append" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type":"decision","content":"...", "tags":["tag1"]}'
```

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|--------------|
| `BRAIN_API_URL` | Brain API URL (default: https://brain.activi.io) |
| `BRAIN_API_TOKEN` | API Token fÃ¼r Authentifizierung |

## Beispiele

### Wissen speichern

```json
{
  "type": "decision",
  "content": "TypeScript fÃ¼r alle neuen Projekte verwenden",
  "tags": ["typescript", "standards", "decision"],
  "refs": ["docs/STANDARDS.md"]
}
```

### Wissen suchen

```json
{
  "query": "typescript",
  "tag": "decision",
  "limit": 5
}
```
