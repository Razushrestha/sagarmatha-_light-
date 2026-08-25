"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { inventoryAPI } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { Shield } from "lucide-react";

interface AuditLog {
  _id: string;
  action: string;
  resource: string;
  user?: { name: string; email: string };
  ip?: string;
  createdAt: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    inventoryAPI.getAuditLogs({ limit: "100" })
      .then((r) => setLogs(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader title="Audit Logs" />

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Timestamp</th>
              <th className="table-header">User</th>
              <th className="table-header">Action</th>
              <th className="table-header">Resource</th>
              <th className="table-header">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={5} className="table-cell"><div className="h-10 bg-brand-50 rounded animate-pulse" /></td></tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-cell text-center py-12 text-gray-400">
                  <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />No audit logs yet
                </td>
              </tr>
            ) : logs.map((log) => (
              <tr key={log._id} className="hover:bg-brand-50/50">
                <td className="table-cell text-sm text-gray-500">{formatDateTime(log.createdAt)}</td>
                <td className="table-cell">
                  <p className="font-medium">{log.user?.name || "System"}</p>
                  <p className="text-xs text-gray-400">{log.user?.email}</p>
                </td>
                <td className="table-cell">
                  <span className="badge bg-brand-100 text-brand-700 capitalize">{log.action}</span>
                </td>
                <td className="table-cell capitalize">{log.resource}</td>
                <td className="table-cell text-gray-500 font-mono text-xs">{log.ip || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
