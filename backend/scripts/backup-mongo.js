/**
 * Dump MongoDB to BACKUP_DIR (keeps last BACKUP_KEEP copies).
 * Schedule on Windows: schtasks /Create /SC DAILY /TN "NepatronixMongoBackup" /TR "node ...\backup-mongo.js"
 * Schedule on Linux: 0 2 * * * cd /var/www/.../backend && node scripts/backup-mongo.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mongoUri } = require('../src/config/env');

const KEEP = Number(process.env.BACKUP_KEEP || 14);
const backupRoot = process.env.BACKUP_DIR || path.join(__dirname, '../backups');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function prune() {
  if (!fs.existsSync(backupRoot)) return;
  const dirs = fs.readdirSync(backupRoot)
    .filter((name) => name.startsWith('dump-'))
    .map((name) => ({ name, time: fs.statSync(path.join(backupRoot, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  dirs.slice(KEEP).forEach((entry) => {
    fs.rmSync(path.join(backupRoot, entry.name), { recursive: true, force: true });
    console.log('Pruned', entry.name);
  });
}

const dest = path.join(backupRoot, `dump-${stamp()}`);
fs.mkdirSync(dest, { recursive: true });

execFileSync('mongodump', ['--uri', mongoUri(), '--out', dest], { stdio: 'inherit' });
fs.writeFileSync(path.join(backupRoot, 'LAST_OK'), new Date().toISOString());
console.log('Backup written to', dest);
prune();
