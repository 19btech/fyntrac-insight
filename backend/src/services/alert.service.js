const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Alert = require('../models/Alert.model');
const Question = require('../models/Question.model');
const Subscription = require('../models/Subscription.model');
const Dashboard = require('../models/Dashboard.model');
const Recon = require('../models/Recon.model');
const ReconRun = require('../models/ReconRun.model');
const mongoService = require('./mongo.service');
const reconService = require('./recon.service');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Evaluate a single alert condition against a numeric metric value.
 */
function evaluateCondition(condition, value) {
  switch (condition.operator) {
    case 'gt': return value > condition.threshold;
    case 'lt': return value < condition.threshold;
    case 'eq': return value === condition.threshold;
    default: return false;
  }
}

/**
 * Run all enabled alerts and send emails when conditions are met.
 */
async function runAlerts() {
  const alerts = await Alert.find({ enabled: true });

  for (const alert of alerts) {
    try {
      const question = await Question.findById(alert.questionId);
      if (!question) continue;

      const pipeline = question.queryConfig?.pipeline || [];
      // Use a synthetic user object for tenant scoping
      const user = { tenantId: alert.tenantId, attributes: {} };
      const { data } = await mongoService.executePipeline(
        question.queryConfig?.collection,
        pipeline,
        user
      );

      // Expect first result row to have a numeric value field
      const metricValue = data?.[0] ? Object.values(data[0]).find((v) => typeof v === 'number') : undefined;
      if (metricValue === undefined) continue;

      if (evaluateCondition(alert.condition, metricValue)) {
        await sendAlertEmail(alert, question, metricValue);
        alert.lastFiredAt = new Date();
        await alert.save();
      }
    } catch (err) {
      console.error(`Alert evaluation failed for alert ${alert._id}:`, err.message);
    }
  }
}

