#!/usr/bin/env node
// Dumps the dev Postgres database to backups/<db>-<timestamp>.sql via pg_dump
// running inside the `db` compose container. --clean --if-exists so the file
// is also a valid input for db-restore.js against a non-empty database.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DB_USERNAME, DB_DATABASE } = require('./db-env');

const backupsDir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(backupsDir, `${DB_DATABASE}-${timestamp}.sql`);

console.log(`Backing up "${DB_DATABASE}" -> ${path.relative(process.cwd(), outFile)}`);

const dump = execFileSync(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    'pg_dump',
    '-U',
    DB_USERNAME,
    '-d',
    DB_DATABASE,
    '--clean',
    '--if-exists',
  ],
  { maxBuffer: 1024 * 1024 * 1024 },
);

fs.writeFileSync(outFile, dump);
console.log(`Backup complete (${(dump.length / 1024).toFixed(1)} KB).`);
