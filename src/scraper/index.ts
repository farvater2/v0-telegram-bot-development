import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { format } from 'date-fns';
import { config } from '../config/index.js';
import { logger, logTask } from '../utils/logger.js';
import type { Task, CheckResult, TemplateVariables } from '../types/index.js';

// Execute a monitoring task
export async function executeTask(task: Task, isTest: boolean = false): Promise<CheckResult> {
  const startTime = Date.now();
  
  try {
    // Make HTTP request
    const response = await makeRequest(task);
    const responseTime = Date.now() - startTime;
    
    // Extract text content
    const content = extractContent(response.data, response.headers['content-type']);
    
    // Execute regex with timeout protection
    const regexResult = await executeRegexWithTimeout(content, task.regex_pattern);
    
    const result: CheckResult = {
      success: true,
      matches: regexResult.matches,
      groups: regexResult.groups,
      matchCount: regexResult.matches.length,
      firstMatch: regexResult.matches[0] || null,
      rawContent: content.slice(0, 1000), // Store first 1000 chars for debugging
      statusCode: response.status,
      responseTime,
    };

    if (!isTest) {
      logTask(task.id, 'info', `Task executed successfully`, {
        matchCount: result.matchCount,
        responseTime,
      });
    }

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);

    logTask(task.id, 'error', `Task execution failed: ${errorMessage}`);

    return {
      success: false,
      matches: [],
      groups: {},
      matchCount: 0,
      firstMatch: null,
      rawContent: '',
      statusCode: error instanceof AxiosError ? (error.response?.status || 0) : 0,
      responseTime,
      error: errorMessage,
    };
  }
}

// Make HTTP request
async function makeRequest(task: Task): Promise<{ data: string; status: number; headers: Record<string, string> }> {
  const headers: Record<string, string> = {
    'User-Agent': task.user_agent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  // Parse additional headers
  if (task.headers) {
    try {
      const customHeaders = JSON.parse(task.headers);
      Object.assign(headers, customHeaders);
    } catch {
      logger.warn(`Invalid headers JSON for task ${task.id}`);
    }
  }

  const config = {
    method: task.http_method.toLowerCase() as 'get' | 'post',
    url: task.url,
    headers,
    timeout: task.timeout * 1000,
    maxRedirects: 5,
    validateStatus: (status: number) => status < 500, // Accept 4xx but not 5xx
  };

  // Add request body for POST
  if (task.http_method === 'POST' && task.request_body) {
    Object.assign(config, { data: task.request_body });
  }

  const response = await axios(config);
  
  return {
    data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
    status: response.status,
    headers: response.headers as Record<string, string>,
  };
}

// Extract text content from response
function extractContent(data: string, contentType?: string): string {
  // If JSON, return as is
  if (contentType?.includes('application/json')) {
    return data;
  }

  // If HTML, extract text
  if (contentType?.includes('text/html') || data.includes('<!DOCTYPE') || data.includes('<html')) {
    const $ = cheerio.load(data);
    
    // Remove script and style tags
    $('script, style, noscript').remove();
    
    // Get text content
    return $('body').text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Return as plain text
  return data;
}

// Execute regex with timeout protection (ReDoS protection)
async function executeRegexWithTimeout(
  content: string, 
  pattern: string
): Promise<{ matches: string[]; groups: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Regex execution timeout - possible ReDoS attack'));
    }, config.regexTimeoutMs);

    try {
      const regex = new RegExp(pattern, 'g');
      const matches: string[] = [];
      const groups: Record<string, string> = {};
      
      let match: RegExpExecArray | null;
      let iterationCount = 0;

      while ((match = regex.exec(content)) !== null) {
        matches.push(match[0]);
        
        // Extract numbered groups
        for (let i = 1; i < match.length; i++) {
          if (match[i] !== undefined) {
            groups[`group_${i}`] = match[i];
          }
        }

        // Extract named groups
        if (match.groups) {
          Object.assign(groups, match.groups);
        }

        iterationCount++;
        if (iterationCount >= config.maxRegexIterations) {
          logger.warn('Regex iteration limit reached');
          break;
        }

        // Prevent infinite loops for zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }

      clearTimeout(timeout);
      resolve({ matches, groups });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Check if notification should be sent based on condition
export function shouldNotify(
  task: Task, 
  result: CheckResult, 
  previousValue: string | null
): boolean {
  switch (task.condition_type) {
    case 'always':
      return result.success;
    
    case 'on_match':
      return result.success && result.matchCount > 0;
    
    case 'on_change':
      if (!result.success || result.matchCount === 0) return false;
      return result.firstMatch !== previousValue;
    
    case 'on_increase':
      if (!result.success || !result.firstMatch || !previousValue) return false;
      const newNum = parseFloat(result.firstMatch.replace(/[^\d.-]/g, ''));
      const oldNum = parseFloat(previousValue.replace(/[^\d.-]/g, ''));
      return !isNaN(newNum) && !isNaN(oldNum) && newNum > oldNum;
    
    case 'on_decrease':
      if (!result.success || !result.firstMatch || !previousValue) return false;
      const newVal = parseFloat(result.firstMatch.replace(/[^\d.-]/g, ''));
      const oldVal = parseFloat(previousValue.replace(/[^\d.-]/g, ''));
      return !isNaN(newVal) && !isNaN(oldVal) && newVal < oldVal;
    
    case 'custom':
      // Custom conditions could be implemented here
      return result.success && result.matchCount > 0;
    
    default:
      return false;
  }
}

// Format notification message using template
export function formatMessage(task: Task, result: CheckResult): string {
  const variables: TemplateVariables = {
    url: task.url,
    check_time: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    task_id: task.id,
    task_name: task.name || `Задача #${task.id}`,
    first_match: result.firstMatch || '',
    total_matches: result.matchCount,
    matches_list: result.matches.map((m, i) => `${i + 1}. ${m}`).join('\n'),
    result: result.matchCount > 0 ? 'true' : 'false',
    matches_count: result.matchCount,
    status: result.matchCount > 0 ? 'Найдено' : 'Не найдено',
  };

  // Add regex groups
  Object.assign(variables, result.groups);

  // Replace variables in template
  let message = task.template;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    message = message.replace(placeholder, String(value));
  }

  return message;
}

// Get error message from various error types
function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNABORTED') {
      return 'Превышено время ожидания';
    }
    if (error.code === 'ENOTFOUND') {
      return 'Сайт не найден';
    }
    if (error.response) {
      return `HTTP ${error.response.status}: ${error.response.statusText}`;
    }
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'Неизвестная ошибка';
}
