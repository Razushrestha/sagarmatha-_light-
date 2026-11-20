"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy URL — customer details/ledger now live at /customers/[id]. */
export default function DebtorManageRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/customers/${id}?from=debtors`);
  }, [id, router]);

  return null;
}
