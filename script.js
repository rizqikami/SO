let inventory = {};
let scanData = JSON.parse(localStorage.getItem('stokOpnameData')) || [];

// 1. Load Database (Hanya ambil kolom 0 dan 1, abaikan kolom 2/kuantitas)
Papa.parse("item.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        results.data.forEach(item => {
            // Mengambil barcode (index 0) dan nama (index 1)
            const keys = Object.keys(item);
            inventory[item[keys[0]]] = item[keys[1]];
        });
        updateTable();
    }
});

// 2. Fungsi Update Tabel UI
function updateTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    scanData.forEach(item => {
        tbody.innerHTML += `<tr><td>${item.nama}</td><td>${item.qty}</td></tr>`;
    });
}

// 3. Setup Scanner
const html5QrCode = new Html5Qrcode("reader");
let isFlashOn = false;

html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
        const existingItem = scanData.find(item => item.barcode === decodedText);
        const name = inventory[decodedText] || "Barang Tidak Ditemukan";

        if (existingItem) {
            existingItem.qty += 1;
        } else {
            scanData.push({ barcode: decodedText, nama: name, qty: 1 });
        }
        
        localStorage.setItem('stokOpnameData', JSON.stringify(scanData));
        document.getElementById("result").innerText = `Terscan: ${name}`;
        updateTable();
    }
);

// 4. Toggle Flash & Export
document.getElementById("flash-btn").addEventListener("click", () => {
    isFlashOn = !isFlashOn;
    html5QrCode.applyVideoConstraints({ advanced: [{ torch: isFlashOn }] });
});

function exportCSV() {
    const csv = Papa.unparse(scanData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "hasil_opname.csv";
    a.click();
}

function resetData() {
    if(confirm("Hapus semua hasil scan?")) {
        localStorage.removeItem('stokOpnameData');
        location.reload();
    }
}
