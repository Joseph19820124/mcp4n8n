import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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
    
    console.error('[Debug] Supabase URL:', url ? `${url.substring(0, 20)}...` : 'NOT SET');
    console.error('[Debug] Supabase Key:', key ? `${key.substring(0, 10)}...` : 'NOT SET');
    
    if (!url || !key) {
      console.error('[Error] Missing Supabase credentials:');
      console.error('- SUPABASE_URL:', !!url);
      console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
      console.error('- SUPABASE_ANON_KEY:', !!process.env.SUPABASE_ANON_KEY);
      throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variables.');
    }
    
    try {
      supabaseClient = createClient(url, key);
      console.error('[Debug] Supabase client created successfully');
    } catch (error) {
      console.error('[Error] Failed to create Supabase client:', error);
      throw error;
    }
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
      console.error(`[Retry ${i + 1}/${retries}] Operation failed:`, error);
      
      // Provide specific error messages for common issues
      if (error instanceof Error) {
        if (error.message.includes('fetch failed')) {
          console.error('[Network Error] Unable to connect to Supabase. Check:');
          console.error('1. Internet connectivity');
          console.error('2. Supabase URL is correct');
          console.error('3. Firewall/proxy settings');
        } else if (error.message.includes('Invalid API key')) {
          console.error('[Auth Error] Invalid Supabase API key. Check your credentials.');
        }
      }
      
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
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'health_check',
        description: 'Check Supabase connection and credentials',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'network_test',
        description: 'Test basic network connectivity to Supabase',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
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
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();
    let success = false;

    try {
      clearExpiredCache();

      switch (name) {
        case 'health_check': {
          try {
            console.error('[Health Check] Starting Supabase connection test...');
            
            // Check environment variables
            const envCheck = {
              SUPABASE_URL: !!process.env.SUPABASE_URL,
              SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
              SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
            };
            
            console.error('[Health Check] Environment variables:', envCheck);
            
            // Try to create client
            const client = getSupabaseClient();
            
            // Try a simple query to test connection
            console.error('[Health Check] Testing basic connectivity...');
            const { data, error } = await client
              .from('information_schema.tables')
              .select('count(*)')
              .limit(1);
            
            if (error) {
              console.error('[Health Check] Connection test failed:', error);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'FAILED',
                    error: error.message,
                    environmentVariables: envCheck,
                    suggestion: 'Check your Supabase credentials and network connectivity'
                  }, null, 2)
                }]
              };
            }
            
            console.error('[Health Check] Connection test successful');
            success = true;
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  status: 'SUCCESS',
                  message: 'Supabase connection is working correctly',
                  environmentVariables: envCheck,
                  testResult: 'Database query executed successfully'
                }, null, 2)
              }]
            };
          } catch (error) {
            console.error('[Health Check] Unexpected error:', error);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  status: 'ERROR',
                  error: error instanceof Error ? error.message : 'Unknown error',
                  environmentVariables: {
                    SUPABASE_URL: !!process.env.SUPABASE_URL,
                    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
                    SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
                  }
                }, null, 2)
              }]
            };
          }
        }

        case 'network_test': {
          try {
            console.error('[Network Test] Starting connectivity tests...');
            
            const supabaseUrl = process.env.SUPABASE_URL;
            if (!supabaseUrl) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'ERROR',
                    error: 'SUPABASE_URL not set'
                  }, null, 2)
                }]
              };
            }
            
            const url = new URL(supabaseUrl);
            const hostname = url.hostname;
            
            console.error(`[Network Test] Testing connection to: ${hostname}`);
            
            // Try basic HTTP fetch to the Supabase endpoint
            const testUrl = `${supabaseUrl}/rest/v1/`;
            console.error(`[Network Test] Fetching: ${testUrl}`);
            
            try {
              const response = await fetch(testUrl, {
                method: 'HEAD',
                headers: {
                  'apikey': process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
                }
              });
              
              console.error(`[Network Test] Response status: ${response.status}`);
              
              success = true;
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'SUCCESS',
                    message: 'Network connectivity test passed',
                    details: {
                      hostname,
                      httpStatus: response.status,
                      responseHeaders: Object.fromEntries(response.headers.entries())
                    }
                  }, null, 2)
                }]
              };
            } catch (fetchError) {
              console.error(`[Network Test] Fetch failed:`, fetchError);
              
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'FAILED',
                    error: 'Network connectivity test failed',
                    details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
                    hostname,
                    troubleshooting: [
                      'Check if the container has internet access',
                      'Verify DNS resolution works',
                      'Check firewall/proxy settings',
                      'Ensure Supabase URL is correct'
                    ]
                  }, null, 2)
                }]
              };
            }
          } catch (error) {
            console.error('[Network Test] Unexpected error:', error);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  status: 'ERROR',
                  error: error instanceof Error ? error.message : 'Unknown error'
                }, null, 2)
              }]
            };
          }
        }

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
          if (offset) query = (query as any).range(offset, offset + (limit || 10) - 1);
          if (single) query = (query as any).single();

          const result = await executeWithRetry(async () => await query);
          
          if (result.error) throw result.error;
          
          setCache(cacheKey, (result as any).data);
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                data: (result as any).data,
                count: result.count
              }, null, 2)
            }]
          };
        }

        case 'insert': {
          const { table, data, returning = true } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).insert(data);
          if (returning) query = (query as any).select();

          const result = await executeWithRetry(async () => await query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: (result as any).data
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
          
          if (returning) query = (query as any).select();

          const result = await executeWithRetry(async () => await query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: (result as any).data
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
          
          if (returning) query = (query as any).select();

          const result = await executeWithRetry(async () => await query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: (result as any).data
              }, null, 2)
            }]
          };
        }

        case 'upsert': {
          const { table, data, onConflict, returning = true } = args as any;
          const client = getSupabaseClient();
          
          let query = client.from(table).upsert(data, { onConflict });
          if (returning) query = (query as any).select();

          const result = await executeWithRetry(async () => await query);
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: (result as any).data
              }, null, 2)
            }]
          };
        }

        case 'rpc': {
          const { functionName, params = {} } = args as any;
          const client = getSupabaseClient();
          
          const result = await executeWithRetry(async () => await client.rpc(functionName, params));
          
          if (result.error) throw result.error;
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                data: (result as any).data
              }, null, 2)
            }]
          };
        }

        case 'batch': {
          const { operations } = args as any;
          const results: QueryResult[] = [];
          
          for (const op of operations) {
            try {
              // Batch operations not supported in current implementation
              results.push({ data: null, error: new Error('Batch operations not supported') });
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
            
          const tablesResult = await executeWithRetry(async () => await tablesQuery);
          
          if (tablesResult.error) throw tablesResult.error;
          
          // Get columns information
          const columnsQuery = table
            ? client.from('information_schema.columns').select('*').eq('table_name', table)
            : client.from('information_schema.columns').select('*').eq('table_schema', 'public');
            
          const columnsResult = await executeWithRetry(async () => await columnsQuery);
          
          if (columnsResult.error) throw columnsResult.error;
          
          success = true;
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                tables: (tablesResult as any).data,
                columns: (columnsResult as any).data
              }, null, 2)
            }]
          };
        }

        case 'count': {
          const { table, filters = [] } = args as any;
          console.error(`[Count] Counting rows in table: ${table}`);
          
          try {
            const client = getSupabaseClient();
            
            let query = client.from(table).select('*', { count: 'exact', head: true });
            
            for (const filter of filters) {
              query = (query as any)[filter.operator](filter.column, filter.value);
            }

            console.error(`[Count] Executing query for table: ${table}`);
            const result = await executeWithRetry(async () => await query);
            
            if (result.error) {
              console.error(`[Count] Query failed:`, result.error);
              
              // Check if it's a table not found error
              if (result.error.message.includes('does not exist') || result.error.message.includes('relation') || result.error.code === 'PGRST116') {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: `Table '${table}' does not exist or is not accessible`,
                      suggestion: 'Check table name spelling and permissions',
                      availableTables: 'Use the schema tool to see available tables'
                    }, null, 2)
                  }]
                };
              }
              
              throw result.error;
            }
            
            console.error(`[Count] Query successful, count: ${result.count}`);
            success = true;
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  count: result.count
                }, null, 2)
              }]
            };
          } catch (error) {
            console.error(`[Count] Unexpected error:`, error);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'Network connection failed',
                  details: error instanceof Error ? error.message : 'Unknown error',
                  troubleshooting: {
                    step1: 'Check if Supabase is accessible from your network',
                    step2: 'Verify firewall/proxy settings',
                    step3: 'Run health_check tool for detailed diagnostics',
                    step4: 'Check Supabase service status'
                  }
                }, null, 2)
              }]
            };
          }
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