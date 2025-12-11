import { type NextApiRequest, type NextApiResponse } from 'next';
import { createClient, type Client } from '@libsql/client';

const REQUIRED_ENV_VARS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;

type TransactionType = 'BUY' | 'SELL' | 'DIVIDEND';

interface TransactionRow {
  id: string;
  user_id: string;
  symbol: string;
  product_name: string;
  category: string;
  broker: string;
  currency: string;
  type: TransactionType;
  quantity: number | null;
  price: number | null;
  commission: number | null;
  dividend_amount: number | null;
  trade_date: string | null;
  notes: string | null;
  current_price: number | null;
  created_at: string;
}

interface InsertPayload {
  symbol?: string;
  productName?: string;
  category?: string;
  broker?: string;
  currency?: string;
  type?: TransactionType;
  quantity?: number;
  price?: number;
  commission?: number;
  dividendAmount?: number;
  tradeDate?: string;
  notes?: string | null;
  currentPrice?: number | null;
}

function getMissingEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
}

function getClient(): Client {
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `Missing database keys (${missing.join(', ')}). Add them in .env.local or Vercel project settings.`
    );
  }

  return createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN as string,
  });
}

async function getUserIdFromToken(token: string, client: Client): Promise<string | null> {
  try {
    const result = await client.execute(
      'SELECT user_id FROM sessions WHERE token = ? AND datetime(expires_at) > datetime("now");',
      [token]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].user_id as string;
  } catch {
    return null;
  }
}

async function ensureTables(client: Client) {
  // transactions table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      product_name TEXT,
      category TEXT,
      broker TEXT,
      currency TEXT,
      type TEXT NOT NULL,
      quantity REAL,
      price REAL,
      commission REAL,
      dividend_amount REAL,
      trade_date TEXT,
      notes TEXT,
      current_price REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await ensureColumns(client, 'transactions', {
    product_name: 'TEXT',
    category: 'TEXT',
    broker: 'TEXT',
    currency: 'TEXT',
    commission: 'REAL',
    dividend_amount: 'REAL',
    trade_date: 'TEXT',
    notes: 'TEXT',
    current_price: 'REAL',
    created_at: "TEXT DEFAULT (datetime('now'))",
  });
}

