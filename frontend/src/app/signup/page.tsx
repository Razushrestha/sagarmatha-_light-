"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { PRODUCT } from "@/lib/company";
import { publicAPI } from "@/lib/api";
import { INDUSTRY_LABELS, PUBLIC_INDUSTRIES } from "@/lib/industry";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [form, setForm] = useState({
    shopName: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    industry: "hardware",
  });

  useEffect(() => {
    publicAPI.config().then((res) => setSignupEnabled(res.data.data?.signupEnabled !== false)).catch(() => {});
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await publicAPI.signup(form);
      toast.success("Shop created. Sign in with your email.");
      router.replace("/login");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Could not create shop");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-brand-50">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-lg bg-brand-900 flex items-center justify-center">
            <span className="text-white font-bold text-lg">{PRODUCT.monogram}</span>
          </div>
          <div>
            <h1 className="font-semibold text-lg text-brand-900">{PRODUCT.name}</h1>
            <p className="text-xs text-brand-500">{PRODUCT.tagline}</p>
          </div>
        </div>

        <div className="card p-5 sm:p-8">
          <h2 className="text-2xl font-semibold text-brand-900 mb-1">Create your shop</h2>
          <p className="text-sm text-brand-500 mb-8">
            {signupEnabled
              ? "Free trial. Your data stays isolated from other shops."
              : "Public signup is closed. Ask Nepatronix to create your shop."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Shop name</label>
              <input className="input-field" value={form.shopName} onChange={set("shopName")} required placeholder="My Electrical Store" />
            </div>
            <div>
              <label className="label">Business type</label>
              <select className="input-field" value={form.industry} onChange={set("industry")}>
                {PUBLIC_INDUSTRIES.map((value) => (
                  <option key={value} value={value}>{INDUSTRY_LABELS[value]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Your name</label>
              <input className="input-field" value={form.name} onChange={set("name")} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={set("email")} required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input-field" value={form.phone} onChange={set("phone")} />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input-field" value={form.password} onChange={set("password")} required minLength={6} />
            </div>
            <button type="submit" disabled={loading || !signupEnabled} className="btn-primary w-full py-3">
              {loading ? "Creating..." : "Start trial"}
            </button>
          </form>

          <p className="text-center text-sm text-brand-600 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-900 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
