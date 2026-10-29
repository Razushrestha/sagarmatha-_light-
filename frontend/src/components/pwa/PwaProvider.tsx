"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { PRODUCT } from "@/lib/company";

const DISMISS_KEY = "nepatronix-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaValue = {
  standalone: boolean;
  canInstall: boolean;
  ios: boolean;
  install: () => Promise<void>;
};

const PwaContext = createContext<PwaValue>({
  standalone: true,
  canInstall: false,
  ios: false,
  install: async () => {},
});

export function usePwa() {
  return useContext(PwaContext);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && webkit;
}

function isPhoneSized() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function InstallAppHint({ compact }: { compact?: boolean }) {
  const { standalone, canInstall, ios, install } = usePwa();
  if (standalone) return null;

  return (
    <div className={compact ? "rounded-lg border border-brand-200 bg-brand-50 p-3" : "rounded-xl border border-brand-200 bg-white p-4"}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-900 text-white font-bold text-sm flex items-center justify-center shrink-0">
          {PRODUCT.monogram}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-900">Use like an app on this phone</p>
          {ios ? (
            <p className="text-xs text-brand-600 mt-1 leading-relaxed">
              Tap <Share className="inline w-3.5 h-3.5 mb-0.5" strokeWidth={2} /> Share, then <strong>Add to Home Screen</strong>. Next time open the icon like WhatsApp. Internet is still required.
            </p>
          ) : (
            <p className="text-xs text-brand-600 mt-1 leading-relaxed">
              Add an icon to the home screen. You will not type the website each time. Chrome menu → <strong>Add to Home screen</strong> / <strong>Install app</strong> if the button below is missing.
            </p>
          )}
          {canInstall && (
            <button type="button" onClick={install} className="btn-primary mt-3 text-sm py-2 px-3">
              <Download className="w-4 h-4" strokeWidth={1.75} />
              Add to home screen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PwaProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [phone, setPhone] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    }

    setStandalone(isStandalone());
    setIos(isIosSafari());
    setPhone(isPhoneSized());
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setDeferred(null);
      setStandalone(true);
    }
  }, [deferred]);

  const value = useMemo<PwaValue>(
    () => ({ standalone, canInstall: Boolean(deferred), ios, install }),
    [standalone, deferred, ios, install]
  );

  const showBanner = !standalone && !dismissed && (Boolean(deferred) || ios || phone);

  return (
    <PwaContext.Provider value={value}>
      {children}
      {showBanner && (
        <div className="fixed bottom-0 inset-x-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md rounded-xl bg-brand-900 text-white shadow-card-hover px-4 py-3 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-white text-brand-900 flex items-center justify-center shrink-0 mt-0.5">
              <Smartphone className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Install {PRODUCT.shortName}</p>
              {ios ? (
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Tap <Share className="inline w-3.5 h-3.5 mb-0.5" strokeWidth={2} /> Share, then <strong>Add to Home Screen</strong>.
                </p>
              ) : (
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Home screen icon. Still online — you just skip typing the address.
                </p>
              )}
              {deferred && (
                <button
                  type="button"
                  onClick={install}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white text-brand-900 text-sm font-semibold px-3 py-1.5"
                >
                  <Download className="w-4 h-4" strokeWidth={1.75} />
                  Add to home screen
                </button>
              )}
            </div>
            <button type="button" onClick={dismiss} className="p-1 text-gray-400 hover:text-white shrink-0" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}
