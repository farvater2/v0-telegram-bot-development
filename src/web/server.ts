import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createApiRouter } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: Server | null = null;

export function startWebServer(): Server | null {
  if (!config.webEnabled) {
    logger.info('Web interface disabled (WEB_ENABLED=false)');
    return null;
  }

  const app: Express = express();

  app.use(express.json({ limit: '1mb' }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`[web] ${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use('/api', createApiRouter());

  // Static frontend.
  // In dev (tsx) __dirname points to src/web, in build it points to dist/web.
  // The public assets live alongside the source, so resolve relative to project root.
  const publicDir = path.resolve(__dirname, '../../public');
  app.use(express.static(publicDir));

  // SPA-ish fallback to index.html for unknown non-API routes
  app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('[web] Unhandled error:', { error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  server = app.listen(config.webPort, () => {
    logger.info(`Web interface running at http://localhost:${config.webPort}`);
  });

  return server;
}

export function stopWebServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('Web server stopped');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
