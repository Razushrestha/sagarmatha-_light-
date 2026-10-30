import axios from "axios";

const backendPort = process.env.BACKEND_PORT || 5000;
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? "/api" : `http://127.0.0.1:${backendPort}/api`);

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    const headers = config.headers;
    if (headers && typeof headers.delete === "function") headers.delete("Content-Type");
    else if (headers) delete headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const path = window.location.pathname;
      if (!path.includes("/login") && !path.includes("/signup") && !path.includes("/change-password") && !path.startsWith("/book")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
  login: (data: { email: string; password: string }) => api.post("/auth/login", data),
  magicLogin: (data: { token: string }) => api.post("/auth/magic-login", data),
  logout: () => api.post("/auth/logout"),
  getMe: () => api.get("/auth/me"),
  getUsers: () => api.get("/auth/users"),
  getRoles: () => api.get("/auth/roles"),
  updateUser: (id: string, data: object) => api.put(`/auth/users/${id}`, data),
  register: (data: object) => api.post("/auth/register", data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post("/auth/change-password", data),
};

export const ALL_RECORDS = "200";

export const productAPI = {
  getAll: (params?: Record<string, string>) => api.get("/products", { params: { limit: ALL_RECORDS, ...params } }),
  getById: (id: string) => api.get(`/products/${id}`),
  getByBarcode: (code: string) => api.get(`/products/barcode/${code}`),
  create: (data: object) => api.post("/products", data),
  update: (id: string, data: object) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    return api.post("/products/upload-image", formData, { timeout: 120000 });
  },
  exportFile: (format: "csv" | "xlsx") =>
    api.get("/products/export", { params: { format }, responseType: "blob" }),
  downloadTemplate: (format: "csv" | "xlsx") =>
    api.get("/products/import-template", { params: { format }, responseType: "blob" }),
  importFile: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/products/import", formData, { timeout: 60000 });
  },
};

export const saleAPI = {
  getAll: (params?: Record<string, string>) => api.get("/sales", { params }),
  getById: (id: string) => api.get(`/sales/${id}`),
  create: (data: object) => api.post("/sales", data),
  update: (id: string, data: object) => api.put(`/sales/${id}`, data),
  remove: (id: string) => api.delete(`/sales/${id}`),
  getDashboard: (params?: Record<string, string>) => api.get("/sales/dashboard", { params }),
  getHeld: () => api.get("/sales/held"),
  completeHeld: (id: string, data: object) => api.put(`/sales/${id}/complete`, data),
  split: (id: string, data: object) => api.post(`/sales/${id}/split`, data),
  convertToSale: (id: string, data?: object) => api.post(`/sales/${id}/convert`, data),
  createReturn: (id: string, data: object) => api.post(`/sales/${id}/return`, data),
  createReturnsBatch: (data: object) => api.post("/sales/returns/batch", data),
  getReturns: () => api.get("/sales/returns"),
  getReturn: (id: string) => api.get(`/sales/returns/${id}`),
};

export const customerAPI = {
  getAll: (params?: Record<string, string>) => api.get("/customers", { params }),
  getById: (id: string) => api.get(`/customers/${id}`),
  create: (data: object) => api.post("/customers", data),
  update: (id: string, data: object) => api.put(`/customers/${id}`, data),
  remove: (id: string) => api.delete(`/customers/${id}`),
  getDebtors: () => api.get("/customers/debtors"),
  getCreditCustomers: () => api.get("/customers/credit"),
  getLedger: (id: string) => api.get(`/customers/${id}/ledger`),
  receivePayment: (id: string, data: object) => api.post(`/customers/${id}/payments`, data),
  refundCredit: (id: string, data: object) => api.post(`/customers/${id}/credit/refund`, data),
};

