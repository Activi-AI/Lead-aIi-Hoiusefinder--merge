import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireAuth } from "./users.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "../data/calls.db"));

// ============================================
// DATABASE SETUP
// ============================================

db.exec(`
  -- Triggers: Wann soll ein Agent anrufen?
  CREATE TABLE IF NOT EXISTS triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    time_start TEXT DEFAULT '09:00',
    time_end TEXT DEFAULT '18:00',
    days TEXT DEFAULT 'Mo,Di,Mi,Do,Fr',
    timezone TEXT DEFAULT 'Europe/Berlin',
    conditions TEXT DEFAULT '{}',
    priority INTEGER DEFAULT 5,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Call Queue: Geplante Anrufe
  CREATE TABLE IF NOT EXISTS call_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    trigger_id INTEGER,
    phone TEXT NOT NULL,
    contact_name TEXT,
    contact_data TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    scheduled_at TEXT,
    attempt INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TEXT,
    next_retry_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trigger_id) REFERENCES triggers(id)
  );

  -- Call History: Alle Anrufe
  CREATE TABLE IF NOT EXISTS call_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_id INTEGER,
    agent_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    contact_name TEXT,
    direction TEXT DEFAULT 'outbound',
    provider TEXT,
    call_uuid TEXT,
    session_id TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    answered_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'initiated',
    result TEXT,
    recording_url TEXT,
    transcript TEXT,
    notes TEXT,
    triggered_by TEXT,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (queue_id) REFERENCES call_queue(id)
  );

  -- Retry Rules
  CREATE TABLE IF NOT EXISTS retry_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    call_result TEXT NOT NULL,
    retry_after_minutes INTEGER DEFAULT 60,
    max_retries INTEGER DEFAULT 3,
    change_time_slot INTEGER DEFAULT 0,
    escalate_after INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_queue_status ON call_queue(status);
  CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON call_queue(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_history_phone ON call_history(phone);
  CREATE INDEX IF NOT EXISTS idx_history_agent ON call_history(agent_id);
`);

// ============================================
// HELPER FUNCTIONS
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
// REGISTER CALL SYSTEM TOOLS
// ============================================

