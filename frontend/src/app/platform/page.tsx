"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PlatformLayout from "@/components/layout/PlatformLayout";
import { platformAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Store,
  User,
  Download,
} from "lucide-react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { INDUSTRIES, INDUSTRY_LABELS, type Industry } from "@/lib/industry";

interface TenantRow {
  _id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  industry?: string;
  createdAt: string;
  owner?: { name?: string; email?: string; phone?: string };
  paidUntil?: string | null;
  lastPaymentAt?: string | null;
  paymentNote?: string;
  paymentNotes?: string;
  billing?: string;
  subscription?: {
    trialExpired?: boolean;
    paidExpired?: boolean;
    trialEndsAt?: string | null;
    paidUntil?: string | null;
    lastPaymentAt?: string | null;
    paymentNotes?: string | null;
    billing?: string;
    limits?: { storageGb: number };
    usage?: { storageBytes: number };
  };
  activity?: {
    lastLoginAt?: string | null;
    lastInvoiceAt?: string | null;
    lastInvoiceNumber?: string | null;
  };
}

const emptyForm = {
  shopName: "",
  name: "",
  email: "",
  password: "",
  phone: "",
  plan: "business",
  status: "active",
  storageGb: 30,
  industry: "hardware",
};

function storageGbUsed(bytes?: number) {
  return (Number(bytes || 0) / (1024 * 1024 * 1024));
}

function shortWhen(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString();
}

function isQuiet(row: TenantRow) {
  const login = row.activity?.lastLoginAt ? new Date(row.activity.lastLoginAt).getTime() : 0;
  const sale = row.activity?.lastInvoiceAt ? new Date(row.activity.lastInvoiceAt).getTime() : 0;
  const latest = Math.max(login, sale);
  if (!latest) return true;
  return Date.now() - latest > 30 * 24 * 60 * 60 * 1000;
}

