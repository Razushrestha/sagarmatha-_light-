"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import PlatformLayout from "@/components/layout/PlatformLayout";
import { platformAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft } from "lucide-react";
import { INDUSTRIES, INDUSTRY_LABELS } from "@/lib/industry";

interface TenantDetail {
  _id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  industry?: string;
  notes?: string;
  paymentNote?: string;
  storageGb?: number;
  trialEndsAt?: string;
  paidUntil?: string;
  lastPaymentAt?: string;
  suspendedReason?: string;
  suspendedAt?: string;
  suspendedByEmail?: string;
  archivedAt?: string;
  archiveUntil?: string;
  archivedByEmail?: string;
  archiveReason?: string;
  owner?: { name?: string; email?: string; phone?: string };
  users?: Array<{ _id: string; name: string; email: string; role: string; isActive: boolean; lastLogin?: string }>;
  lifecycle?: Array<{ at: string; action: string; note?: string; byEmail?: string }>;
  activity?: { lastLoginAt?: string | null; lastInvoiceAt?: string | null; lastInvoiceNumber?: string | null };
  subscription?: {
    trialExpired?: boolean;
    paidExpired?: boolean;
    trialEndsAt?: string | null;
    paidUntil?: string | null;
    limits: { users: number; storageGb: number };
    usage: { users: number; storageBytes: number };
  };
}

