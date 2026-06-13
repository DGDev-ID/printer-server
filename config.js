module.exports = {
  PORT: 3000,

  PRINTERS: {
    // Printer atas: hanya BEVERAGE
    top: {
      ip: "192.168.1.250",
      label: "Kitchen Printer (Food)",
    },
    // Printer bawah: semua menu
    bottom: {
      ip: "192.168.1.251",
      label: "Cashier Printer (All Items)",
    },
  },

  PRINTER_PORT: 9100,
  PRINTER_TIMEOUT_MS: 3000,

  // Lebar kertas thermal (karakter)
  // 80mm printer = 48 karakter (font standar 12x24)
  PAPER_WIDTH: 48,
};