import { type NextApiRequest, type NextApiResponse } from 'next';
import { createClient, type Client } from '@libsql/client';
import crypto from 'crypto';

const REQUIRED_ENV_VARS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;

interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
}

interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

interface PasswordReset {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
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

async function ensureTables(client: Client) {
  // users table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // sessions table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // password_resets table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getExpiryDate(hours: number = 24): string {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const client = getClient();
    await ensureTables(client);

    // REGISTER
    if (req.method === 'POST' && req.query.action === 'register') {
      const { email, password, name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      // Check if user already exists
      const existing = await client.execute(
        'SELECT id FROM users WHERE email = ?;',
        [email.toLowerCase().trim()]
      );

      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      // Create user
      const userId = crypto.randomUUID();
      const passwordHash = hashPassword(password);

      await client.execute(
        'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?);',
        [userId, email.toLowerCase().trim(), passwordHash, name?.trim() || null]
      );

      // Create session
      const sessionId = crypto.randomUUID();
      const token = generateToken();
      const expiresAt = getExpiryDate(720); // 30 days

      await client.execute(
        'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?);',
        [sessionId, userId, token, expiresAt]
      );

      res.status(201).json({
        success: true,
        user: { id: userId, email: email.toLowerCase().trim(), name: name?.trim() || null },
        token,
      });
      return;
    }

    // LOGIN
    if (req.method === 'POST' && req.query.action === 'login') {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      // Find user
      const result = await client.execute(
        'SELECT id, email, password_hash, name FROM users WHERE email = ?;',
        [email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const user = result.rows[0] as unknown as User;
      const passwordHash = hashPassword(password);

      if (user.password_hash !== passwordHash) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      // Create session
      const sessionId = crypto.randomUUID();
      const token = generateToken();
      const expiresAt = getExpiryDate(720); // 30 days

      await client.execute(
        'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?);',
        [sessionId, user.id, token, expiresAt]
      );

      res.status(200).json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
        token,
      });
      return;
    }

    // LOGOUT
    if (req.method === 'POST' && req.query.action === 'logout') {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      await client.execute('DELETE FROM sessions WHERE token = ?;', [token]);

      res.status(200).json({ success: true });
      return;
    }

    // VERIFY TOKEN
    if (req.method === 'GET' && req.query.action === 'verify') {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const result = await client.execute(
        `SELECT s.user_id, s.expires_at, u.email, u.name 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.token = ?;`,
        [token]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      const session = result.rows[0] as any;
      const expiresAt = new Date(session.expires_at);

      if (expiresAt < new Date()) {
        await client.execute('DELETE FROM sessions WHERE token = ?;', [token]);
        res.status(401).json({ error: 'Token expired' });
        return;
      }

      res.status(200).json({
        success: true,
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name,
        },
      });
      return;
    }

    // FORGOT PASSWORD
    if (req.method === 'POST' && req.query.action === 'forgot-password') {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      const result = await client.execute(
        'SELECT id FROM users WHERE email = ?;',
        [email.toLowerCase().trim()]
      );

      // Always return success to prevent email enumeration
      if (result.rows.length === 0) {
        res.status(200).json({ 
          success: true, 
          message: 'If the email exists, a reset link will be sent' 
        });
        return;
      }

      const user = result.rows[0] as any;
      const resetId = crypto.randomUUID();
      const resetToken = generateToken();
      const expiresAt = getExpiryDate(1); // 1 hour

      await client.execute(
        'INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?);',
        [resetId, user.id, resetToken, expiresAt]
      );

      // In production, send email with reset link
      // For now, return the token (REMOVE IN PRODUCTION)
      res.status(200).json({
        success: true,
        message: 'Password reset link sent to email',
        // REMOVE THIS IN PRODUCTION - only for testing:
        resetToken,
        resetLink: `/reset-password?token=${resetToken}`,
      });
      return;
    }

    // RESET PASSWORD
    if (req.method === 'POST' && req.query.action === 'reset-password') {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        res.status(400).json({ error: 'Token and new password are required' });
        return;
      }

      const result = await client.execute(
        'SELECT id, user_id, expires_at, used FROM password_resets WHERE token = ?;',
        [token]
      );

      if (result.rows.length === 0) {
        res.status(400).json({ error: 'Invalid or expired reset token' });
        return;
      }

      const reset = result.rows[0] as unknown as PasswordReset;

      if (reset.used === 1) {
        res.status(400).json({ error: 'Reset token already used' });
        return;
      }

      const expiresAt = new Date(reset.expires_at);
      if (expiresAt < new Date()) {
        res.status(400).json({ error: 'Reset token expired' });
        return;
      }

      // Update password
      const passwordHash = hashPassword(newPassword);
      await client.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?;',
        [passwordHash, reset.user_id]
      );

      // Mark token as used
      await client.execute(
        'UPDATE password_resets SET used = 1 WHERE id = ?;',
        [reset.id]
      );

      // Invalidate all sessions for this user
      await client.execute(
        'DELETE FROM sessions WHERE user_id = ?;',
        [reset.user_id]
      );

      res.status(200).json({
        success: true,
        message: 'Password reset successful',
      });
      return;
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end('Method Not Allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    res.status(500).json({ error: message });
  }
}