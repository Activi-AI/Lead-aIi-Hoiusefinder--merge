// Test-Script to list registered MCP tools
// Run with: node src/test-tools.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerScraperTools } from './scraper-tools.js';

// Mock server to collect tools
const mockServer = {
  tools: [],
  tool(name, schema, handler) {
    this.tools.push({ name, schema, handler: typeof handler });
  }
};

// Register tools
registerScraperTools(mockServer);

// Output registered tools
console.log('Registrierte MCP Tools:');
mockServer.tools.forEach((tool, index) => {
  console.log(`${index + 1}. ${tool.name}`);
  console.log(`   Schema: ${JSON.stringify(tool.schema, null, 2)}`);
  console.log(`   Handler: ${tool.handler}`);
  console.log('---');
});