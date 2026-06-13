const net = require("net");
const { PRINTER_PORT, PRINTER_TIMEOUT_MS, PAPER_WIDTH } = require("./config");
const { getLogoEscPos } = require("./logo");

// ─── ESC/POS Constants ────────────────────────────────────────────────────────
const ESC = "\x1B";
const GS = "\x1D";

const CMD = {
  INIT: ESC + "@",
  ALIGN_CENTER: ESC + "a\x01",
  ALIGN_LEFT: ESC + "a\x00",
  ALIGN_RIGHT: ESC + "a\x02",
  BOLD_ON: ESC + "E\x01",
  BOLD_OFF: ESC + "E\x00",
  DOUBLE_HEIGHT_ON: ESC + "!\x10",
  DOUBLE_HEIGHT_OFF: ESC + "!\x00",
  FEED: ESC + "d\x04",
  CUT: GS + "V\x00",
};

// ─── Layout ───────────────────────────────────────────────────────────────────
const W = PAPER_WIDTH; // 48 untuk 80mm
const LINE = "=".repeat(W);
const DASH = "-".repeat(W);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(left, right, width = W) {
  const gap = width - left.length - right.length;
  if (gap <= 0) return left + "\n" + right.padStart(width);
  return left + " ".repeat(gap) + right;
}

function infoRow(label, value) {
  return label.padEnd(9) + ": " + value;
}

function wrap(text, maxW = W) {
  if (text.length <= maxW) return [text];
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + (line ? " " : "") + w).length > maxW) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatRp(value) {
  return "Rp " + parseInt(value).toLocaleString("id-ID");
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(".", ":");
}

// ─── Konversi string ESC/POS → Buffer ────────────────────────────────────────
// (binary encoding agar ESC bytes tidak corrupt)
function b(str) {
  return Buffer.from(str, "binary");
}

