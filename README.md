# 🖨️ Print Server

Server untuk cetak struk thermal menggunakan ESC/POS via TCP/IP.

## Struktur Project

```
print-server/
├── index.js      # Express server + endpoint
├── printer.js    # ESC/POS builder & TCP sender
├── config.js     # Konfigurasi IP printer & port
└── package.json
```

## Setup & Jalankan

```bash
npm install
npm start
# atau mode dev (auto-restart saat file berubah):
npm run dev
```

Server berjalan di: `http://localhost:3000`

---

## Konfigurasi Printer (`config.js`)

| Printer | IP Default    | Fungsi                  |
|---------|---------------|-------------------------|
| Top     | 192.168.1.250 | BEVERAGE only           |
| Bottom  | 192.168.1.251 | Semua menu (all items)  |

Ubah IP di `config.js` jika perlu.

---

## Endpoints

### `GET /health`
Cek status server dan konfigurasi printer.

**Response:**
```json
{
  "status": "ok",
  "server": "Print Server",
  "printers": {
    "top": { "ip": "192.168.1.250", "label": "Kitchen Printer (Beverage)" },
    "bottom": { "ip": "192.168.1.251", "label": "Cashier Printer (All Items)" }
  }
}
```

---

### `POST /print`
Kirim ke **kedua printer** sekaligus.

- **Top printer** hanya mencetak item dengan `menu_type: "BEVERAGE"`
- **Bottom printer** mencetak semua item + total + info pembayaran

**Request Body:** Transaction JSON dari sistem.

**Response sukses (200):**
```json
{
  "success": true,
  "transaction_id": 880,
  "unique_code": "TRXVGWWBEOWUB1781329755",
  "printers": {
    "top": { "success": true, "message": "Print sent to 192.168.1.250" },
    "bottom": { "success": true, "message": "Print sent to 192.168.1.251" }
  }
}
```

**Response partial (207)** jika salah satu printer gagal:
```json
{
  "success": false,
  "printers": {
    "top": { "success": false, "message": "Timeout connecting to 192.168.1.250" },
    "bottom": { "success": true, "message": "Print sent to 192.168.1.251" }
  }
}
```

---

### `POST /print/top`
Kirim **hanya ke printer atas** (BEVERAGE only).

### `POST /print/bottom`
Kirim **hanya ke printer bawah** (semua item).

---

## Testing di Postman

1. Method: `POST`
2. URL: `http://localhost:3000/print`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON): paste transaction data dari sistem

### Contoh Body:
```json
{
  "id": 880,
  "unique_code": "TRXVGWWBEOWUB1781329755",
  "cafe_id": 1,
  "cust_name": "Kak Aan",
  "price": "8000.00",
  "fee": "0.00",
  "total_price": "8000.00",
  "payment_type": "manual",
  "status": "success",
  "created_at": "2026-06-13T05:49:15.000000Z",
  "cafe": {
    "id": 1,
    "name": "ARLETTA CAFE NGALIYAN",
    "address": "GANG KELAPA GADING RT 02 RW 01, WATES, NGALIYAN, JAWA TENGAH"
  },
  "table": { "id": 21, "name": "Meja 18" },
  "details": [
    {
      "id": 1796,
      "transaction_id": 880,
      "menu_id": 55,
      "amount": 1,
      "price": "8000.00",
      "description": null,
      "selected_variants": [],
      "menu": {
        "id": 55,
        "name": "ICE TEA",
        "price": "8000.00",
        "menu_type": "BEVERAGE"
      }
    }
  ]
}
```

---

## Format Struk

### Printer Atas (Top - Beverage)
```
================================
    ARLETTA CAFE NGALIYAN
  GANG KELAPA GADING RT 02 RW
   01, WATES, NGALIYAN, JAWA
           TENGAH

No:           OWUB1781329755
Tanggal:   13/06/2026, 12.49
Meja:              Meja 18
Pelanggan:         Kak Aan
    [ MINUMAN / BEVERAGE ]
================================
ICE TEA
  1 x Rp 8.000         Rp 8.000
--------------------------------
Total Minuman:         Rp 8.000

     Terima kasih!
    Selamat menikmati :)
```

### Printer Bawah (Bottom - Semua Menu)
Sama seperti atas, ditambah:
- Total + fee (jika ada)
- Info pembayaran & status
