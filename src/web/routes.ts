import express, { type Request, type Response, type Router } from 'express';
import {
  getTaskById,
  getTasksByUserId,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskHistory,
} from '../database/index.js';
import { executeTask, shouldNotify, formatMessage } from '../scraper/index.js';
import { scheduleTask, unscheduleTask, getSchedulerStatus } from '../scheduler/index.js';
import { isValidUrl, isValidRegex, isValidFrequency } from '../utils/validators.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { CreateTaskParams, UpdateTaskParams, TaskMode, ConditionType, HttpMethod } from '../types/index.js';

// Helper to parse and validate a numeric id param
function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

// Validate the core task fields shared between create and update
function validateTaskBody(body: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || body.url !== undefined) {
    if (typeof body.url !== 'string' || !isValidUrl(body.url)) {
      return 'Некорректный URL (требуется http:// или https://)';
    }
  }
  if (!partial || body.regex_pattern !== undefined) {
    if (typeof body.regex_pattern !== 'string' || !isValidRegex(body.regex_pattern)) {
      return 'Некорректное регулярное выражение';
    }
  }
  if (!partial || body.template !== undefined) {
    if (typeof body.template !== 'string' || body.template.trim().length === 0) {
      return 'Шаблон сообщения обязателен';
    }
  }
  if (!partial || body.frequency_seconds !== undefined) {
    const freq = Number(body.frequency_seconds);
    if (!isValidFrequency(freq, config.minFrequencySeconds)) {
      return `Частота должна быть не менее ${config.minFrequencySeconds} секунд`;
    }
  }
  return null;
}

