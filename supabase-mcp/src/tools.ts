import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  QueryOptions, 
  QueryResult, 
  BatchOperation,
  TransactionResult,
  DatabaseMetrics,
  CacheEntry,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo
} from './types.js';

const CACHE_TTL = 300000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

let supabaseClient: SupabaseClient | null = null;
const queryCache = new Map<string, CacheEntry>();
const metrics: DatabaseMetrics = {
  totalQueries: 0,
  successfulQueries: 0,
  failedQueries: 0,
  averageResponseTime: 0,
};

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      throw new Error('Supabase credentials not configured');
    }
    
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

function getCacheKey(operation: string, params: any): string {
  return `${operation}:${JSON.stringify(params)}`;
}

function getFromCache(key: string): any | null {
  const entry = queryCache.get(key);
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    return entry.data;
  }
  queryCache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttl: number = CACHE_TTL): void {
  queryCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of queryCache.entries()) {
    if (now - entry.timestamp >= entry.ttl) {
      queryCache.delete(key);
    }
  }
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

function updateMetrics(startTime: number, success: boolean): void {
  const responseTime = Date.now() - startTime;
  metrics.totalQueries++;
  if (success) {
    metrics.successfulQueries++;
  } else {
    metrics.failedQueries++;
  }
  metrics.averageResponseTime = 
    (metrics.averageResponseTime * (metrics.totalQueries - 1) + responseTime) / metrics.totalQueries;
  metrics.lastQueryTime = new Date();
}

