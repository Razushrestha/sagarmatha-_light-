import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? "/api" : "http://localhost:5000/api");

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
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
  register: (data: Record<string, unknown>) => api.post("/auth/register", data),
};

// Products
export const productAPI = {
  getAll: (params?: Record<string, string>) => api.get("/products", { params }),
  getById: (id: string) => api.get(`/products/${id}`),
  getByBarcode: (code: string) => api.get(`/products/barcode/${code}`),
  create: (data: Record<string, unknown>) => api.post("/products", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    return api.post("/products/upload-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  exportFile: (format: "csv" | "xlsx") =>
    api.get("/products/export", { params: { format }, responseType: "blob" }),
  downloadTemplate: (format: "csv" | "xlsx") =>
    api.get("/products/import-template", { params: { format }, responseType: "blob" }),
  importFile: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/products/import", formData, {
      timeout: 60000,
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// Sales
export const saleAPI = {
  getAll: (params?: Record<string, string>) => api.get("/sales", { params }),
  getById: (id: string) => api.get(`/sales/${id}`),
  create: (data: Record<string, unknown>) => api.post("/sales", data),
  getDashboard: () => api.get("/sales/dashboard"),
  getHeld: () => api.get("/sales/held"),
  completeHeld: (id: string, data: Record<string, unknown>) => api.put(`/sales/${id}/complete`, data),
  convertToSale: (id: string, data?: Record<string, unknown>) => api.post(`/sales/${id}/convert`, data),
  createReturn: (id: string, data: Record<string, unknown>) => api.post(`/sales/${id}/return`, data),
  createReturnsBatch: (data: Record<string, unknown>) => api.post("/sales/returns/batch", data),
  getReturns: () => api.get("/sales/returns"),
  getReturn: (id: string) => api.get(`/sales/returns/${id}`),
};

// Customers
export const customerAPI = {
  getAll: (params?: Record<string, string>) => api.get("/customers", { params }),
  getById: (id: string) => api.get(`/customers/${id}`),
  create: (data: Record<string, unknown>) => api.post("/customers", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/customers/${id}`, data),
  getDebtors: () => api.get("/customers/debtors"),
  getCreditCustomers: () => api.get("/customers/credit"),
  getLedger: (id: string) => api.get(`/customers/${id}/ledger`),
  receivePayment: (id: string, data: Record<string, unknown>) => api.post(`/customers/${id}/payments`, data),
  refundCredit: (id: string, data: Record<string, unknown>) => api.post(`/customers/${id}/credit/refund`, data),
};

export const electricianAPI = {
  getAll: (params?: Record<string, string>) => api.get("/electricians", { params }),
  create: (data: Record<string, unknown>) => api.post("/electricians", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/electricians/${id}`, data),
  remove: (id: string) => api.delete(`/electricians/${id}`),
  getCommission: (id: string) => api.get(`/electricians/${id}/commission`),
  receiveCommission: (id: string, data: Record<string, unknown>) =>
    api.post(`/electricians/${id}/commission-received`, data),
};

// Suppliers
export const supplierAPI = {
  getAll: (params?: Record<string, string>) => api.get("/suppliers", { params }),
  getById: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: Record<string, unknown>) => api.post("/suppliers", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/suppliers/${id}`, data),
  getPurchases: (params?: Record<string, string>) => api.get("/suppliers/purchases", { params }),
  getPurchase: (id: string) => api.get(`/suppliers/purchases/${id}`),
  createPurchase: (data: Record<string, unknown>) => api.post("/suppliers/purchases", data),
  receivePurchaseOrder: (id: string, data?: Record<string, unknown>) =>
    api.post(`/suppliers/purchases/${id}/receive`, data),
  createPurchaseReturn: (purchaseId: string, data: Record<string, unknown>) =>
    api.post(`/suppliers/purchases/${purchaseId}/return`, data),
  getReturns: (params?: Record<string, string>) => api.get("/suppliers/returns", { params }),
  getPayments: (params?: Record<string, string>) => api.get("/suppliers/payments", { params }),
  createPayment: (data: Record<string, unknown>) => api.post("/suppliers/payments", data),
};

// Misc
export const miscAPI = {
  getCategories: () => api.get("/categories"),
  createCategory: (data: Record<string, unknown>) => api.post("/categories", data),
  getBrands: () => api.get("/brands"),
  createBrand: (data: Record<string, unknown>) => api.post("/brands", data),
  getUnits: () => api.get("/units"),
  getWarehouses: () => api.get("/warehouses"),
  getStockMovements: (params?: Record<string, string>) => api.get("/stock-movements", { params }),
  getSettings: () => api.get("/settings"),
  updateSettings: (data: Record<string, unknown>) => api.put("/settings", data),
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
  createExpense: (data: Record<string, unknown>) => api.post("/accounting/expenses", data),
  getReports: (params?: Record<string, string>) => api.get("/accounting/reports", { params }),
};

// Inventory ops
export const inventoryAPI = {
  adjustStock: (data: Record<string, unknown>) => api.post("/inventory/adjust", data),
  createWarehouse: (data: Record<string, unknown>) => api.post("/inventory/warehouses", data),
  markNotificationRead: (id: string) => api.put(`/inventory/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put("/inventory/notifications/read-all"),
  getAuditLogs: (params?: Record<string, string>) => api.get("/inventory/audit-logs", { params }),
};