export function createApiRouter(): Router {
  const router = express.Router();

  // --- Scheduler / system status ---
  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      scheduler: getSchedulerStatus(),
      limits: {
        maxTasksPerUser: config.maxTasksPerUser,
        minFrequencySeconds: config.minFrequencySeconds,
      },
    });
  });

  // --- List tasks (optionally filtered by user_id) ---
  router.get('/tasks', (req: Request, res: Response) => {
    const userIdRaw = req.query.user_id;
    if (userIdRaw === undefined) {
      return res.status(400).json({ error: 'Параметр user_id обязателен' });
    }
    const userId = parseId(String(userIdRaw));
    if (userId === null) {
      return res.status(400).json({ error: 'user_id должен быть числом' });
    }
    const tasks = getTasksByUserId(userId);
    res.json({ tasks });
  });

  // --- Get single task ---
  router.get('/tasks/:id', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });
    const task = getTaskById(id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    res.json({ task });
  });

  // --- Create task ---
  router.post('/tasks', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    if (typeof body.user_id !== 'number' && typeof body.user_id !== 'string') {
      return res.status(400).json({ error: 'user_id обязателен' });
    }
    const userId = parseId(String(body.user_id));
    if (userId === null) return res.status(400).json({ error: 'user_id должен быть числом' });

    const validationError = validateTaskBody(body, false);
    if (validationError) return res.status(400).json({ error: validationError });

    const params: CreateTaskParams = {
      user_id: userId,
      name: typeof body.name === 'string' ? body.name : undefined,
      url: body.url as string,
      regex_pattern: body.regex_pattern as string,
      template: body.template as string,
      mode: (body.mode as TaskMode) || 'extract',
      condition_type: (body.condition_type as ConditionType) || 'on_change',
      condition_expression: typeof body.condition_expression === 'string' ? body.condition_expression : undefined,
      frequency_seconds: Number(body.frequency_seconds),
      headers: typeof body.headers === 'object' && body.headers !== null ? (body.headers as Record<string, string>) : undefined,
      timeout: body.timeout !== undefined ? Number(body.timeout) : undefined,
      max_retries: body.max_retries !== undefined ? Number(body.max_retries) : undefined,
      http_method: (body.http_method as HttpMethod) || 'GET',
      request_body: typeof body.request_body === 'string' ? body.request_body : undefined,
      user_agent: typeof body.user_agent === 'string' ? body.user_agent : undefined,
    };

    const task = createTask(params);
    logger.info(`[web] Task #${task.id} created for user ${userId}`);

    // If created as active, schedule it
    if (task.status === 'active') {
      scheduleTask(task);
    }

    res.status(201).json({ task });
  });

  // --- Update task ---
  router.put('/tasks/:id', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });

    const existing = getTaskById(id);
    if (!existing) return res.status(404).json({ error: 'Задача не найдена' });

    const body = req.body as Record<string, unknown>;
    const validationError = validateTaskBody(body, true);
    if (validationError) return res.status(400).json({ error: validationError });

    const params: UpdateTaskParams = {};
    if (body.name !== undefined) params.name = body.name as string;
    if (body.url !== undefined) params.url = body.url as string;
    if (body.regex_pattern !== undefined) params.regex_pattern = body.regex_pattern as string;
    if (body.template !== undefined) params.template = body.template as string;
    if (body.mode !== undefined) params.mode = body.mode as TaskMode;
    if (body.condition_type !== undefined) params.condition_type = body.condition_type as ConditionType;
    if (body.condition_expression !== undefined) params.condition_expression = body.condition_expression as string;
    if (body.frequency_seconds !== undefined) params.frequency_seconds = Number(body.frequency_seconds);
    if (body.headers !== undefined) params.headers = body.headers as Record<string, string>;
    if (body.timeout !== undefined) params.timeout = Number(body.timeout);
    if (body.max_retries !== undefined) params.max_retries = Number(body.max_retries);
    if (body.http_method !== undefined) params.http_method = body.http_method as HttpMethod;
    if (body.request_body !== undefined) params.request_body = body.request_body as string;
    if (body.user_agent !== undefined) params.user_agent = body.user_agent as string;

    const task = updateTask(id, params);
    logger.info(`[web] Task #${id} updated`);

    // Reschedule if active so new frequency/settings take effect
    if (task && task.status === 'active') {
      unscheduleTask(id);
      scheduleTask(task);
    }

    res.json({ task });
  });

  // --- Start task ---
  router.post('/tasks/:id/start', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });
    const task = getTaskById(id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    updateTaskStatus(id, 'active');
    const updated = getTaskById(id)!;
    scheduleTask(updated);
    logger.info(`[web] Task #${id} started`);
    res.json({ task: updated });
  });

  // --- Stop task ---
  router.post('/tasks/:id/stop', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });
    const task = getTaskById(id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    updateTaskStatus(id, 'stopped');
    unscheduleTask(id);
    logger.info(`[web] Task #${id} stopped`);
    res.json({ task: getTaskById(id) });
  });

  // --- Delete task ---
  router.delete('/tasks/:id', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });
    const ok = deleteTask(id);
    if (!ok) return res.status(404).json({ error: 'Задача не найдена' });
    unscheduleTask(id);
    logger.info(`[web] Task #${id} deleted`);
    res.json({ success: true });
  });

  // --- Task history ---
  router.get('/tasks/:id/history', (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const history = getTaskHistory(id, Number.isNaN(limit) ? 50 : limit);
    res.json({ history });
  });

  // --- Test task (run once without saving notification state) ---
  router.post('/tasks/:id/test', async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Некорректный id' });
    const task = getTaskById(id);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    try {
      const result = await executeTask(task, true);
      const willNotify = shouldNotify(task, result, task.last_value);
      const preview = result.success ? formatMessage(task, result) : null;
      res.json({ result, willNotify, preview });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // --- Test arbitrary config without an existing task (for the create form) ---
  router.post('/test-config', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const validationError = validateTaskBody(body, false);
    if (validationError) return res.status(400).json({ error: validationError });

    const fakeTask = {
      id: 0,
      user_id: 0,
      name: typeof body.name === 'string' ? body.name : null,
      url: body.url as string,
      regex_pattern: body.regex_pattern as string,
      template: body.template as string,
      mode: (body.mode as TaskMode) || 'extract',
      condition_type: (body.condition_type as ConditionType) || 'on_change',
      condition_expression: null,
      frequency_seconds: Number(body.frequency_seconds),
      status: 'stopped' as const,
      last_value: null,
      last_check: null,
      created_at: '',
      updated_at: '',
      headers: typeof body.headers === 'object' && body.headers !== null ? JSON.stringify(body.headers) : null,
      timeout: body.timeout !== undefined ? Number(body.timeout) : config.defaultTimeout,
      max_retries: body.max_retries !== undefined ? Number(body.max_retries) : config.defaultMaxRetries,
      http_method: (body.http_method as HttpMethod) || 'GET',
      request_body: typeof body.request_body === 'string' ? body.request_body : null,
      user_agent: typeof body.user_agent === 'string' ? body.user_agent : config.defaultUserAgent,
    };

    try {
      const result = await executeTask(fakeTask, true);
      const preview = result.success ? formatMessage(fakeTask, result) : null;
      res.json({ result, preview });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
