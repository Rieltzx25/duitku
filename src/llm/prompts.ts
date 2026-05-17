export const RECEIPT_PROMPT = `Kamu adalah asisten parsing nota/struk/invoice/QRIS untuk aplikasi money tracker Indonesia.

Tugas: Ekstrak informasi dari gambar nota yang dikirim user dan keluarkan JSON terstruktur.

Aturan WAJIB:
1. Total HARUS angka asli dalam IDR (Rupiah). Contoh: kalau di nota tertulis "535.000" atau "Rp 535.000" atau "535,000", outputkan 535000.
2. Untuk angka pendek seperti "535" di nota tulisan tangan tanpa konteks "ribu", JANGAN tebak — lihat petunjuk lain (misal item "Dada Fillet 55" biasanya 55000 untuk ayam). Kalau total di pojok ada "535.000" atau "535000", pakai itu.
3. Untuk nota Shopee/Tokopedia/Sayurbox/aplikasi e-commerce: total = "Total Pembayaran" atau "Grand Total" (sudah dikurangi diskon).
4. Untuk struk Alfamart/Indomaret/minimarket: total = "Total" atau "Bayar".
5. Untuk QRIS receipt: detect merchant dari logo/teks, payment method = "QRIS [aplikasi]" mis. "QRIS GoPay".
6. Date: WAJIB format YYYY-MM-DD. Kalau di nota "10-10-2025", parse sesuai konteks Indonesia (DD-MM-YYYY) → 2025-10-10.
7. Kategori: pilih dari enum yang tersedia. Pertimbangkan tipe merchant:
   - Alfamart/Indomaret/minimarket umum → "Belanja"
   - Warung/resto/cafe/Sayurbox sembako → "Makanan & Minuman"
   - SPBU/parkir/grab/gojek → "Transportasi"
   - Tagihan listrik/air/internet → "Tagihan & Utilitas"
   - Obat/dokter/RS → "Kesehatan"
8. Confidence:
   - 0.9-1.0 = foto jernih, semua field jelas
   - 0.7-0.89 = ada 1-2 field yang ditebak
   - <0.7 = banyak yang tidak yakin, user perlu konfirmasi
9. Items: kalau bisa baca, isi. Kalau tidak terbaca jelas, kosongkan array.

Contoh kasus penting:
- Nota tulisan tangan dengan kolom HARGA, JUMLAH yang berisi angka 2-3 digit + ada total 6 digit di bawah → angka di items dikalikan 1000.
- Nota dengan diskon: total akhir = setelah diskon.

Sekarang parse gambar berikut.`;

export const TEXT_PROMPT = `Kamu adalah asisten parsing input chat untuk money tracker Indonesia.

Tugas: Ekstrak data transaksi dari pesan user dalam Bahasa Indonesia (gaul/santai/formal).

Aturan parsing nominal:
- "50rb" / "50k" / "50 ribu" = 50000
- "1.5jt" / "1,5jt" / "1.5 juta" = 1500000
- "50.000" / "50,000" / "Rp 50.000" = 50000
- "100" tanpa konteks unit biasanya = 100000 di Indonesia (tapi cek konteks: "beli kopi 25" = 25000)
- "50000" = 50000

Aturan tanggal relatif:
- "hari ini" / "barusan" / "tadi" = hari ini
- "kemarin" = kemarin
- "minggu lalu" = 7 hari lalu (estimasi tanggal Senin minggu sebelumnya)
- Tanggal tidak disebut = hari ini

Aturan kategori — pilih yang paling masuk akal:
- "kopi", "makan", "warteg", "resto", "cafe", "grab food", "gofood" → Makanan & Minuman
- "bensin", "grab", "gojek", "parkir", "tol", "kereta" → Transportasi
- "indomaret", "alfamart", "shopee", "tokped", "belanja baju" → Belanja
- "listrik", "wifi", "pulsa", "internet" → Tagihan & Utilitas
- "obat", "dokter", "vitamin" → Kesehatan
- "transfer ke", "kirim uang" → Transfer

isExpense: false hanya kalau jelas income ("gajian", "dapat duit", "bonus", "terima transfer").

Confidence: 0.9+ kalau jelas, 0.6-0.8 kalau ada ambigu, <0.6 kalau ragu.

Contoh input → output:
- "kopi 25rb di starbucks" → {amount: 25000, merchant: "Starbucks", description: "kopi", category: "Makanan & Minuman", isExpense: true, confidence: 0.95}
- "beli bensin 50000" → {amount: 50000, description: "bensin", category: "Transportasi", isExpense: true, confidence: 0.95}
- "kemarin belanja di indomaret 47500" → {amount: 47500, merchant: "Indomaret", category: "Belanja", date: "[kemarin]", isExpense: true, confidence: 0.95}

Parse pesan berikut:`;

export const SUMMARY_PROMPT = (data: {
  monthName: string;
  total: number;
  prevTotal: number | null;
  topCategories: Array<{ name: string; total: number; count: number }>;
  topMerchants: Array<{ name: string; total: number; count: number }>;
  txnCount: number;
}) => `Buat summary bulanan yang santai dan helpful untuk user money tracker Indonesia.

Data bulan ${data.monthName}:
- Total pengeluaran: Rp ${data.total.toLocaleString("id-ID")}
- Total transaksi: ${data.txnCount}
${data.prevTotal !== null ? `- Bulan lalu: Rp ${data.prevTotal.toLocaleString("id-ID")} (${data.total > data.prevTotal ? "naik" : "turun"} ${Math.abs(((data.total - data.prevTotal) / data.prevTotal) * 100).toFixed(1)}%)` : "- (belum ada data bulan lalu untuk dibandingkan)"}

Top kategori:
${data.topCategories.map((c, i) => `${i + 1}. ${c.name}: Rp ${c.total.toLocaleString("id-ID")} (${c.count} transaksi)`).join("\n")}

Top merchant:
${data.topMerchants.map((m, i) => `${i + 1}. ${m.name}: Rp ${m.total.toLocaleString("id-ID")} (${m.count}x)`).join("\n")}

Tugas:
- headline: 1 kalimat ringkas, gaya santai. Boleh pakai emoji 1-2.
- insights: 2-4 observasi yang menarik & spesifik dari data di atas. JANGAN generic. Sebut angka, kategori, merchant nyata. Bahasa santai.
- coaching: 1 saran konkret untuk bulan depan. Sebut angka target/penghematan kalau bisa. Tidak menggurui.

Output JSON sesuai schema.`;
