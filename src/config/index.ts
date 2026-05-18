import 'dotenv/config';

// Bot configuration
export const config = {
  // Telegram Bot
  botToken: process.env.BOT_TOKEN || '',
  
  // Database
  dbPath: process.env.DB_PATH || './data/bot.db',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Task limits
  maxTasksPerUser: 50,
  minFrequencySeconds: 10,
  maxConcurrentTasks: 10,
  
  // Request defaults
  defaultTimeout: 30,
  defaultMaxRetries: 3,
  defaultUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  
  // Regex protection
  regexTimeoutMs: 5000,
  maxRegexIterations: 1000,
  
  // History
  maxHistoryPerTask: 1000,
} as const;

// Validate required config
export function validateConfig(): void {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN environment variable is required');
  }
}
