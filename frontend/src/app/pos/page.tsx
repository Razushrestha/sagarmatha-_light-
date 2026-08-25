"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Modal from "@/components/ui/Modal";
import { productAPI, saleAPI, customerAPI, miscAPI, electricianAPI } from "@/lib/api";
import { formatCurrency, cn, getImageUrl } from "@/lib/utils";
import { isWireProduct, lineCommission, productCategoryName, productCommissionPercent } from "@/lib/commission";
import toast from "react-hot-toast";
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  Banknote, User, UserPlus, Users, X, ScanBarcode, RotateCcw, Package, FileText, Receipt, Warehouse, Zap,
} from "lucide-react";
import WarehouseSelect, { pickDefaultWarehouseId } from "@/components/ui/WarehouseSelect";

interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  sellingPrice: number;
  wholesalePrice?: number;
  dealerPrice?: number;
  currentStock: number;
  images?: string[];
  category?: { _id: string; name: string } | string;
  commissionPercent?: number;
}

interface Category {
  _id: string;
  name: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  commission?: number;
  commissionPercent?: number;
  commissionManual?: boolean;
}

interface Customer { _id: string; name: string; phone: string; address?: string; outstanding?: number; creditBalance?: number; customerType?: string; }

type CustomerPanel = null | "new" | "search";

interface PaymentLine { method: string; amount: number; reference?: string; }

interface ElectricianOption {
  _id: string;
  name: string;
  commissionPercent?: number;
}

interface HeldSale {
  _id: string;
  invoiceNumber: string;
  customerName?: string;
  total: number;
  items: Array<{ productName: string; quantity: number }>;
}

const CART_PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank" },
  { id: "esewa", label: "eSewa" },
  { id: "fonepay", label: "Fonepay" },
  { id: "khalti", label: "Khalti" },
  { id: "credit", label: "Debtor" },
] as const;

function buildCartPayments(total: number, payingNow: number, method: string): PaymentLine[] {
  const pay = Math.min(Math.max(0, payingNow), total);
  const debt = Math.max(0, total - pay);
  const lines: PaymentLine[] = [];

  if (pay > 0 && method !== "credit") {
    lines.push({ method, amount: pay });
  }
  if (debt > 0) {
    lines.push({ method: "credit", amount: debt });
  }
  if (method === "credit" && pay === 0 && debt === 0 && total > 0) {
    lines.push({ method: "credit", amount: total });
  }
  if (lines.length === 0 && total > 0) {
    lines.push({ method: method === "credit" ? "credit" : method, amount: total });
  }
  return lines;
}

function safeOutstanding(value?: number) {
  return Number.isFinite(value) ? value! : 0;
}

function safeCredit(value?: number) {
  return Number.isFinite(value) ? value! : 0;
}

const PAYMENT_METHODS = ["cash", "esewa", "khalti", "fonepay", "bank", "credit"];
const PRICE_LEVELS = [
  { id: "retail", label: "Retail" },
  { id: "wholesale", label: "Wholesale" },
  { id: "dealer", label: "Dealer" },
] as const;
type PriceLevel = typeof PRICE_LEVELS[number]["id"];
type BillMode = "vat" | "estimate";

function getPrice(product: Product, level: PriceLevel): number {
  if (level === "wholesale" && product.wholesalePrice) return product.wholesalePrice;
  if (level === "dealer" && product.dealerPrice) return product.dealerPrice;
  return product.sellingPrice;
}

function stockStatus(stock: number) {
  if (stock <= 0) return { label: "Out of stock", className: "bg-brand-200 text-brand-600" };
  if (stock <= 5) return { label: `${stock} left`, className: "bg-amber-100 text-amber-800" };
  return { label: `${stock} in stock`, className: "bg-brand-100 text-brand-700" };
}

function getLineSubtotal(item: CartItem): number {
  const gross = item.unitPrice * item.quantity;
  if (item.discount <= 0) return gross;
  return gross - gross * (item.discount / 100);
}

const POS_DRAFT_KEY = "pos-draft-v1";

type PosDraft = {
  cart: CartItem[];
  electricianId: string;
  warehouseId: string;
  priceLevel: PriceLevel;
  invoiceDiscount: number;
  includeVat: boolean;
  selectedPaymentMethod: string;
  selectedCustomer: Customer | null;
};

function loadPosDraft(): PosDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PosDraft;
    if (!Array.isArray(data.cart)) return null;
    return data;
  } catch {
    return null;
  }
}

function savePosDraft(draft: PosDraft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POS_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota errors */
  }
}

function clearPosDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(POS_DRAFT_KEY);
}

