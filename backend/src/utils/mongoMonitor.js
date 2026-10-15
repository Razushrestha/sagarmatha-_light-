const mongoose = require('mongoose');
const { recordMongoQuery } = require('./metrics');

function installMongoMonitor() {
  const queryExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function execWithTiming(...args) {
    const started = Date.now();
    try {
      return await queryExec.apply(this, args);
    } finally {
      recordMongoQuery(this.model?.modelName || 'Query', Date.now() - started, this.op || 'find');
    }
  };

  const aggregateExec = mongoose.Aggregate.prototype.exec;
  mongoose.Aggregate.prototype.exec = async function aggregateWithTiming(...args) {
    const started = Date.now();
    try {
      return await aggregateExec.apply(this, args);
    } finally {
      recordMongoQuery(this._model?.modelName || 'Aggregate', Date.now() - started, 'aggregate');
    }
  };
}

module.exports = { installMongoMonitor };
