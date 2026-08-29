"use client";

import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { FormField, SelectField } from "@/components/ui/FormField";
import { formatCurrency, cn } from "@/lib/utils";

export interface SupplierPaymentPayload {
  supplier: string;
  voucherDate: string;
  paidFromAccount: string;
  bankName?: string;
  amount: number;
  discount: number;
  taxDeducted: number;
  narration: string;
  purchaseAllocations: Array<{ purchase: string; amount: number }>;
}

interface SupplierOption {
  _id: string;
  name: string;
  outstanding?: number;
}

interface AccountOption {
  _id: string;
  code: string;
  name: string;
  type: string;
  balance?: number;
}

interface UnpaidPurchase {
  _id: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  createdAt: string;
}

interface SupplierPaymentFormProps {
  suppliers: SupplierOption[];
  accounts: AccountOption[];
  saving?: boolean;
  defaultSupplierId?: string;
  initialPayment?: {
    _id: string;
    paymentNumber?: string;
    supplier?: string | { _id?: string; name?: string; outstanding?: number };
    voucherDate?: string;
    paidFromAccount?: string | { _id?: string; name?: string; code?: string };
    bankName?: string;
    amount: number;
    discount?: number;
    taxDeducted?: number;
    narration?: string;
    purchaseAllocations?: Array<{
      amount: number;
      purchase?: string | { _id?: string; invoiceNumber?: string; total?: number; amountDue?: number; createdAt?: string };
    }>;
  } | null;
  onSubmit: (payload: SupplierPaymentPayload) => void;
  onCancel: () => void;
  loadUnpaidPurchases: (supplierId: string) => Promise<UnpaidPurchase[]>;
}

