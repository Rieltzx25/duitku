// JSON Schemas untuk structured output Gemini

export const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["receipt", "qris", "invoice", "handwritten", "unknown"],
      description: "Jenis dokumen yang difoto",
    },
    merchant: {
      type: "string",
      description: "Nama toko/merchant. Contoh: 'Alfamart Budhi Raya', 'Shopee - Beeru Store', 'Toko Koko Binus'. Jika tidak jelas, isi 'Tidak diketahui'.",
    },
    total: {
      type: "number",
      description: "Total akhir yang harus/sudah dibayar dalam IDR. Wajib angka, bukan string. Jika tertulis 535.000 berarti 535000.",
    },
    dateRaw: {
      type: "string",
      description: "Tanggal SEPERTI YANG TERTULIS PERSIS di nota — copy text-nya, JANGAN konversi. Contoh: '10-10-2025', '11.10.25', '07/05/26'. KOSONGKAN ('') kalau tidak ada tanggal di nota. JANGAN tebak.",
    },
    items: {
      type: "array",
      description: "Detail item yang dibeli",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unitPrice: { type: "number", description: "Harga satuan dalam IDR" },
          subtotal: { type: "number", description: "Subtotal dalam IDR" },
        },
        required: ["name"],
      },
    },
    category: {
      type: "string",
      description: "Kategori pengeluaran. WAJIB salah satu dari: Makanan & Minuman, Belanja, Transportasi, Tagihan & Utilitas, Hiburan, Kesehatan, Pendidikan, Investasi & Tabungan, Transfer, Lain-lain",
      enum: [
        "Makanan & Minuman",
        "Belanja",
        "Transportasi",
        "Tagihan & Utilitas",
        "Hiburan",
        "Kesehatan",
        "Pendidikan",
        "Investasi & Tabungan",
        "Transfer",
        "Lain-lain",
      ],
    },
    paymentMethod: {
      type: "string",
      description: "Metode bayar jika terlihat: 'QRIS', 'Debit BCA', 'Cash', 'ShopeePay', 'GoPay', 'Transfer', dll. Kosongkan jika tidak ada.",
    },
    confidence: {
      type: "number",
      description: "Tingkat keyakinan parsing dari 0.0-1.0. Pertimbangkan kejelasan foto dan ketepatan total.",
    },
    notes: {
      type: "string",
      description: "Catatan SINGKAT (max 1 kalimat) tentang masalah parsing NON-tanggal yang perlu user perhatikan. Contoh: 'merchant tidak jelas', 'ada coretan di total', 'multiple transaksi di 1 nota'. DILARANG membahas tanggal di sini — analisis tanggal ditangani sistem.",
    },
  },
  required: ["type", "merchant", "total", "category", "confidence"],
};

export const TEXT_PARSE_SCHEMA = {
  type: "object",
  properties: {
    amount: {
      type: "number",
      description: "Nominal pengeluaran dalam IDR. '50rb' = 50000, '1.5jt' = 1500000, '50.000' = 50000",
    },
    merchant: {
      type: "string",
      description: "Nama toko atau lokasi jika disebutkan. Contoh: 'Indomaret', 'warteg pinggir jalan'. Kosongkan kalau tidak ada.",
    },
    description: {
      type: "string",
      description: "Deskripsi singkat dari apa yang dibeli/dikeluarkan. Contoh: 'kopi sore', 'bensin pertamax'.",
    },
    category: {
      type: "string",
      enum: [
        "Makanan & Minuman",
        "Belanja",
        "Transportasi",
        "Tagihan & Utilitas",
        "Hiburan",
        "Kesehatan",
        "Pendidikan",
        "Investasi & Tabungan",
        "Transfer",
        "Lain-lain",
      ],
    },
    date: {
      type: "string",
      description: "Tanggal transaksi YYYY-MM-DD jika user sebut (mis. 'kemarin', 'tadi siang'). Kosongkan = hari ini.",
    },
    confidence: { type: "number" },
    isExpense: {
      type: "boolean",
      description: "true kalau ini pengeluaran, false kalau pemasukan/income",
    },
  },
  required: ["amount", "category", "confidence", "isExpense"],
};

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "Headline ringkas 1 kalimat tentang bulan ini. Santai, friendly.",
    },
    insights: {
      type: "array",
      description: "2-4 insight cerdas yang actionable. Tidak generic. Bahasa santai.",
      items: { type: "string" },
    },
    coaching: {
      type: "string",
      description: "1 saran kongkret untuk bulan depan. Spesifik angka kalau bisa.",
    },
  },
  required: ["headline", "insights", "coaching"],
};

export interface ParsedReceipt {
  type: "receipt" | "qris" | "invoice" | "handwritten" | "unknown";
  merchant: string;
  total: number;
  dateRaw?: string; // raw text dari nota — code yang interpret
  items?: Array<{ name: string; qty?: number; unitPrice?: number; subtotal?: number }>;
  category: string;
  paymentMethod?: string;
  confidence: number;
  notes?: string;
}

export interface ParsedText {
  amount: number;
  merchant?: string;
  description?: string;
  category: string;
  date?: string;
  confidence: number;
  isExpense: boolean;
}

export interface SummaryNarrative {
  headline: string;
  insights: string[];
  coaching: string;
}