async function ensureColumns(
  client: Client,
  table: string,
  columns: Record<string, string>
) {
  const columnInfo = await client.execute(`PRAGMA table_info(${table});`);
  const existingColumns = new Set(
    (columnInfo.rows as Array<{ name?: string }>).map((row) => row.name)
  );

  for (const [name, type] of Object.entries(columns)) {
    if (!existingColumns.has(name)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`);
    }
  }
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validatePayload(payload: InsertPayload) {
  const baseRequired: Array<keyof InsertPayload> = ['symbol', 'currency'];
  if (!payload.type) {
    return 'type is required';
  }

  const isDividend = payload.type === 'DIVIDEND';
  if (!isDividend) {
    baseRequired.push('broker');
  }

  for (const field of baseRequired) {
    if (!payload[field]) {
      return `${field} is required`;
    }
  }

  if (payload.type === 'BUY' || payload.type === 'SELL') {
    if (payload.quantity === undefined) return 'quantity is required for BUY/SELL';
    if (payload.price === undefined) return 'price is required for BUY/SELL';
  }

  if (payload.type === 'DIVIDEND') {
    if (payload.dividendAmount === undefined) {
      return 'dividendAmount is required for DIVIDEND';
    }
  }

  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const client = getClient();
    await ensureTables(client);

    // Get user ID from token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userId = await getUserIdFromToken(token, client);
    if (!userId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // GET: list transactions
    if (req.method === 'GET') {
      const rows = await client.execute(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY trade_date DESC, created_at DESC;',
        [userId]
      );

      const data: TransactionRow[] = (rows.rows as unknown as TransactionRow[]).map(
        (row) => ({
          ...row,
          quantity: row.quantity !== null ? Number(row.quantity) : null,
          price: row.price !== null ? Number(row.price) : null,
          commission: row.commission !== null ? Number(row.commission) : null,
          dividend_amount:
            row.dividend_amount !== null ? Number(row.dividend_amount) : null,
          current_price:
            row.current_price !== null ? Number(row.current_price) : null,
        })
      );

      res.status(200).json(data);
      return;
    }

    // POST: insert transaction
    if (req.method === 'POST') {
      const body: InsertPayload =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      const payload: InsertPayload = {
        symbol: body.symbol?.trim(),
        productName: body.productName?.trim(),
        category: body.category?.trim(),
        broker: body.broker?.trim(),
        currency: body.currency?.trim(),
        type: body.type,
        quantity: parseNumber(body.quantity),
        price: parseNumber(body.price),
        commission: parseNumber(body.commission) ?? 0,
        dividendAmount: parseNumber(body.dividendAmount),
        tradeDate: body.tradeDate,
        notes: body.notes?.trim() ?? null,
        currentPrice: parseNumber(body.currentPrice),
      };

      const error = validatePayload(payload);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const id = crypto.randomUUID();
      const quantity =
        payload.type === 'SELL' && payload.quantity !== undefined
          ? -Math.abs(payload.quantity)
          : payload.quantity ?? null;
      const price = payload.price ?? null;
      const commission = payload.commission ?? 0;
      const dividendAmount =
        payload.type === 'DIVIDEND'
          ? payload.dividendAmount ?? 0
          : payload.dividendAmount ?? 0;

      await client.execute(
        `
          INSERT INTO transactions (
            id, user_id, symbol, product_name, category, broker, currency, type,
            quantity, price, commission, dividend_amount, trade_date, notes, current_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          id,
          userId,
          payload.symbol ?? '',
          payload.productName ?? '',
          payload.category ?? '',
          payload.broker ?? '',
          payload.currency ?? '',
          payload.type ?? 'BUY',
          quantity,
          price,
          commission,
          dividendAmount,
          payload.tradeDate ?? null,
          payload.notes ?? null,
          payload.currentPrice ?? null,
        ]
      );

      res.status(201).json({ ok: true, id });
      return;
    }

    // PUT: update a transaction
    if (req.method === 'PUT') {
      const body: InsertPayload & { id?: string } =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body.id) {
        res.status(400).json({ error: 'id is required for update' });
        return;
      }

      const payload: InsertPayload = {
        symbol: body.symbol?.trim(),
        productName: body.productName?.trim(),
        category: body.category?.trim(),
        broker: body.broker?.trim(),
        currency: body.currency?.trim(),
        type: body.type,
        quantity: parseNumber(body.quantity),
        price: parseNumber(body.price),
        commission: parseNumber(body.commission) ?? 0,
        dividendAmount: parseNumber(body.dividendAmount),
        tradeDate: body.tradeDate,
        notes: body.notes?.trim() ?? null,
        currentPrice: parseNumber(body.currentPrice),
      };

      const error = validatePayload(payload);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const quantity =
        payload.type === 'SELL' && payload.quantity !== undefined
          ? -Math.abs(payload.quantity)
          : payload.quantity ?? null;
      const price = payload.price ?? null;
      const commission = payload.commission ?? 0;
      const dividendAmount =
        payload.type === 'DIVIDEND'
          ? payload.dividendAmount ?? 0
          : payload.dividendAmount ?? 0;

      await client.execute(
        `
          UPDATE transactions
          SET symbol = ?, product_name = ?, category = ?, broker = ?, currency = ?, type = ?,
              quantity = ?, price = ?, commission = ?, dividend_amount = ?, trade_date = ?,
              notes = ?, current_price = ?
          WHERE id = ? AND user_id = ?;
        `,
        [
          payload.symbol ?? '',
          payload.productName ?? '',
          payload.category ?? '',
          payload.broker ?? '',
          payload.currency ?? '',
          payload.type ?? 'BUY',
          quantity,
          price,
          commission,
          dividendAmount,
          payload.tradeDate ?? null,
          payload.notes ?? null,
          payload.currentPrice ?? null,
          body.id,
          userId,
        ]
      );

      res.status(200).json({ ok: true });
      return;
    }

    // DELETE: delete a transaction (or clear all when no id is provided)
    if (req.method === 'DELETE') {
      const idParam =
        typeof req.query.id === 'string'
          ? req.query.id
          : Array.isArray(req.query.id)
            ? req.query.id[0]
            : undefined;

      if (idParam) {
        await client.execute('DELETE FROM transactions WHERE user_id = ? AND id = ?;', [
          userId,
          idParam,
        ]);
        res.status(200).json({ ok: true, deleted: idParam });
        return;
      }

      await client.execute('DELETE FROM transactions WHERE user_id = ?;', [userId]);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end('Method Not Allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    if (
      message.includes('TURSO_DATABASE_URL') ||
      message.includes('TURSO_AUTH_TOKEN')
    ) {
      res
        .status(500)
        .json({
          error:
            'Missing database keys (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). Add them in .env.local or Vercel settings.',
        });
      return;
    }
    res.status(500).json({ error: message });
  }
}