# Integriertes Housefinder-Lead-AI System

## Übersicht
Dieses Repository ist ein Merge aus Housefinder, lead-builder-mcp, lead-ai-mcp und Lead-aIi-Hoiusefinder--merge. Es erweitert bestehende Funktionen ohne Überschreibungen von UI/Frontends.

## Module
- **Housefinder (src/housefinder/)**: Automatisierte Unterkunftssuche für Monteure mit KI-Agenten (Python).
- **MCP Server (src/mcp/)**:
  - lead-builder: Lead-Management (TypeScript).
  - lead-ai: Lead-AI mit Integrationen wie Vonage, Sipgate, Scraper (TypeScript).
- **UI/Frontend**: Erweiterte HTML/CSS aus Lead-aIi-Hoiusefinder--merge (ui/).
- **Tools/Infra**: Zusätzliche Tools und Infrastruktur (tools/, infra/).

## Installation
1. Python-Abhängigkeiten: `pip install -r requirements.txt`
2. Node.js-Abhängigkeiten: `npm install`
3. Starte: Siehe infra/docker-compose.yml

## Funktionen
- KI-gestützte Unterkunftssuche.
- MCP-basierte Lead-Building mit Integrationen.
- Erweiterbare UI ohne Überschreibungen.

## Erweiterungen
Dieses System erweitert sich kontinuierlich. Neue Module können hinzugefügt werden, ohne bestehende zu ändern.

## Erweiterte MCP-Server aus LEAD-AI-COMPLETE
Zusätzlich integriert wurden vollständige MCP-Server-Implementierungen aus der lokalen Extraktion:
- **agents/brain-mcp-server/**: Brain-basierter MCP-Server.
- **agents/lead-ai-mcp/**: Lead-AI MCP-Server mit Scraper und Call-Tools.
- **agents/mcp-advanced/**: Erweiterte MCP-Funktionen.
- **agents/mega-merge-mcp/**: Mega-Merge MCP-Server.
- **agents/call-agents-platform/**: Plattform für Call-Agenten.
- **ops/server-configs/**: Server-Konfigurationen.
- **eval/tests/**: Tests für die Implementierungen.
- **integrations/credentials-examples/**: Beispiele für Credentials.
- **ops/development/**: Entwicklungs-Setups.
- **docs/merged_local_docs/**: Zusätzliche Dokumentation.

## 📊 Extraktions-Statistiken (aus LEAD-AI-COMPLETE)
| Metrik | Wert |
|--------|------|
| Tokens analysiert | 2,556,317 |
| Teile verarbeitet | 50 |