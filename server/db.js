import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { seedCatalog } from './seed.js';

export function openDatabase(filename = process.env.DATABASE_PATH || './data/shop.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.function('uk_lower', (value) => String(value ?? '').toLocaleLowerCase('uk-UA'));
  if (!db.prepare('SELECT id FROM categories LIMIT 1').get()) {
    transaction(db, () => seedCatalog(db));
  }
  return db;
}

// Synchronous statements keep the whole transaction on one SQLite connection.
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
