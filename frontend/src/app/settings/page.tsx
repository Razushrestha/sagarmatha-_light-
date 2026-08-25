"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { FormCard, FormSection, FormGrid, FormCheckbox } from "@/components/ui/FormLayout";
import { miscAPI } from "@/lib/api";
import { Save } from "lucide-react";
import toast from "react-hot-toast";

interface Settings {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  pan: string;
  vatNumber: string;
  vatRate: number;
  vatInclusive: boolean;
  invoicePrefix: string;
  termsAndConditions: string;
  footerText: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    miscAPI.getSettings()
      .then((res) => setSettings(res.data.data))
      .catch(() => toast.error("Unable to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const update = (field: keyof Settings, value: string | number | boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await miscAPI.updateSettings(settings as unknown as Record<string, unknown>);
      toast.success("Settings saved!");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="card p-8 animate-pulse bg-brand-50 h-64" />
      </DashboardLayout>
    );
  }

  if (!settings) {
    return (
      <DashboardLayout>
        <PageHeader title="Settings" />
        <div className="card p-8 text-center text-gray-400">Settings unavailable. Login as Super Admin.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Settings"
        action={
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FormCard>
          <FormSection title="Company Profile">
            <FormGrid cols={2}>
              <div className="sm:col-span-2">
                <FormField label="Company Name">
                  <input className="input-field" value={settings.companyName} onChange={(e) => update("companyName", e.target.value)} />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Address">
                  <textarea className="input-field min-h-[64px] resize-y" value={settings.address} onChange={(e) => update("address", e.target.value)} />
                </FormField>
              </div>
              <FormField label="Phone">
                <input className="input-field" value={settings.phone} onChange={(e) => update("phone", e.target.value)} />
              </FormField>
              <FormField label="Email">
                <input className="input-field" value={settings.email || ""} onChange={(e) => update("email", e.target.value)} />
              </FormField>
              <FormField label="PAN Number">
                <input className="input-field" value={settings.pan || ""} onChange={(e) => update("pan", e.target.value)} />
              </FormField>
              <FormField label="VAT Number">
                <input className="input-field" value={settings.vatNumber || ""} onChange={(e) => update("vatNumber", e.target.value)} />
              </FormField>
            </FormGrid>
          </FormSection>
        </FormCard>

        <FormCard>
          <FormSection title="Tax & Invoice Settings">
            <FormGrid cols={2}>
              <FormField label="VAT Rate (%)">
                <input type="number" className="input-field" value={settings.vatRate} onChange={(e) => update("vatRate", Number(e.target.value))} />
              </FormField>
              <FormField label="Invoice Prefix">
                <input className="input-field" value={settings.invoicePrefix} onChange={(e) => update("invoicePrefix", e.target.value)} />
              </FormField>
            </FormGrid>
            <div className="mt-3">
              <FormCheckbox id="vatInclusive" label="VAT inclusive pricing (Nepal 13%)" checked={settings.vatInclusive} onChange={(v) => update("vatInclusive", v)} />
            </div>
            <div className="mt-3 space-y-3">
              <FormField label="Terms & Conditions">
                <textarea className="input-field min-h-[72px] resize-y" value={settings.termsAndConditions || ""} onChange={(e) => update("termsAndConditions", e.target.value)} />
              </FormField>
              <FormField label="Invoice Footer">
                <input className="input-field" value={settings.footerText || ""} onChange={(e) => update("footerText", e.target.value)} />
              </FormField>
            </div>
          </FormSection>
        </FormCard>
      </div>
    </DashboardLayout>
  );
}