async function sendAlertEmail(alert, question, value) {
  const html = `
    <h2>Fyntrac Analytics Alert: ${alert.name}</h2>
    <p>The alert condition was triggered for question <strong>${question.name}</strong>.</p>
    <p>Current value: <strong>${value}</strong> (threshold: ${alert.condition.threshold})</p>
    <p>Fired at: ${new Date().toISOString()}</p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'analytics@fyntrac.com',
    to: alert.recipients.join(', '),
    subject: `[Fyntrac Analytics] Alert: ${alert.name}`,
    html,
  });
}

/**
 * Process dashboard subscriptions ("Pulses"). Emails the recipients a link to
 * the dashboard whenever the cron schedule matches the current minute.
 */
async function runSubscriptions() {
  const subs = await Subscription.find({ enabled: true });
  const now = new Date();
  for (const sub of subs) {
    try {
      if (!cron.validate(sub.cron)) continue;
      // Cheap match: schedule a one-shot validator that fires immediately and stops
      // (node-cron has no built-in "should this fire now?" predicate).
      // We approximate by checking whether the cron's next run minute matches now.
      // For a robust solution, persist `nextRunAt` and compare.
      // Here we mark every minute-tick eligible if the cron expression matches.
      const taskShouldFire = cronMatchesNow(sub.cron, now);
      if (!taskShouldFire) continue;

      const dashboard = await Dashboard.findById(sub.dashboardId);
      if (!dashboard) continue;

      const url = `${process.env.APP_BASE_URL || ''}/dashboard/${dashboard._id}`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'analytics@fyntrac.com',
        to: sub.recipients.join(', '),
        subject: sub.subject || `[Fyntrac Analytics] Dashboard: ${dashboard.name}`,
        html: `
          <h2>${dashboard.name}</h2>
          ${dashboard.description ? `<p>${dashboard.description}</p>` : ''}
          <p><a href="${url}">Open the dashboard</a></p>
          <p>Sent at ${now.toISOString()}</p>
        `,
      });
      sub.lastSentAt = now;
      await sub.save();
    } catch (err) {
      console.error(`Subscription ${sub._id} send failed:`, err.message);
    }
  }
}

/** Lightweight cron-vs-now matcher (minute|hour|dom|month|dow). */
function cronMatchesNow(expr, now) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  const fields = [
    { v: now.getMinutes(), pat: m },
    { v: now.getHours(), pat: h },
    { v: now.getDate(), pat: dom },
    { v: now.getMonth() + 1, pat: mon },
    { v: now.getDay(), pat: dow },
  ];
  return fields.every(({ v, pat }) => matchCronField(v, pat));
}

function matchCronField(value, pattern) {
  if (pattern === '*') return true;
  for (const part of pattern.split(',')) {
    if (part === '*') return true;
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step, 10);
      const [start, end] = range === '*' ? [0, 59] : range.split('-').map(Number);
      for (let i = start; i <= (end ?? start); i += stepNum) if (i === value) return true;
      continue;
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (value >= start && value <= end) return true;
      continue;
    }
    if (parseInt(part, 10) === value) return true;
  }
  return false;
}

/**
 * Run scheduled recons. Each enabled Recon's cron is matched against the
 * current minute; matching ones are executed (using a synthetic tenant user)
 * and an email is sent if recipients are set or mismatch threshold is breached.
 */
async function runRecons() {
  const recons = await Recon.find({ archived: { $ne: true }, 'schedule.enabled': true });
  const now = new Date();
  for (const recon of recons) {
    try {
      if (!recon.schedule?.cron) continue;
      if (!cronMatchesNow(recon.schedule.cron, now)) continue;
      const user = { tenantId: recon.tenantId, attributes: {} };
      const result = await reconService.runRecon(recon, user);
      const run = await ReconRun.create({
        reconId: recon._id, tenantId: recon.tenantId, runBy: 'scheduler',
        durationMs: result.durationMs,
        mappingSnapshot: recon.mapping, optionsSnapshot: recon.options,
        summary: result.summary,
        rows: result.rows,           // already capped by MAX_STORED_ROWS in service
        totalRows: result.totalRows,
        rowsTruncated: result.rowsTruncated,
      });
      recon.lastRun = { at: now, runId: String(run._id), summary: result.summary };
      await recon.save();

      const recipients = (recon.schedule.recipients || []).filter(Boolean);
      const mismatch = result.summary.rowCounts.mismatched + result.summary.rowCounts.onlyA + result.summary.rowCounts.onlyB;
      const threshold = recon.schedule.alertWhenMismatchOver;
      const shouldAlert = recipients.length > 0 && (threshold == null || mismatch > threshold);
      if (!shouldAlert) continue;

      const url = `${process.env.APP_BASE_URL || ''}/recon/${recon._id}/run/${run._id}`;
      const c = result.summary.rowCounts;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'analytics@fyntrac.com',
        to: recipients.join(', '),
        subject: `[Fyntrac Recon] ${recon.name} — ${mismatch} variances`,
        html: `
          <h2>${recon.name}</h2>
          <p>${recon.description || ''}</p>
          <p><strong>${c.matched}</strong> matched · <strong>${c.mismatched}</strong> mismatched · <strong>${c.onlyA}</strong> only in A · <strong>${c.onlyB}</strong> only in B</p>
          <p><a href="${url}">Open the run</a></p>
          <p>Run at ${now.toISOString()}</p>
        `,
      });
      // Only mark lastSentAt after the email is actually sent
      recon.schedule.lastSentAt = now;
      await recon.save();
    } catch (err) {
      console.error(`Recon ${recon._id} run failed:`, err.message);
    }
  }
}

/**
 * Start the cron-based scheduler for alerts AND subscriptions.
 *
 * NOTE: The scheduler uses the default (global) Mongoose connection which is
 * only established in SKIP_AUTH / dev mode. In production (multi-tenant), DB
 * connections are per-request via tenant-db.service.js and there is no single
 * default connection, so the scheduler must NOT be started — every query would
 * buffer indefinitely and time out.
 *
 * Pass a `tenantId` to run against a specific tenant's DB (future enhancement).
 */
function startScheduler() {
  const mongoose = require('mongoose');

  // Only run if the default connection is (or will be) available.
  // READY states: 1 = connected, 2 = connecting
  const state = mongoose.connection.readyState;
  if (state === 0) {
    // No default connection configured — skip silently in production.
    console.log('[scheduler] No default MongoDB connection — scheduler disabled (multi-tenant mode).');
    return;
  }

  const startCron = () => {
    cron.schedule('* * * * *', () => {
      runAlerts().catch((err) => console.error('Alert scheduler error:', err.message));
      runSubscriptions().catch((err) => console.error('Subscription scheduler error:', err.message));
      runRecons().catch((err) => console.error('Recon scheduler error:', err.message));
    });
    console.log('[scheduler] Alert + subscription + recon scheduler started');
  };

  if (state === 1) {
    // Already connected — start immediately.
    startCron();
  } else {
    // Connecting — wait for the open event.
    mongoose.connection.once('open', startCron);
  }
}

module.exports = { startScheduler, runAlerts, runSubscriptions, runRecons };
