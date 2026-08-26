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
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authAPI = {
  login: (data: { email: string; password: string }) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  getMe: () => api.get("/auth/me"),
  getUsers: () => api.get("/auth/users"),
  getRoles: () => api.get("/auth/roles"),
  updateUser: (id: string, data: object) => api.put(`/auth/users/${id}`, data),
  register: (data: object) => api.post("/auth/register", data),
};

// Products
export const productAPI = {
  getAll: (params?: Record<string, string>) => api.get("/products", { params }),
  getById: (id: string) => api.get(`/products/${id}`),
  getByBarcode: (code: string) => api.get(`/products/barcode/${code}`),
  create: (data: object) => api.post("/products", data),
  update: (id: string, data: object) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    return api.post("/products/upload-image", formData);
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

// Sales
export const saleAPI = {
  getAll: (params?: Record<string, string>) => api.get("/sales", { params }),
  getById: (id: string) => api.get(`/sales/${id}`),
  create: (data: object) => api.post("/sales", data),
  getDashboard: () => api.get("/sales/dashboard"),
  getHeld: () => api.get("/sales/held"),
  completeHeld: (id: string, data: object) => api.put(`/sales/${id}/complete`, data),
  convertToSale: (id: string, data?: object) => api.post(`/sales/${id}/convert`, data),
  createReturn: (id: string, data: object) => api.post(`/sales/${id}/return`, data),
  createReturnsBatch: (data: object) => api.post("/sales/returns/batch", data),
  getReturns: () => api.get("/sales/returns"),
  getReturn: (id: string) => api.get(`/sales/returns/${id}`),
};

// Customers
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

export const electricianAPI = {
  getAll: (params?: Record<string, string>) => api.get("/electricians", { params }),
  create: (data: object) => api.post("/electricians", data),
  update: (id: string, data: object) => api.put(`/electricians/${id}`, data),
  remove: (id: string) => api.delete(`/electricians/${id}`),
  getCommission: (id: string) => api.get(`/electricians/${id}/commission`),
  receiveCommission: (id: string, data: object) =>
    api.post(`/electricians/${id}/commission-received`, data),
};

// Suppliers
export const supplierAPI = {
  getAll: (params?: Record<string, string>) => api.get("/suppliers", { params }),
  getById: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: object) => api.post("/suppliers", data),
  update: (id: string, data: object) => api.put(`/suppliers/${id}`, data),
  remove: (id: string) => api.delete(`/suppliers/${id}`),
  getPurchases: (params?: Record<string, string>) => api.get("/suppliers/purchases", { params }),
  getPurchase: (id: string) => api.get(`/suppliers/purchases/${id}`),
  createPurchase: (data: object) => api.post("/suppliers/purchases", data),
  receivePurchaseOrder: (id: string, data?: object) =>
    api.post(`/suppliers/purchases/${id}/receive`, data),
  createPurchaseReturn: (purchaseId: string, data: object) =>
    api.post(`/suppliers/purchases/${purchaseId}/return`, data),
  getReturns: (params?: Record<string, string>) => api.get("/suppliers/returns", { params }),
  getPayments: (params?: Record<string, string>) => api.get("/suppliers/payments", { params }),
  createPayment: (data: object) => api.post("/suppliers/payments", data),
};

// Misc
export const miscAPI = {
  getCategories: () => api.get("/categories"),
  createCategory: (data: object) => api.post("/categories", data),
  getBrands: () => api.get("/brands"),
  createBrand: (data: object) => api.post("/brands", data),
  getUnits: () => api.get("/units"),
  getWarehouses: () => api.get("/warehouses"),
  getStockMovements: (params?: Record<string, string>) => api.get("/stock-movements", { params }),
  getSettings: () => api.get("/settings"),
  updateSettings: (data: object) => api.put("/settings", data),
  getNotifications: () => api.get("/notifications"),
  search: (q: string) => api.get("/search", { params: { q } }),
};

// Accounting
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
};

// Inventory ops
export const inventoryAPI = {
  adjustStock: (data: object) => api.post("/inventory/adjust", data),
  createWarehouse: (data: object) => api.post("/inventory/warehouses", data),
  markNotificationRead: (id: string) => api.put(`/inventory/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put("/inventory/notifications/read-all"),
  getAuditLogs: (params?: Record<string, string>) => api.get("/inventory/audit-logs", { params }),
};
