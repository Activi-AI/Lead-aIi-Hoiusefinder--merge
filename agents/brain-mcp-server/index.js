#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// Configuration
const BRAIN_API_URL = process.env.BRAIN_API_URL || "https://brain.activi.io";
const BRAIN_API_TOKEN = process.env.BRAIN_API_TOKEN || "";

// Helper: Make API request to Brain
async function brainRequest(endpoint, method = "GET", body = null) {
  const url = `${BRAIN_API_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (BRAIN_API_TOKEN) {
    headers["Authorization"] = `Bearer ${BRAIN_API_TOKEN}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

// Tool definitions (compatible with OpenAI function calling format)
const TOOLS = [
  {
    name: "brain_search",
    description: "Search the Brain memory for knowledge by tag or text query. Use this to find stored information, decisions, policies, or any previously saved knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text to search for in memory content"
        },
        tag: {
          type: "string",
          description: "Filter by specific tag (e.g., 'policy', 'decision', 'code')"
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)"
        }
      }
    }
  },
  {
    name: "brain_append",
    description: "Store new knowledge in the Brain memory. Use this to save important decisions, learnings, code snippets, policies, or any information that should be remembered.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Category of the memory (e.g., 'decision', 'policy', 'code', 'learning', 'error', 'fix')"
        },
        content: {
          type: "string",
          description: "The actual content/knowledge to store"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization and search (e.g., ['typescript', 'api', 'auth'])"
        },
        refs: {
          type: "array",
          items: { type: "string" },
          description: "References to related files or resources (e.g., ['src/auth.ts', 'docs/API.md'])"
        }
      },
      required: ["type", "content"]
    }
  },
  {
    name: "brain_recent",
    description: "Get the most recent entries from Brain memory. Useful to see what was recently learned or decided.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of entries to retrieve (default: 10)"
        },
        type: {
          type: "string",
          description: "Filter by type (e.g., 'decision', 'policy', 'code')"
        }
      }
    }
  },
  {
    name: "brain_stats",
    description: "Get statistics about the Brain memory - total entries, entries by type, etc.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

// Tool handlers
async function handleTool(name, args) {
  switch (name) {
    case "brain_search": {
      const params = new URLSearchParams();
      if (args.query) params.append("q", args.query);
      if (args.tag) params.append("tag", args.tag);
      if (args.limit) params.append("limit", args.limit);
      return brainRequest(`/memory/search?${params}`);
    }

    case "brain_append": {
      return brainRequest("/memory/append", "POST", {
        type: args.type,
        content: args.content,
        tags: args.tags || [],
        refs: args.refs || []
      });
    }

    case "brain_recent": {
      const params = new URLSearchParams();
      if (args.limit) params.append("limit", args.limit);
      if (args.type) params.append("type", args.type);
      return brainRequest(`/memory/recent?${params}`);
    }

    case "brain_stats": {
      return brainRequest("/memory/stats");
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create MCP Server
const server = new Server(
  {
    name: "brain-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args || {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Brain MCP Server running on stdio");
}

main().catch(console.error);
