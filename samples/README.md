# Sample Receipts

Folder ini buat naruh contoh nota/struk untuk testing parser.

## Karakteristik nota yang sudah dipertimbangkan di prompt Gemini:

1. **Nota tulisan tangan** (mis. toko ayam "Koko Binus")
   - Format: kolom Banyaknya / Nama Barang / Harga / Jumlah
   - Angka pendek (mis. 55, 50) di kolom harga = ribuan (55.000, 50.000)
   - Total akhir biasanya ditulis lengkap di bawah: `535.000`
   - Tanggal format DD-MM-YYYY (10-10-2025 = 10 Oktober 2025)

2. **Struk thermal minimarket** (Alfamart, Indomaret, dll)
   - Header: nama toko + alamat + NPWP
   - Item dengan kode barang + kuantitas + harga
   - Field "Total Item", "Total", "Tunai/Debit"
   - Payment method jelas (Cash, Debit BCA, QRIS, dll)

3. **Struk thermal warung/grocery** (Tokem, dll)
   - Mirip minimarket tapi lebih sederhana
   - Sering ada diskon, pembulatan
   - Total akhir = field "Total" / "Bayar"

4. **Invoice e-commerce digital** (Sayurbox, Tokopedia, dll)
   - PDF/screenshot dengan logo merchant
   - Item dengan kode, qty, price, subtotal
   - Discount, Delivery Fee, Service Fee
   - Grand Total = total final

5. **Receipt e-payment / QRIS** (Shopee, GoPay, OVO, DANA, dll)
   - Logo aplikasi pembayaran
   - Merchant name + alamat
   - Subtotal, biaya layanan, diskon, voucher
   - Total Pembayaran final

## Cara test:

Setelah bot deploy, kirim foto nota apapun ke bot. Hasil parsing akan tampil dalam pesan konfirmasi dengan emoji confidence:
- ✅ = confidence ≥ 0.85 (parsing sangat yakin)
- ⚠️ = confidence 0.7-0.85 (cek lagi ya)
- ❓ = confidence < 0.7 (besar kemungkinan ada error)

Kalau ada hasil yang salah, klik tombol **Edit Nominal** / **Pindah Kategori** / **Hapus**.
