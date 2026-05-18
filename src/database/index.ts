import initSqlJs, { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import type { Task, TaskHistory, CreateTaskParams, UpdateTaskParams, TaskStatus } from '../types/index.js';

const DB_PATH = process.env.DB_PATH || './data/bot.db';

let db: SqlJsDatabase | null = null;

// Initialize database
export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  
  // Ensure data directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    logger.info('Database loaded from file');
  } else {
    db = new SQL.Database();
    logger.info('New database created');
  }
  
  // Create tables
  createTables();
  
  return db;
}

// Save database to file
export function saveDatabase(): void {
  if (!db) return;
  
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  logger.debug('Database saved to file');
}

// Create tables
function createTables(): void {
  if (!db) throw new Error('Database not initialized');
  
  // Tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      url TEXT NOT NULL,
      regex_pattern TEXT NOT NULL,
      template TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'extract',
      condition_type TEXT NOT NULL DEFAULT 'on_change',
      condition_expression TEXT,
      frequency_seconds INTEGER NOT NULL DEFAULT 3600,
      status TEXT NOT NULL DEFAULT 'stopped',
      last_value TEXT,
      last_check TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      headers TEXT,
      timeout INTEGER DEFAULT 30,
      max_retries INTEGER DEFAULT 3,
      http_method TEXT DEFAULT 'GET',
      request_body TEXT,
      user_agent TEXT DEFAULT 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    )
  `);
  
  // Task history table
  db.run(`
    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      check_time TEXT NOT NULL DEFAULT (datetime('now')),
      result TEXT,
      message_sent INTEGER DEFAULT 0,
      response_time INTEGER,
      status_code INTEGER,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);
  
  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_task_id ON task_history(task_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_check_time ON task_history(check_time)');
  
  saveDatabase();
  logger.info('Database tables created');
}

