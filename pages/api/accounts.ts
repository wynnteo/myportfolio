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
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT DEFAULT '',
      currency TEXT DEFAULT 'SGD',
      starting_balance REAL DEFAULT 0,
      include_in_networth INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
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

    // GET all accounts
    if (req.method === 'GET') {
      const rows = await client.execute(
        'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC;',
        [userId]
      );
      return res.status(200).json(rows.rows);
    }

    // POST create
    if (req.method === 'POST') {
      const { name, type, tags, currency, starting_balance, include_in_networth } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'name and type are required' });

      const id = crypto.randomUUID();
      await client.execute(
        `INSERT INTO accounts (id, user_id, name, type, tags, currency, starting_balance, include_in_networth)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [id, userId, name.trim(), type, tags ?? '', currency ?? 'SGD',
         Number(starting_balance) || 0, include_in_networth ? 1 : 0]
      );
      return res.status(201).json({ ok: true, id });
    }

    // PUT update
    if (req.method === 'PUT') {
      const { id, name, type, tags, currency, starting_balance, include_in_networth } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      await client.execute(
        `UPDATE accounts SET name = ?, type = ?, tags = ?, currency = ?, starting_balance = ?, include_in_networth = ?
         WHERE id = ? AND user_id = ?;`,
        [name?.trim() ?? '', type ?? '', tags ?? '', currency ?? 'SGD',
         Number(starting_balance) || 0, include_in_networth ? 1 : 0, id, userId]
      );
      return res.status(200).json({ ok: true });
    }

    // DELETE
    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id is required' });

      // Also delete all snapshots for this account
      await client.execute('DELETE FROM account_snapshots WHERE account_id = ?;', [id]);
      await client.execute('DELETE FROM accounts WHERE id = ? AND user_id = ?;', [id, userId]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}