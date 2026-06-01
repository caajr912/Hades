import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const QUEUE_FILE = path.join(process.cwd(), 'queue.json');

async function readQueue() {
  try {
    return JSON.parse(await fs.readFile(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writeQueue(entries) {
  await fs.writeFile(QUEUE_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

/** Add a composed draft to the queue with status "pending". */
export async function enqueue(lead, draft) {
  const entries = await readQueue();
  const entry = {
    id:         randomUUID(),
    status:     'pending',
    lead,
    draft,
    createdAt:  new Date().toISOString(),
    reviewedAt: null
  };
  entries.push(entry);
  await writeQueue(entries);
  return entry;
}

/**
 * List queue entries, optionally filtered by status.
 * @param {string|null} status  'pending' | 'approved' | 'rejected' | null (all)
 */
export async function listQueue(status = null) {
  const entries = await readQueue();
  return status ? entries.filter(e => e.status === status) : entries;
}

/**
 * Transition an entry's status. Returns the updated entry, or null if not found.
 * @param {string} id
 * @param {'approved'|'rejected'} action
 */
export async function reviewEntry(id, action) {
  const entries = await readQueue();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;
  entries[idx].status     = action;
  entries[idx].reviewedAt = new Date().toISOString();
  await writeQueue(entries);
  return entries[idx];
}
