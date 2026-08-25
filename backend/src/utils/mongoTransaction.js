const mongoose = require('mongoose');

let transactionsSupported = null;

async function supportsTransactions() {
  if (transactionsSupported !== null) return transactionsSupported;

  try {
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        if (mongoose.connection.readyState === 1) return resolve();
        mongoose.connection.once('connected', resolve);
        mongoose.connection.once('error', reject);
      });
    }

    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    transactionsSupported = false;
  }

  return transactionsSupported;
}

function sessionQuery(query, session) {
  return session ? query.session(session) : query;
}

function sessionOpts(session) {
  return session ? { session } : {};
}

async function withOptionalTransaction(fn) {
  if (!(await supportsTransactions())) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = {
  supportsTransactions,
  sessionQuery,
  sessionOpts,
  withOptionalTransaction,
};
