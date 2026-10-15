"use client";

import { ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import PlatformLayout from "@/components/layout/PlatformLayout";
import { platformAPI } from "@/lib/api";
import { AlertTriangle, ClipboardList, Database, Leaf, Zap } from "lucide-react";

interface Metrics {
  process?: { rssMb?: number; jobWorker?: boolean; uptimeSec?: number };
  latency?: { p95Ms?: number; avgMs?: number };
  cache?: { hitRatePercent?: number | null; redis?: string; redisMemory?: { used?: string | null } };
  mongo?: { slow?: number; slowLast5m?: number; avgMs?: number; replica?: boolean; slowQueries?: Array<{ model?: string; ms?: number; op?: string }> };
  scale?: { recommendations?: string[] };
  jobs?: { mode?: string; enqueued?: number; completed?: number; failed?: number; queue?: boolean; worker?: boolean };
  alerts?: {
    armed?: boolean;
    channels?: { telegram?: boolean; email?: boolean };
    open?: Array<{ key: string; title?: string }>;
  };
}

export default function PlatformOpsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [backups, setBackups] = useState<{ lastOk?: string | null; items?: Array<{ name: string; at: string; bytes: number }> } | null>(null);
  const [busy, setBusy] = useState("");

  const load = async () => {
    const [ops, dumps] = await Promise.all([
      platformAPI.getMetrics().catch(() => null),
      platformAPI.getBackups().catch(() => null),
    ]);
    if (ops) setMetrics(ops.data.data);
    if (dumps) setBackups(dumps.data.data);
  };

  useEffect(() => {
    load().catch(() => toast.error("Could not load ops"));
    const id = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(id);
  }, []);

  const redisOffline = metrics?.cache?.redis && metrics.cache.redis !== "connected";
  const hitRate = metrics?.cache?.hitRatePercent;

  return (
    <PlatformLayout>
      <h1 className="text-[28px] leading-tight font-semibold text-slate-900">Ops</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Metrics, Redis, jobs and Mongo backups. Cards are for when you are looking; the watchdog pages you when you are not.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <MetricCard icon={<Database className="w-4 h-4" />} iconClass="bg-indigo-50 text-indigo-600" label="Cache hit rate" value={hitRate == null ? "—%" : `${hitRate}%`} hint={`Redis: ${metrics?.cache?.redis || "offline"}`} />
        <MetricCard icon={<Zap className="w-4 h-4" />} iconClass="bg-violet-50 text-violet-600" label="API p95 / RSS" value={`${metrics?.latency?.p95Ms ?? 0} ms / ${metrics?.process?.rssMb ?? 0} MB`} hint="Last 5 minutes" />
        <MetricCard icon={<Leaf className="w-4 h-4" />} iconClass="bg-emerald-50 text-emerald-600" label="Mongo slow (5m)" value={String(metrics?.mongo?.slowLast5m ?? metrics?.mongo?.slow ?? 0)} hint={`Lifetime slow ${metrics?.mongo?.slow ?? 0} · avg ${metrics?.mongo?.avgMs ?? 0} ms`} />
        <MetricCard icon={<ClipboardList className="w-4 h-4" />} iconClass="bg-sky-50 text-sky-600" label="Jobs" value={`${metrics?.jobs?.completed ?? 0}/${metrics?.jobs?.enqueued ?? 0}`} hint={metrics?.jobs?.mode || (metrics?.process?.jobWorker ? "worker" : "producer")} />
      </div>

      {redisOffline && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p>Redis is offline. Cache, shared rate limits and BullMQ are disabled.</p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <p className="text-slate-600">
          {metrics?.alerts?.armed
            ? `Watchdog armed (${[
                metrics.alerts.channels?.telegram ? "Telegram" : null,
                metrics.alerts.channels?.email ? "email" : null,
              ].filter(Boolean).join(" + ") || "no channel"}).`
            : "Watchdog idle — set Telegram and/or SMTP in backend/.env."}
          {metrics?.alerts?.open?.length ? ` Open: ${metrics.alerts.open.map((row) => row.key).join(", ")}.` : ""}
        </p>
        <button
          type="button"
          className="text-indigo-600 font-medium"
          onClick={async () => {
            try {
              await platformAPI.testAlert();
              toast.success("Test page sent");
            } catch (err: unknown) {
              const error = err as { response?: { data?: { message?: string } } };
              toast.error(error.response?.data?.message || "Could not send test page");
            }
          }}
        >
          Send test page
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-2">Redis & jobs</h2>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>Redis: {metrics?.cache?.redis || "offline"}{metrics?.cache?.redisMemory?.used ? ` · memory ${metrics.cache.redisMemory.used}` : ""}</li>
            <li>Queue: {metrics?.jobs?.queue ? "yes" : "no"} · worker {metrics?.jobs?.worker ? "yes" : "no"} · mode {metrics?.jobs?.mode || "—"}</li>
            <li>Failed jobs: {metrics?.jobs?.failed ?? 0}</li>
          </ul>
          <h3 className="text-xs font-medium text-slate-500 mt-4 mb-2">Scale notes</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            {(metrics?.scale?.recommendations || []).map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-slate-900">Backups</h2>
            <button
              type="button"
              disabled={busy === "backup"}
              className="rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
              onClick={async () => {
                setBusy("backup");
                try {
                  await platformAPI.runBackup();
                  toast.success("Backup finished");
                  await load();
                } catch (err: unknown) {
                  const error = err as { response?: { data?: { message?: string } } };
                  toast.error(error.response?.data?.message || "Backup failed");
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "backup" ? "Running…" : "Run backup now"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">Last OK: {backups?.lastOk ? new Date(backups.lastOk).toLocaleString() : "never"}</p>
          <ul className="text-sm text-slate-600 space-y-1 max-h-56 overflow-y-auto">
            {!(backups?.items || []).length && <li className="text-slate-400">No dumps yet. Schedule daily mongodump or use the button.</li>}
            {(backups?.items || []).map((row) => (
              <li key={row.name} className="flex justify-between gap-2">
                <span className="font-mono text-xs">{row.name}</span>
                <span className="text-slate-400">{(row.bytes / (1024 * 1024)).toFixed(1)} MB · {new Date(row.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PlatformLayout>
  );
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconClass}`}>{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-1 tracking-tight">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
    </div>
  );
}
