const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const accountingController = require('../controllers/accountingController');

const router = express.Router();

router.use(protect);

router.get('/accounts', authorize('accounting:read', 'purchase:read'), accountingController.getAccounts);
router.get('/journal', authorize('accounting:read'), accountingController.getJournalEntries);
router.get('/summary', authorize('accounting:read', 'reports:view'), accountingController.getFinancialSummary);
router.get('/profit-loss', authorize('accounting:read', 'reports:view'), accountingController.getProfitLoss);
router.get('/balance-sheet', authorize('accounting:read', 'reports:view'), accountingController.getBalanceSheet);
router.get('/expenses', authorize('accounting:read'), accountingController.getExpenses);
router.post('/expenses', authorize('accounting:write'), accountingController.createExpense);
router.put('/expenses/:id', authorize('accounting:write'), accountingController.updateExpense);
router.delete('/expenses/:id', authorize('accounting:write'), accountingController.deleteExpense);
router.get('/reports', authorize('reports:view', 'accounting:read'), accountingController.getReports);

module.exports = router;
