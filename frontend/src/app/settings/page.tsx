"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { FormCard, FormSection, FormGrid, FormCheckbox } from "@/components/ui/FormLayout";
import { authAPI, miscAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Save, Shield } from "lucide-react";
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

interface RoleInfo {
  key: string;
  name: string;
  description: string;
  landingPage: string;
}

interface StaffUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive?: boolean;
}

interface AccountDraft {
  name: string;
  email: string;
  password: string;
}

function roleLabel(role: string) {
  return role.replace(/_/g, " ");
}

export default function SettingsPage() {
  const { user, hasPermission, refreshUser } = useAuth();
  const canManageUsers = hasPermission("users:manage", "settings:manage");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [accounts, setAccounts] = useState<StaffUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AccountDraft>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  useEffect(() => {
    miscAPI.getSettings()
      .then((res) => setSettings(res.data.data))
      .catch(() => toast.error("Unable to load settings"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!canManageUsers) return;
    Promise.all([authAPI.getRoles(), authAPI.getUsers()])
      .then(([roleRes, userRes]) => {
        const nextUsers: StaffUser[] = userRes.data.data || [];
        setRoles(roleRes.data.data || []);
        setAccounts(nextUsers);
        const nextDrafts: Record<string, AccountDraft> = {};
        nextUsers.forEach((person) => {
          nextDrafts[person._id] = { name: person.name, email: person.email, password: "" };
        });
        setDrafts(nextDrafts);
      })
      .catch(() => toast.error("Unable to load users and roles"));
  }, [canManageUsers]);

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

  const updateDraft = (id: string, field: keyof AccountDraft, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveAccount = async (person: StaffUser) => {
    const draft = drafts[person._id];
    if (!draft?.email?.trim()) return toast.error("Email is required");
    if (draft.password && draft.password.length < 6) return toast.error("Password must be at least 6 characters");
    setSavingUserId(person._id);
    try {
      const payload: { name: string; email: string; password?: string } = {
        name: draft.name.trim(),
        email: draft.email.trim(),
      };
      if (draft.password) payload.password = draft.password;
      const res = await authAPI.updateUser(person._id, payload);
      const saved = res.data.data as StaffUser;
      setAccounts((prev) => prev.map((row) => (row._id === saved._id ? { ...row, ...saved } : row)));
      setDrafts((prev) => ({
        ...prev,
        [person._id]: { name: saved.name, email: saved.email, password: "" },
      }));
      if (user?._id === person._id) await refreshUser();
      toast.success(`${saved.name} login updated`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not update this account");
    } finally {
      setSavingUserId(null);
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

      {canManageUsers && (
        <div className="mt-4 space-y-4">
          <FormCard>
            <FormSection title="Roles" description="What each login type can do in the system.">
              {roles.length === 0 ? (
                <p className="text-sm text-gray-400">No roles loaded.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {roles.map((role) => (
                    <div key={role.key} className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-brand-600" />
                        <p className="text-sm font-semibold text-brand-900">{role.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                      <p className="text-[11px] text-gray-400 mt-2 capitalize">Opens at {role.landingPage.replace("/", "") || "dashboard"}</p>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>
          </FormCard>

          <FormCard>
            <FormSection
              title="Login accounts"
              description="Admin can update email and password for Admin and Sales (and other staff). Leave password blank to keep the current one."
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Name</th>
                      <th className="table-header">Role</th>
                      <th className="table-header">Email</th>
                      <th className="table-header">New password</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-50">
                    {accounts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="table-cell text-center py-8 text-gray-400">No login accounts found</td>
                      </tr>
                    ) : accounts.map((person) => {
                      const draft = drafts[person._id] || { name: person.name, email: person.email, password: "" };
                      return (
                        <tr key={person._id}>
                          <td className="table-cell">
                            <input
                              className="input-field min-w-[140px]"
                              value={draft.name}
                              onChange={(e) => updateDraft(person._id, "name", e.target.value)}
                            />
                          </td>
                          <td className="table-cell">
                            <span className="badge bg-brand-100 text-brand-700 capitalize">{roleLabel(person.role)}</span>
                          </td>
                          <td className="table-cell">
                            <input
                              type="email"
                              className="input-field min-w-[220px]"
                              value={draft.email}
                              onChange={(e) => updateDraft(person._id, "email", e.target.value)}
                            />
                          </td>
                          <td className="table-cell">
                            <input
                              type="password"
                              autoComplete="new-password"
                              placeholder="Leave blank to keep"
                              className="input-field min-w-[180px]"
                              value={draft.password}
                              onChange={(e) => updateDraft(person._id, "password", e.target.value)}
                            />
                          </td>
                          <td className="table-cell">
                            <button
                              type="button"
                              disabled={savingUserId === person._id}
                              onClick={() => saveAccount(person)}
                              className="btn-secondary text-xs"
                            >
                              {savingUserId === person._id ? "Saving..." : "Update login"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </FormSection>
          </FormCard>
        </div>
      )}
    </DashboardLayout>
  );
}
