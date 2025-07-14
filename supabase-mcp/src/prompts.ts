import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function setupPrompts(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'analyze-schema',
        description: 'Analyze database schema and suggest improvements',
        arguments: [
          {
            name: 'table',
            description: 'Specific table to analyze (optional)',
            required: false
          }
        ]
      },
      {
        name: 'generate-migration',
        description: 'Generate SQL migration based on requirements',
        arguments: [
          {
            name: 'requirements',
            description: 'Description of the migration requirements',
            required: true
          }
        ]
      },
      {
        name: 'optimize-query',
        description: 'Optimize a database query',
        arguments: [
          {
            name: 'query',
            description: 'The query to optimize',
            required: true
          }
        ]
      },
      {
        name: 'generate-rls-policy',
        description: 'Generate Row Level Security policy',
        arguments: [
          {
            name: 'table',
            description: 'Table name',
            required: true
          },
          {
            name: 'requirements',
            description: 'Security requirements',
            required: true
          }
        ]
      },
      {
        name: 'data-modeling',
        description: 'Help with data modeling and relationships',
        arguments: [
          {
            name: 'entities',
            description: 'Entities and their relationships',
            required: true
          }
        ]
      },
      {
        name: 'debug-query',
        description: 'Debug a failing query',
        arguments: [
          {
            name: 'query',
            description: 'The failing query',
            required: true
          },
          {
            name: 'error',
            description: 'Error message',
            required: true
          }
        ]
      }
    ]
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'analyze-schema': {
          const table = args?.table;
          const basePrompt = `Please analyze the database schema${table ? ` for the table "${table}"` : ''} and provide:

1. **Current Structure Analysis**:
   - Table relationships
   - Data types appropriateness
   - Naming conventions
   - Missing indexes

2. **Potential Issues**:
   - Performance bottlenecks
   - Data integrity concerns
   - Scalability issues

3. **Recommendations**:
   - Index suggestions
   - Normalization improvements
   - Data type optimizations
   - Constraint additions

4. **Best Practices**:
   - Naming convention improvements
   - Missing foreign keys
   - Suggested RLS policies`;

          return {
            prompt: basePrompt,
            arguments: args
          };
        }

        case 'generate-migration': {
          const { requirements } = args as any;
          return {
            prompt: `Generate a SQL migration for Supabase based on these requirements:

${requirements}

Please provide:
1. **Migration SQL** with:
   - CREATE TABLE statements
   - ALTER TABLE statements if modifying existing tables
   - Index creation
   - Constraints and foreign keys
   - RLS policies if applicable

2. **Rollback SQL** to undo the migration

3. **TypeScript Types** for the new/modified tables

4. **Example Queries** showing how to use the new structure

5. **Considerations**:
   - Data migration if needed
   - Performance impact
   - Backward compatibility`,
            arguments: args
          };
        }

        case 'optimize-query': {
          const { query } = args as any;
          return {
            prompt: `Optimize this Supabase query:

\`\`\`sql
${query}
\`\`\`

Please provide:
1. **Optimized Query** with explanations
2. **Performance Analysis**:
   - Current query execution plan
   - Bottlenecks identified
   - Expected improvements

3. **Index Recommendations**
4. **Alternative Approaches** using:
   - Supabase client optimizations
   - RPC functions if beneficial
   - Materialized views if applicable

5. **Best Practices** violated and how to fix them`,
            arguments: args
          };
        }

        case 'generate-rls-policy': {
          const { table, requirements } = args as any;
          return {
            prompt: `Generate Row Level Security (RLS) policies for the "${table}" table based on these requirements:

${requirements}

Please provide:
1. **SQL Policies**:
   - SELECT policies
   - INSERT policies
   - UPDATE policies
   - DELETE policies

2. **Policy Explanations**:
   - What each policy does
   - Security implications
   - Performance considerations

3. **Testing Queries** to verify policies work correctly

4. **Common Pitfalls** to avoid

5. **Integration Guide** with Supabase Auth`,
            arguments: args
          };
        }

        case 'data-modeling': {
          const { entities } = args as any;
          return {
            prompt: `Help design a data model for these entities and relationships:

${entities}

Please provide:
1. **Entity Relationship Diagram** (in text format)
2. **Table Definitions** with:
   - Primary keys
   - Foreign keys
   - Appropriate data types
   - Constraints

3. **Normalization Analysis**:
   - Current normal form
   - Recommendations for improvement

4. **Index Strategy**
5. **Sample Queries** for common operations
6. **Scalability Considerations**
7. **RLS Policy Suggestions**`,
            arguments: args
          };
        }

        case 'debug-query': {
          const { query, error } = args as any;
          return {
            prompt: `Debug this failing Supabase query:

**Query:**
\`\`\`sql
${query}
\`\`\`

**Error:**
\`\`\`
${error}
\`\`\`

Please provide:
1. **Root Cause Analysis**
2. **Fixed Query** with explanations
3. **Common Causes** for this type of error
4. **Prevention Tips**
5. **Related Documentation** references`,
            arguments: args
          };
        }

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      console.error(`[Prompt Error - ${name}]`, error);
      throw error;
    }
  });
}