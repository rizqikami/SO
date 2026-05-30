let inventory = {};
let scanData = JSON.parse(localStorage.getItem('stokOpnameData')) || [];
let petugas = localStorage.getItem('namaPetugas');

// Inisialisasi Nama Petugas
if (!petugas) {
    petugas = prompt("Masukkan nama petugas stok opname:") || "Anonim";
    localStorage.setItem('namaPetugas', petugas);
}
document.getElementById("petugas-info").innerText = "Petugas: " + petugas;

// Load database item.csv
Papa.parse("item.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        results.data.forEach(item => {
            const keys = Object.keys(item);
            inventory[item[keys[0]]] = item[keys[1]];
        });
        updateTable();
    }
});

function updateTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    scanData.forEach(item => {
        tbody.innerHTML += `<tr><td>${item.nama}</td><td>${item.qty}</td></tr>`;
    });
}

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
            existingItem.timestamp = new Date().toLocaleString();
        } else {
            scanData.push({ 
                barcode: decodedText, 
                nama: name, 
                qty: 1, 
                petugas: petugas, 
                timestamp: new Date().toLocaleString() 
            });
        }
        
        localStorage.setItem('stokOpnameData', JSON.stringify(scanData));
        document.getElementById("result").innerText = `Terscan: ${name}`;
        updateTable();
    }
);

document.getElementById("flash-btn").addEventListener("click", () => {
    isFlashOn = !isFlashOn;
    html5QrCode.applyVideoConstraints({ advanced: [{ torch: isFlashOn }] });
});

function exportCSV() {
    const csv = Papa.unparse(scanData);
    const blob = new Blob([`Petugas: ${petugas}\n` + csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StokOpname_${petugas}_${new Date().toLocaleDateString()}.csv`;
    a.click();
}

function resetData() {
    if(confirm("Hapus semua hasil scan?")) {
        localStorage.removeItem('stokOpnameData');
        localStorage.removeItem('namaPetugas');
        location.reload();
    }
}
