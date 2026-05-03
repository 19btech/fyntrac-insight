require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authMiddleware = require('./middleware/auth.middleware');
const queryRoutes = require('./routes/query.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const questionRoutes = require('./routes/question.routes');
const collectionRoutes = require('./routes/collection.routes');
const schemaRoutes = require('./routes/schema.routes');
const aiRoutes = require('./routes/ai.routes');
const alertRoutes = require('./routes/alert.routes');
const shareRoutes = require('./routes/share.routes');
const metricRoutes = require('./routes/metric.routes');
const adminRoutes = require('./routes/admin.routes');
const modelRoutes = require('./routes/model.routes');
const trashRoutes = require('./routes/trash.routes');
const embedRoutes = require('./routes/embed.routes');
const bookmarkRoutes = require('./routes/bookmark.routes');
const commentRoutes = require('./routes/comment.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const reconRoutes = require('./routes/recon.routes');
const alertService = require('./services/alert.service');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
// CORS: supports comma-separated origins and any *.app.github.dev (Codespaces) /
// *.github.dev hosts when CORS_ORIGIN is empty or set to '*'.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl, server-to-server, same-origin
      if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // Allow GitHub Codespaces forwarded ports automatically
      if (/^https:\/\/[a-z0-9-]+\.app\.github\.dev$/i.test(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);
// CSV upload payloads can be up to ~25MB.
app.use(express.json({ limit: '32mb' }));

// Connect to metadata MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to metadata MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Public routes (no auth)
app.use('/api/share', shareRoutes);
app.use('/api/embed', embedRoutes); // v60 static embedding (signed JWT)

// Protected routes
app.use('/api', authMiddleware);
app.use('/api/query', queryRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/schema', schemaRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-settings', require('./routes/ai-settings.routes'));
app.use('/api/alerts', alertRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/recons', reconRoutes);
app.use('/api/trash', trashRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler — keeps process alive on Mongo / unexpected errors
app.use((err, _req, res, _next) => {
  console.error('[api error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});

// Start alert scheduler
alertService.startScheduler();

app.listen(PORT, () => console.log(`Fyntrac Analytics backend running on port ${PORT}`));
