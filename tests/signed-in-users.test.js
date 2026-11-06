import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { getSignedInUsers } from '../db.js';

test('lists distinct users with unexpired sessions, without exposing tokens', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE users (id TEXT, username TEXT, name TEXT);
      CREATE TABLE auth_sessions (token_hash TEXT, user_id TEXT, expires_at TEXT);
      INSERT INTO users VALUES ('u1', 'bertha', 'Bertha'), ('u2', 'mia', 'Mia'), ('u3', 'old', 'Old');
      INSERT INTO auth_sessions VALUES
        ('secret1', 'u1', '2026-01-02T00:00:00.000Z'),
        ('secret2', 'u1', '2026-01-03T00:00:00.000Z'),
        ('secret3', 'u2', '2026-01-02T00:00:00.000Z'),
        ('secret4', 'u3', '2026-01-01T00:00:00.000Z');
    `);
    const users = getSignedInUsers(db, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(users.map((u) => ({ ...u })), [
      { id: 'u1', username: 'bertha', name: 'Bertha', sessionCount: 2 },
      { id: 'u2', username: 'mia', name: 'Mia', sessionCount: 1 },
    ]);
  } finally {
    db.close();
  }
});
