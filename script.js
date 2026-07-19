let inventory = {};
let scanData = JSON.parse(localStorage.getItem('stokOpnameData')) || [];
let isCameraOn = false;
let isFlashOn = false;
let isCooldown = false; // Flag untuk delay scan 10 detik
let cooldownTimer = null;
const html5QrCode = new Html5Qrcode("reader");

// 1. Inisialisasi Petugas Sesi SO
function cekPetugas() {
    let nama = localStorage.getItem('namaPetugas');
    if (!nama) {
        nama = prompt("Masukkan nama petugas Stok Opname (SO):") || "";
        nama = nama.trim();
        if (!nama) nama = "Anonim";
        localStorage.setItem('namaPetugas', nama);
    }
    document.getElementById("petugas-info").innerText = "Petugas: " + nama;
    return nama;
}
let petugas = cekPetugas();

// 2. Load Database Master Data (Aman dari Pergeseran Kolom / Urutan Header)
Papa.parse("item.csv", {
    download: true, 
    header: true, 
    skipEmptyLines: true,
    complete: function(results) {
        results.data.forEach(item => {
            // Memanggil langsung nama header secara eksplisit demi akurasi data
            const kode = item["Kode Barang"] ? item["Kode Barang"].trim() : null;
            const nama = item["Nama Barang"] ? item["Nama Barang"].trim() : null;
            if (kode && nama) {
                inventory[kode] = nama;
            }
        });
        updateTable();
    },
    error: function(err) {
        console.error("Gagal memuat file item.csv. Pastikan file tersedia di folder yang sama.", err);
    }
});

// 3. Kendali Kamera (FPS ditingkatkan agar pembacaan mulus)
async function toggleKamera() {
    const readerDiv = document.getElementById("reader");
    if (!isCameraOn) {
        readerDiv.style.display = "block";
        // FPS dinaikkan ke 12 agar tracking kamera responsif di handphone
        await html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 12, qrbox: 250 }, 
            onScanSuccess
        );
        document.getElementById("toggle-camera-btn").innerText = "Matikan Kamera";
        document.getElementById("toggle-camera-btn").style.backgroundColor = "#d50000";
    } else {
        await html5QrCode.stop();
        readerDiv.style.display = "none";
        document.getElementById("toggle-camera-btn").innerText = "Aktifkan Kamera";
        document.getElementById("toggle-camera-btn").style.backgroundColor = "#00838f";
    }
    isCameraOn = !isCameraOn;
}

// Handler saat Kamera Berhasil Membaca Barcode
function onScanSuccess(decodedText) {
    if (isCooldown) return; // Abaikan jika masih dalam masa jeda 10 detik

    const barcode = decodedText.trim();
    const name = inventory[barcode];

    // FILTER: Jika barang TIDAK ditemukan di item.csv, abaikan (catat manual di kertas)
    if (!name) {
        document.getElementById("result").innerHTML = `<span style="color: #d50000;">⚠️ [${barcode}] Tak Ditemukan! Catat di kertas.</span>`;
        triggerCooldown(false, barcode); 
        return;
    }

    // Jika valid, masukkan ke tabel data
    tambahBarang(barcode, name);
    triggerCooldown(true, name);
}

// Fungsi Jeda (Cooldown) Scan Selama 10 Detik dengan Indikator Hitung Mundur
function triggerCooldown(isItemFound, itemLabel) {
    isCooldown = true;
    let sisaWaktu = 10;
    const resultDiv = document.getElementById("result");

    cooldownTimer = setInterval(() => {
        sisaWaktu--;
        if (sisaWaktu <= 0) {
            clearInterval(cooldownTimer);
            isCooldown = false;
            resultDiv.innerHTML = "Kamera Siap... Arahkan ke Barcode";
        } else {
            if (isItemFound) {
                resultDiv.innerHTML = `<span style="color: #00c853;">✔️ Terscan: ${itemLabel}</span><br><span style="color: #ff6d00;">Jeda Kamera: ${sisaWaktu} detik... (Hitung Fisik Sekarang)</span>`;
            } else {
                resultDiv.innerHTML = `<span style="color: #d50000;">⚠️ [${itemLabel}] Tak Ditemukan!</span><br><span style="color: #ff6d00;">Jeda Kamera: ${sisaWaktu} detik...</span>`;
            }
        }
    }, 1000);
}

// 4. Logika Penambahan Barang & Update Terkini
function tambahBarang(barcode, name) {
    // Kunci semua riwayat scan sebelumnya
    scanData.forEach(item => item.isLocked = true);

    const existing = scanData.find(i => i.barcode === barcode);
    const waktuSekarang = new Date().toLocaleTimeString('id-ID');

    if (existing) {
        existing.isLocked = false; // Buka kunci khusus item aktif ini
        existing.qty += 1;
        existing.timestamp = waktuSekarang; // Update waktu ke ketukan terbaru
    } else {
        scanData.push({ 
            barcode: barcode, 
            nama: name, 
            qty: 1, 
            petugas: petugas, 
            timestamp: waktuSekarang,
            isLocked: false 
        });
    }
    saveData();
    updateTable();
}

