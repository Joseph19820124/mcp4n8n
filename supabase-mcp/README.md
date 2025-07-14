# Supabase MCP Server

A production-ready Model Context Protocol (MCP) server for Supabase database operations, providing comprehensive database management capabilities through a standardized interface with nginx reverse proxy and supergateway architecture.

## Features

### 🔧 Database Operations
- **Query**: Advanced querying with filters, ordering, pagination
- **Insert**: Single and batch insert operations
- **Update**: Conditional updates with filters
- **Delete**: Safe deletion with filters
- **Upsert**: Insert or update operations
- **RPC**: Call custom database functions
- **Batch**: Execute multiple operations efficiently

### 📊 Database Management
- **Schema Introspection**: Get table structures and relationships
- **Row Counting**: Count rows with optional filters
- **Metrics**: Monitor query performance and statistics

### 🤖 AI-Powered Assistance
- **Schema Analysis**: AI-powered database schema analysis
- **Query Optimization**: Get suggestions for query improvements
- **Migration Generation**: Generate SQL migrations from requirements
- **RLS Policy Generation**: Create Row Level Security policies
- **Data Modeling**: Get help with database design
- **Query Debugging**: Debug failing queries

### 🚀 Production Ready
- **Multi-layer Architecture**: nginx (8080) → supergateway (8081) → MCP service
- **Authentication**: Bearer token authentication via nginx
- **Caching**: Built-in query result caching
- **Retry Logic**: Automatic retry on failed operations  
- **Metrics**: Performance monitoring and statistics
- **Error Handling**: Comprehensive error handling and logging
- **Security**: Support for both anon and service role keys
- **SSE Support**: Server-Sent Events for real-time updates
- **Docker Ready**: Complete containerization with nginx and supergateway

## Architecture

This MCP server follows a production-ready multi-layer architecture:

```
External Client (n8n/Claude Desktop)
    ↓ HTTP/HTTPS (Bearer Auth)
Port 8080 - Nginx (Reverse Proxy + Authentication)
    ↓ Internal forwarding  
Port 8081 - Supergateway (Protocol Conversion + Process Management)
    ↓ stdio communication
Node.js MCP Service (Business Logic)
    ↓ API calls
Supabase Database
```

### Key Components

- **Nginx (Port 8080)**: Handles external requests, Bearer token authentication, SSL termination
- **Supergateway (Port 8081)**: Converts HTTP/SSE requests to MCP protocol stdio communication
- **MCP Service**: Implements the actual database operations and business logic
- **SSE Server**: Alternative HTTP interface for real-time updates

## Installation

### Option 1: Docker (Recommended)

1. Clone or copy the `supabase-mcp` directory
2. Create environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```
3. Build and run with Docker:
   ```bash
   docker build -t supabase-mcp .
   docker run -p 8080:8080 --env-file .env supabase-mcp
   ```

### Option 2: Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Install supergateway globally:
   ```bash
   npm install -g supergateway
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Start with development script:
   ```bash
   ./start.sh
   ```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key for admin operations |
| `MCP_AUTH_TOKEN` | No | Bearer token for nginx authentication (default: auto-generated) |
| `CACHE_TTL` | No | Cache time-to-live in milliseconds (default: 300000) |
| `MAX_RETRIES` | No | Maximum retry attempts (default: 3) |
| `RETRY_DELAY` | No | Retry delay in milliseconds (default: 1000) |
| `SSE_PORT` | No | SSE server port (default: 8082) |
| `SSE_HOST` | No | SSE server host (default: localhost) |

### Example `.env` file:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MCP_AUTH_TOKEN=your-secure-bearer-token
```

## Usage

### Starting the Server

```bash
# Docker (Recommended)
docker build -t supabase-mcp .
docker run -p 8080:8080 --env-file .env supabase-mcp

# Local development
npm run build
./start.sh

# Alternative: SSE server only
npm run dev:sse
```

### Accessing the Server

- **Main endpoint**: `http://localhost:8080` (requires Bearer token)
- **Health check**: `http://localhost:8080/health`
- **SSE endpoint**: `http://localhost:8082/sse`
- **Documentation**: `http://localhost:8082/docs`

### Authentication

