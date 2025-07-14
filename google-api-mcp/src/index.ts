#!/usr/bin/env node

/**
 * Google API MCP Server
 * A Model Context Protocol server for Google API quota management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Simple logger for production monitoring - MUST use stderr for MCP servers
const logger = {
  error: (message: string, context?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} ${message}`, context ? JSON.stringify(context) : '');
  },
  warn: (message: string, context?: any) => {
    console.error(`[WARN] ${new Date().toISOString()} ${message}`, context ? JSON.stringify(context) : '');
  },
  info: (message: string, context?: any) => {
    console.error(`[INFO] ${new Date().toISOString()} ${message}`, context ? JSON.stringify(context) : '');
  },
};

// Configuration from environment variables
const config = {
  serverName: 'google-api-mcp',
  serverVersion: '1.0.0',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
};

// Quota tracking for various Google APIs
interface QuotaInfo {
  apiName: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  resetTime: string;
  lastUpdated: string;
}

// Mock quota data - in a real implementation, this would connect to Google's API
const mockQuotaData: Record<string, QuotaInfo> = {
  'youtube': {
    apiName: 'YouTube Data API v3',
    dailyLimit: 10000,
    used: 2500,
    remaining: 7500,
    resetTime: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    lastUpdated: new Date().toISOString(),
  },
  'maps': {
    apiName: 'Google Maps API',
    dailyLimit: 25000,
    used: 5000,
    remaining: 20000,
    resetTime: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    lastUpdated: new Date().toISOString(),
  },
  'translate': {
    apiName: 'Google Translate API',
    dailyLimit: 500000,
    used: 50000,
    remaining: 450000,
    resetTime: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    lastUpdated: new Date().toISOString(),
  },
  'vision': {
    apiName: 'Google Vision API',
    dailyLimit: 1000,
    used: 100,
    remaining: 900,
    resetTime: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    lastUpdated: new Date().toISOString(),
  },
};

// Main function to set up and run the MCP server
async function main() {
  logger.info('Starting Google API MCP server...');

  const server = new Server(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_google_key_quota',
          description: 'Get quota status for Google APIs including YouTube, Maps, Translate, and Vision APIs',
          inputSchema: {
            type: 'object',
            properties: {
              apiName: {
                type: 'string',
                description: 'The Google API to check quota for (youtube, maps, translate, vision, or all)',
                enum: ['youtube', 'maps', 'translate', 'vision', 'all'],
              },
            },
            required: [],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_google_key_quota':
          return await handleGetGoogleKeyQuota(args as any || {});
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error('Tool execution error', {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  // Handle get_google_key_quota tool
  async function handleGetGoogleKeyQuota(args: { apiName?: string }) {
    const apiName = args.apiName || 'all';
    
    logger.info('Getting quota status', { apiName });

    let quotaData: QuotaInfo[] = [];

    if (apiName === 'all') {
      quotaData = Object.values(mockQuotaData);
    } else {
      const apiData = mockQuotaData[apiName];
      if (!apiData) {
        throw new Error(`Unknown API: ${apiName}. Valid options are: youtube, maps, translate, vision, all`);
      }
      quotaData = [apiData];
    }

    // Calculate summary statistics
    const summary = {
      totalAPIs: quotaData.length,
      totalUsed: quotaData.reduce((sum, api) => sum + api.used, 0),
      totalLimit: quotaData.reduce((sum, api) => sum + api.dailyLimit, 0),
      averageUsagePercent: 0,
      criticalAPIs: [] as string[],
      warningAPIs: [] as string[],
    };

    // Analyze usage and identify critical/warning APIs
    quotaData.forEach(api => {
      const usagePercent = (api.used / api.dailyLimit) * 100;
      if (usagePercent >= 90) {
        summary.criticalAPIs.push(api.apiName);
      } else if (usagePercent >= 70) {
        summary.warningAPIs.push(api.apiName);
      }
    });

    summary.averageUsagePercent = (summary.totalUsed / summary.totalLimit) * 100;

    // Format response
    const response = {
      timestamp: new Date().toISOString(),
      summary: {
        ...summary,
        averageUsagePercent: parseFloat(summary.averageUsagePercent.toFixed(2)),
      },
      quotaDetails: quotaData.map(api => ({
        ...api,
        usagePercent: parseFloat(((api.used / api.dailyLimit) * 100).toFixed(2)),
        estimatedTimeToReset: getTimeToReset(api.resetTime),
      })),
      recommendations: generateRecommendations(quotaData),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  // Helper function to calculate time until quota reset
  function getTimeToReset(resetTime: string): string {
    const now = new Date();
    const reset = new Date(resetTime);
    const diffMs = reset.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  // Generate recommendations based on quota usage
  function generateRecommendations(quotaData: QuotaInfo[]): string[] {
    const recommendations: string[] = [];

    quotaData.forEach(api => {
      const usagePercent = (api.used / api.dailyLimit) * 100;
      
      if (usagePercent >= 90) {
        recommendations.push(`🔴 ${api.apiName}: Critical usage (${usagePercent.toFixed(1)}%). Consider implementing caching or request batching.`);
      } else if (usagePercent >= 70) {
        recommendations.push(`🟡 ${api.apiName}: High usage (${usagePercent.toFixed(1)}%). Monitor closely to avoid hitting limits.`);
      } else if (usagePercent < 20) {
        recommendations.push(`🟢 ${api.apiName}: Low usage (${usagePercent.toFixed(1)}%). You have plenty of quota available.`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('✅ All APIs are within normal usage ranges.');
    }

    return recommendations;
  }

  // Set up stdio transport
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  logger.info('Google API MCP server started successfully', {
    serverName: config.serverName,
    version: config.serverVersion,
    capabilities: ['tools'],
  });
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Run the server
main().catch((error) => {
  logger.error('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});