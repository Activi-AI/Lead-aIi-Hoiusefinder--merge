import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { registerScraperTools } from "./scraper-tools.js";
import { registerAuthTools } from "./auth-tools.js";

const execAsync = promisify(exec);

// ============================================
// CONFIGURATION
// ============================================

// Lead Builder Backend
const LB_BACKEND_BASE = process.env.LB_BACKEND_BASE ?? "http://49.13.144.44:3003";

// Cloud Agents Backend
const CA_BACKEND_BASE = process.env.CA_BACKEND_BASE ?? "http://178.156.178.70:3001";

// ============================================
// HELPER FUNCTIONS
// ============================================

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
  version: "2.1.0",
});

// ============================================
// REGISTER AUTH TOOLS (auth_*)
// ============================================

registerAuthTools(server);

// ============================================
// REGISTER SCRAPER TOOLS (scraper_*)
// ============================================

registerScraperTools(server);

// ============================================
// LEAD BUILDER TOOLS (lb_*)
// ============================================

server.tool(
  "lb_health",
  { baseUrl: z.string().optional().describe("Override backend base url") },
  async ({ baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(`${base}/health`);
    return { content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }] };
  }
);

server.tool(
  "lb_stats",
  { baseUrl: z.string().optional() },
  async ({ baseUrl }) => {
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/dashboard/stats`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_campaigns",
  {
    status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
    baseUrl: z.string().optional(),
  },
  async ({ status, priority, baseUrl }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/campaigns${params.toString() ? "?" + params : ""}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_campaign_create",
  {
    name: z.string(),
    target_type: z.enum(["lead_campaign", "job_posting", "call_list"]),
    description: z.string().optional(),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
    target_count: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ name, target_type, description, priority, target_count, baseUrl }) => {
    const body = { name, target_type, description, priority, target_count };
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_campaign_stats",
  { id: z.string(), baseUrl: z.string().optional() },
  async ({ id, baseUrl }) => {
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/campaigns/${id}/stats`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_leads",
  {
    campaign_id: z.string().optional(),
    status: z.enum(["new", "contacted", "responded", "qualified", "converted", "rejected"]).optional(),
    quality: z.enum(["hot", "warm", "cold", "unknown"]).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ campaign_id, status, quality, limit, offset, baseUrl }) => {
    const params = new URLSearchParams();
    if (campaign_id) params.set("campaign_id", campaign_id);
    if (status) params.set("status", status);
    if (quality) params.set("quality", quality);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/leads${params.toString() ? "?" + params : ""}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_lead_create",
  {
    campaign_id: z.string().optional(),
    name: z.string().optional(),
    company: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
    location: z.string().optional(),
    source: z.enum(["manual", "scraper", "import", "api"]).optional(),
    baseUrl: z.string().optional(),
  },
  async ({ campaign_id, name, company, email, phone, position, location, source, baseUrl }) => {
    const body = { campaign_id, name, company, email, phone, position, location, source: source ?? "manual" };
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_communications",
  {
    lead_id: z.string().optional(),
    campaign_id: z.string().optional(),
    channel: z.enum(["email", "whatsapp", "phone", "linkedin"]).optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ lead_id, campaign_id, channel, limit, baseUrl }) => {
    const params = new URLSearchParams();
    if (lead_id) params.set("lead_id", lead_id);
    if (campaign_id) params.set("campaign_id", campaign_id);
    if (channel) params.set("channel", channel);
    if (limit) params.set("limit", String(limit));
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/communications${params.toString() ? "?" + params : ""}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_sources",
  { baseUrl: z.string().optional() },
  async ({ baseUrl }) => {
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/sources`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "lb_templates",
  { type: z.string().optional(), baseUrl: z.string().optional() },
  async ({ type, baseUrl }) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    const out = await httpJson(`${baseUrl ?? LB_BACKEND_BASE}/v1/templates${params.toString() ? "?" + params : ""}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

// ============================================
// CLOUD AGENTS TOOLS (ca_*)
// ============================================

server.tool(
  "ca_health",
  { baseUrl: z.string().optional() },
  async ({ baseUrl }) => {
    const base = baseUrl ?? CA_BACKEND_BASE;
    const out = await httpJson(`${base}/health`);
    return { content: [{ type: "text", text: JSON.stringify({ base, ...out }, null, 2) }] };
  }
);

server.tool(
  "ca_agents_status",
  { token: z.string().optional(), baseUrl: z.string().optional() },
  async ({ token, baseUrl }) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const out = await httpJson(`${baseUrl ?? CA_BACKEND_BASE}/api/agents/status`, { headers });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "ca_tasks_list",
  {
    token: z.string().optional(),
    state: z.string().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ token, state, baseUrl }) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    const out = await httpJson(`${baseUrl ?? CA_BACKEND_BASE}/api/tasks${params.toString() ? "?" + params : ""}`, { headers });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "ca_chat_send",
  {
    token: z.string(),
    agentName: z.string(),
    message: z.string(),
    baseUrl: z.string().optional(),
  },
  async ({ token, agentName, message, baseUrl }) => {
    const out = await httpJson(`${baseUrl ?? CA_BACKEND_BASE}/api/chat/${agentName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "ca_brain_search",
  {
    token: z.string(),
    query: z.string(),
    limit: z.number().optional(),
    mode: z.enum(["semantic", "keyword", "hybrid"]).optional(),
    baseUrl: z.string().optional(),
  },
  async ({ token, query, limit, mode, baseUrl }) => {
    const params = new URLSearchParams();
    params.set("q", query);
    if (limit) params.set("limit", String(limit));
    if (mode) params.set("mode", mode);
    const out = await httpJson(`${baseUrl ?? CA_BACKEND_BASE}/api/brain/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "ca_brain_ingest",
  {
    token: z.string(),
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()).optional(),
    baseUrl: z.string().optional(),
  },
  async ({ token, title, content, tags, baseUrl }) => {
    const out = await httpJson(`${baseUrl ?? CA_BACKEND_BASE}/api/brain/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, content, tags }),
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "ca_brain_stats",
  { token: z.string(), baseUrl: z.string().optional() },
  async ({ token, baseUrl }) => {
    const out = await httpJson(`${baseUrl ?? CA_BACKEND_BASE}/api/brain/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

// ============================================
// SERVER OPS TOOLS (ops_*)
// ============================================

server.tool(
  "ops_pm2_status",
  { format: z.enum(["table", "json"]).optional() },
  async ({ format }) => {
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes = JSON.parse(stdout);
      if (format === "json") {
        return { content: [{ type: "text", text: JSON.stringify(processes, null, 2) }] };
      }
      const table = processes.map((p: any) => ({
        name: p.name,
        status: p.pm2_env?.status,
        cpu: p.monit?.cpu,
        memory: `${Math.round((p.monit?.memory || 0) / 1024 / 1024)}MB`,
        uptime: p.pm2_env?.pm_uptime ? `${Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000 / 60)}m` : '-',
      }));
      return { content: [{ type: "text", text: JSON.stringify(table, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e}` }] };
    }
  }
);

server.tool(
  "ops_pm2_logs",
  {
    process: z.string().optional(),
    lines: z.number().optional(),
    err: z.boolean().optional(),
  },
  async ({ process: proc, lines, err }) => {
    try {
      const cmd = `pm2 logs ${proc || ""} --lines ${lines || 50} --nostream ${err ? "--err" : ""}`;
      const { stdout, stderr } = await execAsync(cmd);
      return { content: [{ type: "text", text: stdout + stderr }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e}` }] };
    }
  }
);

server.tool(
  "ops_server_stats",
  {},
  async () => {
    try {
      const { stdout } = await execAsync(`
        echo "=== DISK ===" && df -h / | tail -1 &&
        echo "=== MEMORY ===" && free -h | head -2 &&
        echo "=== LOAD ===" && uptime
      `);
      return { content: [{ type: "text", text: stdout }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e}` }] };
    }
  }
);

// ============================================
// START SERVER
// ============================================

async function main() {
  console.error("[MCP] Lead AI Housefinder MCP Server v2.1.0 starting...");
  console.error("[MCP] Auth-System aktiviert - Login erforderlich fÃ¼r Scraper-Tools");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] Server connected via stdio");
}

main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