export const cafeAPI = {
  getMenu: () => api.get("/cafe/menu"),
  getMargins: () => api.get("/cafe/margins"),
  saveRecipe: (id: string, data: object) => api.put(`/cafe/recipes/${id}`, data),
  bookWaste: (data: object) => api.post("/cafe/waste", data),
  getTables: () => api.get("/cafe/tables"),
  createTable: (data: object) => api.post("/cafe/tables", data),
  updateTable: (id: string, data: object) => api.put(`/cafe/tables/${id}`, data),
  getPriceRules: () => api.get("/cafe/price-rules"),
  savePriceRule: (data: object) => api.post("/cafe/price-rules", data),
  updatePriceRule: (id: string, data: object) => api.put(`/cafe/price-rules/${id}`, data),
  removePriceRule: (id: string) => api.delete(`/cafe/price-rules/${id}`),
};

export const shiftAPI = {
  current: () => api.get("/shifts/current"),
  list: () => api.get("/shifts"),
  open: (data: object) => api.post("/shifts/open", data),
  close: (id: string, data: object) => api.post(`/shifts/${id}/close`, data),
};

export const paintAPI = {
  getShades: (params?: Record<string, string>) => api.get("/paint/shades", { params }),
  createShade: (data: object) => api.post("/paint/shades", data),
  updateShade: (id: string, data: object) => api.put(`/paint/shades/${id}`, data),
  removeShade: (id: string) => api.delete(`/paint/shades/${id}`),
  previewMix: (data: { shadeId: string; packLitres: number }) => api.post("/paint/mix/preview", data),
  mix: (data: { shadeId: string; packLitres: number; warehouseId?: string }) => api.post("/paint/mix", data),
  getLots: (params?: Record<string, string>) => api.get("/paint/lots", { params }),
  getChallans: () => api.get("/paint/challans"),
  getChallan: (id: string) => api.get(`/paint/challans/${id}`),
  createChallan: (data: object) => api.post("/paint/challans", data),
  dispatchChallan: (id: string, data?: object) => api.post(`/paint/challans/${id}/dispatch`, data),
  deliverChallan: (id: string) => api.post(`/paint/challans/${id}/deliver`),
};

export const hotelAPI = {
  getRooms: () => api.get("/hotel/rooms"),
  saveRoom: (data: object) => api.post("/hotel/rooms", data),
  updateRoom: (id: string, data: object) => api.put(`/hotel/rooms/${id}`, data),
  setRoomStatus: (id: string, data: object) => api.post(`/hotel/rooms/${id}/status`, data),
  getStays: (params?: Record<string, string>) => api.get("/hotel/stays", { params }),
  getRack: (params?: Record<string, string>) => api.get("/hotel/rack", { params }),
  checkIn: (data: object) => api.post("/hotel/stays/check-in", data),
  reserve: (data: object) => api.post("/hotel/stays/reserve", data),
  arrive: (id: string, data?: object) => api.post(`/hotel/stays/${id}/arrive`, data),
  updateGuest: (id: string, data: object) => api.put(`/hotel/stays/${id}/guest`, data),
  cancelStay: (id: string, data?: object) => api.post(`/hotel/stays/${id}/cancel`, data),
  noShow: (id: string, data?: object) => api.post(`/hotel/stays/${id}/no-show`, data),
  checkOut: (id: string, data?: object) => api.post(`/hotel/stays/${id}/check-out`, data),
  getFolio: (id: string) => api.get(`/hotel/folios/${id}`),
  settleFolio: (id: string, data: object) => api.post(`/hotel/folios/${id}/settle`, data),
  depositFolio: (id: string, data: object) => api.post(`/hotel/folios/${id}/deposit`, data),
  cityLedgerFolio: (id: string, data: object) => api.post(`/hotel/folios/${id}/city-ledger`, data),
  emailFolio: (id: string, data: object) => api.post(`/hotel/folios/${id}/email`, data),
  extendStay: (id: string, data: object) => api.post(`/hotel/stays/${id}/extend`, data),
  moveStay: (id: string, data: object) => api.post(`/hotel/stays/${id}/move`, data),
  changeRate: (id: string, data: object) => api.post(`/hotel/stays/${id}/rate`, data),
  getReport: (params?: Record<string, string>) => api.get("/hotel/report", { params }),
  getAudit: () => api.get("/hotel/audit"),
  closeNight: (data?: object) => api.post("/hotel/audit/close", data),
  reopenNight: (id: string) => api.post(`/hotel/audit/${id}/reopen`),
  splitFolio: (id: string, data: object) => api.post(`/hotel/folios/${id}/split`, data),
  moveFolioCharge: (id: string, data: object) => api.post(`/hotel/folios/${id}/move`, data),
  getStaff: () => api.get("/hotel/staff"),
  searchGuests: (q: string) => api.get("/hotel/guests", { params: { q } }),
  getRatePlans: () => api.get("/hotel/rates"),
  saveRatePlan: (data: object) => api.post("/hotel/rates", data),
  updateRatePlan: (id: string, data: object) => api.put(`/hotel/rates/${id}`, data),
  quoteRate: (params: Record<string, string>) => api.get("/hotel/rates/quote", { params }),
  getChannel: () => api.get("/hotel/channel"),
  createChannel: (data: object) => api.post("/hotel/channel", data),
  importChannel: (id: string, data: object) => api.post(`/hotel/channel/${id}/import`, data),
};

