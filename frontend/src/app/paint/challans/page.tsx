"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { paintAPI, productAPI } from "@/lib/api";
import toast from "react-hot-toast";

type Challan = { _id: string; challanNumber: string; customerName?: string; status: string; vehicle?: string; driver?: string };
type Product = { _id: string; name: string };

export default function ChallansPage() {
  const [rows, setRows] = useState<Challan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");

  const load = () => paintAPI.getChallans().then((r) => setRows(r.data.data || [])).catch(() => {});
  useEffect(() => {
    load();
    productAPI.getAll({ limit: "100" }).then((r) => setProducts(r.data.data || [])).catch(() => {});
  }, []);

  const create = async () => {
    const product = products.find((row) => row._id === productId);
    if (!product) return toast.error("Pick a product");
    try {
      await paintAPI.createChallan({
        customerName,
        vehicle,
        driver,
        items: [{ product: product._id, productName: product.name, quantity: Number(qty) || 1 }],
      });
      toast.success("Challan drafted");
      load();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not create");
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Delivery challans" />
      <div className="card p-4 mb-6 grid sm:grid-cols-2 gap-2 max-w-3xl">
        <input className="input-field" placeholder="Customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <input className="input-field" placeholder="Vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        <input className="input-field" placeholder="Driver" value={driver} onChange={(e) => setDriver(e.target.value)} />
        <select className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Product</option>
          {products.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}
        </select>
        <input className="input-field" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button type="button" className="btn-primary" onClick={create}>Draft challan</button>
      </div>
      <div className="card divide-y">
        {rows.map((row) => (
          <div key={row._id} className="p-3 flex justify-between gap-3 text-sm">
            <div>
              <p className="font-medium">{row.challanNumber} · {row.status}</p>
              <p className="text-brand-500">{row.customerName} · {row.vehicle} · {row.driver}</p>
            </div>
            <div className="flex gap-2">
              <Link className="text-brand-700" href={`/paint/challans/${row._id}/print`}>Print</Link>
              {row.status === "draft" && <button type="button" onClick={() => paintAPI.dispatchChallan(row._id).then(load).catch((e) => toast.error(e.response?.data?.message || "Dispatch failed"))}>Dispatch</button>}
              {row.status === "dispatched" && <button type="button" onClick={() => paintAPI.deliverChallan(row._id).then(load)}>Delivered</button>}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