All requests to port 8080 require Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/health
```

### Available Tools

#### Query Data
```typescript
// Query with filters and options
{
  "name": "query",
  "arguments": {
    "table": "users",
    "select": "id, name, email",
    "filters": [
      { "column": "active", "operator": "eq", "value": true },
      { "column": "created_at", "operator": "gte", "value": "2024-01-01" }
    ],
    "order": { "column": "created_at", "ascending": false },
    "limit": 10
  }
}
```

#### Insert Data
```typescript
{
  "name": "insert",
  "arguments": {
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com",
      "active": true
    }
  }
}
```

#### Update Data
```typescript
{
  "name": "update",
  "arguments": {
    "table": "users",
    "data": { "active": false },
    "filters": [
      { "column": "id", "operator": "eq", "value": 123 }
    ]
  }
}
```

#### Delete Data
```typescript
{
  "name": "delete",
  "arguments": {
    "table": "users",
    "filters": [
      { "column": "id", "operator": "eq", "value": 123 }
    ]
  }
}
```

#### Call RPC Function
```typescript
{
  "name": "rpc",
  "arguments": {
    "functionName": "get_user_stats",
    "params": { "user_id": 123 }
  }
}
```

### Available Resources

- `supabase://config` - Current configuration and connection status
- `supabase://tables` - List of all database tables
- `supabase://functions` - List of all RPC functions
- `supabase://policies` - Row Level Security policies
- `supabase://stats` - Database statistics and metrics

### Available Prompts

- `analyze-schema` - Analyze database schema and suggest improvements
- `generate-migration` - Generate SQL migrations from requirements
- `optimize-query` - Get query optimization suggestions
- `generate-rls-policy` - Create Row Level Security policies
- `data-modeling` - Get help with database design
- `debug-query` - Debug failing queries

## Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `{ "column": "status", "operator": "eq", "value": "active" }` |
| `neq` | Not equal | `{ "column": "status", "operator": "neq", "value": "deleted" }` |
| `gt` | Greater than | `{ "column": "age", "operator": "gt", "value": 18 }` |
| `gte` | Greater than or equal | `{ "column": "score", "operator": "gte", "value": 100 }` |
| `lt` | Less than | `{ "column": "price", "operator": "lt", "value": 50 }` |
| `lte` | Less than or equal | `{ "column": "quantity", "operator": "lte", "value": 10 }` |
| `like` | Pattern matching | `{ "column": "name", "operator": "like", "value": "%john%" }` |
| `ilike` | Case-insensitive pattern matching | `{ "column": "email", "operator": "ilike", "value": "%@gmail.com" }` |
| `is` | Is null/not null | `{ "column": "deleted_at", "operator": "is", "value": null }` |
| `in` | In array | `{ "column": "status", "operator": "in", "value": ["active", "pending"] }` |

## Error Handling

The server includes comprehensive error handling:

- **Connection Errors**: Automatic retry with exponential backoff
- **Query Errors**: Detailed error messages with context
- **Validation Errors**: Input validation with helpful messages
- **Rate Limiting**: Built-in protection against excessive requests

## Performance Features

- **Query Caching**: Automatic caching of SELECT queries
- **Connection Pooling**: Efficient database connection management
- **Batch Operations**: Execute multiple operations in a single request
- **Metrics Collection**: Monitor performance and usage statistics

## Security

- **Row Level Security**: Full support for Supabase RLS policies
- **Key Management**: Support for both anon and service role keys
- **Input Validation**: Comprehensive input sanitization
- **SQL Injection Protection**: Built-in protection through Supabase client

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run type-check` - Type check without compilation
- `npm run lint` - Run ESLint

### Project Structure

```
supabase-mcp/
├── src/
│   ├── index.ts          # Main server entry point
│   ├── types.ts          # Type definitions
│   ├── tools.ts          # Database operation tools
│   ├── resources.ts      # Resource handlers
│   └── prompts.ts        # AI prompts for assistance
├── dist/                 # Compiled output
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── Dockerfile           # Docker container configuration
├── railway.json         # Railway deployment configuration
└── README.md            # This file
```

## Deployment

### Docker

```bash
# Build image
docker build -t supabase-mcp .

# Run container
docker run -p 3000:3000 --env-file .env supabase-mcp
```

### Railway

1. Connect your repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically with each push

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the existing issues in the repository
2. Create a new issue with detailed information
3. Include environment details and error messages

## Changelog

### v1.0.0
- Initial release
- Basic CRUD operations
- Schema introspection
- AI-powered assistance
- Production-ready features