function inputDate(value?: string | null, addMonths = 0) {
  const d = value ? new Date(value) : new Date();
  if (!value && addMonths) d.setMonth(d.getMonth() + addMonths);
  return d.toISOString().slice(0, 10);
}

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function TenantDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [plan, setPlan] = useState("business");
  const [industry, setIndustry] = useState("hardware");
  const [storageGb, setStorageGb] = useState(10);
  const [notes, setNotes] = useState("");
  const [trialEndsAt, setTrialEndsAt] = useState(inputDate(null, 3));
  const [paidUntil, setPaidUntil] = useState(inputDate(null, 12));
  const [paymentNote, setPaymentNote] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [snapshot, setSnapshot] = useState<{
    users?: { count: number };
    products?: number;
    salesLast7Days?: { count: number; total: number };
    storage?: { gb: number; limitGb: number };
    redis?: { status: string; errors: Array<{ at: string; message: string }> };
    jobs?: { mode?: string; errors: Array<{ at: string; name?: string; message: string }> };
  } | null>(null);
  const [shopLog, setShopLog] = useState<Array<{
    _id: string;
    action: string;
    actorEmail?: string;
    createdAt: string;
    note?: string;
  }>>([]);
  const [busy, setBusy] = useState("");

  const applyTenant = (data: TenantDetail) => {
    setTenant(data);
    setPlan(data.plan);
    setIndustry(data.industry || "hardware");
    setStorageGb(data.storageGb || data.subscription?.limits.storageGb || 10);
    setNotes(data.notes || "");
    setTrialEndsAt(inputDate(data.trialEndsAt || data.subscription?.trialEndsAt, 3));
    setPaidUntil(inputDate(data.paidUntil || data.subscription?.paidUntil, 12));
    setPaymentNote(data.paymentNote || "");
  };

  useEffect(() => {
    platformAPI.getTenant(id)
      .then((res) => applyTenant(res.data.data))
      .catch(() => toast.error("Shop not found"));
    platformAPI.getSnapshot(id)
      .then((res) => setSnapshot(res.data.data))
      .catch(() => setSnapshot(null));
    platformAPI.getSupportLog({ tenantId: id })
      .then((res) => setShopLog(res.data.data || []))
      .catch(() => setShopLog([]));
  }, [id]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Action failed");
    } finally {
      setBusy("");
    }
  };

  const save = () => run("save", async () => {
    const res = await platformAPI.updateTenant(id, { plan, notes, storageGb, industry });
    applyTenant({ ...tenant!, ...res.data.data });
    toast.success("Saved");
  });

  const lifecycle = (action: string, extra: Record<string, string | number> = {}) =>
    run(action, async () => {
      const res = await platformAPI.lifecycle(id, { action, ...extra });
      if (action === "wipe") {
        toast.success("Shop wiped");
        router.push("/platform");
        return;
      }
      applyTenant(res.data.data);
      toast.success("Updated");
    });

  const openShop = () => run("open", async () => {
    await platformAPI.impersonate(id);
    await refreshUser();
    router.push("/dashboard");
  });

  const sendInvite = () => run("invite", async () => {
    const res = await platformAPI.inviteOwner(id);
    setInviteUrl(res.data.data?.url || "");
    toast.success("Copy the link and send it to the owner");
  });

  const resetPassword = () => run("password", async () => {
    const res = await platformAPI.resetOwnerPassword(id);
    const pwd = res.data.data?.temporaryPassword;
    setTempPassword(pwd || "");
    toast.success("Owner must change password at next login");
    const fresh = await platformAPI.getTenant(id);
    applyTenant(fresh.data.data);
  });

  if (!tenant) {
    return (
      <PlatformLayout>
        <p className="text-sm text-slate-500">Loading…</p>
      </PlatformLayout>
    );
  }

  const archived = tenant.status === "archived";
  const suspended = tenant.status === "suspended";

  return (
    <PlatformLayout>
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to shops
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold text-slate-900">{tenant.name}</h1>
          <p className="text-sm text-slate-500">
            slug: {tenant.slug} · {tenant.owner?.email || "no owner"} · {tenant.status}
          </p>
        </div>
        {!archived && (
          <button type="button" disabled={!!busy} className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2" onClick={openShop}>
            Open shop
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-6">
        <Info label="Last login" value={when(tenant.activity?.lastLoginAt)} warn={!tenant.activity?.lastLoginAt} />
        <Info
          label="Last invoice"
          value={tenant.activity?.lastInvoiceNumber
            ? `${when(tenant.activity.lastInvoiceAt)} (${tenant.activity.lastInvoiceNumber})`
            : when(tenant.activity?.lastInvoiceAt)}
          warn={!tenant.activity?.lastInvoiceAt}
        />
        <Info
          label="Access"
          value={
            archived
              ? `Archived until ${when(tenant.archiveUntil)}`
              : suspended
                ? "Login disabled"
                : tenant.subscription?.paidExpired
                  ? "Paid period ended"
                  : tenant.subscription?.trialExpired
                    ? "Trial ended"
                    : "Can log in"
          }
        />
        <Info label="Paid until" value={when(tenant.paidUntil)} warn={Boolean(tenant.subscription?.paidExpired)} />
        <Info label="Last payment" value={when(tenant.lastPaymentAt)} warn={!tenant.lastPaymentAt} />
      </div>

      {snapshot && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-6">
          <Info label="Users" value={String(snapshot.users?.count ?? 0)} />
          <Info label="Products" value={String(snapshot.products ?? 0)} />
          <Info
            label="Sales last 7 days"
            value={`${snapshot.salesLast7Days?.count || 0} / Rs ${Number(snapshot.salesLast7Days?.total || 0).toLocaleString()}`}
          />
          <Info
            label="Storage"
            value={`${snapshot.storage?.gb ?? 0} / ${snapshot.storage?.limitGb ?? "—"} GB`}
          />
          <Info
            label="Redis / jobs"
            value={`${snapshot.redis?.status || "offline"} · ${snapshot.jobs?.mode || "inline"}`}
            warn={snapshot.redis?.status !== "connected" || (snapshot.jobs?.errors?.length || 0) > 0}
          />
        </div>
      )}
      {(snapshot?.redis?.errors?.length || snapshot?.jobs?.errors?.length) ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {(snapshot?.redis?.errors || []).slice(0, 3).map((row, i) => (
            <p key={`r-${i}`}>Redis: {row.message}</p>
          ))}
          {(snapshot?.jobs?.errors || []).slice(0, 3).map((row, i) => (
            <p key={`j-${i}`}>Job {row.name}: {row.message}</p>
          ))}
        </div>
      ) : null}

      {suspended && (
        <p className="mb-4 text-sm rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3">
          Suspended {when(tenant.suspendedAt)} by {tenant.suspendedByEmail || "platform"} — {tenant.suspendedReason}
        </p>
      )}
      {archived && (
        <p className="mb-4 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 px-4 py-3">
          Archived {when(tenant.archivedAt)} by {tenant.archivedByEmail || "platform"}.
          Data is kept until {when(tenant.archiveUntil)}. {tenant.archiveReason}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Plan & notes</h2>
          <select className="platform-input" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            {INDUSTRIES.map((value) => (
              <option key={value} value={value}>{INDUSTRY_LABELS[value]}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500">Changing type resets modules (partners, warranty, quotations, projects).</p>
          <select className="platform-input" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select className="platform-input" value={storageGb} onChange={(e) => setStorageGb(Number(e.target.value))}>
            <option value={10}>10 GB storage</option>
            <option value={30}>30 GB storage</option>
            <option value={50}>50 GB storage</option>
            <option value={100}>100 GB storage</option>
          </select>
          <textarea className="platform-input min-h-[72px]" placeholder="Internal notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" disabled={!!busy} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2" onClick={save}>
            Save plan
          </button>
          {tenant.subscription && (
            <p className="text-xs text-slate-500">
              Users {tenant.subscription.usage.users}/{tenant.subscription.limits.users} ·
              Storage {(tenant.subscription.usage.storageBytes / (1024 * 1024 * 1024)).toFixed(2)}/{tenant.subscription.limits.storageGb} GB
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Money (no checkout yet)</h2>
          <p className="text-xs text-slate-500">
            Record bank/eSewa/cash in these fields. Last payment: {when(tenant.lastPaymentAt)}.
          </p>
          <label className="text-xs font-medium text-slate-600">Trial ends</label>
          <input type="date" className="platform-input" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
          <button
            type="button"
            disabled={!!busy || archived}
            className="rounded-lg border border-slate-200 text-sm font-medium px-4 py-2 hover:bg-slate-50"
            onClick={() => lifecycle("extend-trial", { trialEndsAt, note: paymentNote })}
          >
            Extend trial
          </button>
          <label className="text-xs font-medium text-slate-600">Paid until</label>
          <input type="date" className="platform-input" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
          <label className="text-xs font-medium text-slate-600">Payment notes</label>
          <textarea
            className="platform-input min-h-[72px]"
            placeholder="e.g. Rs 24,000 via eSewa, 12 months, txn 98xx"
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
          />
          <button
            type="button"
            disabled={!!busy || archived}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2"
            onClick={() => lifecycle("record-payment", { paidUntil, note: paymentNote, plan })}
          >
            Record payment
          </button>
          {tenant.paymentNote && <p className="text-xs text-slate-500">Last note: {tenant.paymentNote}</p>}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Owner access</h2>
          <p className="text-sm text-slate-500">
            If they never get in, send a 24-hour magic link (copy to WhatsApp). Or reset a temporary password.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || archived || suspended} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 disabled:opacity-40" onClick={sendInvite}>
              Resend owner invite
            </button>
            <button type="button" disabled={!!busy} className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2" onClick={resetPassword}>
              Reset owner password
            </button>
          </div>
          {inviteUrl && (
            <p className="text-sm bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 break-all">
              Invite: <span className="font-mono">{inviteUrl}</span>
            </p>
          )}
          {tempPassword && (
            <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Temporary password: <span className="font-mono font-medium">{tempPassword}</span>
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Disable login</h2>
          <p className="text-sm text-slate-500">Suspend keeps all data. Staff cannot sign in until you unsuspend.</p>
          {!suspended ? (
            <>
              <textarea className="platform-input min-h-[64px]" placeholder="Why are you suspending this shop?" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
              <button
                type="button"
                disabled={!!busy || archived}
                className="rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-4 py-2"
                onClick={() => lifecycle("suspend", { reason: suspendReason })}
              >
                Suspend shop
              </button>
            </>
          ) : (
            <button type="button" disabled={!!busy} className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-4 py-2" onClick={() => lifecycle("unsuspend")}>
              Unsuspend (restore login)
            </button>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Archive (soft delete)</h2>
          <p className="text-sm text-slate-500">Hides the shop from login. Mongo data is kept for 90 days, then you can wipe it.</p>
          {!archived ? (
            <>
              <input className="platform-input" placeholder="Reason" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
              <button type="button" disabled={!!busy} className="rounded-lg border border-slate-300 text-sm font-medium px-4 py-2" onClick={() => lifecycle("archive", { reason: archiveReason })}>
                Archive shop
              </button>
            </>
          ) : (
            <button type="button" disabled={!!busy} className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2" onClick={() => lifecycle("restore")}>
              Restore shop
            </button>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-red-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-red-800">Wipe (permanent)</h2>
          <p className="text-sm text-slate-500">Deletes users, sales, products, files. Archive first, then type the slug <span className="font-mono">{tenant.slug}</span>.</p>
          <input className="platform-input" placeholder="Type slug to confirm" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
          <button
            type="button"
            disabled={!!busy || !archived}
            className="rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
            onClick={() => {
              if (!window.confirm("This cannot be undone. Wipe this shop forever?")) return;
              lifecycle("wipe", { confirmSlug });
            }}
          >
            Wipe shop data
          </button>
        </section>
      </div>

      <section className="mt-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Users</h2>
        <ul className="space-y-2 text-sm mb-6">
          {(tenant.users || []).map((u) => (
            <li key={u._id} className="flex justify-between gap-2 text-slate-700">
              <span>{u.name} · {u.email}</span>
              <span className="text-slate-400">{u.role} · last login {when(u.lastLogin)}</span>
            </li>
          ))}
        </ul>
        <h2 className="font-semibold text-slate-900 mb-3">Who opened this shop</h2>
        <ul className="space-y-2 text-sm text-slate-600 mb-6">
          {shopLog.length === 0 && <li className="text-slate-400">No impersonate or invite events yet.</li>}
          {shopLog.map((row) => (
            <li key={row._id}>
              <span className="font-medium text-slate-800">{row.actorEmail || "platform"}</span>
              {" · "}{row.action}
              {row.note ? ` · ${row.note}` : ""}
              {" · "}{when(row.createdAt)}
            </li>
          ))}
        </ul>
        <h2 className="font-semibold text-slate-900 mb-3">Lifecycle log</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          {(tenant.lifecycle || []).length === 0 && <li className="text-slate-400">No lifecycle events yet.</li>}
          {(tenant.lifecycle || []).map((row, i) => (
            <li key={`${row.at}-${i}`}>
              <span className="font-medium text-slate-800">{row.action}</span>
              {" · "}
              {when(row.at)}
              {row.byEmail ? ` · ${row.byEmail}` : ""}
              {row.note ? ` — ${row.note}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </PlatformLayout>
  );
}

function Info({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-medium mt-1 ${warn ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
