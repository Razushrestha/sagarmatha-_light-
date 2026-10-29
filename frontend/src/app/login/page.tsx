"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { PRODUCT } from "@/lib/company";
import { InstallAppHint } from "@/components/pwa/PwaProvider";
import { prefetchAppRoutes } from "@/lib/appRoutes";
import { authAPI, publicAPI } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, acceptSession } = useAuth();
  const router = useRouter();
  const [inviteStatus, setInviteStatus] = useState("");
  const [signupEnabled, setSignupEnabled] = useState(true);
  const inviteTried = useRef(false);

  useEffect(() => {
    prefetchAppRoutes((href) => router.prefetch(href));
    publicAPI.config().then((res) => setSignupEnabled(res.data.data?.signupEnabled !== false)).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (inviteTried.current) return;
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    inviteTried.current = true;
    setInviteStatus("Opening your shop…");
    authAPI.magicLogin({ token })
      .then((res) => {
        const landing = acceptSession(res.data.data);
        toast.success("Signed in with invite link");
        router.replace(landing);
      })
      .catch((err: unknown) => {
        const error = err as { response?: { data?: { message?: string } } };
        setInviteStatus("");
        toast.error(error.response?.data?.message || "Invite link expired. Sign in with your password or ask for a new link.");
      });
  }, [acceptSession, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const landingPage = await login(email, password);
      router.replace(landingPage);
      toast.success("Welcome back!");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; code?: string; message?: string };
      if (!error.response) {
        toast.error("Cannot reach the API. Make sure the website and backend are running on their own ports.");
      } else {
        toast.error(error.response?.data?.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-brand-900 relative">
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="w-14 h-14 rounded-lg bg-white flex items-center justify-center mb-8">
            <span className="text-brand-900 font-bold text-xl">{PRODUCT.monogram}</span>
          </div>
          <h1 className="text-4xl font-semibold mb-4 tracking-tight">{PRODUCT.name}</h1>
          <p className="text-lg text-gray-300 mb-8 max-w-md leading-relaxed">
            Multi-shop ERP for Nepal. POS, inventory, accounting and VAT. Each business isolated in its own workspace.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {["POS & Billing", "Inventory", "Accounting", "Analytics"].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-1 h-1 rounded-full bg-white" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 pb-28 bg-brand-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-lg bg-brand-900 flex items-center justify-center">
              <span className="text-white font-bold text-lg">{PRODUCT.monogram}</span>
            </div>
            <div>
              <h1 className="font-semibold text-lg text-brand-900">{PRODUCT.name}</h1>
              <p className="text-xs text-brand-500">{PRODUCT.tagline}</p>
            </div>
          </div>

          <div className="card p-5 sm:p-8">
            <h2 className="text-2xl font-semibold text-brand-900 mb-1">Welcome back</h2>
            <p className="text-sm text-brand-500 mb-8">
              {inviteStatus || "Sign in to your account to continue"}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@nepatronix.com"
                  required
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" strokeWidth={1.75} /> : <Eye className="w-4 h-4" strokeWidth={1.75} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {signupEnabled && (
              <p className="text-center text-sm text-brand-600 mt-6">
                New shop?{" "}
                <Link href="/signup" className="font-medium text-brand-900 hover:underline">
                  Create an account
                </Link>
              </p>
            )}
          </div>

          <div className="mt-6">
            <InstallAppHint compact />
          </div>
          <p className="text-center text-xs text-brand-400 mt-6">
            {PRODUCT.name} by Nepatronix
          </p>
        </div>
      </div>
    </div>
  );
}