export const electricianAPI = {
  getAll: (params?: Record<string, string>) => api.get("/electricians", { params }),
  create: (data: object) => api.post("/electricians", data),
  update: (id: string, data: object) => api.put(`/electricians/${id}`, data),
  remove: (id: string) => api.delete(`/electricians/${id}`),
  getCommission: (id: string) => api.get(`/electricians/${id}/commission`),
  receiveCommission: (id: string, data: object) =>
    api.post(`/electricians/${id}/commission-received`, data),
};

export const supplierAPI = {
  getAll: (params?: Record<string, string>) => api.get("/suppliers", { params }),
  getById: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: object) => api.post("/suppliers", data),
  update: (id: string, data: object) => api.put(`/suppliers/${id}`, data),
  remove: (id: string) => api.delete(`/suppliers/${id}`),
  getPurchases: (params?: Record<string, string>) => api.get("/suppliers/purchases", { params }),
  getPurchase: (id: string) => api.get(`/suppliers/purchases/${id}`),
  createPurchase: (data: object) => api.post("/suppliers/purchases", data),
  updatePurchase: (id: string, data: object) => api.put(`/suppliers/purchases/${id}`, data),
  deletePurchase: (id: string) => api.delete(`/suppliers/purchases/${id}`),
  receivePurchaseOrder: (id: string, data?: object) =>
    api.post(`/suppliers/purchases/${id}/receive`, data),
  createPurchaseReturn: (purchaseId: string, data: object) =>
    api.post(`/suppliers/purchases/${purchaseId}/return`, data),
  getReturns: (params?: Record<string, string>) => api.get("/suppliers/returns", { params }),
  getReturn: (id: string) => api.get(`/suppliers/returns/${id}`),
  updatePurchaseReturn: (id: string, data: object) => api.put(`/suppliers/returns/${id}`, data),
  deletePurchaseReturn: (id: string) => api.delete(`/suppliers/returns/${id}`),
  getPayments: (params?: Record<string, string>) => api.get("/suppliers/payments", { params }),
  getPayment: (id: string) => api.get(`/suppliers/payments/${id}`),
  createPayment: (data: object) => api.post("/suppliers/payments", data),
  updatePayment: (id: string, data: object) => api.put(`/suppliers/payments/${id}`, data),
  deletePayment: (id: string) => api.delete(`/suppliers/payments/${id}`),
};

export const miscAPI = {
  getCategories: () => api.get("/categories"),
  createCategory: (data: object) => api.post("/categories", data),
  updateCategory: (id: string, data: object) => api.put(`/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/categories/${id}`),
  getBrands: () => api.get("/brands"),
  createBrand: (data: object) => api.post("/brands", data),
  updateBrand: (id: string, data: object) => api.put(`/brands/${id}`, data),
  deleteBrand: (id: string) => api.delete(`/brands/${id}`),
  getUnits: () => api.get("/units"),
  getWarehouses: () => api.get("/warehouses"),
  getStockMovements: (params?: Record<string, string>) => api.get("/stock-movements", { params }),
  getSettings: () => api.get("/settings"),
  updateSettings: (data: object) => api.put("/settings", data),
  getNotifications: () => api.get("/notifications"),
  search: (q: string) => api.get("/search", { params: { q } }),
};

