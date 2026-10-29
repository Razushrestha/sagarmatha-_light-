"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { paintAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type Lot = { _id: string; batchNo?: string; remaining: number; qty: number; unitCost: number; receivedAt: string; product?: { name: string; sku: string } };

export default function PaintLotsPage() {
  const [rows, setRows] = useState<Lot[]>([]);
  useEffect(() => {
    paintAPI.getLots().then((r) => setRows(r.data.data || [])).catch(() => setRows([]));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader title="Paint batches (FIFO)" />
      <p className="text-sm text-brand-500 mb-4">Inbound stock opens a lot. Sales and mix deduct the oldest lot first.</p>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Product</th>
              <th className="table-header">Batch</th>
              <th className="table-header">Remaining</th>
              <th className="table-header">Cost</th>
              <th className="table-header">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="table-cell text-center py-10 text-gray-400">No open lots yet. Receive a purchase or mix a tin.</td></tr>
            ) : rows.map((row) => (
              <tr key={row._id}>
                <td className="table-cell">{row.product?.name} <span className="text-brand-400">{row.product?.sku}</span></td>
                <td className="table-cell">{row.batchNo || "—"}</td>
                <td className="table-cell">{row.remaining} / {row.qty}</td>
                <td className="table-cell">{formatCurrency(row.unitCost)}</td>
                <td className="table-cell">{new Date(row.receivedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