// Get database instance
export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// Task CRUD operations
export function createTask(params: CreateTaskParams): Task {
  const db = getDatabase();
  
  const headers = params.headers ? JSON.stringify(params.headers) : null;
  
  db.run(`
    INSERT INTO tasks (
      user_id, name, url, regex_pattern, template, mode, 
      condition_type, condition_expression, frequency_seconds,
      headers, timeout, max_retries, http_method, request_body, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    params.user_id,
    params.name || null,
    params.url,
    params.regex_pattern,
    params.template,
    params.mode,
    params.condition_type,
    params.condition_expression || null,
    params.frequency_seconds,
    headers,
    params.timeout || 30,
    params.max_retries || 3,
    params.http_method || 'GET',
    params.request_body || null,
    params.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  ]);
  
  saveDatabase();
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  const taskId = result[0].values[0][0] as number;
  
  return getTaskById(taskId)!;
}

export function getTaskById(id: number): Task | null {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
  
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  
  return rowToTask(result[0].columns, result[0].values[0]);
}

export function getTasksByUserId(userId: number): Task[] {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  
  if (result.length === 0) {
    return [];
  }
  
  return result[0].values.map(row => rowToTask(result[0].columns, row));
}

export function getActiveTasks(): Task[] {
  const db = getDatabase();
  const result = db.exec('SELECT * FROM tasks WHERE status = ?', ['active']);
  
  if (result.length === 0) {
    return [];
  }
  
  return result[0].values.map(row => rowToTask(result[0].columns, row));
}

export function updateTask(id: number, params: UpdateTaskParams): Task | null {
  const db = getDatabase();
  
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (params.name !== undefined) {
    updates.push('name = ?');
    values.push(params.name);
  }
  if (params.url !== undefined) {
    updates.push('url = ?');
    values.push(params.url);
  }
  if (params.regex_pattern !== undefined) {
    updates.push('regex_pattern = ?');
    values.push(params.regex_pattern);
  }
  if (params.template !== undefined) {
    updates.push('template = ?');
    values.push(params.template);
  }
  if (params.mode !== undefined) {
    updates.push('mode = ?');
    values.push(params.mode);
  }
  if (params.condition_type !== undefined) {
    updates.push('condition_type = ?');
    values.push(params.condition_type);
  }
  if (params.condition_expression !== undefined) {
    updates.push('condition_expression = ?');
    values.push(params.condition_expression);
  }
  if (params.frequency_seconds !== undefined) {
    updates.push('frequency_seconds = ?');
    values.push(params.frequency_seconds);
  }
  if (params.headers !== undefined) {
    updates.push('headers = ?');
    values.push(JSON.stringify(params.headers));
  }
  if (params.timeout !== undefined) {
    updates.push('timeout = ?');
    values.push(params.timeout);
  }
  if (params.max_retries !== undefined) {
    updates.push('max_retries = ?');
    values.push(params.max_retries);
  }
  if (params.http_method !== undefined) {
    updates.push('http_method = ?');
    values.push(params.http_method);
  }
  if (params.request_body !== undefined) {
    updates.push('request_body = ?');
    values.push(params.request_body);
  }
  if (params.user_agent !== undefined) {
    updates.push('user_agent = ?');
    values.push(params.user_agent);
  }
  
  if (updates.length === 0) {
    return getTaskById(id);
  }
  
  updates.push("updated_at = datetime('now')");
  values.push(id);
  
  db.run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);
  saveDatabase();
  
  return getTaskById(id);
}

export function updateTaskStatus(id: number, status: TaskStatus): void {
  const db = getDatabase();
  db.run("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
  saveDatabase();
}

export function updateTaskLastCheck(id: number, lastValue: string | null): void {
  const db = getDatabase();
  db.run(
    "UPDATE tasks SET last_check = datetime('now'), last_value = ?, updated_at = datetime('now') WHERE id = ?",
    [lastValue, id]
  );
  saveDatabase();
}

export function deleteTask(id: number): boolean {
  const db = getDatabase();
  const task = getTaskById(id);
  if (!task) return false;
  
  db.run('DELETE FROM task_history WHERE task_id = ?', [id]);
  db.run('DELETE FROM tasks WHERE id = ?', [id]);
  saveDatabase();
  
  return true;
}

export function countUserTasks(userId: number): number {
  const db = getDatabase();
  const result = db.exec('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?', [userId]);
  return (result[0]?.values[0]?.[0] as number) || 0;
}

// Task history operations
export function addTaskHistory(
  taskId: number,
  result: string | null,
  messageSent: boolean,
  responseTime: number | null,
  statusCode: number | null,
  error: string | null
): void {
  const db = getDatabase();
  
  db.run(`
    INSERT INTO task_history (task_id, result, message_sent, response_time, status_code, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [taskId, result, messageSent ? 1 : 0, responseTime, statusCode, error]);
  
  // Clean old history (keep last 1000 entries per task)
  db.run(`
    DELETE FROM task_history 
    WHERE task_id = ? AND id NOT IN (
      SELECT id FROM task_history WHERE task_id = ? ORDER BY check_time DESC LIMIT 1000
    )
  `, [taskId, taskId]);
  
  saveDatabase();
}

export function getTaskHistory(taskId: number, limit: number = 50): TaskHistory[] {
  const db = getDatabase();
  const result = db.exec(
    'SELECT * FROM task_history WHERE task_id = ? ORDER BY check_time DESC LIMIT ?',
    [taskId, limit]
  );
  
  if (result.length === 0) {
    return [];
  }
  
  return result[0].values.map(row => rowToTaskHistory(result[0].columns, row));
}

// Helper functions
function rowToTask(columns: string[], row: SqlValue[]): Task {
  const obj: Record<string, SqlValue> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  
  return {
    id: obj.id as number,
    user_id: obj.user_id as number,
    name: obj.name as string | null,
    url: obj.url as string,
    regex_pattern: obj.regex_pattern as string,
    template: obj.template as string,
    mode: obj.mode as Task['mode'],
    condition_type: obj.condition_type as Task['condition_type'],
    condition_expression: obj.condition_expression as string | null,
    frequency_seconds: obj.frequency_seconds as number,
    status: obj.status as Task['status'],
    last_value: obj.last_value as string | null,
    last_check: obj.last_check as string | null,
    created_at: obj.created_at as string,
    updated_at: obj.updated_at as string,
    headers: obj.headers as string | null,
    timeout: obj.timeout as number,
    max_retries: obj.max_retries as number,
    http_method: (obj.http_method || 'GET') as Task['http_method'],
    request_body: obj.request_body as string | null,
    user_agent: obj.user_agent as string,
  };
}

function rowToTaskHistory(columns: string[], row: SqlValue[]): TaskHistory {
  const obj: Record<string, SqlValue> = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  
  return {
    id: obj.id as number,
    task_id: obj.task_id as number,
    check_time: obj.check_time as string,
    result: obj.result as string | null,
    message_sent: Boolean(obj.message_sent),
    response_time: obj.response_time as number | null,
    status_code: obj.status_code as number | null,
    error: obj.error as string | null,
  };
}

// Graceful shutdown
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    logger.info('Database closed');
  }
}
