export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface QueryResult {
  data: any[] | null;
  error: Error | null;
  count?: number;
}

export interface TableInfo {
  tableName: string;
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  isNullable: boolean;
  defaultValue?: any;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface DatabaseMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageResponseTime: number;
  lastQueryTime?: Date;
}

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

export type SupabaseOperation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface QueryOptions {
  select?: string;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  filters?: FilterCondition[];
  single?: boolean;
}

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: any;
}

export type FilterOperator = 
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'is' | 'in'
  | 'contains' | 'containedBy' | 'overlaps';

export interface BatchOperation {
  table: string;
  operation: SupabaseOperation;
  data?: any;
  options?: QueryOptions;
}

export interface TransactionResult {
  success: boolean;
  results: QueryResult[];
  error?: Error;
}