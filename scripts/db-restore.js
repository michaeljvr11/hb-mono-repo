#!/usr/bin/env node
// Restores a backups/*.sql dump (produced by db-backup.js) into the running
// `db` compose container. Defaults to the most recent backup. Dumps taken
// with --clean --if-exists carry their own DROP statements, so this is safe
// to run against a database that already has data in it.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DB_USERNAME, DB_DATABASE } = require('./db-env');

const backupsDir = path.join(__dirname, '..', 'backups');
const args = process.argv.slice(2);
const yes = args.includes('--yes') || args.includes('-y');
const fileArg = args.find((a) => !a.startsWith('-'));

function latestBackup() {
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => path.join(backupsDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (files.length === 0) {
    console.error(`No backups found in ${backupsDir}. Run "npm run db:backup" first.`);
    process.exit(1);
  }
  return files[0];
}

const target = fileArg ? path.resolve(fileArg) : latestBackup();
if (!fs.existsSync(target)) {
  console.error(`Backup file not found: ${target}`);
  process.exit(1);
}

function confirmAndRun() {
  console.log(
    `Restoring ${path.relative(process.cwd(), target)} into "${DB_DATABASE}". ` +
      'This overwrites current data (the dump drops-and-recreates objects it contains).',
  );
  const sql = fs.readFileSync(target);
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', DB_USERNAME, '-d', DB_DATABASE], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log('Restore complete.');
}

if (yes) {
  confirmAndRun();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`Restore ${path.basename(target)} into "${DB_DATABASE}"? Type "yes" to continue: `, (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted — no changes made.');
      process.exit(1);
    }
    confirmAndRun();
  });
}
