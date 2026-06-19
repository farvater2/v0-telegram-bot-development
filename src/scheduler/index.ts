import { Bot } from 'grammy';
import cron from 'node-cron';
import { config } from '../config/index.js';
import { getActiveTasks, updateTaskLastCheck, updateTaskStatus, addTaskHistory, getTaskById } from '../database/index.js';
import { executeTask, shouldNotify, formatMessage } from '../scraper/index.js';
import { logger, logTask } from '../utils/logger.js';
import type { BotContext } from '../bot/index.js';
import type { Task } from '../types/index.js';

// Map to track task timers
const taskTimers: Map<number, NodeJS.Timeout> = new Map();

// Queue for task execution to prevent overload
const taskQueue: number[] = [];
let isProcessing = false;
let runningTasks = 0;

// Bot instance for sending notifications
let botInstance: Bot<BotContext> | null = null;

// Initialize scheduler
export function initScheduler(bot: Bot<BotContext>): void {
  botInstance = bot;
  
  // Load and schedule all active tasks
  loadActiveTasks();
  
  // Periodic check for new active tasks (every minute)
  cron.schedule('* * * * *', () => {
    syncActiveTasks();
  });
  
  // Daily database backup reminder
  cron.schedule('0 3 * * *', () => {
    logger.info('Daily maintenance: cleaning old history...');
    // Additional maintenance tasks could be added here
  });
  
  logger.info('Scheduler initialized');
}

// Load all active tasks and schedule them
function loadActiveTasks(): void {
  const tasks = getActiveTasks();
  logger.info(`Loading ${tasks.length} active tasks`);
  
  for (const task of tasks) {
    scheduleTask(task);
  }
}

// Sync active tasks (add new, remove stopped)
function syncActiveTasks(): void {
  const activeTasks = getActiveTasks();
  const activeIds = new Set(activeTasks.map(t => t.id));
  
  // Schedule new active tasks
  for (const task of activeTasks) {
    if (!taskTimers.has(task.id)) {
      scheduleTask(task);
    }
  }
  
  // Remove timers for stopped tasks
  for (const [taskId] of taskTimers) {
    if (!activeIds.has(taskId)) {
      unscheduleTask(taskId);
    }
  }
}

// Schedule a single task
export function scheduleTask(task: Task): void {
  // Don't schedule if already scheduled
  if (taskTimers.has(task.id)) {
    return;
  }
  
  // Calculate initial delay based on last check
  let initialDelay = 0;
  if (task.last_check) {
    const lastCheck = new Date(task.last_check).getTime();
    const nextRun = lastCheck + task.frequency_seconds * 1000;
    const now = Date.now();
    initialDelay = Math.max(0, nextRun - now);
  }
  
  // Schedule first execution
  const firstTimeout = setTimeout(() => {
    queueTask(task.id);
    
    // Then schedule periodic execution
    const interval = setInterval(() => {
      queueTask(task.id);
    }, task.frequency_seconds * 1000);
    
    taskTimers.set(task.id, interval);
  }, initialDelay);
  
  taskTimers.set(task.id, firstTimeout);
  logTask(task.id, 'info', `Task scheduled (frequency: ${task.frequency_seconds}s, initial delay: ${Math.round(initialDelay / 1000)}s)`);
}

// Unschedule a task
export function unscheduleTask(taskId: number): void {
  const timer = taskTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
    taskTimers.delete(taskId);
    logTask(taskId, 'info', 'Task unscheduled');
  }
}

// Add task to execution queue
function queueTask(taskId: number): void {
  if (!taskQueue.includes(taskId)) {
    taskQueue.push(taskId);
    processQueue();
  }
}

// Process task queue
async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  
  while (taskQueue.length > 0 && runningTasks < config.maxConcurrentTasks) {
    const taskId = taskQueue.shift();
    if (taskId !== undefined) {
      runningTasks++;
      processTask(taskId).finally(() => {
        runningTasks--;
        // Continue processing queue
        if (taskQueue.length > 0) {
          setImmediate(() => processQueue());
        }
      });
    }
  }
  
  isProcessing = false;
}