export function registerCallSystemTools(server: McpServer) {

  // === TRIGGER MANAGEMENT ===

  server.tool(
    "trigger_create",
    {
      agent_id: z.string().describe("Agent ID"),
      name: z.string().describe("Trigger Name"),
      time_start: z.string().optional().describe("Startzeit (HH:MM)"),
      time_end: z.string().optional().describe("Endzeit (HH:MM)"),
      days: z.string().optional().describe("Tage (Mo,Di,Mi,Do,Fr)"),
      conditions: z.string().optional().describe("Bedingungen als JSON"),
      priority: z.number().optional().describe("Prioritaet (1-10)"),
    },
    async (params) => {
      const authError = authCheck();
      if (authError) return authError;

      const stmt = db.prepare(`
        INSERT INTO triggers (agent_id, name, time_start, time_end, days, conditions, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        params.agent_id,
        params.name,
        params.time_start || "09:00",
        params.time_end || "18:00",
        params.days || "Mo,Di,Mi,Do,Fr",
        params.conditions || "{}",
        params.priority || 5
      );

      return {
        content: [{
          type: "text",
          text: `Trigger erstellt! ID: ${result.lastInsertRowid}, Agent: ${params.agent_id}, Name: ${params.name}`,
        }],
      };
    }
  );

  server.tool(
    "trigger_list",
    { agent_id: z.string().optional().describe("Filter nach Agent ID") },
    async ({ agent_id }) => {
      const authError = authCheck();
      if (authError) return authError;

      const triggers = agent_id
        ? db.prepare("SELECT * FROM triggers WHERE agent_id = ?").all(agent_id)
        : db.prepare("SELECT * FROM triggers").all();

      if (triggers.length === 0) {
        return { content: [{ type: "text", text: "Keine Trigger gefunden." }] };
      }

      const text = triggers.map((t: any) =>
        `#${t.id} ${t.name} (${t.agent_id}) - ${t.enabled ? "Aktiv" : "Deaktiviert"} - ${t.time_start}-${t.time_end} ${t.days}`
      ).join("\n");

      return { content: [{ type: "text", text: "=== TRIGGERS ===\n" + text }] };
    }
  );

  server.tool(
    "trigger_toggle",
    {
      trigger_id: z.number().describe("Trigger ID"),
      enabled: z.boolean().describe("Aktivieren oder Deaktivieren"),
    },
    async ({ trigger_id, enabled }) => {
      const authError = authCheck();
      if (authError) return authError;

      db.prepare("UPDATE triggers SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(enabled ? 1 : 0, trigger_id);

      return {
        content: [{ type: "text", text: `Trigger #${trigger_id} ${enabled ? "aktiviert" : "deaktiviert"}` }],
      };
    }
  );

  // === CALL QUEUE ===

  server.tool(
    "queue_add",
    {
      agent_id: z.string().describe("Agent ID"),
      phone: z.string().describe("Telefonnummer"),
      contact_name: z.string().optional().describe("Kontaktname"),
      contact_data: z.string().optional().describe("Kontaktdaten als JSON"),
      priority: z.number().optional().describe("Prioritaet (1-10)"),
      scheduled_at: z.string().optional().describe("Geplante Zeit (ISO 8601)"),
      trigger_id: z.number().optional().describe("Verknuepfter Trigger"),
    },
    async (params) => {
      const authError = authCheck();
      if (authError) return authError;

      const stmt = db.prepare(`
        INSERT INTO call_queue (agent_id, phone, contact_name, contact_data, priority, scheduled_at, trigger_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        params.agent_id,
        params.phone,
        params.contact_name || null,
        params.contact_data || "{}",
        params.priority || 5,
        params.scheduled_at || null,
        params.trigger_id || null
      );

      return {
        content: [{
          type: "text",
          text: `Anruf zur Queue hinzugefuegt! ID: ${result.lastInsertRowid}, Telefon: ${params.phone}`,
        }],
      };
    }
  );

  server.tool(
    "queue_list",
    {
      agent_id: z.string().optional().describe("Filter nach Agent"),
      status: z.string().optional().describe("Filter nach Status"),
      limit: z.number().optional().describe("Max Anzahl"),
    },
    async ({ agent_id, status, limit }) => {
      const authError = authCheck();
      if (authError) return authError;

      let query = "SELECT * FROM call_queue WHERE 1=1";
      const params: any[] = [];

      if (agent_id) { query += " AND agent_id = ?"; params.push(agent_id); }
      if (status) { query += " AND status = ?"; params.push(status); }
      query += " ORDER BY priority DESC, scheduled_at ASC LIMIT ?";
      params.push(limit || 50);

      const queue = db.prepare(query).all(...params);

      if (queue.length === 0) {
        return { content: [{ type: "text", text: "Queue ist leer." }] };
      }

      const text = queue.map((q: any) =>
        `#${q.id} ${q.phone} (${q.contact_name || "Unbekannt"}) - ${q.status} - Versuch ${q.attempt}/${q.max_attempts}`
      ).join("\n");

      return { content: [{ type: "text", text: "=== CALL QUEUE ===\n" + text }] };
    }
  );

  server.tool(
    "queue_process_next",
    { agent_id: z.string().describe("Agent ID") },
    async ({ agent_id }) => {
      const authError = authCheck();
      if (authError) return authError;

      const next = db.prepare(`
        SELECT * FROM call_queue
        WHERE agent_id = ? AND status IN ('pending', 'retry')
          AND (scheduled_at IS NULL OR scheduled_at <= datetime('now'))
        ORDER BY priority DESC, created_at ASC LIMIT 1
      `).get(agent_id) as any;

      if (!next) {
        return { content: [{ type: "text", text: "Keine Anrufe in der Queue." }] };
      }

      db.prepare(`
        UPDATE call_queue SET status = 'in_progress', attempt = attempt + 1, last_attempt_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(next.id);

      return {
        content: [{
          type: "text",
          text: `Naechster Anruf: Queue #${next.id}, Telefon: ${next.phone}, Kontakt: ${next.contact_name || "Unbekannt"}, Versuch: ${next.attempt + 1}/${next.max_attempts}`,
        }],
      };
    }
  );

  // === CALL HISTORY ===

  server.tool(
    "history_add",
    {
      queue_id: z.number().optional().describe("Queue ID"),
      agent_id: z.string().describe("Agent ID"),
      phone: z.string().describe("Telefonnummer"),
      contact_name: z.string().optional().describe("Kontaktname"),
      provider: z.string().describe("Provider (vonage/sipgate)"),
      call_uuid: z.string().optional().describe("Vonage Call UUID"),
      session_id: z.string().optional().describe("Sipgate Session ID"),
      status: z.string().optional().describe("Status"),
    },
    async (params) => {
      const authError = authCheck();
      if (authError) return authError;

      const stmt = db.prepare(`
        INSERT INTO call_history (queue_id, agent_id, phone, contact_name, provider, call_uuid, session_id, status, triggered_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        params.queue_id || null, params.agent_id, params.phone, params.contact_name || null,
        params.provider, params.call_uuid || null, params.session_id || null,
        params.status || "initiated", getUsername()
      );

      return { content: [{ type: "text", text: `Call History Eintrag erstellt: #${result.lastInsertRowid}` }] };
    }
  );

  server.tool(
    "history_update",
    {
      history_id: z.number().describe("History ID"),
      status: z.string().optional().describe("Neuer Status"),
      result: z.string().optional().describe("Ergebnis"),
      duration_seconds: z.number().optional().describe("Dauer in Sekunden"),
      recording_url: z.string().optional().describe("Recording URL"),
      notes: z.string().optional().describe("Notizen"),
    },
    async (params) => {
      const authError = authCheck();
      if (authError) return authError;

      const updates: string[] = [];
      const values: any[] = [];

      if (params.status) {
        updates.push("status = ?"); values.push(params.status);
        if (params.status === "answered") updates.push("answered_at = CURRENT_TIMESTAMP");
        if (["completed", "failed", "no_answer", "busy", "rejected"].includes(params.status)) {
          updates.push("ended_at = CURRENT_TIMESTAMP");
        }
      }
      if (params.result) { updates.push("result = ?"); values.push(params.result); }
      if (params.duration_seconds !== undefined) { updates.push("duration_seconds = ?"); values.push(params.duration_seconds); }
      if (params.recording_url) { updates.push("recording_url = ?"); values.push(params.recording_url); }
      if (params.notes) { updates.push("notes = ?"); values.push(params.notes); }

      if (updates.length === 0) {
        return { content: [{ type: "text", text: "Keine Updates angegeben." }] };
      }

      values.push(params.history_id);
      db.prepare(`UPDATE call_history SET ${updates.join(", ")} WHERE id = ?`).run(...values);

      return { content: [{ type: "text", text: `Call History #${params.history_id} aktualisiert` }] };
    }
  );

  server.tool(
    "history_list",
    {
      agent_id: z.string().optional().describe("Filter nach Agent"),
      phone: z.string().optional().describe("Filter nach Telefonnummer"),
      status: z.string().optional().describe("Filter nach Status"),
      limit: z.number().optional().describe("Max Anzahl"),
    },
    async ({ agent_id, phone, status, limit }) => {
      const authError = authCheck();
      if (authError) return authError;

      let query = "SELECT * FROM call_history WHERE 1=1";
      const params: any[] = [];

      if (agent_id) { query += " AND agent_id = ?"; params.push(agent_id); }
      if (phone) { query += " AND phone = ?"; params.push(phone); }
      if (status) { query += " AND status = ?"; params.push(status); }
      query += " ORDER BY started_at DESC LIMIT ?";
      params.push(limit || 50);

      const history = db.prepare(query).all(...params);

      if (history.length === 0) {
        return { content: [{ type: "text", text: "Keine Anrufe in der History." }] };
      }

      const text = history.map((h: any) =>
        `#${h.id} ${h.phone} (${h.provider}) - ${h.status} - ${h.duration_seconds || 0}s - ${h.started_at}`
      ).join("\n");

      return { content: [{ type: "text", text: "=== CALL HISTORY ===\n" + text }] };
    }
  );

  server.tool(
    "history_stats",
    {
      agent_id: z.string().optional().describe("Filter nach Agent"),
      days: z.number().optional().describe("Tage zurueck (default: 7)"),
    },
    async ({ agent_id, days }) => {
      const authError = authCheck();
      if (authError) return authError;

      const daysBack = days || 7;
      let whereClause = `started_at >= datetime('now', '-${daysBack} days')`;
      const params: any[] = [];

      if (agent_id) { whereClause += " AND agent_id = ?"; params.push(agent_id); }

      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
          SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) as no_answer,
          SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          AVG(duration_seconds) as avg_duration,
          SUM(duration_seconds) as total_duration
        FROM call_history WHERE ${whereClause}
      `).get(...params) as any;

      const successRate = stats.total > 0
        ? (((stats.completed || 0) + (stats.answered || 0)) / stats.total * 100).toFixed(1)
        : 0;

      return {
        content: [{
          type: "text",
          text: `=== CALL STATS (letzte ${daysBack} Tage) ===
Gesamt: ${stats.total || 0} | Erfolgsrate: ${successRate}%
Abgeschlossen: ${stats.completed || 0} | Angenommen: ${stats.answered || 0}
Nicht erreicht: ${stats.no_answer || 0} | Besetzt: ${stats.busy || 0} | Fehler: ${stats.failed || 0}
Durchschnitt: ${Math.round(stats.avg_duration || 0)}s | Gesamt: ${Math.round((stats.total_duration || 0) / 60)}min`,
        }],
      };
    }
  );

  // === RETRY RULES ===

  server.tool(
    "retry_rule_create",
    {
      agent_id: z.string().describe("Agent ID"),
      call_result: z.string().describe("Call Result (no_answer, busy, failed)"),
      retry_after_minutes: z.number().optional().describe("Retry nach X Minuten"),
      max_retries: z.number().optional().describe("Max Retries"),
    },
    async (params) => {
      const authError = authCheck();
      if (authError) return authError;

      const stmt = db.prepare(`
        INSERT INTO retry_rules (agent_id, call_result, retry_after_minutes, max_retries)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(
        params.agent_id, params.call_result,
        params.retry_after_minutes || 60, params.max_retries || 3
      );

      return {
        content: [{
          type: "text",
          text: `Retry-Regel erstellt! ID: ${result.lastInsertRowid}, Bei: ${params.call_result}, Nach: ${params.retry_after_minutes || 60}min, Max: ${params.max_retries || 3}`,
        }],
      };
    }
  );

  server.tool(
    "retry_rule_list",
    { agent_id: z.string().optional().describe("Filter nach Agent") },
    async ({ agent_id }) => {
      const authError = authCheck();
      if (authError) return authError;

      const rules = agent_id
        ? db.prepare("SELECT * FROM retry_rules WHERE agent_id = ?").all(agent_id)
        : db.prepare("SELECT * FROM retry_rules").all();

      if (rules.length === 0) {
        return { content: [{ type: "text", text: "Keine Retry-Regeln gefunden." }] };
      }

      const text = rules.map((r: any) =>
        `#${r.id} ${r.agent_id}: Bei ${r.call_result} -> Retry nach ${r.retry_after_minutes}min (max ${r.max_retries}x)`
      ).join("\n");

      return { content: [{ type: "text", text: "=== RETRY REGELN ===\n" + text }] };
    }
  );

  // === QUEUE + RETRY INTEGRATION ===

  server.tool(
    "queue_handle_result",
    {
      queue_id: z.number().describe("Queue ID"),
      result: z.string().describe("Call Result (completed, no_answer, busy, failed, rejected)"),
      notes: z.string().optional().describe("Notizen"),
    },
    async ({ queue_id, result, notes }) => {
      const authError = authCheck();
      if (authError) return authError;

      const queueItem = db.prepare("SELECT * FROM call_queue WHERE id = ?").get(queue_id) as any;
      if (!queueItem) {
        return { content: [{ type: "text", text: "Queue Item nicht gefunden." }] };
      }

      const retryRule = db.prepare(`
        SELECT * FROM retry_rules WHERE agent_id = ? AND call_result = ?
      `).get(queueItem.agent_id, result) as any;

      let newStatus = "completed";
      let nextRetry = null;

      if (result !== "completed" && retryRule && queueItem.attempt < retryRule.max_retries) {
        newStatus = "retry";
        const retryTime = new Date(Date.now() + retryRule.retry_after_minutes * 60 * 1000);
        nextRetry = retryTime.toISOString();
      } else if (result !== "completed") {
        newStatus = "failed";
      }

      db.prepare(`UPDATE call_queue SET status = ?, next_retry_at = ? WHERE id = ?`).run(newStatus, nextRetry, queue_id);

      const message = newStatus === "retry"
        ? `Retry geplant: ${nextRetry}, Versuch ${queueItem.attempt}/${retryRule?.max_retries || queueItem.max_attempts}`
        : newStatus === "completed" ? "Anruf erfolgreich" : "Anruf fehlgeschlagen (max Versuche)";

      return { content: [{ type: "text", text: `Queue #${queue_id}: ${result} - ${message}` }] };
    }
  );
}
