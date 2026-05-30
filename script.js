let inventory = {};
let scanData = JSON.parse(localStorage.getItem('stokOpnameData')) || [];
let petugas = localStorage.getItem('namaPetugas');
let isCameraOn = false;
let isFlashOn = false;
const html5QrCode = new Html5Qrcode("reader");

// Inisialisasi
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

function toggleKamera() {
    const readerDiv = document.getElementById("reader");
    if (!isCameraOn) {
        readerDiv.style.display = "block";
        html5QrCode.start({ facingMode: "environment" }, { fps: 2, qrbox: 250 }, onScanSuccess);
        document.getElementById("toggle-camera-btn").innerText = "Matikan Kamera";
    } else {
        html5QrCode.stop();
        readerDiv.style.display = "none";
        document.getElementById("toggle-camera-btn").innerText = "Aktifkan Kamera";
    }
    isCameraOn = !isCameraOn;
}

let lastScan = "";
function onScanSuccess(decodedText) {
    if (decodedText === lastScan) return;
    lastScan = decodedText;
    setTimeout(() => { lastScan = ""; }, 2000);

    const existingItem = scanData.find(item => item.barcode === decodedText);
    const name = inventory[decodedText] || "Barang Tidak Ditemukan";

    if (existingItem) {
        existingItem.qty += 1;
    } else {
        scanData.push({ barcode: decodedText, nama: name, qty: 1, petugas: petugas, timestamp: new Date().toLocaleString() });
    }
    saveData();
    updateTable();
    document.getElementById("result").innerText = `Terscan: ${name}`;
}

function ubahQty(barcode, delta) {
    const item = scanData.find(i => i.barcode === barcode);
    if (item) {
        item.qty = Math.max(0, item.qty + delta);
        saveData();
        updateTable();
    }
}

function updateTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    scanData.forEach(item => {
        tbody.innerHTML += `<tr>
            <td>${item.nama}<br><small>Kode: ${item.barcode}</small></td>
            <td>
                <button onclick="ubahQty('${item.barcode}', -1)">-</button>
                ${item.qty}
                <button onclick="ubahQty('${item.barcode}', 1)">+</button>
            </td>
        </tr>`;
    });
}

function saveData() { localStorage.setItem('stokOpnameData', JSON.stringify(scanData)); }

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
    if(confirm("Hapus semua data?")) {
        localStorage.removeItem('stokOpnameData');
        localStorage.removeItem('namaPetugas');
        location.reload();
    }
}
