#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { setupTools } from './tools.js';
import { setupResources } from './resources.js';
import { setupPrompts } from './prompts.js';

dotenv.config();

const server = new Server(
  {
    name: 'supabase-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please set them in your .env file');
  process.exit(1);
}

setupTools(server);
setupResources(server);
setupPrompts(server);

async function main() {
  const transport = new StdioServerTransport();
  
  transport.onerror = (error: any) => {
    console.error('[Transport Error]', error);
  };

  server.onerror = (error: any) => {
    console.error('[Server Error]', error);
  };

  process.on('SIGINT', async () => {
    console.error('Received SIGINT, shutting down gracefully...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Received SIGTERM, shutting down gracefully...');
    await server.close();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
    process.exit(1);
  });

  try {
    console.error('Starting Supabase MCP server...');
    console.error(`Supabase URL: ${process.env.SUPABASE_URL}`);
    await server.connect(transport);
    console.error('Supabase MCP server running successfully');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});