// 5. Update Tabel (Data Terbaru & Unlocked Berada di Paling Atas)
function updateTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = ""; 
    
    const activeData = scanData.filter(item => item.qty > 0);
    const uniqueBarcodes = [...new Set(activeData.map(item => item.barcode))];
    
    // Urutkan: isLocked = false (Item yang baru di-scan) diletakkan paling atas tabel
    const sortedData = [...activeData].sort((a, b) => a.isLocked - b.isLocked);

    let htmlRows = []; // Optimasi DOM: Menghindari penurunan performa/lag di HP

    sortedData.forEach((item) => {
        const nomorUrut = uniqueBarcodes.indexOf(item.barcode) + 1;
        const isFirst = activeData.findIndex(d => d.barcode === item.barcode) === activeData.indexOf(item);
        
        const rowBg = item.isLocked ? 'style="background: #e8f5e9;"' : 'style="background: #fff9c4; font-weight: bold;"';
        const lockIcon = item.isLocked ? "🔒" : "🔓";
        const disabledAttr = item.isLocked ? 'disabled' : '';
        const underlineStyle = item.isLocked ? 'none' : 'underline';
        
        htmlRows.push(`<tr ${rowBg}>
            <td>
                ${isFirst ? "<b>" + nomorUrut + ".</b>" : ""} ${item.nama}
                <br><small style="color: #555;">${item.barcode} | ${item.timestamp}</small>
            </td>
            <td style="text-align: center; white-space: nowrap;">
                <button onclick="ubahQty('${item.barcode}', -1)" ${disabledAttr}>-</button>
                <span onclick="!${item.isLocked} && editManual('${item.barcode}')" style="cursor:pointer; font-size: 1.1em; padding: 0 5px; text-decoration: ${underlineStyle};">${item.qty}</span>
                <button onclick="ubahQty('${item.barcode}', 1)" ${disabledAttr}>+</button>
                <button onclick="toggleLock('${item.barcode}')" style="margin-left:5px; background: none; border: none;">${lockIcon}</button>
            </td>
        </tr>`);
    });

    tbody.innerHTML = htmlRows.join(''); // Render sekaligus ke layar agar anti-lag
}

function toggleLock(barcode) {
    const item = scanData.find(i => i.barcode === barcode);
    if (item) {
        item.isLocked = !item.isLocked;
        saveData();
        updateTable();
    }
}

function ubahQty(barcode, delta) {
    const item = scanData.find(i => i.barcode === barcode && !i.isLocked);
    if (item) {
        item.qty = Math.max(0, item.qty + delta);
        saveData();
        updateTable();
    }
}

function editManual(barcode) {
    const item = scanData.find(i => i.barcode === barcode && !i.isLocked);
    if (item) {
        const newQty = prompt(`Ubah kuantitas untuk:\n${item.nama}`, item.qty);
        if (newQty !== null && !isNaN(newQty) && newQty.trim() !== "") {
            item.qty = parseInt(newQty);
            saveData();
            updateTable();
        }
    }
}

// 6. Pencarian Manual Ganda (Bisa Cari Nama ATAU Kode Barang) + Fitur Debounce & Wildcard (%)
let debounceTimeout;
function cariBarang(query) {
    // Terapkan debounce 300ms agar HP tidak lag saat mengetik cepat
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        eksekusiPencarian(query);
    }, 300);
}

