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
    CREATE TABLE IF NOT EXISTS account_snapshots (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      balance REAL NOT NULL,
      note TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(account_id) REFERENCES accounts(id),
      UNIQUE(account_id, year, month)
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

    // GET all snapshots for the user's accounts
    if (req.method === 'GET') {
      const rows = await client.execute(
        `SELECT s.* FROM account_snapshots s
         JOIN accounts a ON s.account_id = a.id
         WHERE a.user_id = ?
         ORDER BY s.year ASC, s.month ASC;`,
        [userId]
      );
      return res.status(200).json(rows.rows);
    }

    // POST create snapshot (upsert: if same account+year+month exists, update it)
    if (req.method === 'POST') {
      const { account_id, year, month, balance, note } = req.body;
      if (!account_id || !year || !month || balance === undefined) {
        return res.status(400).json({ error: 'account_id, year, month, balance are required' });
      }

      // Verify account belongs to user
      const accCheck = await client.execute(
        'SELECT id FROM accounts WHERE id = ? AND user_id = ?;',
        [account_id, userId]
      );
      if (accCheck.rows.length === 0) return res.status(403).json({ error: 'Account not found' });

      // Check if snapshot already exists for this account+year+month
      const existing = await client.execute(
        'SELECT id FROM account_snapshots WHERE account_id = ? AND year = ? AND month = ?;',
        [account_id, year, month]
      );

      if (existing.rows.length > 0) {
        // Update existing
        await client.execute(
          `UPDATE account_snapshots SET balance = ?, note = ?, updated_at = datetime('now')
           WHERE account_id = ? AND year = ? AND month = ?;`,
          [Number(balance), note ?? null, account_id, year, month]
        );
        return res.status(200).json({ ok: true, updated: true });
      }

      const id = crypto.randomUUID();
      await client.execute(
        `INSERT INTO account_snapshots (id, account_id, year, month, balance, note)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [id, account_id, Number(year), Number(month), Number(balance), note ?? null]
      );
      return res.status(201).json({ ok: true, id });
    }

    // PUT update existing snapshot
    if (req.method === 'PUT') {
      const { id, balance, note } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      await client.execute(
        `UPDATE account_snapshots SET balance = ?, note = ?, updated_at = datetime('now')
         WHERE id = ?;`,
        [Number(balance), note ?? null, id]
      );
      return res.status(200).json({ ok: true });
    }

    // DELETE
    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id is required' });

      await client.execute('DELETE FROM account_snapshots WHERE id = ?;', [id]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}