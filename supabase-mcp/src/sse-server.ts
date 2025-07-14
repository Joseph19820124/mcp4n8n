#!/usr/bin/env node

/**
 * SSE Server for Supabase MCP
 * Provides HTTP/SSE interface as alternative to stdio transport
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './tools.js';
import { setupResources } from './resources.js';
import { setupPrompts } from './prompts.js';
import dotenv from 'dotenv';

dotenv.config();

// Server configuration
const PORT = process.env.SSE_PORT || 8082;
const HOST = process.env.SSE_HOST || 'localhost';

// Create MCP server instance
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

// Setup MCP handlers
setupTools(server);
setupResources(server);
setupPrompts(server);

// Track active connections
const activeConnections = new Set<ServerResponse>();

// Helper function to send SSE data
function sendSSE(res: ServerResponse, data: any, event?: string) {
  if (event) {
    res.write(`event: ${event}\n`);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// CORS headers
function setCORSHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '3600');
}

// Handle HTTP requests
function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = parse(req.url || '', true);
  const method = req.method || 'GET';

  // Set CORS headers
  setCORSHeaders(res);

  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'supabase-mcp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: {
        supabaseUrl: process.env.SUPABASE_URL,
        hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      }
    }));
    return;
  }

  // SSE endpoint
  if (url.pathname === '/sse') {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Track connection
    activeConnections.add(res);

    // Send initial connection message
    sendSSE(res, {
      type: 'connected',
      server: 'supabase-mcp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }, 'connection');

    // Handle client disconnect
    req.on('close', () => {
      activeConnections.delete(res);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (res.finished) {
        clearInterval(keepAlive);
        activeConnections.delete(res);
        return;
      }
      sendSSE(res, { type: 'ping', timestamp: new Date().toISOString() }, 'ping');
    }, 30000);

    return;
  }

  // JSON-RPC endpoint
  if (url.pathname === '/rpc' && method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const jsonRpcRequest = JSON.parse(body);
        
        // Handle different MCP methods
        let response;
        switch (jsonRpcRequest.method) {
          case 'tools/list':
            response = await server.listTools();
            break;
            
          case 'tools/call':
            response = await server.callTool(
              jsonRpcRequest.params.name,
              jsonRpcRequest.params.arguments
            );
            break;
            
          case 'resources/list':
            response = await server.listResources();
            break;
            
          case 'resources/read':
            response = await server.readResource(jsonRpcRequest.params.uri);
            break;
            
          case 'prompts/list':
            response = await server.listPrompts();
            break;
            
          case 'prompts/get':
            response = await server.getPrompt(
              jsonRpcRequest.params.name,
              jsonRpcRequest.params.arguments
            );
            break;
            
          default:
            throw new Error(`Unknown method: ${jsonRpcRequest.method}`);
        }

        // Send JSON-RPC response
        const jsonRpcResponse = {
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          result: response,
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jsonRpcResponse));

        // Broadcast to SSE clients
        const sseData = {
          type: 'rpc_call',
          method: jsonRpcRequest.method,
          params: jsonRpcRequest.params,
          result: response,
          timestamp: new Date().toISOString(),
        };
        
        activeConnections.forEach((connection) => {
          if (!connection.finished) {
            sendSSE(connection, sseData, 'rpc_call');
          }
        });

      } catch (error) {
        console.error('JSON-RPC error:', error);
        
        const errorResponse = {
          jsonrpc: '2.0',
          id: body ? JSON.parse(body).id : null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error),
          },
        };

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
      }
    });
    return;
  }

  // API documentation endpoint
  if (url.pathname === '/docs' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Supabase MCP Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .endpoint { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
        .method { color: #007acc; font-weight: bold; }
        pre { background: #f0f0f0; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .status { color: #28a745; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Supabase MCP Server</h1>
    <p class="status">Status: Running</p>
    <p>Model Context Protocol server for Supabase database operations</p>
    
    <h2>Available Endpoints</h2>
    
    <div class="endpoint">
        <h3><span class="method">GET</span> /health</h3>
        <p>Health check endpoint</p>
    </div>
    
    <div class="endpoint">
        <h3><span class="method">GET</span> /sse</h3>
        <p>Server-Sent Events endpoint for real-time updates</p>
    </div>
    
    <div class="endpoint">
        <h3><span class="method">POST</span> /rpc</h3>
        <p>JSON-RPC endpoint for MCP protocol calls</p>
        <pre>
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
        </pre>
    </div>
    
    <h2>Available Methods</h2>
    <ul>
        <li><code>tools/list</code> - List available tools</li>
        <li><code>tools/call</code> - Call a specific tool</li>
        <li><code>resources/list</code> - List available resources</li>
        <li><code>resources/read</code> - Read a specific resource</li>
        <li><code>prompts/list</code> - List available prompts</li>
        <li><code>prompts/get</code> - Get a specific prompt</li>
    </ul>
    
    <h2>Configuration</h2>
    <ul>
        <li>Port: ${PORT}</li>
        <li>Host: ${HOST}</li>
        <li>Supabase URL: ${process.env.SUPABASE_URL || 'Not configured'}</li>
        <li>Active SSE Connections: <span id="connections">${activeConnections.size}</span></li>
    </ul>
    
    <script>
        // Update active connections count
        setInterval(() => {
            fetch('/health')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('connections').textContent = '${activeConnections.size}';
                });
        }, 5000);
    </script>
</body>
</html>
    `);
    return;
  }

  // 404 for other paths
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: ['/health', '/sse', '/rpc', '/docs'],
  }));
}

// Create and start server
const httpServer = createServer(handleRequest);

// Handle server errors
httpServer.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Start server
httpServer.listen(PORT, HOST, () => {
  console.log(`Supabase MCP SSE Server running on http://${HOST}:${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log(`SSE endpoint: http://${HOST}:${PORT}/sse`);
  console.log(`JSON-RPC endpoint: http://${HOST}:${PORT}/rpc`);
  console.log(`Documentation: http://${HOST}:${PORT}/docs`);
});

export { server };