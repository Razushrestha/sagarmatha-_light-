const mongoose = require('mongoose');
const { getTenantId } = require('../../utils/tenantContext');

const QUERY_HOOKS = [
  'find',
  'findOne',
  'count',
  'countDocuments',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
  'distinct',
];

const UPDATE_HOOKS = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'];

function tenantObjectId() {
  const tid = getTenantId();
  if (!tid || !mongoose.Types.ObjectId.isValid(tid)) return null;
  return new mongoose.Types.ObjectId(tid);
}

function skipped(query) {
  return Boolean(query?.getOptions?.()?.skipTenant || query?.options?.skipTenant);
}

function applyTenantFilter() {
  if (skipped(this)) return;
  const tid = tenantObjectId();
  if (!tid) return;
  const query = this.getQuery();
  this.setQuery({ ...query, tenantId: tid });
}

function stripTenantFromUpdate() {
  if (skipped(this)) return;
  const tid = tenantObjectId();
  if (!tid) return;
  const update = this.getUpdate();
  if (!update || typeof update !== 'object') return;
  delete update.tenantId;
  if (update.$set) {
    delete update.$set.tenantId;
    if (!Object.keys(update.$set).length) delete update.$set;
  }
  if (update.$unset) {
    delete update.$unset.tenantId;
  }
  if (update.$setOnInsert) {
    update.$setOnInsert.tenantId = tid;
  }
  this.setUpdate(update);
}

function applyTenantPlugin(schema, { uniqueFields = [], uniqueTenant = false } = {}) {
  schema.add({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  });
  if (uniqueTenant) {
    schema.index({ tenantId: 1 }, { unique: true, sparse: true });
  } else {
    schema.index({ tenantId: 1 });
  }

  uniqueFields.forEach((field) => {
    schema.index({ tenantId: 1, [field]: 1 }, { unique: true, sparse: true });
  });

  schema.pre('save', function () {
    if (this.role === 'platform_admin') return;
    const tid = tenantObjectId();
    if (tid) this.tenantId = tid;
  });

  schema.pre('insertMany', function (next, docs) {
    const tid = tenantObjectId();
    if (tid && Array.isArray(docs)) {
      docs.forEach((doc) => {
        if (doc && doc.role !== 'platform_admin') doc.tenantId = tid;
      });
    }
    next();
  });

  QUERY_HOOKS.forEach((hook) => {
    schema.pre(hook, applyTenantFilter);
  });

  UPDATE_HOOKS.forEach((hook) => {
    schema.pre(hook, stripTenantFromUpdate);
  });

  schema.pre('aggregate', function () {
    if (this.options?.skipTenant) return;
    const tid = tenantObjectId();
    if (!tid) return;
    const pipeline = this.pipeline();
    const first = pipeline[0];
    if (first?.$match) {
      first.$match = { ...first.$match, tenantId: tid };
      return;
    }
    pipeline.unshift({ $match: { tenantId: tid } });
  });
}

module.exports = { applyTenantPlugin };