// ─── Build Receipt (async, return Buffer) ─────────────────────────────────────
async function buildReceipt(trx, printerType) {
  const isTop = printerType === "top";

  const items = isTop
    ? trx.details.filter((d) => d.menu?.menu_type === "FOOD")
    : trx.details;

  if (!items.length) return null;

  // Fetch logo (di-cache setelah pertama kali)
  const logoBytes = await getLogoEscPos();

  // Kumpulkan semua bagian sebagai array Buffer
  const parts = [];
  const t = (str) => parts.push(b(str));   // teks / ESC command
  const r = (buf) => parts.push(buf);      // raw Buffer (logo)

  t(CMD.INIT);

  // ══════════════════════════════════════════════
  // LOGO
  // ══════════════════════════════════════════════
  if (logoBytes) {
    t(CMD.ALIGN_CENTER);
    r(logoBytes);
    t("\n");                    // jarak setelah logo
  }

  // ══════════════════════════════════════════════
  // NAMA CAFE & ALAMAT
  // ══════════════════════════════════════════════
  t(CMD.ALIGN_CENTER);
  t(CMD.BOLD_ON);
  t(CMD.DOUBLE_HEIGHT_ON);
  t((trx.cafe?.name || "CAFE") + "\n");
  t(CMD.DOUBLE_HEIGHT_OFF);
  t(CMD.BOLD_OFF);

  if (trx.cafe?.address) {
    for (const l of wrap(trx.cafe.address, W)) t(l + "\n");
  }

  t("\n");

  // ══════════════════════════════════════════════
  // INFO TRANSAKSI
  // ══════════════════════════════════════════════
  t(CMD.ALIGN_LEFT);
  t(LINE + "\n");

  const noTrx = trx.unique_code.length > 16
    ? trx.unique_code.slice(-16)
    : trx.unique_code;

  t(infoRow("No", noTrx) + "\n");
  t(infoRow("Tanggal", formatDate(trx.created_at)) + "\n");
  t(infoRow("Meja", trx.table?.name || "-") + "\n");
  t(infoRow("Pelanggan", trx.cust_name || "-") + "\n");

  if (isTop) {
    t(DASH + "\n");
    t(CMD.ALIGN_CENTER);
    t(CMD.BOLD_ON);
    t("** MAKANAN / FOOD **\n");
    t(CMD.BOLD_OFF);
    t(CMD.ALIGN_LEFT);
  }

  t(LINE + "\n");

  // ══════════════════════════════════════════════
  // HEADER KOLOM
  // ══════════════════════════════════════════════
  t(CMD.BOLD_ON);
  t(row("MENU", "HARGA") + "\n");
  t(CMD.BOLD_OFF);
  t(DASH + "\n");

  // ══════════════════════════════════════════════
  // ITEM LIST
  // ══════════════════════════════════════════════
  let subtotal = 0;

  for (const item of items) {
    const name = item.menu?.name || "Menu";
    const qty = item.amount;
    const price = parseFloat(item.price);
    const itemTotal = qty * price;
    subtotal += itemTotal;

    t(CMD.BOLD_ON);
    for (const l of wrap(name, W)) t(l + "\n");
    t(CMD.BOLD_OFF);

    t(row(`  ${qty} x ${formatRp(price)}`, formatRp(itemTotal)) + "\n");

    if (item.selected_variants?.length) {
      for (const v of item.selected_variants) t(`  + ${v.name}\n`);
    }
    if (item.description) {
      for (const l of wrap(`  Catatan: ${item.description}`, W)) t(l + "\n");
    }
  }

  t(DASH + "\n");

  // ══════════════════════════════════════════════
  // TOTAL
  // ══════════════════════════════════════════════
  if (isTop) {
    t(CMD.BOLD_ON);
    t(row("TOTAL MINUMAN", formatRp(subtotal)) + "\n");
    t(CMD.BOLD_OFF);

  } else {
    t(row("Subtotal", formatRp(trx.price)) + "\n");

    t(row("PPN", formatRp(trx.fee || 0)) + "\n");

    t(LINE + "\n");
    t(CMD.BOLD_ON);
    t(CMD.DOUBLE_HEIGHT_ON);
    t(row("TOTAL", formatRp(trx.total_price)) + "\n");
    t(CMD.DOUBLE_HEIGHT_OFF);
    t(CMD.BOLD_OFF);
    t(LINE + "\n");

    const payMap = {
      manual: "Tunai / Manual",
      cash: "Tunai",
      qris: "QRIS",
      debit: "Kartu Debit",
      credit: "Kartu Kredit",
    };
    t(row("Pembayaran", payMap[trx.payment_type] || trx.payment_type) + "\n");
    t(row("Status", trx.status === "success" ? "LUNAS" : trx.status.toUpperCase()) + "\n");
  }

  // ══════════════════════════════════════════════
  // FOOTER
  // ══════════════════════════════════════════════
  t("\n");
  t(DASH + "\n");
  t(CMD.ALIGN_CENTER);
  t(CMD.BOLD_ON);
  t("Terima kasih!\n");
  t(CMD.BOLD_OFF);
  t("Selamat menikmati :)\n");
  t("\n");
  t(CMD.FEED);
  t(CMD.CUT);

  return Buffer.concat(parts);
}

// ─── Send to Printer ──────────────────────────────────────────────────────────
function sendToPrinter(ip, data) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      client.destroy();
      resolve(result);
    };

    client.setTimeout(PRINTER_TIMEOUT_MS);

    client.connect(PRINTER_PORT, ip, () => {
      // Kirim Buffer langsung (bukan string) agar data binary logo tidak corrupt
      client.write(data, () => {
        setTimeout(() => done({ success: true, message: `Print sent to ${ip}` }), 500);
      });
    });

    client.on("timeout", () => done({ success: false, message: `Timeout connecting to ${ip}` }));
    client.on("error", (e) => done({ success: false, message: `Error on ${ip}: ${e.message}` }));
  });
}

module.exports = { buildReceipt, sendToPrinter };