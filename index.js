const express = require("express");
const { PRINTERS, PORT } = require("./config");
const { buildReceipt, sendToPrinter } = require("./printer");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({
  origin: "https://dashboard-cafe.arlettaluxury.com",
}));

// ─── Normalize & Validate ─────────────────────────────────────────────────────

/**
 * Normalisasi 3 format input yang mungkin masuk:
 *
 * Format A — transaksi final (format asli):
 *   { id, unique_code, details: [...], cafe, table, ... }
 *
 * Format B — single detail item (dari endpoint detail):
 *   { id, transaction_id, menu, transaction: { cafe, table, ... } }
 *
 * Format C — array detail items:
 *   [{ transaction_id, menu, transaction: {...} }, ...]
 */
function normalizeTrx(body) {
  // Format C: array of detail items
  if (Array.isArray(body) && body.length > 0 && body[0].transaction && !body[0].details) {
    const trx = { ...body[0].transaction };
    trx.details = body.map(normalizeDetailItem);
    trx.is_pending_detail_print = true;
    return trx;
  }

  // Format B: single detail item
  if (body && body.transaction && body.transaction_id && !body.details) {
    const trx = { ...body.transaction };
    trx.details = [normalizeDetailItem(body)];
    trx.is_pending_detail_print = true;
    return trx;
  }

  // Format A: sudah lengkap, pastikan details punya field menu yang benar
  if (body && body.details) {
    body.details = body.details.map(normalizeDetailItem);
  }

  return body;
}

/**
 * Pastikan setiap item di details punya struktur menu yang konsisten.
 * Format B/C kadang punya `menu` di root item, bukan di dalam detail.
 */
function normalizeDetailItem(item) {
  // Sudah punya menu → tidak perlu apa-apa
  if (item.menu) return item;
  return item;
}

function validateTrx(trx) {
  if (!trx || !trx.id || !trx.details || !Array.isArray(trx.details)) {
    return "Invalid transaction data. Pastikan field id dan details ada.";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /print  →  Kedua printer sekaligus
// ─────────────────────────────────────────────────────────────────────────────
app.post("/print", async (req, res) => {
  const trx = normalizeTrx(req.body);
  const err = validateTrx(trx);
  if (err) return res.status(400).json({ success: false, message: err });

  const results = {};

  const [topReceipt, bottomReceipt] = await Promise.all([
    buildReceipt(trx, "top"),
    buildReceipt(trx, "bottom"),
  ]);

  if (topReceipt) {
    console.log(`[PRINT] TOP    → ${PRINTERS.top.ip}`);
    results.top = await sendToPrinter(PRINTERS.top.ip, topReceipt);
  } else {
    results.top = { success: true, message: "Dilewati: tidak ada item FOOD pada transaksi ini." };
  }

  if (bottomReceipt) {
    console.log(`[PRINT] BOTTOM → ${PRINTERS.bottom.ip}`);
    results.bottom = await sendToPrinter(PRINTERS.bottom.ip, bottomReceipt);
  } else {
    results.bottom = { success: true, message: "Dilewati: tidak ada item untuk dicetak." };
  }

  const allSuccess = results.top.success && results.bottom.success;
  return res.status(200).json({
    success: allSuccess,
    transaction_id: trx.id,
    unique_code: trx.unique_code,
    printers: results,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /print/top    →  Hanya printer atas (FOOD)
// POST /print/bottom →  Hanya printer bawah (semua menu)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/print/:target", async (req, res) => {
  const { target } = req.params;

  if (!["top", "bottom"].includes(target)) {
    return res.status(404).json({
      success: false,
      message: "Endpoint tidak ditemukan. Gunakan /print/top atau /print/bottom",
    });
  }

  const trx = normalizeTrx(req.body);
  const err = validateTrx(trx);
  if (err) return res.status(400).json({ success: false, message: err });

  const receipt = await buildReceipt(trx, target);

  if (!receipt) {
    return res.status(200).json({
      success: false,
      message: target === "top"
        ? "Tidak ada item FOOD untuk dicetak."
        : "Tidak ada item untuk dicetak.",
    });
  }

  const printer = PRINTERS[target];
  console.log(`[PRINT] ${target.toUpperCase()} → ${printer.ip}`);
  const result = await sendToPrinter(printer.ip, receipt);

  return res.status(200).json({
    success: result.success,
    target,
    printer_ip: printer.ip,
    transaction_id: trx.id,
    message: result.message,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "Print Server",
    printers: {
      top: PRINTERS.top,
      bottom: PRINTERS.bottom,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🖨️  Print Server running on http://localhost:${PORT}`);
  console.log(`   TOP    → ${PRINTERS.top.ip}  (FOOD only)`);
  console.log(`   BOTTOM → ${PRINTERS.bottom.ip}  (All items)`);
  console.log(`\nEndpoints:`);
  console.log(`   POST /print          → kedua printer`);
  console.log(`   POST /print/top      → printer atas (food)`);
  console.log(`   POST /print/bottom   → printer bawah (semua menu)`);
  console.log(`   GET  /health         → status server\n`);
});
