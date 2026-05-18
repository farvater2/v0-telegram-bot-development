declare module 'sql.js' {
  export type SqlValue = string | number | null | Uint8Array;
  
  export interface Database {
    run(sql: string, params?: SqlValue[]): void;
    exec(sql: string, params?: SqlValue[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export default function initSqlJs(): Promise<SqlJsStatic>;
}