function safeNum(value: number | undefined | null, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

const cellInput = "w-full h-9 px-3 text-sm border border-brand-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-900/10 focus:border-brand-400";

export default function SupplierPaymentForm({
  suppliers,
  accounts,
  saving = false,
  defaultSupplierId = "",
  initialPayment = null,
  onSubmit,
  onCancel,
  loadUnpaidPurchases,
}: SupplierPaymentFormProps) {
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [voucherDate, setVoucherDate] = useState(todayISO());
  const [paidFromAccount, setPaidFromAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState(0);
  const [includeDiscount, setIncludeDiscount] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [includeTax, setIncludeTax] = useState(false);
  const [taxDeducted, setTaxDeducted] = useState(0);
  const [narration, setNarration] = useState("");
  const [unpaidPurchases, setUnpaidPurchases] = useState<UnpaidPurchase[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const paymentAccounts = accounts.filter((a) => a.type === "asset" && ["1001", "1002"].includes(a.code));

  useEffect(() => {
    if (defaultSupplierId) setSupplierId(defaultSupplierId);
  }, [defaultSupplierId]);

  useEffect(() => {
    if (!initialPayment) return;
    const sid = typeof initialPayment.supplier === "object"
      ? initialPayment.supplier._id
      : initialPayment.supplier || defaultSupplierId;
    if (sid) setSupplierId(sid);
    const aid = typeof initialPayment.paidFromAccount === "object"
      ? initialPayment.paidFromAccount._id
      : initialPayment.paidFromAccount || "";
    if (aid) setPaidFromAccount(aid);
    if (initialPayment.voucherDate) {
      setVoucherDate(new Date(initialPayment.voucherDate).toISOString().split("T")[0]);
    }
    setBankName(initialPayment.bankName || "");
    setAmount(safeNum(initialPayment.amount));
    setIncludeDiscount(safeNum(initialPayment.discount) > 0);
    setDiscount(safeNum(initialPayment.discount));
    setIncludeTax(safeNum(initialPayment.taxDeducted) > 0);
    setTaxDeducted(safeNum(initialPayment.taxDeducted));
    setNarration(initialPayment.narration || "");
  }, [initialPayment, defaultSupplierId]);

  useEffect(() => {
    if (paymentAccounts.length > 0 && !paidFromAccount) {
      setPaidFromAccount(paymentAccounts[0]._id);
    }
  }, [paymentAccounts, paidFromAccount]);

  useEffect(() => {
    if (!supplierId) {
      setUnpaidPurchases([]);
      setAllocations({});
      return;
    }
    setLoadingPurchases(true);
    loadUnpaidPurchases(supplierId)
      .then((purchases) => {
        const list = purchases.map((p) => ({ ...p }));
        const allocMap: Record<string, number> = {};
        for (const alloc of initialPayment?.purchaseAllocations || []) {
          const purchaseRef = alloc.purchase;
          const pid = typeof purchaseRef === "object" ? purchaseRef?._id : purchaseRef;
          if (!pid) continue;
          allocMap[pid] = alloc.amount;
          const existing = list.find((p) => p._id === pid);
          if (existing) {
            existing.amountDue += alloc.amount;
          } else if (typeof purchaseRef === "object") {
            list.push({
              _id: pid,
              invoiceNumber: purchaseRef.invoiceNumber || pid,
              total: purchaseRef.total || alloc.amount,
              amountDue: (purchaseRef.amountDue || 0) + alloc.amount,
              createdAt: purchaseRef.createdAt || new Date().toISOString(),
            });
          }
        }
        setUnpaidPurchases(list);
        setAllocations(allocMap);
      })
      .finally(() => setLoadingPurchases(false));
  }, [supplierId, initialPayment, loadUnpaidPurchases]);

  const selectedSupplier = suppliers.find((s) => s._id === supplierId);
  const selectedAccount = paymentAccounts.find((a) => a._id === paidFromAccount);
  const isBankAccount = (selectedAccount?.name || "").toLowerCase().includes("bank");
  const discountAmount = includeDiscount ? safeNum(discount) : 0;
  const taxAmount = includeTax ? safeNum(taxDeducted) : 0;
  const totalSettlement = safeNum(amount) + discountAmount + taxAmount;

  const updateAllocation = (purchaseId: string, value: number) => {
    setAllocations((prev) => ({ ...prev, [purchaseId]: Math.max(0, value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !paidFromAccount || safeNum(amount) <= 0) return;
    if (isBankAccount && !bankName.trim()) return;

    const purchaseAllocations = Object.entries(allocations)
      .filter(([, amt]) => amt > 0)
      .map(([purchase, allocAmount]) => ({ purchase, amount: allocAmount }));

    onSubmit({
      supplier: supplierId,
      voucherDate,
      paidFromAccount,
      bankName: isBankAccount ? bankName.trim() : "",
      amount: safeNum(amount),
      discount: discountAmount,
      taxDeducted: taxAmount,
      narration,
      purchaseAllocations,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
      <div className="relative px-6 py-5 bg-brand-900 text-white shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg text-brand-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-start justify-between gap-8 pr-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-brand-300 font-medium">Payment Voucher</p>
            <h3 className="text-xl font-semibold mt-1">{initialPayment ? "Edit Payment to Supplier" : "Payment to Supplier"}</h3>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] uppercase tracking-wide text-brand-300 font-medium">Payment No.</p>
            <p className="text-sm font-mono font-medium mt-1 text-white/95">
              {initialPayment?.paymentNumber || "Auto Generated"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-brand-50/80 border-b border-brand-200 shrink-0">
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 ${isBankAccount ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <FormField label="Voucher Date">
            <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className={cellInput} />
          </FormField>
          <FormField label="Paid To" required>
            <SelectField
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Select supplier..."
              options={suppliers.map((s) => ({
                value: s._id,
                label: s.outstanding ? `${s.name}: Due ${formatCurrency(s.outstanding)}` : s.name,
              }))}
            />
          </FormField>
          <FormField label="Paid From" required>
            <SelectField
              value={paidFromAccount}
              onChange={(value) => {
                setPaidFromAccount(value);
                setBankName("");
              }}
              placeholder="Select account..."
              options={paymentAccounts.map((a) => ({
                value: a._id,
                label: `${a.name}: ${formatCurrency(a.balance || 0)}`,
              }))}
            />
          </FormField>
          {isBankAccount && (
            <FormField label="Bank Name" required>
              <input
                className={cellInput}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Enter bank name"
              />
            </FormField>
          )}
        </div>
        {(selectedSupplier || selectedAccount) && (
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-brand-200/80 text-xs text-brand-600">
            {selectedSupplier && (
              <span>
                Supplier balance: <strong className="text-brand-900">{formatCurrency(selectedSupplier.outstanding || 0)}</strong>
              </span>
            )}
            {selectedAccount && (
              <span>
                Account balance: <strong className="text-brand-900">{formatCurrency(selectedAccount.balance || 0)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-3">Payment Against Purchases</p>
        {loadingPurchases ? (
          <div className="h-24 bg-brand-50 rounded-lg animate-pulse" />
        ) : !supplierId ? (
          <p className="text-sm text-brand-400 py-6 text-center border border-dashed border-brand-200 rounded-lg">Select a supplier to view unpaid purchases</p>
        ) : unpaidPurchases.length === 0 ? (
          <p className="text-sm text-brand-400 py-6 text-center border border-dashed border-brand-200 rounded-lg">No unpaid purchases for this supplier</p>
        ) : (
          <div className="border border-brand-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-brand-800 text-white text-[11px] uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left font-semibold">Purchase No.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Due</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Allocate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 bg-white">
                {unpaidPurchases.map((p) => (
                  <tr key={p._id} className="hover:bg-brand-50/40">
                    <td className="px-3 py-2.5 font-medium text-brand-800">{p.invoiceNumber}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(p.total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-brand-700">{formatCurrency(p.amountDue)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={p.amountDue}
                        step="any"
                        value={allocations[p._id] || ""}
                        onChange={(e) => updateAllocation(p._id, Number(e.target.value))}
                        className={cn(cellInput, "text-right w-28 ml-auto")}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Options & Notes</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer text-brand-700">
                <input type="checkbox" checked={includeDiscount} onChange={(e) => setIncludeDiscount(e.target.checked)} className="rounded border-brand-300 text-brand-900" />
                Discount
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-brand-700">
                <input type="checkbox" checked={includeTax} onChange={(e) => setIncludeTax(e.target.checked)} className="rounded border-brand-300 text-brand-900" />
                Tax Deducted
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {includeDiscount && (
                <FormField label="Discount Amount">
                  <input type="number" min={0} value={discount || ""} onChange={(e) => setDiscount(safeNum(Number(e.target.value)))} className={cellInput} />
                </FormField>
              )}
              {includeTax && (
                <FormField label="Tax Deducted">
                  <input type="number" min={0} value={taxDeducted || ""} onChange={(e) => setTaxDeducted(safeNum(Number(e.target.value)))} className={cellInput} />
                </FormField>
              )}
            </div>
            <FormField label="Narration">
              <textarea
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="input-field min-h-[88px] resize-y text-sm"
                placeholder="Payment notes..."
              />
            </FormField>
          </div>

          <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3">
            <FormField label="Amount" required>
              <input
                type="number"
                min={0}
                step="any"
                value={amount || ""}
                onChange={(e) => setAmount(safeNum(Number(e.target.value)))}
                className={cn(cellInput, "text-lg font-semibold")}
                placeholder="0.00"
              />
            </FormField>
            <div className="space-y-2 text-sm divide-y divide-brand-100">
              {discountAmount > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-brand-600">Discount</span>
                  <span className="text-red-600 tabular-nums">−{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-brand-600">Tax Deducted</span>
                  <span className="text-red-600 tabular-nums">−{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-3">
                <span className="font-semibold text-brand-900">Total Settlement</span>
                <span className="text-xl font-bold text-brand-900 tabular-nums">{formatCurrency(totalSettlement)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-3.5 border-t border-brand-200 bg-white flex items-center justify-between gap-3 shrink-0">
        <button type="button" onClick={onCancel} className="btn-secondary flex items-center gap-2 h-10 px-4">
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !supplierId || !paidFromAccount || safeNum(amount) <= 0 || (isBankAccount && !bankName.trim())}
          className={cn("btn-primary flex items-center gap-2 h-10 px-8", saving && "opacity-70")}
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : initialPayment ? "Update Payment" : "Save Payment"}
        </button>
      </div>
    </form>
  );
}
