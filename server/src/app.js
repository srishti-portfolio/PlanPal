import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import accountRouter from './routes/account.js';
import authRouter from './routes/auth.js';
import chatsRouter from './routes/chats.js';
import eventsRouter from './routes/events.js';
import notesRouter from './routes/notes.js';

export function createApp() {
  const app = express();

  // Render terminates TLS in front of us; trust its proxy so rate limits see real client IPs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (no Origin header) and the configured frontends only.
        callback(null, !origin || config.corsOrigins.includes(origin));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api/notes', notesRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
