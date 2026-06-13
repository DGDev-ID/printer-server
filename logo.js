/**
 * logo.js
 * Load logo dari file lokal (assets/logo_v2.png),
 * convert ke ESC/POS raster bitmap (GS v 0).
 *
 * Thermal printer 80mm @ 203 DPI → printable width ±576px.
 * Kita pakai 384px supaya logo tidak terlalu besar & tetap tajam.
 */

const path = require("path");
const { Jimp } = require("jimp");

const LOGO_PATH        = path.join(__dirname, "assets", "logo_v2.png");
const LOGO_PRINT_WIDTH = 384; // px — sesuaikan jika ingin lebih besar/kecil

// ── Cache ─────────────────────────────────────────────────────────────────────
let _cache = null;

/**
 * Baca logo dari disk, resize, convert ke ESC/POS GS v 0 raster.
 * Hasilnya di-cache; panggil ulang tidak re-read file.
 *
 * @returns {Promise<Buffer|null>}  null jika file tidak ada / gagal
 */
async function getLogoEscPos() {
  if (_cache) return _cache;

  try {
    const img = await Jimp.read(LOGO_PATH);

    // Hitung tinggi proporsional
    const targetW = LOGO_PRINT_WIDTH;
    const targetH = Math.round((img.height / img.width) * targetW);

    img.resize({ w: targetW, h: targetH });
    img.greyscale();

    // ── Encode raster (1-bit per pixel) ───────────────────────────────────────
    const byteWidth  = Math.ceil(targetW / 8);
    const raster     = [];

    for (let y = 0; y < targetH; y++) {
      for (let bx = 0; bx < byteWidth; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < targetW) {
            const px  = img.getPixelColor(x, y);
            const lum = (px >>> 24) & 0xff;   // red channel = luminance (grayscale)
            if (lum < 180) byte |= (0x80 >> bit); // gelap → cetak
          }
        }
        raster.push(byte);
      }
    }

    // ── GS v 0 header ─────────────────────────────────────────────────────────
    // GS v 0  m  xL xH  yL yH  d1…dk
    // m=0 normal density, xL/xH = byte-width, yL/yH = height
    const xL = byteWidth & 0xff;
    const xH = (byteWidth >> 8) & 0xff;
    const yL = targetH & 0xff;
    const yH = (targetH >> 8) & 0xff;

    const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    const data   = Buffer.from(raster);

    _cache = Buffer.concat([header, data]);
    console.log(`[LOGO] OK — ${targetW}×${targetH}px, ${_cache.length} bytes`);
    return _cache;

  } catch (err) {
    console.warn(`[LOGO] Gagal load logo: ${err.message} — struk tanpa logo`);
    return null;
  }
}

module.exports = { getLogoEscPos };