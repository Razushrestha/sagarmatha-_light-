const { registerJob, jobResultKey, setJobResult } = require('../utils/jobs');
const { runWithTenant } = require('../utils/tenantContext');
const { recordJob } = require('../utils/metrics');
const { buildShopReport } = require('../services/reportService');
const { usedStorageBytes } = require('../utils/storageUsage');

function registerJobs() {
  registerJob('shop-report', async (data) => {
    const { tenantId, jobId, type, startDate, endDate } = data;
    try {
      const result = await runWithTenant(tenantId, () =>
        buildShopReport({ tenantId }, { type, startDate, endDate })
      );
      await setJobResult(jobResultKey(tenantId, jobId), { status: 'completed', type, data: result });
      recordJob('completed');
    } catch (error) {
      await setJobResult(jobResultKey(tenantId, jobId), { status: 'failed', message: error.message });
      recordJob('failed');
      throw error;
    }
  });

  registerJob('tenant-storage-scan', async (data) => {
    const { tenantId, jobId } = data;
    try {
      const bytes = await usedStorageBytes(tenantId);
      await setJobResult(jobResultKey(tenantId, jobId), { status: 'completed', data: { bytes } });
      recordJob('completed');
    } catch (error) {
      await setJobResult(jobResultKey(tenantId, jobId), { status: 'failed', message: error.message });
      recordJob('failed');
      throw error;
    }
  });
}

module.exports = { registerJobs };