export default function POSPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; isDefault?: boolean }>>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [electricians, setElectricians] = useState<ElectricianOption[]>([]);
  const [electricianId, setElectricianId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "cash", amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [billMode, setBillMode] = useState<BillMode | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [priceLevel, setPriceLevel] = useState<PriceLevel>("retail");
  const [customerPanel, setCustomerPanel] = useState<CustomerPanel>(null);
  const emptyNewCustomer = () => ({
    name: "",
    phone: "",
    address: "",
    vatNumber: "",
    openingDebt: "",
    openingCredit: "",
    openingBalanceDate: new Date().toISOString().slice(0, 10),
  });

  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer());
  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [includeVat, setIncludeVat] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("cash");
  const [payingNow, setPayingNow] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const productSearchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const draft = loadPosDraft();
    if (draft) {
      setCart(draft.cart || []);
      setElectricianId(draft.electricianId || "");
      if (draft.warehouseId) setWarehouseId(draft.warehouseId);
      if (draft.priceLevel) setPriceLevel(draft.priceLevel);
      setInvoiceDiscount(draft.invoiceDiscount || 0);
      if (typeof draft.includeVat === "boolean") setIncludeVat(draft.includeVat);
      if (draft.selectedPaymentMethod) setSelectedPaymentMethod(draft.selectedPaymentMethod);
      setSelectedCustomer(draft.selectedCustomer || null);
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    savePosDraft({
      cart,
      electricianId,
      warehouseId,
      priceLevel,
      invoiceDiscount,
      includeVat,
      selectedPaymentMethod,
      selectedCustomer,
    });
  }, [draftReady, cart, electricianId, warehouseId, priceLevel, invoiceDiscount, includeVat, selectedPaymentMethod, selectedCustomer]);

  useEffect(() => {
    loadProducts();
    loadHeld();
    miscAPI.getCategories().then((r) => setCategories(r.data.data));
    miscAPI.getWarehouses().then((r) => {
      const list = r.data.data || [];
      setWarehouses(list);
      setWarehouseId((prev) => prev || pickDefaultWarehouseId(list));
    }).catch(() => toast.error("Failed to load warehouses"));
    electricianAPI.getAll({ limit: "200" })
      .then((r) => setElectricians(r.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (customerPanel !== "search") return;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      customerAPI.getAll({ search: customerSearch, limit: "20" })
        .then((res) => setSearchResults(res.data.data))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, customerPanel]);

  const loadProducts = async (q?: string, categoryId?: string) => {
    const params: Record<string, string> = { limit: "50" };
    if (q?.trim()) params.search = q.trim();
    const cat = categoryId ?? selectedCategory;
    if (cat) params.category = cat;
    const res = await productAPI.getAll(params);
    setProducts(res.data.data);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const params: Record<string, string> = { limit: "50" };
    if (search.trim()) params.search = search.trim();
    if (categoryId) params.category = categoryId;
    productAPI.getAll(params).then((r) => setProducts(r.data.data));
  };

  const loadHeld = () => saleAPI.getHeld().then((r) => setHeldSales(r.data.data));

  const addToCart = useCallback((product: Product) => {
    if (product.currentStock <= 0) { toast.error("Out of stock!"); return; }
    setCart((prev) => {
      const existing = prev.find((i) => i.product._id === product._id);
      if (existing) {
        if (existing.quantity >= product.currentStock) { toast.error("Not enough stock!"); return prev; }
        return prev.map((i) => i.product._id === product._id ? { ...i, quantity: i.quantity + 1, unitPrice: getPrice(product, priceLevel) } : i);
      }
      return [...prev, {
        product,
        quantity: 1,
        unitPrice: getPrice(product, priceLevel),
        discount: 0,
        commissionPercent: productCommissionPercent(product),
      }];
    });
  }, [priceLevel]);

  const handlePriceLevelChange = (level: PriceLevel) => {
    setPriceLevel(level);
    setCart((prev) => prev.map((item) => ({
      ...item,
      unitPrice: getPrice(item.product, level),
    })));
  };

  const handleBarcodeScan = async (code: string) => {
    if (!code.trim()) return;
    try {
      const res = await productAPI.getByBarcode(code.trim());
      addToCart(res.data.data);
      setSearch("");
    } catch { toast.error("Product not found"); }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.product._id !== productId) return item;
      const newQty = item.quantity + delta;
      if (newQty > item.product.currentStock) { toast.error("Not enough stock!"); return item; }
      return { ...item, quantity: Math.max(0, newQty) };
    }).filter((i) => i.quantity > 0));
  };

  const setQuantity = (productId: string, qty: number) => {
    if (Number.isNaN(qty)) return;
    setCart((prev) => prev.map((item) => {
      if (item.product._id !== productId) return item;
      const newQty = Math.max(0, Math.floor(qty));
      if (newQty > item.product.currentStock) {
        toast.error("Not enough stock!");
        return { ...item, quantity: item.product.currentStock };
      }
      return { ...item, quantity: newQty };
    }).filter((i) => i.quantity > 0));
  };

  const updateItemDiscount = (productId: string, discount: number) => {
    const value = Math.min(100, Math.max(0, discount));
    setCart((prev) => prev.map((item) =>
      item.product._id === productId ? { ...item, discount: value } : item
    ));
  };

  const updateItemCommissionPercent = (productId: string, raw: string) => {
    setCart((prev) => prev.map((item) => {
      if (item.product._id !== productId) return item;
      if (isWireProduct(item.product)) return { ...item, commissionPercent: 0, commission: 0, commissionManual: false };
      const value = Math.min(100, Math.max(0, Number(raw)));
      if (!Number.isFinite(value)) return item;
      return { ...item, commissionPercent: value, commissionManual: false, commission: undefined };
    }));
  };

  const updateItemCommission = (productId: string, raw: string) => {
    setCart((prev) => prev.map((item) => {
      if (item.product._id !== productId) return item;
      if (isWireProduct(item.product)) return { ...item, commission: 0, commissionManual: false };
      if (raw === "") return { ...item, commission: undefined, commissionManual: false };
      const value = Math.max(0, Number(raw));
      if (!Number.isFinite(value)) return item;
      return { ...item, commission: value, commissionManual: true };
    }));
  };

  const grossSubtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const subtotal = cart.reduce((s, i) => s + getLineSubtotal(i), 0);
  const lineDiscountTotal = grossSubtotal - subtotal;
  const taxableAmount = subtotal - (invoiceDiscount > 0 ? subtotal * (invoiceDiscount / 100) : 0);
  const vatAmount = includeVat ? taxableAmount * 0.13 : 0;
  const total = taxableAmount + vatAmount;
  const invoiceDiscountFactor = subtotal > 0 ? taxableAmount / subtotal : 1;
  const cashPaidTotal = payments.filter((p) => p.method !== "credit").reduce((s, p) => s + (p.amount || 0), 0);
  const creditTotal = payments.filter((p) => p.method === "credit").reduce((s, p) => s + (p.amount || 0), 0);
  const paidTotal = cashPaidTotal;
  const amountDue = creditTotal > 0 ? creditTotal : Math.max(0, total - cashPaidTotal);
  const change = cashPaidTotal > total ? cashPaidTotal - total : 0;
  const cartDebtAmount = Math.max(0, total - payingNow);
  const requiresCustomer = cartDebtAmount > 0 || selectedPaymentMethod === "credit";
  const getItemRate = (item: CartItem) => {
    if (isWireProduct(item.product)) return 0;
    if (typeof item.commissionPercent === "number") return item.commissionPercent;
    return productCommissionPercent(item.product);
  };
  const getItemCommission = (item: CartItem) => {
    if (isWireProduct(item.product)) return 0;
    if (item.commissionManual && typeof item.commission === "number") return item.commission;
    return lineCommission(getLineSubtotal(item), false, getItemRate(item));
  };
  const cartCommissions = cart.map(getItemCommission);
  const commissionTotal = cartCommissions.reduce((s, n) => s + n, 0);

  useEffect(() => {
    if (!showPayment && selectedPaymentMethod !== "credit") {
      setPayingNow(total);
    }
  }, [total, showPayment, selectedPaymentMethod]);

  useEffect(() => {
    if (payingNow > total) setPayingNow(total);
  }, [payingNow, total]);

  const buildSalePayload = (billType: BillMode, isHeld = false, paymentLines?: PaymentLine[]) => {
    const isEstimate = billType === "estimate";
    const activePayments = paymentLines ?? payments;
    const cashPaid = activePayments.filter((p) => p.method !== "credit").reduce((s, p) => s + (p.amount || 0), 0);
    const dueAmount = Math.max(0, total - cashPaid);
    return {
      type: isEstimate ? "estimate" : "invoice",
      status: isHeld ? "draft" : "completed",
      isHeld,
      customer: selectedCustomer?._id,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      customerAddress: selectedCustomer?.address,
      electrician: electricianId || undefined,
      commissionTotal,
      items: cart.map((item) => {
        const lineSubtotal = getLineSubtotal(item);
        const lineTaxable = lineSubtotal * invoiceDiscountFactor;
        const categoryName = productCategoryName(item.product);
        const commissionPercent = getItemRate(item);
        const commission = getItemCommission(item);
        return {
          product: item.product._id,
          productName: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          vatRate: includeVat ? 13 : 0,
          vatAmount: includeVat ? lineTaxable * 0.13 : 0,
          subtotal: lineSubtotal,
          costPrice: item.unitPrice * 0.7,
          categoryName,
          commissionPercent,
          commission,
        };
      }),
      subtotal: taxableAmount,
      discount: invoiceDiscount,
      discountType: "percent",
      vatAmount: includeVat ? vatAmount : 0,
      total,
      amountPaid: isHeld ? 0 : cashPaid,
      amountDue: isHeld ? total : dueAmount,
      payments: isHeld ? [] : activePayments.filter((p) => p.amount > 0),
      changeAmount: isHeld ? 0 : change,
      isVatBill: !isEstimate && includeVat,
      warehouse: warehouseId,
    };
  };

  const resetCart = () => {
    setCart([]); setSelectedCustomer(null); setInvoiceDiscount(0); setElectricianId("");
    setPayments([{ method: "cash", amount: 0 }]); setShowPayment(false); setBillMode(null); setIncludeVat(true); setSelectedPaymentMethod("cash"); setPayingNow(0);
    setCustomerPanel(null); setNewCustomer(emptyNewCustomer());
    setCustomerSearch(""); setSearchResults([]);
    clearPosDraft();
    loadProducts(); loadHeld();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    const debt = Number(newCustomer.openingDebt) || 0;
    const credit = Number(newCustomer.openingCredit) || 0;
    if (debt > 0 && credit > 0) {
      toast.error("Enter either previous debt or previous credit, not both.");
      return;
    }
    setSavingCustomer(true);
    try {
      const res = await customerAPI.create({
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        address: newCustomer.address.trim(),
        vatNumber: newCustomer.vatNumber.trim(),
        customerType: "retail",
        openingDebt: debt,
        openingCredit: credit,
        openingBalanceDate: newCustomer.openingBalanceDate || new Date().toISOString().slice(0, 10),
      });
      setSelectedCustomer(res.data.data);
      setNewCustomer(emptyNewCustomer());
      setCustomerPanel(null);
      toast.success(debt > 0 ? "Customer added. Listed under Debtors" : credit > 0 ? "Customer added. Listed under Customer Credit" : "Customer added");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerPanel(null);
    setCustomerSearch("");
    setSearchResults([]);
  };

  // Keep selected customer balances fresh after debtor sales elsewhere
  useEffect(() => {
    if (!selectedCustomer?._id) return;
    customerAPI.getById(selectedCustomer._id)
      .then((r) => setSelectedCustomer(r.data.data))
      .catch(() => {});
  }, [showPayment, selectedCustomer?._id]);

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerPanel(null);
  };

  const beginBill = (mode: BillMode) => {
    if (!cart.length) return toast.error("Cart is empty");
    if (!warehouseId) return toast.error("Select a warehouse");
    if (requiresCustomer && !selectedCustomer) {
      return toast.error("Select a customer for debtor / partial credit sales");
    }
    const lines = buildCartPayments(total, payingNow, selectedPaymentMethod);
    setBillMode(mode);
    setPayments(lines);
    setShowPayment(true);
  };

  const startVatBill = () => beginBill("vat");

  const startEstimateBill = () => beginBill("estimate");

  const handleBackPayment = () => {
    setShowPayment(false);
    setBillMode(null);
  };

  const handleCheckout = async () => {
    if (!cart.length || !billMode) return toast.error("Cart is empty");
    if (!warehouseId) return toast.error("Select a warehouse");

    const modalPayments = payments.filter((p) => p.amount > 0);
    const checkoutPayments = showPayment && modalPayments.length > 0
      ? modalPayments
      : buildCartPayments(total, payingNow, selectedPaymentMethod);

    const checkoutCashPaid = checkoutPayments.filter((p) => p.method !== "credit").reduce((s, p) => s + (p.amount || 0), 0);
    const checkoutCreditTotal = checkoutPayments.filter((p) => p.method === "credit").reduce((s, p) => s + (p.amount || 0), 0);
    const checkoutHasCredit = checkoutCreditTotal > 0 || checkoutCashPaid < total;

    if (checkoutCashPaid < total && !checkoutHasCredit) {
      return toast.error("Add debtor payment for remaining balance or pay full amount");
    }
    if (checkoutHasCredit && !selectedCustomer) {
      return toast.error("Select a customer for debtor sales");
    }

    setPayments(checkoutPayments);
    setLoading(true);
    try {
      const res = await saleAPI.create(buildSalePayload(billMode, false, checkoutPayments));
      const doc = res.data.data;
      if (billMode === "estimate") {
        toast.success(`Estimate ${doc.invoiceNumber} created!`);
      } else {
        toast.success(`Invoice ${doc.invoiceNumber} created!`);
      }
      router.push(`/sales/${doc._id}/print`);
      resetCart();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Checkout failed");
    } finally { setLoading(false); }
  };

  const handlePaymentMethodSelect = (methodId: string) => {
    setSelectedPaymentMethod(methodId);
    if (methodId === "credit") {
      setPayingNow(0);
    } else if (payingNow === 0) {
      setPayingNow(total);
    }
  };

  const addPaymentLine = () => setPayments([...payments, { method: "cash", amount: 0 }]);
  const updatePayment = (idx: number, field: keyof PaymentLine, value: string | number) => {
    setPayments(payments.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const removePayment = (idx: number) => setPayments(payments.filter((_, i) => i !== idx));

  const getCartQty = (productId: string) =>
    cart.find((item) => item.product._id === productId)?.quantity ?? 0;

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        <div className="flex gap-3 mb-4 items-center">
          <div className="flex rounded-lg border border-brand-200 overflow-hidden shrink-0">
            {PRICE_LEVELS.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handlePriceLevelChange(pl.id)}
                className={cn(
                  "px-3 py-2 text-xs font-medium transition-all",
                  priceLevel === pl.id ? "bg-brand-900 text-white" : "bg-white text-brand-700 hover:bg-brand-50"
                )}
              >
                {pl.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Warehouse className="w-4 h-4 text-brand-500 hidden sm:block" />
            <WarehouseSelect
              compact
              value={warehouseId}
              onChange={setWarehouseId}
              warehouses={warehouses}
              required
            />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              clearTimeout(productSearchTimer.current);
              productSearchTimer.current = setTimeout(() => loadProducts(value, selectedCategory), 200);
            }}
              onKeyDown={(e) => e.key === "Enter" && handleBarcodeScan(search)}
              placeholder="Search products or scan barcode..." className="input-field pl-10" />
          </div>
          <button onClick={() => setShowHeld(true)} className="btn-secondary flex items-center gap-2 shrink-0">
            <RotateCcw className="w-4 h-4" /> Held ({heldSales.length})
          </button>
          <button onClick={() => barcodeRef.current?.focus()} className="btn-secondary flex items-center gap-2 shrink-0">
            <ScanBarcode className="w-4 h-4" /> Scan
          </button>
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="relative shrink-0 w-10 h-10 rounded-lg border border-brand-200 bg-white hover:bg-brand-50 flex items-center justify-center transition-colors"
            aria-label="Open cart"
          >
            <ShoppingCart className="w-5 h-5 text-brand-800" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-brand-900 text-white text-[10px] font-bold flex items-center justify-center">
                {cartItemCount > 99 ? "99+" : cartItemCount}
              </span>
            )}
          </button>
          <input ref={barcodeRef} type="text" className="sr-only" onKeyDown={(e) => {
            if (e.key === "Enter") handleBarcodeScan((e.target as HTMLInputElement).value);
          }} />
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          <button
            type="button"
            onClick={() => handleCategoryChange("")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-medium rounded-full border shrink-0 transition-all",
              !selectedCategory
                ? "bg-brand-900 text-white border-brand-900 shadow-sm"
                : "bg-white text-brand-700 border-brand-200 hover:bg-brand-50 hover:border-brand-300"
            )}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat._id}
              type="button"
              onClick={() => handleCategoryChange(cat._id)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-full border shrink-0 transition-all whitespace-nowrap",
                selectedCategory === cat._id
                  ? "bg-brand-900 text-white border-brand-900 shadow-sm"
                  : "bg-white text-brand-700 border-brand-200 hover:bg-brand-50 hover:border-brand-300"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {products.map((p) => {
                const inCart = getCartQty(p._id);
                const stock = stockStatus(p.currentStock);
                const outOfStock = p.currentStock <= 0;

                return (
                  <article
                    key={p._id}
                    className={cn(
                      "group card overflow-hidden flex flex-col transition-all duration-200",
                      "hover:shadow-md hover:border-brand-300",
                      outOfStock && "opacity-70"
                    )}
                  >
                    <div className="relative aspect-[5/4] bg-brand-50 border-b border-brand-100 overflow-hidden">
                      {p.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getImageUrl(p.images[0])}
                          alt={p.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-14 h-14 rounded-xl bg-white border border-brand-200 flex items-center justify-center">
                            <Package className="w-7 h-7 text-brand-300" strokeWidth={1.5} />
                          </div>
                        </div>
                      )}

                      <span className={cn("absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-full", stock.className)}>
                        {stock.label}
                      </span>
                    </div>

                    <div className="p-3 flex flex-col flex-1 gap-2">
                      <div className="min-h-[2.75rem]">
                        <h3 className="text-sm font-semibold text-brand-900 line-clamp-2 leading-snug">{p.name}</h3>
                        <p className="text-[11px] text-brand-400 mt-0.5 font-mono">{p.sku}</p>
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-brand-400">Price</p>
                          <p className="text-base font-bold text-brand-900 leading-tight">
                            {formatCurrency(getPrice(p, priceLevel))}
                          </p>
                        </div>

                        {outOfStock ? (
                          <button
                            type="button"
                            disabled
                            className="shrink-0 px-3 py-2 text-xs font-medium rounded-md bg-brand-100 text-brand-400 cursor-not-allowed"
                          >
                            Unavailable
                          </button>
                        ) : inCart > 0 ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateQuantity(p._id, -1)}
                              className="w-8 h-8 rounded-md border border-brand-200 bg-white hover:bg-brand-50 flex items-center justify-center"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={p.currentStock}
                              value={inCart}
                              onChange={(e) => setQuantity(p._id, Number(e.target.value))}
                              className="w-12 h-8 text-center text-sm font-semibold border border-brand-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-900/10"
                            />
                            <button
                              type="button"
                              onClick={() => addToCart(p)}
                              className="w-8 h-8 rounded-md border border-brand-200 bg-white hover:bg-brand-50 flex items-center justify-center"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(p)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-brand-900 text-white hover:bg-brand-800 transition-colors"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Add to Cart
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {products.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-brand-400">
                <Package className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No products found</p>
              </div>
            )}
        </div>
      </div>

      <Modal open={showCart} onClose={() => { setShowCart(false); setShowPayment(false); setCustomerPanel(null); }} title={`Cart (${cartItemCount})`} size="3xl">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-brand-400">
            <ShoppingCart className="w-14 h-14 mb-3 opacity-50" />
            <p className="text-sm">No products added yet</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_100px_80px_110px_110px_40px] gap-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-brand-400">
              <span>Product</span>
              <span className="text-center">Quantity</span>
              <span className="text-center">Disc %</span>
              <span className="text-right">Amount</span>
              <span className="text-center">Commission</span>
              <span />
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
              {cart.map((item, index) => {
                const lineTotal = getLineSubtotal(item);
                const itemCommission = cartCommissions[index] || 0;
                const wire = isWireProduct(item.product);
                return (
                  <div key={item.product._id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_100px_80px_110px_110px_40px] gap-3 items-center p-4 rounded-xl border border-brand-100 bg-brand-50/40">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-14 h-14 rounded-lg bg-white border border-brand-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.product.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getImageUrl(item.product.images[0])} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-6 h-6 text-brand-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-brand-900 leading-snug">{item.product.name}</p>
                        <p className="text-xs text-brand-500 mt-0.5">{formatCurrency(item.unitPrice)} each</p>
                        {item.discount > 0 && (
                          <p className="text-[11px] text-brand-600 mt-0.5">
                            −{item.discount}% ({formatCurrency(item.unitPrice * item.quantity - lineTotal)})
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-1.5 sm:justify-center">
                      <span className="sm:hidden text-xs text-brand-500 w-16">Qty</span>
                      <button type="button" onClick={() => updateQuantity(item.product._id, -1)} className="w-8 h-8 rounded-md bg-white border border-brand-200 flex items-center justify-center hover:bg-brand-50">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={item.product.currentStock}
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.product._id, Number(e.target.value))}
                        className="w-12 h-8 text-center text-sm font-semibold border border-brand-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-900/10"
                      />
                      <button type="button" onClick={() => updateQuantity(item.product._id, 1)} className="w-8 h-8 rounded-md bg-white border border-brand-200 flex items-center justify-center hover:bg-brand-50">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 sm:justify-center">
                      <span className="sm:hidden text-xs text-brand-500">Disc %</span>
                      <input
                        type="number"
                        value={item.discount || ""}
                        onChange={(e) => updateItemDiscount(item.product._id, Number(e.target.value))}
                        placeholder="0"
                        className="w-16 input-field py-1.5 text-sm text-center"
                        min={0}
                        max={100}
                      />
                    </div>

                    <p className="text-sm font-bold text-brand-900 text-right sm:text-right">
                      <span className="sm:hidden text-xs font-normal text-brand-500 mr-2">Total</span>
                      {formatCurrency(lineTotal)}
                    </p>

                    <div className="flex flex-col items-center gap-1">
                      <span className="sm:hidden text-xs text-brand-500">Commission</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={wire}
                        value={wire ? 0 : itemCommission}
                        onChange={(e) => updateItemCommission(item.product._id, e.target.value)}
                        className="w-full max-w-[110px] input-field py-1.5 text-sm text-center disabled:bg-brand-50 disabled:text-brand-400"
                      />
                      {wire ? (
                        <span className="text-[10px] text-brand-400">Wire: 0%</span>
                      ) : (
                        <div className="flex items-center gap-0.5 text-[10px] text-brand-500">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={getItemRate(item)}
                            onChange={(e) => updateItemCommissionPercent(item.product._id, e.target.value)}
                            className="w-10 h-5 text-[10px] text-center border border-brand-200 rounded bg-white"
                          />
                          <span>%</span>
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={() => setCart(cart.filter((c) => c.product._id !== item.product._id))} className="text-brand-400 hover:text-brand-800 justify-self-end sm:justify-self-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-brand-100 pt-4 space-y-2.5 bg-white rounded-xl">
              <div className="flex justify-between text-sm">
                <span className="text-brand-500">Items</span>
                <span className="font-medium">{cartItemCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-500">Gross Subtotal</span>
                <span>{formatCurrency(grossSubtotal)}</span>
              </div>
              {lineDiscountTotal > 0 && (
                <div className="flex justify-between text-sm text-brand-600">
                  <span>Line Discounts</span>
                  <span>−{formatCurrency(lineDiscountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm items-center">
                <span className="text-brand-500">Invoice Discount (%)</span>
                <input type="number" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(Number(e.target.value))} className="w-20 input-field py-1.5 text-sm text-center" min={0} max={100} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-500">Taxable Amount</span>
                <span>{formatCurrency(taxableAmount)}</span>
              </div>
              <div className="flex justify-between text-sm items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-brand-500 shrink-0">VAT (13%)</span>
                  <div className="flex rounded-md border border-brand-200 overflow-hidden text-[11px] font-medium shrink-0">
                    <button
                      type="button"
                      onClick={() => setIncludeVat(true)}
                      className={cn(
                        "px-2.5 py-1 transition-colors",
                        includeVat ? "bg-brand-900 text-white" : "bg-white text-brand-600 hover:bg-brand-50"
                      )}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncludeVat(false)}
                      className={cn(
                        "px-2.5 py-1 border-l border-brand-200 transition-colors",
                        !includeVat ? "bg-brand-900 text-white" : "bg-white text-brand-600 hover:bg-brand-50"
                      )}
                    >
                      No
                    </button>
                  </div>
                </div>
                <span className={cn("font-medium", !includeVat && "text-brand-400")}>
                  {formatCurrency(vatAmount)}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold text-brand-900 pt-3 border-t border-brand-100">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-500">
                  Total commission
                  {!electricianId && " — select electrician to save"}
                </span>
                <span className="font-medium">{formatCurrency(commissionTotal)}</span>
              </div>
            </div>

            <div className="p-4 border border-brand-100 rounded-xl bg-white space-y-3">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-brand-100">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Warehouse</p>
                  <p className="text-[11px] text-brand-400 mt-0.5">Stock will be deducted from this location</p>
                </div>
                <WarehouseSelect
                  value={warehouseId}
                  onChange={setWarehouseId}
                  warehouses={warehouses}
                  className="w-44"
                  required
                />
              </div>
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-brand-100">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-500 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Electrician
                  </p>
                  <p className="text-[11px] text-brand-400 mt-0.5">Saved on the electrician account, not printed on the bill</p>
                </div>
                <select
                  value={electricianId}
                  onChange={(e) => setElectricianId(e.target.value)}
                  className="input-field w-44 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  {electricians.map((el) => (
                    <option key={el._id} value={el._id}>
                      {el.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedCustomer ? (
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-brand-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-900">{selectedCustomer.name}</p>
                      <p className="text-xs text-brand-500">{selectedCustomer.phone}</p>
                      {selectedCustomer.address && (
                        <p className="text-xs text-brand-400 mt-0.5 truncate">{selectedCustomer.address}</p>
                      )}
                      {safeOutstanding(selectedCustomer.outstanding) > 0 && (
                        <p className="text-xs text-amber-700 mt-1 font-medium">
                          Debt: {formatCurrency(selectedCustomer.outstanding!)}
                        </p>
                      )}
                      {safeCredit(selectedCustomer.creditBalance) > 0 && (
                        <p className="text-xs text-emerald-700 mt-1 font-medium">
                          Credit: {formatCurrency(selectedCustomer.creditBalance!)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={clearCustomer} className="p-1 rounded-md hover:bg-brand-50 text-brand-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomerPanel(customerPanel === "new" ? null : "new")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg border transition-colors",
                        customerPanel === "new"
                          ? "bg-brand-900 text-white border-brand-900"
                          : "bg-white text-brand-800 border-brand-200 hover:bg-brand-50"
                      )}
                    >
                      <UserPlus className="w-4 h-4" /> New Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerPanel(customerPanel === "search" ? null : "search")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg border transition-colors",
                        customerPanel === "search"
                          ? "bg-brand-900 text-white border-brand-900"
                          : "bg-white text-brand-800 border-brand-200 hover:bg-brand-50"
                      )}
                    >
                      <Users className="w-4 h-4" /> Customers
                    </button>
                  </div>

                  {customerPanel === "new" && (
                    <form onSubmit={handleCreateCustomer} className="space-y-3 pt-1 border-t border-brand-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label">Name *</label>
                          <input
                            className="input-field"
                            value={newCustomer.name}
                            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                            placeholder="Customer name"
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Phone *</label>
                          <input
                            className="input-field"
                            value={newCustomer.phone}
                            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                            placeholder="98XXXXXXXX"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label">Location</label>
                        <input
                          className="input-field"
                          value={newCustomer.address}
                          onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                          placeholder="Address / area"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-brand-100">
                        <div>
                          <label className="label">VAT Number</label>
                          <input
                            className="input-field"
                            value={newCustomer.vatNumber}
                            onChange={(e) => setNewCustomer({ ...newCustomer, vatNumber: e.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="label">Balance As Of Date</label>
                          <input
                            type="date"
                            className="input-field"
                            value={newCustomer.openingBalanceDate}
                            onChange={(e) => setNewCustomer({ ...newCustomer, openingBalanceDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Previous Debt (NPR)</label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="input-field"
                            value={newCustomer.openingDebt}
                            onChange={(e) => setNewCustomer({ ...newCustomer, openingDebt: e.target.value, openingCredit: e.target.value ? "" : newCustomer.openingCredit })}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="label">Previous Credit (NPR)</label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className="input-field"
                            value={newCustomer.openingCredit}
                            onChange={(e) => setNewCustomer({ ...newCustomer, openingCredit: e.target.value, openingDebt: e.target.value ? "" : newCustomer.openingDebt })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <button type="submit" disabled={savingCustomer} className="btn-primary w-full sm:w-auto">
                        {savingCustomer ? "Saving..." : "Save & Select"}
                      </button>
                    </form>
                  )}

                  {customerPanel === "search" && (
                    <div className="space-y-2 pt-1 border-t border-brand-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder="Search by name or phone..."
                          className="input-field pl-10"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-brand-100 divide-y divide-brand-50">
                        {searchLoading ? (
                          <p className="text-xs text-brand-400 text-center py-4">Searching...</p>
                        ) : searchResults.length === 0 ? (
                          <p className="text-xs text-brand-400 text-center py-4">
                            {customerSearch ? "No customers found" : "Type to search customers"}
                          </p>
                        ) : (
                          searchResults.map((c) => (
                            <button
                              key={c._id}
                              type="button"
                              onClick={() => selectCustomer(c)}
                              className="w-full text-left px-3 py-2.5 hover:bg-brand-50 transition-colors"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-brand-900">{c.name}</p>
                                  <p className="text-xs text-brand-500">{c.phone}{c.address ? ` · ${c.address}` : ""}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  {safeOutstanding(c.outstanding) > 0 && (
                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                      Debt {formatCurrency(c.outstanding!)}
                                    </span>
                                  )}
                                  {safeCredit(c.creditBalance) > 0 && (
                                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                      Credit {formatCurrency(c.creditBalance!)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border border-brand-100 rounded-xl bg-white space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Payment Method</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {CART_PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => handlePaymentMethodSelect(method.id)}
                    className={cn(
                      "py-2 px-2 text-xs font-medium rounded-lg border transition-colors",
                      selectedPaymentMethod === method.id
                        ? "bg-brand-900 text-white border-brand-900"
                        : "bg-white text-brand-700 border-brand-200 hover:bg-brand-50"
                    )}
                  >
                    {method.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-brand-100">
                <div>
                  <label className="label">Amount Paying Now</label>
                  <input
                    type="number"
                    min={0}
                    max={total}
                    step="any"
                    value={payingNow || ""}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPayingNow(Number.isNaN(val) ? 0 : Math.min(Math.max(0, val), total));
                      if (val > 0 && selectedPaymentMethod === "credit") {
                        setSelectedPaymentMethod("cash");
                      }
                    }}
                    disabled={selectedPaymentMethod === "credit"}
                    className="input-field"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  {cartDebtAmount > 0 ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
                      <p className="text-amber-800 text-xs font-medium uppercase tracking-wide">Debtor Balance</p>
                      <p className="text-amber-900 font-bold tabular-nums">{formatCurrency(cartDebtAmount)}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2.5 text-sm text-brand-600">
                      Full payment, no debtor balance
                    </div>
                  )}
                </div>
              </div>

              {requiresCustomer && !selectedCustomer && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Select a customer above. Required for debtor or partial payments.
                </p>
              )}
            </div>

            {!showPayment ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={startVatBill}
                  disabled={!cart.length || loading}
                  className="btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
                >
                  <Receipt className="w-4 h-4" /> VAT Bill
                </button>
                <button
                  type="button"
                  onClick={startEstimateBill}
                  disabled={!cart.length || loading}
                  className="btn-secondary flex items-center justify-center gap-2 py-2.5 text-sm"
                >
                  <FileText className="w-4 h-4" /> Estimate Bill
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-brand-900">
                    {billMode === "estimate" ? "Estimate Bill" : "VAT Bill"}: Payment
                  </p>
                  <span className="text-sm font-bold text-brand-800">{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-brand-700">Split Payments</p>
                  <button type="button" onClick={addPaymentLine} className="text-xs text-brand-600 hover:underline">+ Add</button>
                </div>
                {payments.map((p, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select value={p.method} onChange={(e) => updatePayment(idx, "method", e.target.value)} className="input-field text-xs w-28 py-1.5">
                      {CART_PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <input type="number" value={p.amount || ""} onChange={(e) => updatePayment(idx, "amount", Number(e.target.value))} placeholder="Amount" className="input-field flex-1 py-1.5 text-sm" />
                    {payments.length > 1 && <button type="button" onClick={() => removePayment(idx)} className="text-brand-700"><X className="w-4 h-4" /></button>}
                  </div>
                ))}
                <div className="text-sm space-y-1 bg-brand-50 rounded-lg p-3">
                  <div className="flex justify-between"><span>Paid</span><span className="font-medium">{formatCurrency(paidTotal)}</span></div>
                  {amountDue > 0 && <div className="flex justify-between text-brand-700"><span>Due (Debtor)</span><span className="font-medium">{formatCurrency(amountDue)}</span></div>}
                  {change > 0 && <div className="flex justify-between text-brand-900"><span>Change</span><span className="font-medium">{formatCurrency(change)}</span></div>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleBackPayment} className="btn-secondary py-2.5">Back</button>
                  <button type="button" onClick={handleCheckout} disabled={loading} className="btn-accent flex items-center justify-center gap-2 py-2.5">
                    <Banknote className="w-4 h-4" />
                    {loading ? "..." : billMode === "estimate" ? "Complete Estimate" : "Complete VAT Bill"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showHeld} onClose={() => setShowHeld(false)} title="Held Sales" size="md">
        {heldSales.length === 0 ? <p className="text-gray-400 text-center py-8">No held sales</p> : (
          <div className="space-y-2">
            {heldSales.map((h) => (
              <div key={h._id} className="p-3 border border-brand-100 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium">{h.invoiceNumber}</p>
                  <p className="text-xs text-gray-400">{h.customerName || "Walk-in"} · {h.items.length} items</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand-700">{formatCurrency(h.total)}</p>
                  <button onClick={() => toast("Open POS and re-add items, or complete via sales list")} className="text-xs text-brand-600">View</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
