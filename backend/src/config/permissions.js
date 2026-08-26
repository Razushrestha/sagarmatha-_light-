const PERMISSIONS = {
  // Sales
  'invoice:create': 'Create invoices',
  'invoice:read': 'View invoices',
  'invoice:edit': 'Edit invoices',
  'invoice:delete': 'Delete invoices',
  'pos:access': 'Access POS',
  'discount:5': 'Give discount up to 5%',
  'discount:15': 'Give discount up to 15%',
  'discount:unlimited': 'Give any discount',
  // Inventory
  'product:create': 'Create products',
  'product:read': 'View products',
  'product:edit': 'Edit products',
  'product:delete': 'Delete products',
  'stock:adjust': 'Adjust stock',
  'stock:transfer': 'Transfer stock',
  // Purchase
  'purchase:create': 'Create purchases',
  'purchase:read': 'View purchases',
  'purchase:edit': 'Edit purchases',
  // Customers
  'customer:create': 'Create customers',
  'customer:read': 'View customers',
  'customer:edit': 'Edit customers',
  // Accounting
  'accounting:read': 'View accounting',
  'accounting:write': 'Manage accounting',
  'reports:view': 'View reports',
  'reports:export': 'Export reports',
  'profit:view': 'View profit margins',
  // Admin
  'users:manage': 'Manage users',
  'settings:manage': 'Manage settings',
  'audit:view': 'View audit logs',
};

const DEFAULT_ROLES = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full system access',
    permissions: Object.keys(PERMISSIONS),
    landingPage: '/dashboard',
  },
  admin: {
    name: 'Admin / Manager',
    description: 'Business operations management',
    permissions: Object.keys(PERMISSIONS).filter((p) => p !== 'audit:view'),
    landingPage: '/dashboard',
  },
  sales_staff: {
    name: 'Sales Staff',
    description: 'POS and sales operations',
    permissions: ['pos:access', 'invoice:create', 'invoice:read', 'discount:5', 'customer:create', 'customer:read', 'product:read'],
    landingPage: '/pos',
  },
  receptionist: {
    name: 'Receptionist',
    description: 'Customer and quotation management',
    permissions: ['customer:create', 'customer:read', 'customer:edit', 'product:read', 'invoice:read'],
    landingPage: '/customers',
  },
  accountant: {
    name: 'Accountant',
    description: 'Financial management',
    permissions: ['accounting:read', 'accounting:write', 'reports:view', 'reports:export', 'customer:read', 'purchase:read', 'invoice:read'],
    landingPage: '/accounting',
  },
  storekeeper: {
    name: 'Storekeeper',
    description: 'Inventory and stock management',
    permissions: ['product:read', 'product:edit', 'stock:adjust', 'stock:transfer', 'purchase:read', 'purchase:create'],
    landingPage: '/inventory',
  },
};

module.exports = { PERMISSIONS, DEFAULT_ROLES };
