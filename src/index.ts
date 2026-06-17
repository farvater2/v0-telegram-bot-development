import { config, validateConfig } from './config/index.js';
import { createBot } from './bot/index.js';
import { registerCommands } from './commands/index.js';
import { initDatabase, closeDatabase, saveDatabase } from './database/index.js';
import { initScheduler, stopScheduler } from './scheduler/index.js';
import { startWebServer, stopWebServer } from './web/server.js';
import { logger } from './utils/logger.js';

// Main function
async function main(): Promise<void> {
  logger.info('Starting Telegram Page Watcher Bot...');
  
  try {
    // Validate config
    validateConfig();
    
    // Initialize database
    logger.info('Initializing database...');
    await initDatabase();
    
    // Create bot
    logger.info('Creating bot instance...');
    const bot = createBot(config.botToken);
    
    // Register commands
    logger.info('Registering commands...');
    registerCommands(bot);
    
    // Initialize scheduler
    logger.info('Initializing scheduler...');
    initScheduler(bot);
    
    // Start web interface
    logger.info('Starting web interface...');
    startWebServer();
    
    // Setup graceful shutdown
    setupGracefulShutdown(bot);
    
    // Start bot
    logger.info('Starting bot...');
    
    // Delete any existing webhook to ensure long polling works
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    logger.info('Webhook deleted, starting long polling...');
    
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
      
      // Stop web server
      await stopWebServer();
      
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
