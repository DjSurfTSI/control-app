import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import atmRoutes from './routes/atms.js';
import taskRoutes from './routes/tasks.js';
import photoRoutes from './routes/photos.js';
import notificationRoutes from './routes/notifications.js';
import integrationRoutes from './routes/integration.js';
import settingsRoutes from './routes/settings.js';
import referenceRoutes from './routes/reference.js';
import workspaceRoutes from './routes/workspace.js';
import { isCvEnabled, warmupCvModel } from './cv/atmDetector.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/atms', atmRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/workspace', workspaceRoutes);

app.use((err, req, res, next) => {
  if (req.path.startsWith('/api')) {
    return errorHandler(err, req, res, next);
  }
  next(err);
});

const clientDist = path.join(__dirname, '../client/dist');

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(clientDist, 'sw.js'), (err) => {
    if (err) res.status(404).send('Service Worker не найден. Соберите клиент.');
  });
});

app.use(express.static(clientDist, {
  setHeaders(res, filePath) {
    if (path.basename(filePath) === 'sw.js') {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Не найдено' });
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Соберите клиент: npm run build --prefix client');
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  if (isCvEnabled()) {
    console.log('CV-проверка включена — предзагрузка модели CLIP...');
    warmupCvModel()
      .then(() => console.log('CV-модель готова'))
      .catch((err) => console.error('CV warmup failed:', err.message));
  } else {
    console.log('CV-проверка отключена в настройках');
  }
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});