export function setupTools(server: Server): void {
  // Query data from a table
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'query',
        description: 'Query data from a Supabase table with filters and options',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            select: { type: 'string', description: 'Columns to select (default: *)' },
            filters: {
              type: 'array',
              description: 'Filter conditions',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string' },
                  operator: { 
                    type: 'string',
                    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']
                  },
                  value: {}
                },
                required: ['column', 'operator', 'value']
              }
            },
            order: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                ascending: { type: 'boolean' }
              }
            },
            limit: { type: 'number' },
            offset: { type: 'number' },
            single: { type: 'boolean', description: 'Return single record' }
          },
          required: ['table']
        }
      },
      {
        name: 'insert',
        description: 'Insert data into a Supabase table',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            data: { 
              oneOf: [
                { type: 'object', description: 'Single record to insert' },
                { type: 'array', items: { type: 'object' }, description: 'Multiple records to insert' }
              ]
            },
            returning: { type: 'boolean', description: 'Return inserted data', default: true }
          },
          required: ['table', 'data']
        }
      },
      {
        name: 'update',
        description: 'Update data in a Supabase table',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            data: { type: 'object', description: 'Data to update' },
            filters: {
              type: 'array',
              description: 'Filter conditions for rows to update',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string' },
                  operator: { type: 'string' },
                  value: {}
                },
                required: ['column', 'operator', 'value']
              }
            },
            returning: { type: 'boolean', description: 'Return updated data', default: true }
          },
          required: ['table', 'data', 'filters']
        }
      },
      {
        name: 'delete',
        description: 'Delete data from a Supabase table',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            filters: {
              type: 'array',
              description: 'Filter conditions for rows to delete',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string' },
                  operator: { type: 'string' },
                  value: {}
                },
                required: ['column', 'operator', 'value']
              }
            },
            returning: { type: 'boolean', description: 'Return deleted data', default: true }
          },
          required: ['table', 'filters']
        }
      },
      {
        name: 'upsert',
        description: 'Upsert (insert or update) data in a Supabase table',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            data: { 
              oneOf: [
                { type: 'object' },
                { type: 'array', items: { type: 'object' } }
              ],
              description: 'Data to upsert'
            },
            onConflict: { type: 'string', description: 'Column(s) to check for conflicts' },
            returning: { type: 'boolean', description: 'Return upserted data', default: true }
          },
          required: ['table', 'data']
        }
      },
      {
        name: 'rpc',
        description: 'Call a Supabase RPC (Remote Procedure Call) function',
        inputSchema: {
          type: 'object',
          properties: {
            functionName: { type: 'string', description: 'RPC function name' },
            params: { type: 'object', description: 'Function parameters' }
          },
          required: ['functionName']
        }
      },
      {
        name: 'batch',
        description: 'Execute multiple operations in a batch',
        inputSchema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  table: { type: 'string' },
                  operation: { 
                    type: 'string',
                    enum: ['select', 'insert', 'update', 'delete', 'upsert']
                  },
                  data: {},
                  options: { type: 'object' }
                },
                required: ['table', 'operation']
              }
            }
          },
          required: ['operations']
        }
      },
      {
        name: 'schema',
        description: 'Get table schema information',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name (optional, returns all tables if not specified)' }
          }
        }
      },
      {
        name: 'count',
        description: 'Count rows in a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Table name' },
            filters: {
              type: 'array',
              description: 'Filter conditions',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string' },
                  operator: { type: 'string' },
                  value: {}
                }
              }
            }
          },
          required: ['table']
        }
      },
      {
        name: 'metrics',
        description: 'Get database operation metrics',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }));

  // Handle query operation
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();
    let success = false;

    try {
      clearExpiredCache();

      switch (name) {
        case 'query': {
          const { table, select = '*', filters = [], order, limit, offset, single } = args as any;
          const cacheKey = getCacheKey('query', args);
          
          const cached = getFromCache(cacheKey);
          if (cached) {
            return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
          }

          const client = getSupabaseClient();
          let query = client.from(table).select(select);

          for (const filter of filters) {
            query = (query as any)[filter.operator](filter.column, filter.value);
          }

          if (order) {
            query = query.order(order.column, { ascending: order.ascending ?? true });
          }
          if (limit) query = query.limit(limit);
          if (offset) query = query.range(offset, offset + (limit || 10) - 1);
          if (single) query = query.single();

          const result = await executeWithRetry(() => query);
          
          if (result.error) throw result.error;
          
          setCache(cacheKey, result.data);
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                data: result.data,
                count: result.count
              }, null, 2)
            }]
          };
        }

        case 'insert': {
          const { table, data, returning = true } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).insert(data);
          if (returning) query = query.select();

          const result = await executeWithRetry(() => query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: result.data
              }, null, 2)
            }]
          };
        }

        case 'update': {
          const { table, data, filters = [], returning = true } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).update(data);
          
          for (const filter of filters) {
            query = (query as any)[filter.operator](filter.column, filter.value);
          }
          
          if (returning) query = query.select();

          const result = await executeWithRetry(() => query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: result.data
              }, null, 2)
            }]
          };
        }

        case 'delete': {
          const { table, filters = [], returning = true } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).delete();
          
          for (const filter of filters) {
            query = (query as any)[filter.operator](filter.column, filter.value);
          }
          
          if (returning) query = query.select();

          const result = await executeWithRetry(() => query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: result.data
              }, null, 2)
            }]
          };
        }

        case 'upsert': {
          const { table, data, onConflict, returning = true } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).upsert(data, { onConflict });
          if (returning) query = query.select();

          const result = await executeWithRetry(() => query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: result.data
              }, null, 2)
            }]
          };
        }

        case 'rpc': {
          const { functionName, params = {} } = args as any;
          const client = getSupabaseClient();
          
          const result = await executeWithRetry(() => client.rpc(functionName, params));
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: result.data
              }, null, 2)
            }]
          };
        }

        case 'batch': {
          const { operations } = args as any;
          const results: QueryResult[] = [];
          
          for (const op of operations) {
            try {
              const result = await server.callTool(op.operation, {
                table: op.table,
                ...op.data,
                ...op.options
              });
              results.push({ data: result, error: null });
            } catch (error) {
              results.push({ data: null, error: error as Error });
            }
          }
          
          success = results.every(r => !r.error);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success,
                results
              }, null, 2)
            }]
          };
        }

        case 'schema': {
          const { table } = args as any;
          const client = getSupabaseClient();
          
          // Get table information from information_schema
          const tablesQuery = table 
            ? client.from('information_schema.tables').select('*').eq('table_name', table)
            : client.from('information_schema.tables').select('*').eq('table_schema', 'public');
            
          const tablesResult = await executeWithRetry(() => tablesQuery);
          
          if (tablesResult.error) throw tablesResult.error;
          
          // Get columns information
          const columnsQuery = table
            ? client.from('information_schema.columns').select('*').eq('table_name', table)
            : client.from('information_schema.columns').select('*').eq('table_schema', 'public');
            
          const columnsResult = await executeWithRetry(() => columnsQuery);
          
          if (columnsResult.error) throw columnsResult.error;
          
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                tables: tablesResult.data,
                columns: columnsResult.data
              }, null, 2)
            }]
          };
        }

        case 'count': {
          const { table, filters = [] } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).select('*', { count: 'exact', head: true });
          
          for (const filter of filters) {
            query = (query as any)[filter.operator](filter.column, filter.value);
          }

          const result = await executeWithRetry(() => query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: result.count
              }, null, 2)
            }]
          };
        }

        case 'metrics': {
          success = true;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(metrics, null, 2)
            }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[Tool Error - ${name}]`, error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            details: error
          }, null, 2)
        }]
      };
    } finally {
      updateMetrics(startTime, success);
    }
  });
}