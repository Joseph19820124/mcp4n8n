import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

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

export function setupResources(server: Server): void {
  server.setRequestHandler('resources/list', async () => ({
    resources: [
      {
        uri: 'supabase://config',
        name: 'Supabase Configuration',
        description: 'Current Supabase configuration and connection status',
        mimeType: 'application/json'
      },
      {
        uri: 'supabase://tables',
        name: 'Database Tables',
        description: 'List of all tables in the database',
        mimeType: 'application/json'
      },
      {
        uri: 'supabase://functions',
        name: 'Database Functions',
        description: 'List of all RPC functions in the database',
        mimeType: 'application/json'
      },
      {
        uri: 'supabase://policies',
        name: 'Row Level Security Policies',
        description: 'List of all RLS policies in the database',
        mimeType: 'application/json'
      },
      {
        uri: 'supabase://stats',
        name: 'Database Statistics',
        description: 'Database usage statistics and metrics',
        mimeType: 'application/json'
      }
    ]
  }));

  server.setRequestHandler('resources/read', async (request) => {
    const { uri } = request.params;

    try {
      switch (uri) {
        case 'supabase://config': {
          const url = process.env.SUPABASE_URL;
          const hasAnonKey = !!process.env.SUPABASE_ANON_KEY;
          const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                url,
                hasAnonKey,
                hasServiceKey,
                usingServiceKey: hasServiceKey,
                status: 'connected'
              }, null, 2)
            }]
          };
        }

        case 'supabase://tables': {
          const client = getSupabaseClient();
          
          // Query information schema for tables
          const { data, error } = await client
            .from('information_schema.tables')
            .select('table_name, table_type')
            .eq('table_schema', 'public')
            .order('table_name');
          
          if (error) throw error;
          
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                tables: data,
                count: data.length
              }, null, 2)
            }]
          };
        }

        case 'supabase://functions': {
          const client = getSupabaseClient();
          
          // Query for database functions
          const { data, error } = await client
            .from('information_schema.routines')
            .select('routine_name, routine_type, data_type')
            .eq('routine_schema', 'public')
            .order('routine_name');
          
          if (error) throw error;
          
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                functions: data,
                count: data.length
              }, null, 2)
            }]
          };
        }

        case 'supabase://policies': {
          const client = getSupabaseClient();
          
          // Query for RLS policies
          const { data, error } = await client
            .rpc('get_policies', {})
            .select('*');
          
          if (error) {
            // If the RPC doesn't exist, return a message
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'RLS policies information not available',
                  hint: 'Create a get_policies() function to retrieve policy information'
                }, null, 2)
              }]
            };
          }
          
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                policies: data,
                count: data.length
              }, null, 2)
            }]
          };
        }

        case 'supabase://stats': {
          const client = getSupabaseClient();
          
          try {
            // Try to get database stats
            const { data: tableStats, error: tableError } = await client
              .from('information_schema.tables')
              .select('table_name')
              .eq('table_schema', 'public');
            
            const { data: columnStats, error: columnError } = await client
              .from('information_schema.columns')
              .select('table_name')
              .eq('table_schema', 'public');
            
            const tableCount = tableStats?.length || 0;
            const totalColumns = columnStats?.length || 0;
            
            // Group columns by table
            const columnsByTable: Record<string, number> = {};
            if (columnStats) {
              for (const col of columnStats) {
                columnsByTable[col.table_name] = (columnsByTable[col.table_name] || 0) + 1;
              }
            }
            
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  stats: {
                    totalTables: tableCount,
                    totalColumns,
                    avgColumnsPerTable: tableCount > 0 ? Math.round(totalColumns / tableCount) : 0,
                    columnsByTable
                  }
                }, null, 2)
              }]
            };
          } catch (error) {
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  error: 'Unable to retrieve database statistics',
                  details: error instanceof Error ? error.message : 'Unknown error'
                }, null, 2)
              }]
            };
          }
        }

        default:
          throw new Error(`Unknown resource URI: ${uri}`);
      }
    } catch (error) {
      console.error(`[Resource Error - ${uri}]`, error);
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            details: error
          }, null, 2)
        }]
      };
    }
  });
}