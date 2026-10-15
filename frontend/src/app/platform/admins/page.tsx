"use client";

import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import PlatformLayout from "@/components/layout/PlatformLayout";
import { platformAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AdminRow {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: string;
}

export default function PlatformAdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [temp, setTemp] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => platformAPI.getAdmins()
    .then((res) => setAdmins(res.data.data || []))
    .catch(() => toast.error("Could not load admins"));

  useEffect(() => { load(); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("create");
    try {
      const res = await platformAPI.createAdmin(form);
      setTemp(res.data.data?.temporaryPassword || form.password);
      setForm({ name: "", email: "", password: "" });
      toast.success("Admin created — they must change password at first login");
      await load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not create admin");
    } finally {
      setBusy("");
    }
  };

  return (
    <PlatformLayout>
      <h1 className="text-[28px] leading-tight font-semibold text-slate-900">Admins</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">People who can open shops, change plans, and run ops. Not shop POS users.</p>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px] items-start">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Last login</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((row) => (
                <tr key={row._id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-900">{row.name}{user?._id === row._id ? " (you)" : ""}</td>
                  <td className="px-5 py-3 text-slate-600">{row.email}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{row.lastLogin ? new Date(row.lastLogin).toLocaleString() : "Never"}</td>
                  <td className="px-5 py-3">
                    <span className={row.isActive ? "text-emerald-700 text-xs font-medium" : "text-slate-400 text-xs"}>
                      {row.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <button
                      type="button"
                      className="text-xs text-indigo-600 font-medium"
                      onClick={async () => {
                        try {
                          const res = await platformAPI.updateAdmin(row._id, { resetPassword: true });
                          setTemp(res.data.data?.temporaryPassword || "");
                          toast.success("Temporary password created");
                        } catch (err: unknown) {
                          const error = err as { response?: { data?: { message?: string } } };
                          toast.error(error.response?.data?.message || "Reset failed");
                        }
                      }}
                    >
                      Reset password
                    </button>
                    {user?._id !== row._id && (
                      <button
                        type="button"
                        className="text-xs text-slate-500 font-medium"
                        onClick={async () => {
                          try {
                            await platformAPI.updateAdmin(row._id, { isActive: !row.isActive });
                            await load();
                          } catch (err: unknown) {
                            const error = err as { response?: { data?: { message?: string } } };
                            toast.error(error.response?.data?.message || "Update failed");
                          }
                        }}
                      >
                        {row.isActive ? "Disable" : "Enable"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Add platform admin</h2>
          <input className="platform-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input type="email" className="platform-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="platform-input" placeholder="Password (optional — we can generate one)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} />
          <button type="submit" disabled={!!busy} className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2">
            Create admin
          </button>
          {temp && (
            <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Temporary password: <span className="font-mono font-medium">{temp}</span>
            </p>
          )}
        </form>
      </div>
    </PlatformLayout>
  );
}
