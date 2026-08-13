import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { timingSafeEqual } from 'crypto';
import { runPipeline, sendApprovedLead, recomposePending } from './pipeline.js';
import { listQueue, reviewEntry } from './queue.js';

// Fail closed: every route below except /health can trigger a real send
// (approve → Instantly) or mutate the queue. Refuse to start rather than run
// unauthenticated because an env var was left unset.
const API_KEY = process.env.HADES_API_KEY;
if (!API_KEY) {
  console.error('HADES_API_KEY is not set — refusing to start. Set it in .env (the Lead Engine must send it as "Authorization: Bearer <key>").');
  process.exit(1);
}

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
// Registered before the auth middleware below, so it's the only unauthenticated route.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
// Shared-secret bearer token. The Lead Engine is the only caller and already
// gates who can trigger these actions (Google sign-in + email_approver role)
// before it ever calls Hades — this just verifies the request came from that
// trusted backend, not from anyone who can reach the port.
app.use((req, res, next) => {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  const expected = Buffer.from(API_KEY);
  const provided = Buffer.from(token ?? '');
  const valid = scheme === 'Bearer' && expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!valid) return res.status(401).json({ error: 'Missing or invalid API key' });
  next();
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
