const express = require("express");
const { PRINTERS, PORT } = require("./config");
const { buildReceipt, sendToPrinter } = require("./printer");

const app = express();
app.use(express.json());

// ─── Validation helper ────────────────────────────────────────────────────────
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
  const err = validateTrx(req.body);
  if (err) return res.status(400).json({ success: false, message: err });

  const trx     = req.body;
  const results = {};

  // Build receipt kedua printer secara paralel
  const [topReceipt, bottomReceipt] = await Promise.all([
    buildReceipt(trx, "top"),
    buildReceipt(trx, "bottom"),
  ]);

  if (topReceipt) {
    console.log(`[PRINT] TOP    → ${PRINTERS.top.ip}`);
    results.top = await sendToPrinter(PRINTERS.top.ip, topReceipt);
  } else {
    results.top = { success: false, message: "Tidak ada item BEVERAGE." };
  }

  if (bottomReceipt) {
    console.log(`[PRINT] BOTTOM → ${PRINTERS.bottom.ip}`);
    results.bottom = await sendToPrinter(PRINTERS.bottom.ip, bottomReceipt);
  } else {
    results.bottom = { success: false, message: "Tidak ada item untuk dicetak." };
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
// POST /print/top      →  Hanya printer atas (BEVERAGE)
// POST /print/bottom   →  Hanya printer bawah (semua menu)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/print/:target", async (req, res) => {
  const { target } = req.params;

  if (!["top", "bottom"].includes(target)) {
    return res.status(404).json({
      success: false,
      message: "Endpoint tidak ditemukan. Gunakan /print/top atau /print/bottom",
    });
  }

  const err = validateTrx(req.body);
  if (err) return res.status(400).json({ success: false, message: err });

  const trx     = req.body;
  const receipt = await buildReceipt(trx, target);

  if (!receipt) {
    return res.status(200).json({
      success: false,
      message: target === "top"
        ? "Tidak ada item BEVERAGE untuk dicetak."
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
      top:    PRINTERS.top,
      bottom: PRINTERS.bottom,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🖨️  Print Server running on http://localhost:${PORT}`);
  console.log(`   TOP    → ${PRINTERS.top.ip}  (BEVERAGE only)`);
  console.log(`   BOTTOM → ${PRINTERS.bottom.ip}  (All items)`);
  console.log(`\nEndpoints:`);
  console.log(`   POST /print          → kedua printer`);
  console.log(`   POST /print/top      → printer atas (beverage)`);
  console.log(`   POST /print/bottom   → printer bawah (semua menu)`);
  console.log(`   GET  /health         → status server\n`);
});