export const accountingAPI = {
  getAccounts: () => api.get("/accounting/accounts"),
  getSummary: () => api.get("/accounting/summary"),
  getProfitLoss: (params?: Record<string, string>) => api.get("/accounting/profit-loss", { params }),
  getBalanceSheet: () => api.get("/accounting/balance-sheet"),
  getJournal: (params?: Record<string, string>) => api.get("/accounting/journal", { params }),
  getExpenses: (params?: Record<string, string>) => api.get("/accounting/expenses", { params }),
  createExpense: (data: object) => api.post("/accounting/expenses", data),
  updateExpense: (id: string, data: object) => api.put(`/accounting/expenses/${id}`, data),
  removeExpense: (id: string) => api.delete(`/accounting/expenses/${id}`),
  getReports: (params?: Record<string, string>) => api.get("/accounting/reports", { params }),
  enqueueReport: (data: object) => api.post("/accounting/reports/jobs", data),
  getReportJob: (jobId: string) => api.get(`/accounting/reports/jobs/${jobId}`),
};

export const inventoryAPI = {
  adjustStock: (data: object) => api.post("/inventory/adjust", data),
  createWarehouse: (data: object) => api.post("/inventory/warehouses", data),
  markNotificationRead: (id: string) => api.put(`/inventory/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put("/inventory/notifications/read-all"),
  getAuditLogs: (params?: Record<string, string>) => api.get("/inventory/audit-logs", { params }),
};

export const publicAPI = {
  signup: (data: object) => api.post("/public/signup", data),
  config: () => api.get("/public/config"),
  hotelWidget: (slug: string) => api.get(`/public/hotel/${slug}`),
  hotelBook: (slug: string, data: object) => api.post(`/public/hotel/${slug}/book`, data),
};

export const platformAPI = {
  getMetrics: () => api.get("/platform/metrics"),
  testAlert: () => api.post("/platform/alerts/test"),
  getTenants: (params?: Record<string, string>) => api.get("/platform/tenants", { params }),
  exportTenants: (params?: Record<string, string>) =>
    api.get("/platform/tenants/export", { params, responseType: "blob" }),
  getTenant: (id: string) => api.get(`/platform/tenants/${id}`),
  createTenant: (data: object) => api.post("/platform/tenants", data),
  updateTenant: (id: string, data: object) => api.put(`/platform/tenants/${id}`, data),
  lifecycle: (id: string, data: object) => api.post(`/platform/tenants/${id}/lifecycle`, data),
  resetOwnerPassword: (id: string, data?: object) => api.post(`/platform/tenants/${id}/reset-owner-password`, data || {}),
  impersonate: (id: string, data?: { minutes?: number }) => api.post(`/platform/tenants/${id}/impersonate`, data || {}),
  stopImpersonate: () => api.post("/platform/stop-impersonate"),
  getSnapshot: (id: string) => api.get(`/platform/tenants/${id}/snapshot`),
  inviteOwner: (id: string) => api.post(`/platform/tenants/${id}/invite`),
  getSupportLog: (params?: Record<string, string>) => api.get("/platform/support-log", { params }),
  getBackups: () => api.get("/platform/backups"),
  runBackup: () => api.post("/platform/backups/run", {}, { timeout: 130000 }),
  getSettings: () => api.get("/platform/settings"),
  updateSettings: (data: object) => api.put("/platform/settings", data),
  getAdmins: () => api.get("/platform/admins"),
  createAdmin: (data: object) => api.post("/platform/admins", data),
  updateAdmin: (id: string, data: object) => api.put(`/platform/admins/${id}`, data),
};
