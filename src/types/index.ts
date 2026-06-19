// Task modes
export type TaskMode = 'check' | 'extract';

// Notification conditions
export type ConditionType = 
  | 'always' 
  | 'on_match' 
  | 'on_change' 
  | 'on_increase' 
  | 'on_decrease' 
  | 'custom';

// Task status
export type TaskStatus = 'active' | 'stopped' | 'paused' | 'error';

// HTTP methods
export type HttpMethod = 'GET' | 'POST';

// Task interface
export interface Task {
  id: number;
  user_id: number;
  name: string | null;
  url: string;
  regex_pattern: string;
  template: string;
  mode: TaskMode;
  condition_type: ConditionType;
  condition_expression: string | null;
  frequency_seconds: number;
  stop_on_condition: boolean;
  notify_channel_id: string | null;
  notify_target: 'bot' | 'channel' | 'both';
  status: TaskStatus;
  last_value: string | null;
  last_check: string | null;
  created_at: string;
  updated_at: string;
  headers: string | null;
  timeout: number;
  max_retries: number;
  http_method: HttpMethod;
  request_body: string | null;
  user_agent: string;
}

// Task history entry
export interface TaskHistory {
  id: number;
  task_id: number;
  check_time: string;
  result: string | null;
  message_sent: boolean;
  response_time: number | null;
  status_code: number | null;
  error: string | null;
}

// Task creation parameters
export interface CreateTaskParams {
  user_id: number;
  name?: string;
  url: string;
  regex_pattern: string;
  template: string;
  mode: TaskMode;
  condition_type: ConditionType;
  condition_expression?: string;
  frequency_seconds: number;
  stop_on_condition?: boolean;
  notify_channel_id?: string | null;
  notify_target?: 'bot' | 'channel' | 'both';
  headers?: Record<string, string>;
  timeout?: number;
  max_retries?: number;
  http_method?: HttpMethod;
  request_body?: string;
  user_agent?: string;
}

// Task update parameters
export interface UpdateTaskParams {
  name?: string;
  url?: string;
  regex_pattern?: string;
  template?: string;
  mode?: TaskMode;
  condition_type?: ConditionType;
  condition_expression?: string;
  frequency_seconds?: number;
  stop_on_condition?: boolean;
  notify_channel_id?: string | null;
  notify_target?: 'bot' | 'channel' | 'both';
  headers?: Record<string, string>;
  timeout?: number;
  max_retries?: number;
  http_method?: HttpMethod;
  request_body?: string;
  user_agent?: string;
}

// Check result
export interface CheckResult {
  success: boolean;
  matches: string[];
  groups: Record<string, string>;
  matchCount: number;
  firstMatch: string | null;
  rawContent: string;
  statusCode: number;
  responseTime: number;
  error?: string;
}

// Template variables
export interface TemplateVariables {
  url: string;
  check_time: string;
  task_id: number;
  task_name: string;
  first_match: string;
  total_matches: number;
  matches_list: string;
  result: string;
  matches_count: number;
  status: string;
  [key: string]: string | number;
}

// User session state for conversation
export interface UserSession {
  step: string;
  taskData: Partial<CreateTaskParams>;
  editingTaskId?: number;
  editingField?: string;
}

// Export format
export type ExportFormat = 'json' | 'csv';
