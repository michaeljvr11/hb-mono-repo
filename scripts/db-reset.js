#!/usr/bin/env node
// Destroys and recreates ONLY the Postgres data volume, then re-runs
// migrations + seed. This exists so nobody reaches for `docker compose down
// -v` (which also wipes the Meilisearch volume and looks identical to the
// safe `db:down`). Always takes a safety backup first unless --no-backup is
// passed, and always requires typed confirmation unless --yes is passed.
const { execFileSync, execSync } = require('child_process');
const readline = require('readline');
const { DB_DATABASE } = require('./db-env');

const args = process.argv.slice(2);
const yes = args.includes('--yes') || args.includes('-y');
const skipBackup = args.includes('--no-backup');

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function dbContainerRunning() {
  try {
    const id = execFileSync('docker', ['compose', 'ps', '-q', 'db']).toString().trim();
    return id.length > 0;
  } catch {
    return false;
  }
}

function volumeNameForDb() {
  // Resolve the *actual* named volume backing the db container's data
  // mount, rather than guessing the compose project-name prefix.
  const containerId = execFileSync('docker', ['compose', 'ps', '-q', 'db']).toString().trim();
  const mounts = JSON.parse(
    execFileSync('docker', ['inspect', '-f', '{{json .Mounts}}', containerId]).toString(),
  );
  const dataMount = mounts.find((m) => m.Destination === '/var/lib/postgresql/data');
  if (!dataMount || dataMount.Type !== 'volume') {
    throw new Error('Could not resolve the Postgres data volume from the running container.');
  }
  return dataMount.Name;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function doReset() {
  if (!skipBackup && dbContainerRunning()) {
    console.log('Taking a safety backup first (skip with --no-backup)...');
    sh('node scripts/db-backup.js');
  } else if (!dbContainerRunning()) {
    console.log('DB container is not running — skipping safety backup.');
  }

  let volume = null;
  if (dbContainerRunning()) {
    volume = volumeNameForDb();
  }

  console.log('Stopping and removing the db container...');
  sh('docker compose rm -f -s db');

  if (volume) {
    console.log(`Removing volume ${volume}...`);
    sh(`docker volume rm ${volume}`);
  }

  console.log('Recreating Postgres...');
  sh('npm run db:up');

  console.log('Waiting for Postgres to be healthy...');
  for (let i = 0; i < 15; i++) {
    try {
      const status = execFileSync('docker', ['compose', 'ps', 'db']).toString();
      if (/healthy/.test(status)) break;
    } catch {
      // ignore, keep polling
    }
    await sleep(1000);
  }

  console.log('Running migrations...');
  sh('npm run migration:run');

  console.log('Seeding...');
  sh('npm run seed');

  console.log('Reset complete.');
}

function run() {
  doReset().catch((err) => {
    console.error('db:reset failed:', err.message || err);
    process.exitCode = 1;
  });
}

if (yes) {
  run();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(
    `This destroys ALL data in "${DB_DATABASE}" and rebuilds it from migrations + seed.\n` +
      'Type "yes" to continue: ',
    (answer) => {
      rl.close();
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('Aborted — no changes made.');
        process.exit(1);
      }
      run();
    },
  );
}
