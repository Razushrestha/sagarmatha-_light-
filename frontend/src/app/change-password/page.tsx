"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { authAPI } from "@/lib/api";
import { PRODUCT } from "@/lib/company";

export default function ChangePasswordPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const res = await authAPI.changePassword({ currentPassword, newPassword });
      await refreshUser();
      toast.success("Password updated");
      router.replace(res.data.data.landingPage || "/dashboard");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not update password");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !user) return null;
  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand-50">
      <div className="w-full max-w-md card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-brand-900 mb-1">Set a new password</h1>
        <p className="text-sm text-brand-500 mb-6">
          {user.mustChangePassword
            ? `Required before you can use ${PRODUCT.name}.`
            : "Update the password for this account."}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input-field" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input-field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            <p className="text-xs text-brand-400 mt-1">At least 8 characters. Do not use admin123 or other common passwords.</p>
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input-field" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full py-3">
            {saving ? "Saving..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
