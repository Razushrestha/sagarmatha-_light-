/**
 * Restore a mongodump folder into MONGODB_URI.
 * Usage: node scripts/restore-mongo.js --dir ./backups/dump-... [--drop]
 * Never run --drop against production unless you intend to replace the database.
 */
require('dotenv').config();
const path = require('path');
const { execFileSync } = require('child_process');
const { mongoUri } = require('../src/config/env');

const args = process.argv.slice(2);
const dirFlag = args.indexOf('--dir');
const drop = args.includes('--drop');
if (dirFlag < 0 || !args[dirFlag + 1]) {
  console.error('Usage: node scripts/restore-mongo.js --dir <dump-folder> [--drop]');
  process.exit(1);
}

const dir = path.resolve(args[dirFlag + 1]);
const cmd = ['--uri', mongoUri(), dir];
if (drop) cmd.splice(2, 0, '--drop');

execFileSync('mongorestore', cmd, { stdio: 'inherit' });
console.log('Restore complete from', dir);
