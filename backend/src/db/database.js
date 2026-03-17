import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    // Support both DATABASE_URL and individual DB_* variables
    const databaseUrl = process.env.DATABASE_URL;
    
    let poolConfig;
    if (databaseUrl) {
      // Parse DATABASE_URL (postgresql://user:pass@host:port/db)
      const match = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
      if (match) {
        poolConfig = {
          host: match[3],
          port: parseInt(match[4]),
          database: match[5],
          user: match[1],
          password: match[2],
        };
      }
    }
    
    pool = new Pool({
      host: poolConfig?.host || process.env.DB_HOST || 'localhost',
      port: poolConfig?.port || parseInt(process.env.DB_PORT) || 5432,
      database: poolConfig?.database || process.env.DB_NAME || 'mangavault',
      user: poolConfig?.user || process.env.DB_USER || 'mangavault',
      password: poolConfig?.password || process.env.DB_PASSWORD || 'mangavault_password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
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
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
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
    const pool = getPool();
    
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    // Run migrations
    await runMigrations();
    
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../database');
  
  try {
    // Check if migrations table exists
    const tableExists = await queryOne(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations')"
    );
    
    if (!tableExists) {
      await query(`
        CREATE TABLE migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    // Get executed migrations
    const executed = await queryAll('SELECT name FROM migrations');
    const executedNames = new Set(executed.map(m => m.name));
    
    // Read migration files
    const migrationsPath = path.join(migrationsDir, 'migrations');
    
    if (fs.existsSync(migrationsPath)) {
      const files = fs.readdirSync(migrationsPath)
        .filter(f => f.endsWith('.sql'))
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
  }
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
  getPool
};

