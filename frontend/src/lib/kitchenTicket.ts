type TicketItem = {
  productName?: string;
  product?: { name?: string };
  quantity: number;
  modifiers?: Array<{ group?: string; option?: string }>;
  complimentary?: boolean;
  notes?: string;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function openKitchenTicket({
  invoiceNumber,
  serviceType,
  items,
}: {
  invoiceNumber?: string;
  serviceType?: string;
  items: TicketItem[];
}) {
  if (typeof window === "undefined") return;
  const rows = items.map((item) => {
    const name = item.productName || item.product?.name || "Item";
    const mods = (item.modifiers || []).map((row) => row.option).filter(Boolean).join(" · ");
    return `<tr>
      <td>${esc(item.quantity)}</td>
      <td>
        <strong>${esc(name)}</strong>
        ${mods ? `<div class="mods">${esc(mods)}</div>` : ""}
        ${item.complimentary ? `<div class="mods">COMP</div>` : ""}
      </td>
    </tr>`;
  }).join("");
  const html = `<!doctype html>
<html><head><title>Kitchen ${esc(invoiceNumber || "")}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 12px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px dashed #ccc; vertical-align: top; }
  td:first-child { width: 2.5rem; font-weight: 700; }
  .mods { font-size: 12px; color: #444; margin-top: 2px; }
</style></head>
<body>
  <h1>Kitchen / bar</h1>
  <p>${esc(invoiceNumber || "")} · ${esc(serviceType === "takeaway" ? "Takeaway" : "Dine-in")}</p>
  <table>${rows}</table>
  <script>window.onload = function () { window.print(); }<\/script>
</body></html>`;
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
