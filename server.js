import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { runPipeline, sendApprovedLead, recomposePending } from './pipeline.js';
import { listQueue, reviewEntry } from './queue.js';

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Review queue ──────────────────────────────────────────────────────────────

// GET /queue                → pending drafts
// GET /queue?status=hold    → scrape-failed leads held for retry
// GET /queue?status=all     → every entry regardless of status
// GET /queue?status=<other> → filter by that status string
app.get('/queue', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status === 'all' ? null : (status ?? 'pending');
    const entries = await listQueue(filter);
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// POST /queue/recompose — regenerate all pending drafts against the current brand.js
// Safe to run after editing config/brand.js; does not re-score or re-gate.
app.post('/queue/recompose', async (req, res) => {
  try {
    const result = await recomposePending();
    res.json(result);
  } catch (err) {
    console.error('Recompose error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
// Weekly Apollo pull: every Sunday at 8 PM Central.
// Set TZ=America/Chicago on Railway, or adjust to UTC ("0 1 * * 1").
cron.schedule('0 20 * * 0', async () => {
  console.log('Cron: weekly pipeline starting...');
  try {
    await runPipeline();
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Hades listening on port ${PORT}`));
