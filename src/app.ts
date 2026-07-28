import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './utils/errors.js';
export const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: env.clientOrigin === '*' ? '*' : env.clientOrigin,
    credentials: env.clientOrigin !== '*',
  }),
);
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(env.localUploadDir));
app.get('/health', (_r, res) => res.json({ success: true, status: 'ok' }));
app.use('/api', apiRouter);
app.use(errorHandler);
