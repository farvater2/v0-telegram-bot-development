import { createBot } from './bot/index.js';
import { registerCommands } from './commands/index.js';
import { initDatabase, closeDatabase, saveDatabase } from './database/index.js';
import { initScheduler, stopScheduler } from './scheduler/index.js';
import { logger } from './utils/logger.js';

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  logger.error('BOT_TOKEN environment variable is required');
  process.exit(1);
}

// Main function
async function main(): Promise<void> {
  logger.info('Starting Telegram Page Watcher Bot...');
  
  try {
    // Initialize database
    logger.info('Initializing database...');
    await initDatabase();
    
    // Create bot
    logger.info('Creating bot instance...');
    const bot = createBot(BOT_TOKEN!);
    
    // Register commands
    logger.info('Registering commands...');
    registerCommands(bot);
    
    // Initialize scheduler
    logger.info('Initializing scheduler...');
    initScheduler(bot);
    
    // Setup graceful shutdown
    setupGracefulShutdown(bot);
    
    // Start bot
    logger.info('Starting bot...');
    await bot.start({
      onStart: (botInfo) => {
        logger.info(`Bot started as @${botInfo.username}`);
        logger.info('Ready to accept commands!');
      },
    });
    
  } catch (error) {
    logger.error('Failed to start bot:', { error: (error as Error).message, stack: (error as Error).stack });
    process.exit(1);
  }
}

// Graceful shutdown handler
function setupGracefulShutdown(bot: ReturnType<typeof createBot>): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Stop accepting new requests
      await bot.stop();
      logger.info('Bot stopped');
      
      // Stop scheduler
      stopScheduler();
      
      // Save and close database
      saveDatabase();
      closeDatabase();
      
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', { error: (error as Error).message });
      process.exit(1);
    }
  };
  
  // Handle termination signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', { reason });
  });
}

// Start the application
main().catch((error) => {
  logger.error('Fatal error:', { error: (error as Error).message });
  process.exit(1);
});
