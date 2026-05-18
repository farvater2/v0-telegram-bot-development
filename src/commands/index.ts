import type { Bot } from 'grammy';
import type { BotContext } from '../bot/index.js';
import { logger } from '../utils/logger.js';
import { handleStart, handleHelp, handleCancel } from './basic.js';
import { 
  handleNewTask,
  handleMyTasks,
  handleStartTask,
  handleStopTask,
  handleEditTask,
  handleDeleteTask,
  handleHistory,
  handleTestTask,
  handleExportTasks,
  handleCallback,
  handleTextMessage
} from './tasks.js';

// Register all commands
export function registerCommands(bot: Bot<BotContext>): void {
  logger.info('[v0] Registering commands...');
  
  // Basic commands
  bot.command('start', (ctx) => {
    logger.info('[v0] /start command received');
    return handleStart(ctx);
  });
  bot.command('help', (ctx) => {
    logger.info('[v0] /help command received');
    return handleHelp(ctx);
  });
  bot.command('cancel', (ctx) => {
    logger.info('[v0] /cancel command received');
    return handleCancel(ctx);
  });
  
  // Task management commands
  bot.command('new_task', (ctx) => {
    logger.info('[v0] /new_task command received');
    return handleNewTask(ctx);
  });
  bot.command('my_tasks', (ctx) => {
    logger.info('[v0] /my_tasks command received');
    return handleMyTasks(ctx);
  });
  bot.command('start_task', (ctx) => {
    logger.info('[v0] /start_task command received');
    return handleStartTask(ctx);
  });
  bot.command('stop_task', (ctx) => {
    logger.info('[v0] /stop_task command received');
    return handleStopTask(ctx);
  });
  bot.command('edit_task', (ctx) => {
    logger.info('[v0] /edit_task command received');
    return handleEditTask(ctx);
  });
  bot.command('delete_task', (ctx) => {
    logger.info('[v0] /delete_task command received');
    return handleDeleteTask(ctx);
  });
  bot.command('history', (ctx) => {
    logger.info('[v0] /history command received');
    return handleHistory(ctx);
  });
  bot.command('test_task', (ctx) => {
    logger.info('[v0] /test_task command received');
    return handleTestTask(ctx);
  });
  bot.command('export_tasks', (ctx) => {
    logger.info('[v0] /export_tasks command received');
    return handleExportTasks(ctx);
  });

  // Callback queries
  bot.on('callback_query:data', (ctx) => {
    logger.info('[v0] Callback query received:', ctx.callbackQuery?.data);
    return handleCallback(ctx);
  });

  // Text messages for conversation flow (excluding commands)
  bot.on('message:text', (ctx, next) => {
    // Skip if this is a command (starts with /)
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) {
      logger.info('[v0] Skipping command in text handler:', text);
      return next();
    }
    logger.info('[v0] Text message received:', text.substring(0, 50));
    return handleTextMessage(ctx);
  });

  logger.info('[v0] All commands registered successfully');
}
