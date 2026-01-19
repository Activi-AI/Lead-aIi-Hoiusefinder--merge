import { StdioServerTransport } from \"@modelcontextprotocol/sdk/server/stdio.js\";
import { McpServer } from \"@modelcontextprotocol/sdk/server/mcp.js\";
import { z } from \"zod\";
import { exec } from \"child_process\";
import { promisify } from \"util\";
import { registerScraperTools } from \"./scraper-tools.js\";

const execAsync = promisify(exec);

// ============================================
// CONFIGURATION
// ============================================

// Lead Builder Backend
const LB_BACKEND_BASE = process.env.LB_BACKEND_BASE ?? \"http://49.13.144.44:3003\";

// Cloud Agents Backend
const CA_BACKEND_BASE = process.env.CA_BACKEND_BASE ?? \"http://178.156.178.70:3001\";

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
  name: \"lead-ai-housefinder-mcp\",
  version: \"2.0.0\",
});

// ============================================
// LEAD BUILDER TOOLS (lb_*)
// ============================================

server.tool(
  \"lb_health\",
  { baseUrl: z.string().optional().describe(\"Override backend base url\") },
  async ({ baseUrl }) => {
    const base = baseUrl ?? LB_BACKEND_BASE;
    const out = await httpJson(\`\${base}/health\`);
    return { content: [{ type: \"text\", text: JSON.stringify({ base, ...out }, null, 2) }] };
  }
);

server.tool(
  \"lb_stats\",
  { baseUrl: z.string().optional() },
  async ({ baseUrl }) => {
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/dashboard/stats\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_campaigns\",
  {
    status: z.enum([\"active\", \"paused\", \"completed\", \"archived\"]).optional(),
    priority: z.enum([\"urgent\", \"high\", \"normal\", \"low\"]).optional(),
    baseUrl: z.string().optional(),
  },
  async ({ status, priority, baseUrl }) => {
    const params = new URLSearchParams();
    if (status) params.set(\"status\", status);
    if (priority) params.set(\"priority\", priority);
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/campaigns\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_campaign_create\",
  {
    name: z.string().min(1),
    target_type: z.enum([\"lead_campaign\", \"job_posting\", \"call_list\"]),
    description: z.string().optional(),
    priority: z.enum([\"urgent\", \"high\", \"normal\", \"low\"]).optional(),
    target_count: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ name, target_type, description, priority, target_count, baseUrl }) => {
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/campaigns\`, {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify({ name, target_type, description, priority, target_count }),
    });
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_leads\",
  {
    campaign_id: z.string().optional(),
    status: z.enum([\"new\", \"contacted\", \"responded\", \"qualified\", \"converted\", \"rejected\"]).optional(),
    quality: z.enum([\"hot\", \"warm\", \"cold\", \"unknown\"]).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ campaign_id, status, quality, limit, offset, baseUrl }) => {
    const params = new URLSearchParams();
    if (campaign_id) params.set(\"campaign_id\", campaign_id);
    if (status) params.set(\"status\", status);
    if (quality) params.set(\"quality\", quality);
    if (limit) params.set(\"limit\", String(limit));
    if (offset) params.set(\"offset\", String(offset));
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/leads\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_lead_create\",
  {
    name: z.string().optional(),
    company: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
    location: z.string().optional(),
    source: z.enum([\"manual\", \"scraper\", \"import\", \"api\"]).optional(),
    campaign_id: z.string().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ name, company, email, phone, position, location, source, campaign_id, baseUrl }) => {
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/leads\`, {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify({ name, company, email, phone, position, location, source: source ?? \"manual\", campaign_id }),
    });
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

// ============================================
// ATU RELOCATION TOOLS
// ============================================

server.tool(
  \"lb_vermieter\",
  {
    city: z.string().optional(),
    status: z.enum([\"new\", \"contacted\", \"negotiating\", \"active\", \"inactive\"]).optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ city, status, limit, baseUrl }) => {
    const params = new URLSearchParams();
    if (city) params.set(\"city\", city);
    if (status) params.set(\"status\", status);
    if (limit) params.set(\"limit\", String(limit));
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/vermieter\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_housing\",
  {
    city: z.string().optional(),
    type: z.enum([\"apartment\", \"room\", \"shared\", \"house\"]).optional(),
    max_price: z.number().optional(),
    min_size: z.number().optional(),
    is_available: z.boolean().optional(),
    mietvertrag_possible: z.boolean().optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ city, type, max_price, min_size, is_available, mietvertrag_possible, limit, baseUrl }) => {
    const params = new URLSearchParams();
    if (city) params.set(\"city\", city);
    if (type) params.set(\"type\", type);
    if (max_price) params.set(\"max_price\", String(max_price));
    if (min_size) params.set(\"min_size\", String(min_size));
    if (is_available !== undefined) params.set(\"is_available\", String(is_available));
    if (mietvertrag_possible !== undefined) params.set(\"mietvertrag_possible\", String(mietvertrag_possible));
    if (limit) params.set(\"limit\", String(limit));
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/housing\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_candidates\",
  {
    status: z.enum([\"new\", \"searching\", \"negotiating\", \"found\", \"moved_in\", \"cancelled\"]).optional(),
    employer: z.string().optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ status, employer, limit, baseUrl }) => {
    const params = new URLSearchParams();
    if (status) params.set(\"status\", status);
    if (employer) params.set(\"employer\", employer);
    if (limit) params.set(\"limit\", String(limit));
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/candidates\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_negotiations\",
  {
    status: z.enum([\"pending\", \"calling\", \"in_progress\", \"accepted\", \"rejected\", \"cancelled\"]).optional(),
    candidate_id: z.string().optional(),
    vermieter_id: z.string().optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ status, candidate_id, vermieter_id, limit, baseUrl }) => {
    const params = new URLSearchParams();
    if (status) params.set(\"status\", status);
    if (candidate_id) params.set(\"candidate_id\", candidate_id);
    if (vermieter_id) params.set(\"vermieter_id\", vermieter_id);
    if (limit) params.set(\"limit\", String(limit));
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/negotiations\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_deals\",
  {
    status: z.enum([\"pending\", \"signed\", \"active\", \"completed\", \"cancelled\"]).optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ status, limit, baseUrl }) => {
    const params = new URLSearchParams();
    if (status) params.set(\"status\", status);
    if (limit) params.set(\"limit\", String(limit));
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/deals\${params.toString() ? \"?\" + params : \"\"}\`);
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_search_housing\",
  {
    candidate_id: z.string().min(1),
    auto_negotiate: z.boolean().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ candidate_id, auto_negotiate, baseUrl }) => {
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/agents/search-housing\`, {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify({ candidate_id, auto_negotiate: auto_negotiate ?? false }),
    });
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  \"lb_trigger_call\",
  {
    candidate_id: z.string().min(1),
    vermieter_id: z.string().min(1),
    housing_id: z.string().optional(),
    agent_name: z.string().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ candidate_id, vermieter_id, housing_id, agent_name, baseUrl }) => {
    const out = await httpJson(\`\${baseUrl ?? LB_BACKEND_BASE}/v1/agents/trigger-call\`, {
      method: \"POST\",
      headers: { \"Content-Type\": \"application/json\" },
      body: JSON.stringify({ candidate_id, vermieter_id, housing_id, agent_name: agent_name ?? \"housecall-agent\" }),
    });
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

// ============================================
// CLOUD AGENTS TOOLS (ca_*)
// ============================================

server.tool(\"ca_health\", { baseUrl: z.string().optional() }, async ({ baseUrl }) => {
  const out = await httpJson(\`\${baseUrl ?? CA_BACKEND_BASE}/health\`);
  return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
});

// ============================================
// BRAIN TOOLS
// ============================================

server.tool(
  \"brain_search\",
  {
    token: z.string().min(10),
    query: z.string().min(1),
    mode: z.enum([\"semantic\", \"keyword\", \"hybrid\"]).optional(),
    limit: z.number().optional(),
    baseUrl: z.string().optional(),
  },
  async ({ token, query, mode, limit, baseUrl }) => {
    const params = new URLSearchParams({ q: query });
    if (mode) params.set(\"mode\", mode);
    if (limit) params.set(\"limit\", String(limit));
    const out = await httpJson(\`\${baseUrl ?? CA_BACKEND_BASE}/api/brain/search?\${params}\`, {
      headers: { Authorization: \`Bearer \${token}\` },
    });
    return { content: [{ type: \"text\", text: JSON.stringify(out, null, 2) }] };
  }
);

// ============================================
// REGISTER SCRAPER TOOLS
// ============================================

registerScraperTools(server);

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