function eksekusiPencarian(query) {
    const resultsDiv = document.getElementById("search-results");
    resultsDiv.innerHTML = "";
    
    const queryTrimmed = query.trim();
    if (queryTrimmed.length < 3) return;

    let regex;
    // Jika mengandung karakter '%', ubah menjadi regex wildcard (contoh: buku%tulis -> buku.*tulis)
    if (queryTrimmed.includes('%')) {
        const escapedQuery = queryTrimmed.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"); // Escape karakter regex sensitif
        const wildcardRule = "^" + escapedQuery.replace(/%/g, ".*");
        regex = new RegExp(wildcardRule, "i");
    } else {
        // Jika pencarian normal, cari teks di mana saja (partial match)
        regex = new RegExp(queryTrimmed.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), "i");
    }
    
    // Pencarian memeriksa kecocokan regex di Nama Barang ATAU Kode Barang
    const filtered = Object.entries(inventory).filter(([code, name]) => 
        regex.test(name) || regex.test(code)
    );

    // Batasi hasil pencarian maksimal 20 item agar HP tidak nge-lag saat merender list
    const maxResults = filtered.slice(0, 20);

    maxResults.forEach(([code, name]) => {
        const btn = document.createElement("button");
        btn.innerHTML = `📄 <b>${code}</b> - ${name}`;
        btn.onclick = () => {
            tambahBarang(code, name);
            resultsDiv.innerHTML = "";
            // Coba deteksi ID input pencarian yang valid di HTML
            const inputSearch = document.getElementById("manual-search") || document.getElementById("searchItem");
            if (inputSearch) inputSearch.value = "";
            
            document.getElementById("result").innerHTML = `Terpilih manual: ${name}`;
        };
        resultsDiv.appendChild(btn);
    });

    // Indikator jika barang yang cocok terlalu banyak di database CSV
    if (filtered.length > 20) {
        const info = document.createElement("small");
        info.style.color = "#777";
        info.style.display = "block";
        info.style.padding = "5px";
        info.innerText = `...dan ${filtered.length - 20} barang lainnya. Persempit pencarian Anda.`;
        resultsDiv.appendChild(info);
    }
}

function saveData() { 
    localStorage.setItem('stokOpnameData', JSON.stringify(scanData)); 
}

// Kontrol Flashlight Kamera
document.getElementById("flash-btn").addEventListener("click", () => {
    isFlashOn = !isFlashOn;
    html5QrCode.applyVideoConstraints({ advanced: [{ torch: isFlashOn }] }).catch(err => {
        console.log("Flashlight tidak didukung di perangkat ini.");
    });
});

// 7. Ekspor CSV dengan Tanggal Standar & Nama File Unik (Anti Overwrite)
function exportCSV() {
    if (scanData.length === 0) {
        alert("Tidak ada data hasil SO yang bisa diekspor.");
        return;
    }

    const sekarang = new Date();
    
    // Standarisasi format tanggal internasional: YYYY-MM-DD (Aman untuk Excel / Accurate)
    const yyyy = sekarang.getFullYear();
    const mm = String(sekarang.getMonth() + 1).padStart(2, '0');
    const dd = String(sekarang.getDate()).padStart(2, '0');
    const tanggalFormatted = `${yyyy}-${mm}-${dd}`;

    // Format penanda waktu presisi: HHMMSS (Jam-Menit-Detik) untuk menghindari duplicate/overwrite file
    const jam = String(sekarang.getHours()).padStart(2, '0');
    const menit = String(sekarang.getMinutes()).padStart(2, '0');
    const detik = String(sekarang.getSeconds()).padStart(2, '0');
    const waktuFormatted = `${jam}${menit}${detik}`;
    
    const formattedData = scanData.map(item => ({
        "Kode Barang": "'" + item.barcode, // Tanda petik tunggal agar kode berawalan angka 0 tidak hilang di Excel
        "Nama Barang": item.nama,
        "Kuantitas": item.qty,
        "Tanggal": tanggalFormatted,
        "Waktu": item.timestamp,
        "Petugas": item.petugas
    }));
    
    const csv = Papa.unparse(formattedData);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url; 
    // Format Nama File Akhir: StokOpname_[NamaPetugas]_[YYYYMMDD]_[HHMMSS].csv
    a.download = `StokOpname_${petugas}_${yyyy}${mm}${dd}_${waktuFormatted}.csv`; 
    a.click();

    // ALUR PENGAMANAN: Konfirmasi dua arah pasca ekspor sebelum melakukan auto-reset otomatis
    setTimeout(() => {
        const konfirmasiReset = confirm(
            "Sistem sedang memproses unduhan file CSV.\n\n" +
            "APAKAH FILE TERSEBUT SUDAH PASTI BERHASIL TERUNDUH DI HP ANDA?\n\n" +
            "Jika Anda menekan 'OK', sistem akan otomatis me-reset semua hitungan data lapangan dan menghapus nama petugas saat ini."
        );
        if (konfirmasiReset) {
            eksekusiResetSistem();
        }
    }, 1500); // Diberi jeda singkat agar unduhan file berjalan terlebih dahulu
}

// Fungsi Tombol Kontrol Reset Manual
function resetDataManual() {
    if(confirm("Apakah Anda yakin ingin menghapus paksa seluruh hasil scan dan nama petugas?")) {
        eksekusiResetSistem();
    }
}

// Inti Eksekusi Pembersihan Data & Reset Sesi Sesuai SOP
function eksekusiResetSistem() {
    if (isCameraOn) {
        html5QrCode.stop().catch(() => {});
    }
    localStorage.removeItem('stokOpnameData');
    localStorage.removeItem('namaPetugas');
    setTimeout(() => { 
        location.reload(); 
    }, 200);
}
