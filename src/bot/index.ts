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

  // Debug middleware - log ALL incoming updates
  bot.use(async (ctx, next) => {
    const update = ctx.update;
    logger.info('[v0] Incoming update:', {
      updateId: update.update_id,
      hasMessage: !!update.message,
      messageText: update.message?.text?.substring(0, 100),
      from: ctx.from?.username || ctx.from?.id,
    });
    await next();
  });

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
export async function sendMessage(
  ctx: BotContext, 
  text: string, 
  options?: { reply_markup?: InlineKeyboard }
): Promise<void> {
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
export async function editMessage(
  ctx: BotContext, 
  text: string, 
  options?: { reply_markup?: InlineKeyboard }
): Promise<void> {
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

// Re-export keyboards
export { 
  createKeyboard,
  getModeKeyboard,
  getConditionKeyboard,
  getEditFieldKeyboard,
  getConfirmKeyboard,
  getEditModeKeyboard,
  getEditConditionKeyboard,
  getStopOnConditionKeyboard,
  getSkipChannelKeyboard,
  getChannelOnlyKeyboard
} from './keyboards.js';
