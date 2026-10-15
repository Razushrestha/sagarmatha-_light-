"use client";

import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import PlatformLayout from "@/components/layout/PlatformLayout";
import { platformAPI } from "@/lib/api";

interface Settings {
  trialMonths: number;
  defaultPlan: string;
  defaultStorageGb: number;
  imageMaxPx: number;
  imageThumbPx: number;
  imageWebpQuality: number;
  signupEnabled: boolean;
}

const empty: Settings = {
  trialMonths: 3,
  defaultPlan: "starter",
  defaultStorageGb: 10,
  imageMaxPx: 1280,
  imageThumbPx: 320,
  imageWebpQuality: 78,
  signupEnabled: true,
};

export default function PlatformSettingsPage() {
  const [form, setForm] = useState<Settings>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    platformAPI.getSettings()
      .then((res) => setForm({ ...empty, ...res.data.data }))
      .catch(() => toast.error("Could not load settings"));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await platformAPI.updateSettings(form);
      setForm({ ...empty, ...res.data.data });
      toast.success("Settings saved");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlatformLayout>
      <h1 className="text-[28px] leading-tight font-semibold text-slate-900">Settings</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Defaults for new shops. Existing shops keep their own trial, plan and images.</p>

      <form onSubmit={save} className="max-w-xl bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">Default trial (months)</label>
        <input type="number" min={1} max={24} className="platform-input" value={form.trialMonths} onChange={(e) => setForm({ ...form, trialMonths: Number(e.target.value) })} />

        <label className="block text-sm font-medium text-slate-700">Default plan (public signup)</label>
        <select className="platform-input" value={form.defaultPlan} onChange={(e) => setForm({ ...form, defaultPlan: e.target.value })}>
          <option value="starter">Starter</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>

        <label className="block text-sm font-medium text-slate-700">Default storage</label>
        <select className="platform-input" value={form.defaultStorageGb} onChange={(e) => setForm({ ...form, defaultStorageGb: Number(e.target.value) })}>
          <option value={10}>10 GB</option>
          <option value={30}>30 GB</option>
          <option value={50}>50 GB</option>
          <option value={100}>100 GB</option>
        </select>

        <label className="block text-sm font-medium text-slate-700">Image max size (px)</label>
        <input type="number" min={400} max={4000} className="platform-input" value={form.imageMaxPx} onChange={(e) => setForm({ ...form, imageMaxPx: Number(e.target.value) })} />

        <label className="block text-sm font-medium text-slate-700">Thumbnail size (px)</label>
        <input type="number" min={80} max={800} className="platform-input" value={form.imageThumbPx} onChange={(e) => setForm({ ...form, imageThumbPx: Number(e.target.value) })} />

        <label className="block text-sm font-medium text-slate-700">WebP quality (40–95)</label>
        <input type="number" min={40} max={95} className="platform-input" value={form.imageWebpQuality} onChange={(e) => setForm({ ...form, imageWebpQuality: Number(e.target.value) })} />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.signupEnabled} onChange={(e) => setForm({ ...form, signupEnabled: e.target.checked })} />
          Public signup on
        </label>
        <p className="text-xs text-slate-500">When off, /signup is closed and shops are created only from this admin.</p>

        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </PlatformLayout>
  );
}
