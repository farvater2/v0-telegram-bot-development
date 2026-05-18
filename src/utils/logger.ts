import winston from 'winston';
import { format } from 'date-fns';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Custom format for logs
const customFormat = winston.format.printf(({ level, message, timestamp, taskId, ...rest }) => {
  const taskInfo = taskId ? ` [Task ${taskId}]` : '';
  const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}]${taskInfo} ${message}${extra}`;
});

// Create logger instance
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    }),
    customFormat
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({
          format: () => format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        }),
        customFormat
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Create logs directory if it doesn't exist
import fs from 'fs';
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

// Log task-specific messages
export function logTask(taskId: number, level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
  logger.log(level, message, { taskId, ...meta });
}
