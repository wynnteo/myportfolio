import { type NextApiRequest, type NextApiResponse } from 'next';
import { createClient, type Client } from '@libsql/client';
import crypto from 'crypto';

const REQUIRED_ENV_VARS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;

function getClient(): Client {
  const missing = REQUIRED_ENV_VARS.filter(k => !process.env[k]);
  if (missing.length > 0) throw new Error(`Missing database keys (${missing.join(', ')})`);
  return createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
}

async function getUserIdFromToken(token: string, client: Client): Promise<string | null> {
  try {
    const result = await client.execute('SELECT user_id FROM sessions WHERE token = ?;', [token]);
    return result.rows.length > 0 ? (result.rows[0].user_id as string) : null;
  } catch { return null; }
}

async function ensureTables(client: Client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      country TEXT DEFAULT 'SG',
      currency TEXT DEFAULT 'SGD',
      amount REAL NOT NULL DEFAULT 0,
      frequency TEXT DEFAULT 'Monthly',
      due_day INTEGER,
      due_month INTEGER,
      auto_debit INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS bill_payments (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      paid_date TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(bill_id) REFERENCES bills(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const client = getClient();
    await ensureTables(client);

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const userId = await getUserIdFromToken(token, client);
    if (!userId) return res.status(401).json({ error: 'Invalid or expired token' });

    const resource = req.query.resource as string; // 'bills' or 'payments'

    // ─── BILLS ────────────────────────────────────────────────────────────────

    if (!resource || resource === 'bills') {

      // GET all bills for user
      if (req.method === 'GET') {
        const rows = await client.execute(
          'SELECT * FROM bills WHERE user_id = ? ORDER BY country ASC, category ASC, name ASC;',
          [userId]
        );
        return res.status(200).json(rows.rows);
      }

      // POST create bill
      if (req.method === 'POST') {
        const { name, category, country, currency, amount, frequency, due_day, due_month, auto_debit, notes, is_active } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });

        const id = crypto.randomUUID();
        await client.execute(
          `INSERT INTO bills (id, user_id, name, category, country, currency, amount, frequency, due_day, due_month, auto_debit, notes, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            id, userId,
            name.trim(),
            category ?? 'Other',
            country ?? 'SG',
            currency ?? 'SGD',
            Number(amount) || 0,
            frequency ?? 'Monthly',
            due_day ? Number(due_day) : null,
            due_month ? Number(due_month) : null,
            auto_debit ? 1 : 0,
            notes ?? '',
            is_active !== false ? 1 : 0,
          ]
        );
        return res.status(201).json({ ok: true, id });
      }

      // PUT update bill
      if (req.method === 'PUT') {
        const { id, name, category, country, currency, amount, frequency, due_day, due_month, auto_debit, notes, is_active } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required' });

        await client.execute(
          `UPDATE bills SET name = ?, category = ?, country = ?, currency = ?, amount = ?,
           frequency = ?, due_day = ?, due_month = ?, auto_debit = ?, notes = ?, is_active = ?
           WHERE id = ? AND user_id = ?;`,
          [
            name?.trim() ?? '',
            category ?? 'Other',
            country ?? 'SG',
            currency ?? 'SGD',
            Number(amount) || 0,
            frequency ?? 'Monthly',
            due_day ? Number(due_day) : null,
            due_month ? Number(due_month) : null,
            auto_debit ? 1 : 0,
            notes ?? '',
            is_active !== false ? 1 : 0,
            id, userId,
          ]
        );
        return res.status(200).json({ ok: true });
      }

      // DELETE bill (also deletes its payments)
      if (req.method === 'DELETE') {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ error: 'id is required' });

        // Verify ownership first
        const check = await client.execute(
          'SELECT id FROM bills WHERE id = ? AND user_id = ?;',
          [id, userId]
        );
        if (check.rows.length === 0) return res.status(403).json({ error: 'Bill not found' });

        await client.execute('DELETE FROM bill_payments WHERE bill_id = ?;', [id]);
        await client.execute('DELETE FROM bills WHERE id = ? AND user_id = ?;', [id, userId]);
        return res.status(200).json({ ok: true });
      }
    }

    // ─── PAYMENTS ─────────────────────────────────────────────────────────────

    if (resource === 'payments') {

      // GET all payments for user (optionally filtered by bill_id)
      if (req.method === 'GET') {
        const billId = req.query.bill_id as string | undefined;
        let rows;
        if (billId) {
          rows = await client.execute(
            'SELECT * FROM bill_payments WHERE user_id = ? AND bill_id = ? ORDER BY paid_date DESC;',
            [userId, billId]
          );
        } else {
          rows = await client.execute(
            'SELECT * FROM bill_payments WHERE user_id = ? ORDER BY paid_date DESC;',
            [userId]
          );
        }
        return res.status(200).json(rows.rows);
      }

      // POST record a payment
      if (req.method === 'POST') {
        const { bill_id, paid_date, amount, notes } = req.body;
        if (!bill_id || !paid_date || amount === undefined) {
          return res.status(400).json({ error: 'bill_id, paid_date and amount are required' });
        }

        // Verify bill belongs to user
        const check = await client.execute(
          'SELECT id FROM bills WHERE id = ? AND user_id = ?;',
          [bill_id, userId]
        );
        if (check.rows.length === 0) return res.status(403).json({ error: 'Bill not found' });

        const id = crypto.randomUUID();
        await client.execute(
          'INSERT INTO bill_payments (id, bill_id, user_id, paid_date, amount, notes) VALUES (?, ?, ?, ?, ?, ?);',
          [id, bill_id, userId, paid_date, Number(amount), notes ?? '']
        );
        return res.status(201).json({ ok: true, id });
      }

      // DELETE a payment record
      if (req.method === 'DELETE') {
        const id = req.query.id as string;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const check = await client.execute(
          'SELECT id FROM bill_payments WHERE id = ? AND user_id = ?;',
          [id, userId]
        );
        if (check.rows.length === 0) return res.status(403).json({ error: 'Payment not found' });

        await client.execute('DELETE FROM bill_payments WHERE id = ? AND user_id = ?;', [id, userId]);
        return res.status(200).json({ ok: true });
      }
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end('Method Not Allowed');

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}