// Process a single task
async function processTask(taskId: number): Promise<void> {
  const task = getTaskById(taskId);
  
  // Task might have been deleted or stopped
  if (!task || task.status !== 'active') {
    unscheduleTask(taskId);
    return;
  }
  
  logTask(taskId, 'debug', 'Starting task execution');
  
  try {
    const result = await executeTask(task);
    const previousValue = task.last_value;
    
    // Update last check time and value
    updateTaskLastCheck(taskId, result.firstMatch);
    
    // Record in history
    addTaskHistory(
      taskId,
      result.firstMatch,
      false, // Will update if notification sent
      result.responseTime,
      result.statusCode,
      result.error || null
    );
    
    // Check if notification should be sent
    const conditionMet = shouldNotify(task, result, previousValue);
    if (conditionMet) {
      await sendNotification(task, result);
      
      // Halt the task once the condition is fulfilled, if enabled
      if (task.stop_on_condition) {
        updateTaskStatus(taskId, 'stopped');
        unscheduleTask(taskId);
        logTask(taskId, 'info', 'Task stopped: notification condition fulfilled (stop_on_condition enabled)');
        return;
      }
    }
    
    // Reset error status if successful
    if (result.success && (task.status as string) === 'error') {
      updateTaskStatus(taskId, 'active');
    }
    
  } catch (error) {
    logTask(taskId, 'error', `Task processing failed: ${(error as Error).message}`);
    
    // Add error to history
    addTaskHistory(
      taskId,
      null,
      false,
      null,
      null,
      (error as Error).message
    );
    
    // Mark task as error after multiple failures
    // (Could implement retry logic with max_retries here)
  }
}

// Send notification to user
async function sendNotification(task: Task, result: { firstMatch: string | null; matchCount: number; matches: string[]; groups: Record<string, string>; success: boolean; statusCode: number; responseTime: number; rawContent: string; error?: string }): Promise<void> {
  if (!botInstance) {
    logger.error('Bot instance not initialized for notifications');
    return;
  }
  
  const message = formatMessage(task, result);

  // Determine recipients: channel (if set), user (unless channel-only)
  const recipients: Array<{ chatId: number | string; label: string }> = [];

  if (task.notify_channel_id) {
    recipients.push({ chatId: task.notify_channel_id, label: `channel ${task.notify_channel_id}` });
  }
  if (!task.notify_channel_only || !task.notify_channel_id) {
    recipients.push({ chatId: task.user_id, label: `user ${task.user_id}` });
  }

  for (const recipient of recipients) {
    try {
      await botInstance.api.sendMessage(recipient.chatId, message, { parse_mode: 'HTML' });
      logTask(task.id, 'info', `Notification sent to ${recipient.label}`);
    } catch (error) {
      logTask(task.id, 'error', `Failed to send notification to ${recipient.label}: ${(error as Error).message}`);

      // If the creator blocked the bot, stop the task
      if (
        recipient.chatId === task.user_id &&
        (error as { error_code?: number }).error_code === 403
      ) {
        logTask(task.id, 'warn', 'User blocked bot, stopping task');
        updateTaskStatus(task.id, 'stopped');
        unscheduleTask(task.id);
        return;
      }
    }
  }
}

// Get scheduler status
export function getSchedulerStatus(): { activeTasks: number; queueLength: number; runningTasks: number } {
  return {
    activeTasks: taskTimers.size,
    queueLength: taskQueue.length,
    runningTasks,
  };
}

// Graceful shutdown
export function stopScheduler(): void {
  logger.info('Stopping scheduler...');
  
  for (const [taskId, timer] of taskTimers) {
    clearTimeout(timer);
    clearInterval(timer);
    logTask(taskId, 'debug', 'Timer cleared');
  }
  
  taskTimers.clear();
  taskQueue.length = 0;
  
  logger.info('Scheduler stopped');
}
