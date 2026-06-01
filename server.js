import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { runApolloToClay, handleEnrichedLead, sendApprovedLead } from './pipeline.js';
import { verifyClaySignature } from './clay.js';
import { listQueue, reviewEntry } from './queue.js';

const app = express();

// Capture raw body for Clay signature verification before JSON parsing
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Clay webhook ──────────────────────────────────────────────────────────────
app.post('/webhooks/clay', async (req, res) => {
  if (!verifyClaySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // Acknowledge immediately so Clay does not time out and retry
  res.json({ received: true });
  try {
    await handleEnrichedLead(req.body);
  } catch (err) {
    console.error('handleEnrichedLead error:', err.message);
  }
});

// ── Review queue ──────────────────────────────────────────────────────────────

// GET /queue          → pending drafts
// GET /queue?status=all → all drafts
app.get('/queue', async (req, res) => {
  try {
    const status = req.query.status === 'all' ? null : 'pending';
    const entries = await listQueue(status);
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve a draft and push it to Instantly
app.post('/queue/:id/approve', async (req, res) => {
  try {
    const entry = await reviewEntry(req.params.id, 'approved');
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    await sendApprovedLead(entry);
    res.json({ status: 'approved', id: entry.id, email: entry.lead.email });
  } catch (err) {
    console.error('Approve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reject a draft — marks it rejected, nothing sent
app.post('/queue/:id/reject', async (req, res) => {
  try {
    const entry = await reviewEntry(req.params.id, 'rejected');
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ status: 'rejected', id: entry.id, email: entry.lead.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cron ──────────────────────────────────────────────────────────────────────
// Weekly Apollo → Clay pull: every Sunday at 8 PM Central.
// Set TZ=America/Chicago on Railway, or adjust the expression to UTC ("0 1 * * 1").
cron.schedule('0 20 * * 0', async () => {
  console.log('Cron: weekly Apollo pull starting...');
  try {
    await runApolloToClay();
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Hades listening on port ${PORT}`));
