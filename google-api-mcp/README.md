# Google API MCP Server

A Model Context Protocol (MCP) server for monitoring Google API quotas across multiple services.

## Features

- **Quota Monitoring**: Check usage status for Google APIs including YouTube, Maps, Translate, and Vision
- **Multi-API Support**: Monitor multiple Google services from a single interface
- **Usage Analytics**: Get detailed usage statistics and recommendations
- **Real-time Alerts**: Identify critical and warning quota levels

## Available Tools

### `get_quota_status`
Get quota status for Google APIs.

**Parameters:**
- `apiName` (optional): Specific API to check (`youtube`, `maps`, `translate`, `vision`, or `all`)

**Returns:**
- Current quota usage for selected APIs
- Usage percentages and recommendations
- Time until quota reset
- Summary statistics

## Environment Variables

```bash
# Optional: Google API Key for enhanced functionality
GOOGLE_API_KEY=your-google-api-key

# MCP Authentication Token (required for n8n integration)
MCP_AUTH_TOKEN=your-secure-token

# Server port (default: 8080)
PORT=8080
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Run in development:
```bash
npm run dev
```

4. Run in production:
```bash
npm start
```

## Usage with n8n

1. Deploy to Railway or your preferred platform
2. Configure the MCP Client node in n8n with your server URL
3. Use the `get_quota_status` tool to monitor API usage

## Docker Deployment

The server includes Docker support with NGINX authentication:

```bash
docker build -t google-api-mcp .
docker run -p 8080:8080 -e MCP_AUTH_TOKEN=your-token google-api-mcp
```

## Example Usage

```javascript
// Get all API quotas
{
  "tool": "get_quota_status",
  "arguments": {}
}

// Get specific API quota
{
  "tool": "get_quota_status", 
  "arguments": {
    "apiName": "youtube"
  }
}
```

## Response Format

```json
{
  "timestamp": "2025-01-13T14:30:00.000Z",
  "summary": {
    "totalAPIs": 4,
    "totalUsed": 57600,
    "totalLimit": 536000,
    "averageUsagePercent": 10.75,
    "criticalAPIs": [],
    "warningAPIs": []
  },
  "quotaDetails": [
    {
      "apiName": "YouTube Data API v3",
      "dailyLimit": 10000,
      "used": 2500,
      "remaining": 7500,
      "usagePercent": 25.0,
      "resetTime": "2025-01-14T00:00:00.000Z",
      "estimatedTimeToReset": "9h 30m"
    }
  ],
  "recommendations": [
    "🟡 YouTube Data API v3: High usage (25.0%). Monitor closely to avoid hitting limits."
  ]
}
```

## Architecture

- **NGINX (Port 8080)**: Authentication and reverse proxy
- **Supergateway (Port 8081)**: HTTP to STDIO bridge
- **MCP Server (STDIO)**: Core quota monitoring logic

## Development

- `npm run dev`: Development with hot reload
- `npm run build`: Build TypeScript
- `npm run test`: Run tests
- `npm run clean`: Clean build files