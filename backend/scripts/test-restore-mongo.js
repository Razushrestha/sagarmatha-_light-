/**
 * Dumps the live database and restores it into a throwaway database, then drops that database.
 * Live shop data is not overwritten.
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const { mongoUri, mongoPort } = require('../src/config/env');

(async () => {
  const uri = mongoUri();
  const sourceDb = process.env.MONGODB_DB || 'sagarmatha_light_solution';
  const testDb = `${sourceDb}_restore_test`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nepatronix-restore-'));

  try {
    execFileSync('mongodump', ['--uri', uri, '--out', tmp], { stdio: 'inherit' });
    const dumpedDb = fs.readdirSync(tmp).find((name) => fs.statSync(path.join(tmp, name)).isDirectory());
    if (!dumpedDb) throw new Error('Dump folder was empty.');

    const host = process.env.MONGODB_HOST || '127.0.0.1';
    const restoreUri = `mongodb://${host}:${mongoPort()}/${testDb}`;
    execFileSync(
      'mongorestore',
      ['--uri', restoreUri, '--drop', '--nsFrom', `${dumpedDb}.*`, '--nsTo', `${testDb}.*`, path.join(tmp, dumpedDb)],
      { stdio: 'inherit' }
    );

    const conn = await mongoose.createConnection(restoreUri).asPromise();
    const names = await conn.db.listCollections().toArray();
    console.log(`Restore test OK: ${names.length} collections in ${testDb}`);
    await conn.db.dropDatabase();
    await conn.close();
    console.log('Dropped test database. Live data was not changed.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error('Restore test failed:', error.message);
  console.error('Install MongoDB Database Tools (mongodump / mongorestore) to run backups.');
  process.exit(1);
});
