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
  // Basic commands
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('cancel', handleCancel);
  
  // Task management commands
  bot.command('new_task', handleNewTask);
  bot.command('my_tasks', handleMyTasks);
  bot.command('start_task', handleStartTask);
  bot.command('stop_task', handleStopTask);
  bot.command('edit_task', handleEditTask);
  bot.command('delete_task', handleDeleteTask);
  bot.command('history', handleHistory);
  bot.command('test_task', handleTestTask);
  bot.command('export_tasks', handleExportTasks);

  // Callback queries
  bot.on('callback_query:data', handleCallback);

  // Text messages for conversation flow
  bot.on('message:text', handleTextMessage);

  logger.info('Commands registered');
}
