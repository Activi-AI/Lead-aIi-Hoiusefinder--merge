import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================
// CONFIGURATION
// ============================================

// Lead Builder Backend
const LB_BACKEND_BASE = process.env.LB_BACKEND_BASE ?? "http://49.13.144.44:3003";
const LB_SSH_HOST = process.env.LB_SSH_HOST ?? "root@49.13.144.44";

// Cloud Agents Backend
const CA_BACKEND_BASE = process.env.CA_BACKEND_BASE ?? "http://178.156.178.70:3001";
const CA_SSH_HOST = process.env.CA_SSH_HOST ?? "root@178.156.178.70";

// Shared
const SSH_KEY = process.env.SSH_KEY ?? "~/.ssh/id_ed25519_cloudagents";

// ============================================
// HELPER FUNCTIONS
// ============================================

async function sshExec(host: string, command: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new ${host} "${command.replace(/"/g, '\\"')}"`,
      { timeout: 30000 }
    );
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "Unknown error" };
  }
}

async function httpJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

// ============================================
// MCP SERVER
// ============================================

const server = new McpServer({
  name: "lead-ai-housefinder-mcp",
  version: "1.0.0",
});

// ============================================
// LEAD BUILDER TOOLS (lb_*)
// ============================================

// Tool: lb_health - Health check Lead Builder backend
server.tool(
  "lb_health",
  { baseUrl: z.string().optional().describe("Override backend base url") },
  async ({ baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/health`);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_pm2_status - Show PM2 processes on Lead Builder server
server.tool(
  "lb_pm2_status",
  {
    format: z.enum(["table", "json"]).optional().describe("Output format (default: table)"),
  },
  async ({ format }) => {
    const cmd = format === "json" ? "pm2 jlist" : "pm2 status";
    const out = await sshExec(LB_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: cmd, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_pm2_logs - Get PM2 logs from Lead Builder server
server.tool(
  "lb_pm2_logs",
  {
    process: z.enum(["lead-builder-backend", "lead-builder-frontend", "all"]).optional().describe("Process name (default: all)"),
    lines: z.number().optional().describe("Number of lines (default: 50)"),
    err: z.boolean().optional().describe("Show only error logs"),
  },
  async ({ process, lines, err }) => {
    const n = lines ?? 50;
    const proc = process ?? "all";
    const errFlag = err ? "--err" : "";
    const cmd = `pm2 logs ${proc} --nostream --lines ${n} ${errFlag}`.trim();
    const out = await sshExec(LB_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: cmd, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_deploy - Deploy Lead Builder
server.tool(
  "lb_deploy",
  {
    project: z.enum(["backend", "frontend", "both"]).describe("Which project to deploy"),
    restart: z.boolean().optional().describe("Restart PM2 after deploy (default: true)"),
  },
  async ({ project, restart }) => {
    const shouldRestart = restart !== false;
    const results: { project: string; out: Awaited<ReturnType<typeof sshExec>> }[] = [];

    if (project === "backend" || project === "both") {
      let cmd = `cd /root/lead-builder-backend && git pull origin main && npm install`;
      if (shouldRestart) cmd += ` && pm2 restart lead-builder-backend`;
      const out = await sshExec(LB_SSH_HOST, cmd);
      results.push({ project: "backend", out });
    }

    if (project === "frontend" || project === "both") {
      let cmd = `cd /root/lead-builder-frontend && git pull origin main && npm install && npm run build`;
      if (shouldRestart) cmd += ` && pm2 restart lead-builder-frontend`;
      const out = await sshExec(LB_SSH_HOST, cmd);
      results.push({ project: "frontend", out });
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
    };
  }
);

// Tool: lb_stats - Get Lead Builder dashboard statistics
server.tool(
  "lb_stats",
  { baseUrl: z.string().optional().describe("Override backend base url") },
  async ({ baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/v1/dashboard/stats`);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_campaigns - List campaigns
server.tool(
  "lb_campaigns",
  {
    status: z.enum(["active", "paused", "completed", "archived"]).optional().describe("Filter by status"),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Filter by priority"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ status, priority, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    const url = `${base}/v1/campaigns${params.toString() ? "?" + params : ""}`;
    const out = await httpJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_campaign_create - Create a campaign
server.tool(
  "lb_campaign_create",
  {
    name: z.string().min(1).describe("Campaign name"),
    target_type: z.enum(["lead_campaign", "job_posting", "call_list"]).describe("Target type"),
    description: z.string().optional().describe("Campaign description"),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional().describe("Priority (default: normal)"),
    target_count: z.number().optional().describe("Target lead count (default: 100)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ name, target_type, description, priority, target_count, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/v1/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, target_type, description, priority, target_count }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_campaign_stats - Get campaign statistics
server.tool(
  "lb_campaign_stats",
  {
    id: z.string().describe("Campaign ID"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ id, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/v1/campaigns/${id}/stats`);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_leads - List leads
server.tool(
  "lb_leads",
  {
    campaign_id: z.string().optional().describe("Filter by campaign ID"),
    status: z.enum(["new", "contacted", "responded", "qualified", "converted", "rejected"]).optional().describe("Filter by status"),
    quality: z.enum(["hot", "warm", "cold", "unknown"]).optional().describe("Filter by quality"),
    limit: z.number().optional().describe("Limit (default: 100)"),
    offset: z.number().optional().describe("Offset (default: 0)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ campaign_id, status, quality, limit, offset, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const params = new URLSearchParams();
    if (campaign_id) params.set("campaign_id", campaign_id);
    if (status) params.set("status", status);
    if (quality) params.set("quality", quality);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    const url = `${base}/v1/leads${params.toString() ? "?" + params : ""}`;
    const out = await httpJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_lead_create - Create a lead
server.tool(
  "lb_lead_create",
  {
    name: z.string().optional().describe("Lead name"),
    company: z.string().optional().describe("Company name"),
    email: z.string().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    position: z.string().optional().describe("Job position"),
    location: z.string().optional().describe("Location"),
    source: z.enum(["manual", "scraper", "import", "api"]).optional().describe("Lead source (default: manual)"),
    campaign_id: z.string().optional().describe("Associated campaign ID"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ name, company, email, phone, position, location, source, campaign_id, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, company, email, phone, position, location, source: source ?? "manual", campaign_id }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_communications - List communications
server.tool(
  "lb_communications",
  {
    lead_id: z.string().optional().describe("Filter by lead ID"),
    campaign_id: z.string().optional().describe("Filter by campaign ID"),
    channel: z.enum(["email", "whatsapp", "phone", "linkedin"]).optional().describe("Filter by channel"),
    limit: z.number().optional().describe("Limit (default: 50)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ lead_id, campaign_id, channel, limit, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const params = new URLSearchParams();
    if (lead_id) params.set("lead_id", lead_id);
    if (campaign_id) params.set("campaign_id", campaign_id);
    if (channel) params.set("channel", channel);
    if (limit) params.set("limit", String(limit));
    const url = `${base}/v1/communications${params.toString() ? "?" + params : ""}`;
    const out = await httpJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_sources - List lead sources
server.tool(
  "lb_sources",
  { baseUrl: z.string().optional().describe("Override backend base url") },
  async ({ baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/v1/sources`);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_templates - List templates
server.tool(
  "lb_templates",
  {
    type: z.string().optional().describe("Filter by type"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ type, baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    const url = `${base}/v1/templates${params.toString() ? "?" + params : ""}`;
    const out = await httpJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_db_query - Execute read-only SQL query on Lead Builder DB
server.tool(
  "lb_db_query",
  {
    query: z.string().min(1).describe("SQL query (SELECT only)"),
  },
  async ({ query }) => {
    const upperQuery = query.trim().toUpperCase();
    if (!upperQuery.startsWith("SELECT")) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Only SELECT queries allowed" }, null, 2) }],
      };
    }

    const db = "/root/lead-builder-backend/data/lead-builder.db";
    const escapedQuery = query.replace(/"/g, '\\"');
    const cmd = `sqlite3 -header -column "${db}" "${escapedQuery}"`;
    const out = await sshExec(LB_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: "lb_db_query", query, ...out }, null, 2) }],
    };
  }
);

// Tool: lb_server_stats - Get Lead Builder server resource usage
server.tool(
  "lb_server_stats",
  {},
  async () => {
    const cmd = `echo "=== DISK ===" && df -h / && echo "\\n=== MEMORY ===" && free -h && echo "\\n=== CPU ===" && top -bn1 | head -5`;
    const out = await sshExec(LB_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ tool: "lb_server_stats", ...out }, null, 2) }],
    };
  }
);

// ============================================
// CLOUD AGENTS TOOLS (ca_*)
// ============================================

// Tool: ca_health - Health check Cloud Agents backend
server.tool(
  "ca_health",
  { baseUrl: z.string().optional().describe("Override backend base url") },
  async ({ baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const out = await httpJson(`${base}/health`);
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_chat_send - Send message to agent
server.tool(
  "ca_chat_send",
  {
    token: z.string().min(10).describe("JWT access token (Bearer)"),
    agentName: z.string().min(1).describe("Agent name (e.g. emir)"),
    message: z.string().min(1).describe("Message to send"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, agentName, message, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const out = await httpJson(`${base}/api/chat/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agentName, message }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_agents_status - Get agents status
server.tool(
  "ca_agents_status",
  {
    token: z.string().min(10).optional().describe("JWT access token (Bearer)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const out = await httpJson(`${base}/api/agents/status`, { headers });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_tasks_list - List tasks
server.tool(
  "ca_tasks_list",
  {
    token: z.string().min(10).optional().describe("JWT access token (Bearer)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
    state: z.string().optional().describe("Filter by task state (e.g. pending, running, completed)"),
  },
  async ({ token, baseUrl, state }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const url = state ? `${base}/api/tasks?state=${encodeURIComponent(state)}` : `${base}/api/tasks`;
    const out = await httpJson(url, { headers });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_pm2_status - Show PM2 processes on Cloud Agents server
server.tool(
  "ca_pm2_status",
  {
    format: z.enum(["table", "json"]).optional().describe("Output format (default: table)"),
  },
  async ({ format }) => {
    const cmd = format === "json" ? "pm2 jlist" : "pm2 status";
    const out = await sshExec(CA_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: cmd, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_pm2_logs - Get PM2 logs from Cloud Agents server
server.tool(
  "ca_pm2_logs",
  {
    process: z.string().optional().describe("Process name or id (default: all)"),
    lines: z.number().optional().describe("Number of lines (default: 50)"),
    err: z.boolean().optional().describe("Show only error logs"),
  },
  async ({ process, lines, err }) => {
    const n = lines ?? 50;
    const proc = process ?? "all";
    const errFlag = err ? "--err" : "";
    const cmd = `pm2 logs ${proc} --nostream --lines ${n} ${errFlag}`.trim();
    const out = await sshExec(CA_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: cmd, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_server_stats - Get Cloud Agents server resource usage
server.tool(
  "ca_server_stats",
  {},
  async () => {
    const cmd = `echo "=== DISK ===" && df -h / && echo "\\n=== MEMORY ===" && free -h && echo "\\n=== CPU ===" && top -bn1 | head -5 && echo "\\n=== UPTIME ===" && uptime`;
    const out = await sshExec(CA_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: "ca_server_stats", ...out }, null, 2) }],
    };
  }
);

// Tool: ca_deploy - Deploy Cloud Agents
server.tool(
  "ca_deploy",
  {
    project: z.enum(["cloud-agents", "admin-dashboard"]).describe("Project to deploy"),
    restart: z.boolean().optional().describe("Restart PM2 after pull (default: true)"),
  },
  async ({ project, restart }) => {
    const shouldRestart = restart !== false;
    const projectPath = project === "cloud-agents" ? "/root/cloud-agents" : "/root/admin-dashboard";

    let cmd = `cd ${projectPath} && git pull origin main`;
    if (shouldRestart) {
      cmd += ` && npm install && pm2 restart all`;
    }

    const out = await sshExec(CA_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: cmd, project, ...out }, null, 2) }],
    };
  }
);

// Tool: ca_db_query - Execute read-only SQL query on Cloud Agents DB
server.tool(
  "ca_db_query",
  {
    query: z.string().min(1).describe("SQL query (SELECT only)"),
    database: z.string().optional().describe("Database file path (default: /root/cloud-agents/data/app.sqlite)"),
  },
  async ({ query, database }) => {
    const upperQuery = query.trim().toUpperCase();
    if (!upperQuery.startsWith("SELECT")) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Only SELECT queries allowed" }, null, 2) }],
      };
    }

    const db = database ?? "/root/cloud-agents/data/app.sqlite";
    const escapedQuery = query.replace(/"/g, '\\"');
    const cmd = `sqlite3 -header -column "${db}" "${escapedQuery}"`;
    const out = await sshExec(CA_SSH_HOST, cmd);
    return {
      content: [{ type: "text", text: JSON.stringify({ command: "ca_db_query", database: db, query, ...out }, null, 2) }],
    };
  }
);

// ============================================
// BRAIN KNOWLEDGE BASE TOOLS
// ============================================

// Tool: brain_ingest_text - Add text to knowledge base
server.tool(
  "brain_ingest_text",
  {
    token: z.string().min(10).describe("JWT access token (Bearer) - userId is extracted from JWT"),
    title: z.string().min(1).describe("Document title"),
    content: z.string().min(1).describe("Text content to ingest"),
    tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, title, content, tags, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const out = await httpJson(`${base}/api/brain/ingest/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, content, metadata: tags ? { tags } : undefined }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: brain_search - Search knowledge base
server.tool(
  "brain_search",
  {
    token: z.string().min(10).describe("JWT access token (Bearer) - userId is extracted from JWT"),
    query: z.string().min(1).describe("Search query"),
    mode: z.enum(["semantic", "keyword", "hybrid"]).optional().describe("Search mode (default: hybrid)"),
    limit: z.number().optional().describe("Max results (default: 10)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, query, mode, limit, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const params = new URLSearchParams({ q: query });
    if (mode) params.set("mode", mode);
    if (limit) params.set("limit", String(limit));

    const out = await httpJson(`${base}/api/brain/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: brain_stats - Get brain statistics
server.tool(
  "brain_stats",
  {
    token: z.string().min(10).describe("JWT access token (Bearer) - userId is extracted from JWT"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const out = await httpJson(`${base}/api/brain/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// ============================================
// AUDIT EVENTS TOOLS
// ============================================

// Tool: audit_events_list - List audit events with filters
server.tool(
  "audit_events_list",
  {
    token: z.string().min(10).describe("JWT access token (Bearer)"),
    kind: z.string().optional().describe("Filter by event kind (e.g. user_login, task_created, brain_search)"),
    severity: z.enum(["info", "warn", "error"]).optional().describe("Filter by severity"),
    since: z.string().optional().describe("ISO date string - get events since this time"),
    limit: z.number().optional().describe("Max events to return (default: 50, max: 500)"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, kind, severity, since, limit, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (severity) params.set("severity", severity);
    if (since) params.set("since", since);
    if (limit) params.set("limit", String(limit));

    const url = `${base}/api/audit/events${params.toString() ? "?" + params : ""}`;
    const out = await httpJson(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// Tool: audit_events_stats - Get audit event statistics (Admin only)
server.tool(
  "audit_events_stats",
  {
    token: z.string().min(10).describe("JWT access token (Bearer) - requires admin role"),
    baseUrl: z.string().optional().describe("Override backend base url"),
  },
  async ({ token, baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const out = await httpJson(`${base}/api/audit/events/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }],
    };
  }
);

// ============================================
// OPS DASHBOARD TOOLS (Direct SQLite - no auth required)
// ============================================

const CA_DB_PATH = "/root/cloud-agents/data/app.sqlite";

// Tool: ops_events - Get recent audit events (no auth, direct DB)
server.tool(
  "ops_events",
  {
    kind: z.string().optional().describe("Filter by event kind (e.g. user_login, deploy, chat_sent)"),
    severity: z.enum(["info", "warn", "error"]).optional().describe("Filter by severity"),
    limit: z.number().optional().describe("Max events (default: 20)"),
  },
  async ({ kind, severity, limit }) => {
    const n = limit ?? 20;
    let where = "";
    const conditions: string[] = [];
    if (kind) conditions.push(`kind = '${kind}'`);
    if (severity) conditions.push(`severity = '${severity}'`);
    if (conditions.length > 0) where = `WHERE ${conditions.join(" AND ")}`;

    const query = `SELECT id, ts, kind, severity, message, agent_id, user_id FROM audit_events ${where} ORDER BY ts DESC LIMIT ${n}`;
    const cmd = `sqlite3 -json "${CA_DB_PATH}" "${query}"`;
    const out = await sshExec(CA_SSH_HOST, cmd);

    let events: unknown[] = [];
    if (out.ok && out.stdout) {
      try {
        events = JSON.parse(out.stdout);
      } catch {
        events = [];
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ tool: "ops_events", count: events.length, events, ...out }, null, 2) }],
    };
  }
);

// Tool: ops_tasks_history - Get task history (no auth, direct DB)
server.tool(
  "ops_tasks_history",
  {
    status: z.string().optional().describe("Filter by status (pending, in_progress, completed, stopped)"),
    limit: z.number().optional().describe("Max tasks (default: 20)"),
  },
  async ({ status, limit }) => {
    const n = limit ?? 20;
    const where = status ? `WHERE status = '${status}'` : "";

    const query = `SELECT id, title, status, priority, assignee, created_at, updated_at FROM tasks ${where} ORDER BY created_at DESC LIMIT ${n}`;
    const cmd = `sqlite3 -json "${CA_DB_PATH}" "${query}"`;
    const out = await sshExec(CA_SSH_HOST, cmd);

    let tasks: unknown[] = [];
    if (out.ok && out.stdout) {
      try {
        tasks = JSON.parse(out.stdout);
      } catch {
        tasks = [];
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ tool: "ops_tasks_history", count: tasks.length, tasks, ...out }, null, 2) }],
    };
  }
);

// Tool: ops_stats - Get aggregated statistics (no auth, direct DB)
server.tool(
  "ops_stats",
  {},
  async () => {
    const queries = {
      events_total: `SELECT COUNT(*) as count FROM audit_events`,
      events_by_kind: `SELECT kind, COUNT(*) as count FROM audit_events GROUP BY kind ORDER BY count DESC LIMIT 10`,
      events_by_severity: `SELECT severity, COUNT(*) as count FROM audit_events GROUP BY severity`,
      tasks_by_status: `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`,
      users_total: `SELECT COUNT(*) as count FROM users`,
      brain_docs: `SELECT COUNT(*) as count FROM brain_docs`,
    };

    const stats: Record<string, unknown> = {};

    for (const [key, query] of Object.entries(queries)) {
      const cmd = `sqlite3 -json "${CA_DB_PATH}" "${query}"`;
      const out = await sshExec(CA_SSH_HOST, cmd);
      if (out.ok && out.stdout) {
        try {
          stats[key] = JSON.parse(out.stdout);
        } catch {
          stats[key] = out.stdout;
        }
      } else {
        stats[key] = { error: out.stderr };
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ tool: "ops_stats", stats }, null, 2) }],
    };
  }
);

// ============================================
// MAIN
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