export default function PlatformPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [billing, setBilling] = useState("");
  const [counts, setCounts] = useState({ all: 0, trial_ending: 0, overdue: 0, suspended: 0 });
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [supportLog, setSupportLog] = useState<Array<{
    _id: string;
    action: string;
    tenantName?: string;
    tenantSlug?: string;
    actorEmail?: string;
    createdAt: string;
    note?: string;
  }>>([]);
  const [form, setForm] = useState(emptyForm);

  const shopParams = (archived = showArchived, q = debouncedQuery, bill = billing) => {
    const params: Record<string, string> = {};
    if (archived) params.includeArchived = "true";
    if (q.trim()) params.q = q.trim();
    if (bill) params.billing = bill;
    return params;
  };

  const load = async (archived = showArchived, q = debouncedQuery, bill = billing) => {
    try {
      const params = shopParams(archived, q, bill);
      const [res, log] = await Promise.all([
        platformAPI.getTenants(Object.keys(params).length ? params : undefined),
        platformAPI.getSupportLog().catch(() => null),
      ]);
      setTenants(res.data.data || []);
      if (res.data.counts) setCounts(res.data.counts);
      if (log) setSupportLog(log.data.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not load shops");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(showArchived, debouncedQuery, billing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, debouncedQuery, billing]);

  const exportCsv = async () => {
    try {
      const res = await platformAPI.exportTenants(shopParams());
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nepatronix-shops-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export shops");
    }
  };

  const createShop = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await platformAPI.createTenant(form);
      toast.success("Shop created");
      setForm(emptyForm);
      await load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not create shop");
    } finally {
      setCreating(false);
    }
  };

  const openShop = async (id: string) => {
    try {
      await platformAPI.impersonate(id);
      await refreshUser();
      router.push("/dashboard");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not open shop");
    }
  };

  return (
    <PlatformLayout>
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-[28px] leading-tight font-semibold text-slate-900">Shops</h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage tenants, plans, and storage across your ERP instance.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3.5 py-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add shop
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <label className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="platform-input pl-9"
                placeholder="Search shop, slug, owner email or phone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-500 shrink-0">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived shops
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { id: "", label: "All shops", count: counts.all },
              { id: "trial_ending", label: "Trial ending in 7 days", count: counts.trial_ending },
              { id: "overdue", label: "Overdue", count: counts.overdue },
              { id: "suspended", label: "Suspended", count: counts.suspended },
            ].map((chip) => (
              <button
                key={chip.id || "all"}
                type="button"
                onClick={() => setBilling(chip.id)}
                className={`rounded-full text-xs font-medium px-3 py-1.5 border ${
                  billing === chip.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {chip.label} <span className="opacity-70">{chip.count}</span>
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {loading ? (
              <p className="p-8 text-sm text-slate-500">Loading shops…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs font-medium border-b border-slate-100">
                      <th className="px-5 py-3 font-medium">Shop</th>
                      <th className="px-5 py-3 font-medium">Owner</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Plan</th>
                      <th className="px-5 py-3 font-medium">Paid until</th>
                      <th className="px-5 py-3 font-medium">Last payment</th>
                      <th className="px-5 py-3 font-medium">Payment notes</th>
                      <th className="px-5 py-3 font-medium">Last login</th>
                      <th className="px-5 py-3 font-medium">Last invoice</th>
                      <th className="px-5 py-3 font-medium">Storage</th>
                      <th className="px-5 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => {
                      const used = storageGbUsed(t.subscription?.usage?.storageBytes);
                      const cap = t.subscription?.limits?.storageGb || 0;
                      const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
                      const quiet = isQuiet(t);
                      const statusLabel = t.status === "archived"
                        ? "Archived"
                        : t.status === "suspended"
                          ? "Suspended"
                          : t.subscription?.paidExpired
                            ? "Paid ended"
                            : t.subscription?.trialExpired
                              ? "Trial ended"
                              : t.status;
                      const active = t.status === "active" && !t.subscription?.paidExpired && !t.subscription?.trialExpired;
                      return (
                        <tr key={t._id} className={`border-b border-slate-50 last:border-0 ${quiet ? "bg-slate-50/70" : ""}`}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3 min-w-[180px]">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                <Store className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <Link href={`/platform/tenants/${t._id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                                  {t.name}
                                </Link>
                                <p className="text-xs text-slate-400 truncate">
                                  {INDUSTRY_LABELS[(t.industry as Industry) || "hardware"]} · slug: {t.slug}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            <p>{t.owner?.email || "—"}</p>
                            {t.owner?.phone && <p className="text-xs text-slate-400">{t.owner.phone}</p>}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={
                                active
                                  ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1"
                                  : t.status === "archived"
                                    ? "inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1"
                                    : t.status === "suspended"
                                      ? "inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1"
                                      : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 text-xs font-medium px-2.5 py-1 capitalize"
                              }
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : t.status === "suspended" ? "bg-red-500" : "bg-amber-500"}`} />
                              {active ? "Active" : statusLabel}
                            </span>
                          </td>
                          <td className="px-5 py-4 capitalize text-slate-700">{t.plan}</td>
                          <td className={`px-5 py-4 text-xs ${t.subscription?.paidExpired ? "text-rose-600 font-medium" : "text-slate-600"}`}>
                            {(t.paidUntil || t.subscription?.paidUntil)
                              ? shortWhen(t.paidUntil || t.subscription?.paidUntil)
                              : "—"}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-600">
                            {(t.lastPaymentAt || t.subscription?.lastPaymentAt)
                              ? shortWhen(t.lastPaymentAt || t.subscription?.lastPaymentAt)
                              : "—"}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-500 max-w-[160px] truncate" title={t.paymentNotes || t.paymentNote || ""}>
                            {t.paymentNotes || t.paymentNote || "—"}
                          </td>
                          <td className={`px-5 py-4 text-xs ${t.activity?.lastLoginAt ? "text-slate-600" : "text-rose-600 font-medium"}`}>
                            {shortWhen(t.activity?.lastLoginAt)}
                          </td>
                          <td className={`px-5 py-4 text-xs ${t.activity?.lastInvoiceAt ? "text-slate-600" : "text-rose-600 font-medium"}`}>
                            {t.activity?.lastInvoiceNumber ? (
                              <span>
                                {shortWhen(t.activity.lastInvoiceAt)}
                                <span className="block text-slate-400 font-normal">{t.activity.lastInvoiceNumber}</span>
                              </span>
                            ) : shortWhen(t.activity?.lastInvoiceAt)}
                          </td>
                          <td className="px-5 py-4 min-w-[140px]">
                            {cap ? (
                              <div>
                                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1.5">
                                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(pct, used > 0 ? 4 : 0)}%` }} />
                                </div>
                                <p className="text-xs text-slate-500">{used.toFixed(2)} / {cap} GB</p>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {t.status !== "suspended" && t.status !== "archived" && (
                                <button
                                  type="button"
                                  className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-3.5 py-1.5"
                                  onClick={() => openShop(t._id)}
                                >
                                  Open
                                </button>
                              )}
                              <Link
                                href={`/platform/tenants/${t._id}`}
                                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                                aria-label="Shop details"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-5 py-12 text-center text-slate-400">
                          {query.trim() || billing ? "No shops match that filter." : "No shops yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <section className="mt-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Who opened which shop</h2>
            <p className="text-xs text-slate-500 mb-3">Impersonate and invite actions from platform admins.</p>
            <ul className="space-y-2 text-sm text-slate-600 max-h-56 overflow-y-auto">
              {supportLog.length === 0 && <li className="text-slate-400">No support sessions yet.</li>}
              {supportLog.map((row) => (
                <li key={row._id}>
                  <span className="font-medium text-slate-800">{row.actorEmail || "platform"}</span>
                  {" "}{row.action === "impersonate" ? "opened" : row.action}
                  {" "}
                  <span className="font-medium">{row.tenantName || row.tenantSlug || "shop"}</span>
                  {row.note ? ` · ${row.note}` : ""}
                  <span className="text-slate-400"> · {new Date(row.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <form
          ref={formRef}
          onSubmit={createShop}
          className="w-full xl:w-[360px] shrink-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6"
        >
          <h2 className="text-lg font-semibold text-slate-900">Create a shop</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            Add a new tenant (shop) to your ERP instance. You can configure the plan and storage limit here.
          </p>

          <Field label="Shop name" icon={<Building2 className="w-4 h-4" />}>
            <input
              className="platform-input"
              placeholder="e.g. My Awesome Shop"
              value={form.shopName}
              onChange={(e) => setForm({ ...form, shopName: e.target.value })}
              required
            />
          </Field>
          <Field label="Owner name" icon={<User className="w-4 h-4" />}>
            <input
              className="platform-input"
              placeholder="e.g. John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Email" icon={<Mail className="w-4 h-4" />}>
            <input
              type="email"
              className="platform-input"
              placeholder="e.g. owner@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Phone" icon={<Phone className="w-4 h-4" />}>
            <input
              className="platform-input"
              placeholder="e.g. +977 98XXXXXXXX"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field
            label="Password"
            icon={<Lock className="w-4 h-4" />}
            trailing={(
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          >
            <input
              type={showPassword ? "text" : "password"}
              className="platform-input pr-10"
              placeholder="Create a strong password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </Field>

          <label className="block text-sm font-medium text-slate-700 mb-1.5">Business type</label>
          <select
            className="platform-input mb-4"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          >
            {INDUSTRIES.map((value) => (
              <option key={value} value={value}>{INDUSTRY_LABELS[value]}</option>
            ))}
          </select>

          <label className="block text-sm font-medium text-slate-700 mb-1.5">Plan</label>
          <select
            className="platform-input mb-4"
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value })}
          >
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>

          <label className="block text-sm font-medium text-slate-700 mb-1.5">Storage limit</label>
          <select
            className="platform-input mb-5"
            value={form.storageGb}
            onChange={(e) => setForm({ ...form, storageGb: Number(e.target.value) })}
          >
            <option value={10}>10 GB</option>
            <option value={30}>30 GB</option>
            <option value={50}>50 GB</option>
            <option value={100}>100 GB</option>
          </select>

          <button
            type="submit"
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creating ? "Creating..." : "Create shop"}
          </button>
        </form>
      </div>
    </PlatformLayout>
  );
}

function Field({
  label,
  icon,
  trailing,
  children,
}: {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <div className="[&_input]:pl-10">{children}</div>
        {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
    </div>
  );
}
