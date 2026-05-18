import { Bot, Context, session, SessionFlavor, InlineKeyboard } from 'grammy';
import { logger } from '../utils/logger.js';
import type { UserSession, CreateTaskParams } from '../types/index.js';

// Session data type
export interface SessionData {
  session: UserSession | null;
}

// Custom context type
export type BotContext = Context & SessionFlavor<SessionData>;

// Create bot instance
export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // Session middleware
  bot.use(session({
    initial: (): SessionData => ({
      session: null,
    }),
  }));

  // Error handler
  bot.catch((err) => {
    const error = err.error as Error | undefined;
    logger.error('Bot error:', { error: err.message, stack: error?.stack });
  });

  return bot;
}

// Helper to get user ID
export function getUserId(ctx: BotContext): number {
  return ctx.from?.id || 0;
}

// Helper to send message with error handling
export async function sendMessage(ctx: BotContext, text: string, options?: { reply_markup?: InlineKeyboard }): Promise<void> {
  try {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...options,
    });
  } catch (error) {
    logger.error('Failed to send message:', { error: (error as Error).message });
  }
}

// Helper to edit message
export async function editMessage(ctx: BotContext, text: string, options?: { reply_markup?: InlineKeyboard }): Promise<void> {
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...options,
    });
  } catch (error) {
    logger.error('Failed to edit message:', { error: (error as Error).message });
  }
}

// Clear user session
export function clearSession(ctx: BotContext): void {
  ctx.session.session = null;
}

// Get or create user session
export function getSession(ctx: BotContext): UserSession {
  if (!ctx.session.session) {
    ctx.session.session = {
      step: '',
      taskData: {},
    };
  }
  return ctx.session.session;
}

// Set session step
export function setSessionStep(ctx: BotContext, step: string): void {
  const session = getSession(ctx);
  session.step = step;
}

// Update session task data
export function updateSessionTaskData(ctx: BotContext, data: Partial<CreateTaskParams>): void {
  const session = getSession(ctx);
  session.taskData = { ...session.taskData, ...data };
}

// Create inline keyboard helper
export function createKeyboard(buttons: { text: string; callback_data: string }[][]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  
  for (const row of buttons) {
    for (const button of row) {
      keyboard.text(button.text, button.callback_data);
    }
    keyboard.row();
  }
  
  return keyboard;
}

// Format task status icon
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'active': return '🟢';
    case 'stopped': return '🔴';
    case 'paused': return '🟡';
    case 'error': return '⚠️';
    default: return '⚪';
  }
}

// Format condition type
export function getConditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    'always': 'Всегда',
    'on_match': 'При совпадении',
    'on_change': 'При изменении',
    'on_increase': 'При увеличении',
    'on_decrease': 'При уменьшении',
    'custom': 'Пользовательское',
  };
  return labels[condition] || condition;
}

// Format mode
export function getModeLabel(mode: string): string {
  return mode === 'check' ? 'Проверка' : 'Извлечение';
}

// Truncate text
export function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Escape HTML for Telegram
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Format seconds to human readable
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч`;
  return `${Math.floor(seconds / 86400)} дн`;
}
