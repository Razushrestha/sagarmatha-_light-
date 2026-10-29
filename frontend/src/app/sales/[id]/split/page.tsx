"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { saleAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

type Item = { productName: string; quantity: number; subtotal: number; modifiers?: Array<{ option: string }> };

export default function SplitBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [qty, setQty] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    saleAPI.getById(id).then((r) => {
      const rows = r.data.data?.items || [];
      setItems(rows);
      setQty(rows.map(() => "0"));
    });
  }, [id]);

  const split = async () => {
    const payload = items.map((_, index) => ({ index, quantity: Number(qty[index]) || 0 })).filter((row) => row.quantity > 0);
    try {
      await saleAPI.split(id, { items: payload });
      toast.success("Bill split");
      router.push("/pos");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not split");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Split bill" />
      <p className="text-sm text-brand-500 mb-4">Move some quantities onto a new open bill. Pay that guest separately, leave the rest on the table.</p>
      <div className="card divide-y max-w-xl">
        {items.map((item, i) => (
          <div key={i} className="p-3 flex justify-between gap-3 items-center">
            <div>
              <p className="font-medium">{item.productName}</p>
              <p className="text-xs text-brand-400">{item.quantity} · {formatCurrency(item.subtotal)}</p>
            </div>
            <input className="input-field w-20" type="number" min={0} max={item.quantity} value={qty[i]} onChange={(e) => {
              const next = [...qty];
              next[i] = e.target.value;
              setQty(next);
            }} />
          </div>
        ))}
      </div>
      <button type="button" className="btn-primary mt-4" onClick={split}>Split off selected</button>
    </DashboardLayout>
  );
}
