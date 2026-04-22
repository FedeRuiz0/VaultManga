import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

let pool = null;

function maskValue(value, visible = 2) {
  if (!value) return '';
  if (value.length <= visible) return '*'.repeat(value.length);
  return `${value.slice(0, visible)}***`;
}

function getSanitizedConnectionTarget(databaseUrl, poolConfig) {
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      return `${parsed.protocol}//${maskValue(parsed.username)}@${parsed.hostname}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '')}`;
    } catch {
      // fall through to poolConfig formatting
    }
  }

  return `postgresql://${maskValue(poolConfig.user)}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`;
}


function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);

    const isPostgresProtocol =
      parsed.protocol === 'postgres:' ||
      parsed.protocol === 'postgresql:';

    if (!isPostgresProtocol) {
      throw new Error(`Unsupported DATABASE_URL protocol: ${parsed.protocol}`);
    }

    return {
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: parsed.pathname ? decodeURIComponent(parsed.pathname.replace(/^\//, '')) : undefined,
      user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      ssl:
        parsed.searchParams.get('sslmode') === 'require'
          ? { rejectUnauthorized: false }
          : undefined,
    };
  } catch (error) {
    console.error('Invalid DATABASE_URL:', error.message);
    return null;
  }
}

export function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    const parsedUrlConfig = parseDatabaseUrl(databaseUrl);

    const poolConfig = {
      host: parsedUrlConfig?.host || process.env.DB_HOST || 'localhost',
      port: parsedUrlConfig?.port || Number(process.env.DB_PORT) || 5432,
      database: parsedUrlConfig?.database || process.env.DB_NAME || 'mangavault',
      user: parsedUrlConfig?.user || process.env.DB_USER || 'mangavault',
      password:
        parsedUrlConfig?.password || process.env.DB_PASSWORD || 'mangavault_password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    if (parsedUrlConfig?.ssl) {
      poolConfig.ssl = parsedUrlConfig.ssl;
    }

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  return pool;
}

export async function query(text, params) {
  const client = await getPool().connect();

  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', {
        text: String(text).substring(0, 140),
        duration,
        rows: result.rowCount ?? null,
      });
    }

    return result;
  } finally {
    client.release();
  }
}

export async function queryOne(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

export async function queryAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

export async function initDatabase() {
  try {
    const dbPool = getPool();
    const databaseUrl = process.env.DATABASE_URL;
    const parsedUrlConfig = parseDatabaseUrl(databaseUrl);
    const poolConfigForLog = {
      host: parsedUrlConfig?.host || process.env.DB_HOST || 'localhost',
      port: parsedUrlConfig?.port || Number(process.env.DB_PORT) || 5432,
      database: parsedUrlConfig?.database || process.env.DB_NAME || 'mangavault',
      user: parsedUrlConfig?.user || process.env.DB_USER || 'mangavault',
    };

    const client = await dbPool.connect();
    await client.query('SELECT NOW()');
    const target = await client.query(`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name,
        current_setting('search_path') AS search_path
    `);
    client.release();

    const runtimeTarget = target.rows[0];
    console.log('[db] Connected target:', {
      configured: getSanitizedConnectionTarget(databaseUrl, poolConfigForLog),
      database: runtimeTarget.database_name,
      schema: runtimeTarget.schema_name,
      search_path: runtimeTarget.search_path,
    });

    await runMigrations();
    await ensureUserFavoritesTable();

    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../../database');

  try {
    const tableExistsResult = await queryOne(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations') AS exists"
    );

    if (!tableExistsResult || !tableExistsResult.exists) {
      await query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    const executed = await queryAll('SELECT name FROM migrations');
    const executedNames = new Set(executed.map((m) => m.name));

    const migrationsPath = path.join(migrationsDir, 'migrations');

    if (fs.existsSync(migrationsPath)) {
      const files = fs
        .readdirSync(migrationsPath)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (!executedNames.has(file)) {
          console.log(`Running migration: ${file}`);
          const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf-8');
          await query(sql);
          await query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        }
      }
    }
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

async function ensureUserFavoritesTable() {
  const visibilityRows = await queryAll(
    `
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = 'user_favorites'
    ORDER BY table_schema
    `
  );

  if (visibilityRows.length === 0) {
    console.warn('[db] user_favorites not found after migrations. Applying runtime hardening.');

    await query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        manga_id UUID NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, manga_id)
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_favorites_user_manga
      ON user_favorites(user_id, manga_id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_user_favorites_user_created
      ON user_favorites(user_id, created_at DESC)
    `);
  }

  const finalVisibilityRows = await queryAll(
    `
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = 'user_favorites'
    ORDER BY table_schema
    `
  );

  console.log('[db] user_favorites visibility:', finalVisibilityRows.map((row) => row.table_schema));
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default {
  query,
  queryOne,
  queryAll,
  initDatabase,
  closeDatabase,
  getPool,
};