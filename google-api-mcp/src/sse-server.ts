/**
 * SSE Server for Google API MCP
 * Provides HTTP/SSE interface for the MCP server
 */

import express from 'express';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'google-api-mcp',
    timestamp: new Date().toISOString(),
  });
});

// SSE endpoint
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Google API MCP SSE endpoint connected"}\n\n');

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// Start server
app.listen(PORT, () => {
  console.error(`[INFO] SSE server listening on port ${PORT}`);
});