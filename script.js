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

async function toggleKamera() {
    const readerDiv = document.getElementById("reader");
    if (!isCameraOn) {
        readerDiv.style.display = "block";
        await html5QrCode.start({ facingMode: "environment" }, { fps: 2, qrbox: 250 }, onScanSuccess);
        document.getElementById("toggle-camera-btn").innerText = "Matikan Kamera";
    } else {
        await html5QrCode.stop();
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

    const name = inventory[decodedText] || "Barang Tidak Ditemukan";
    
    // Simpan setiap scan sebagai baris baru
    scanData.push({ 
        barcode: decodedText, 
        nama: name, 
        qty: 1, 
        petugas: petugas, 
        timestamp: new Date().toLocaleTimeString() 
    });
    
    saveData();
    updateTable();
    document.getElementById("result").innerText = `Terscan: ${name}`;
}

function updateTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    // Scan terbaru muncul di atas
    [...scanData].reverse().forEach(item => {
        tbody.innerHTML += `<tr>
            <td>${item.nama}<br><small>${item.barcode} | ${item.timestamp}</small></td>
            <td>${item.qty}</td>
        </tr>`;
    });
}

function saveData() { localStorage.setItem('stokOpnameData', JSON.stringify(scanData)); }

document.getElementById("flash-btn").addEventListener("click", () => {
    isFlashOn = !isFlashOn;
    html5QrCode.applyVideoConstraints({ advanced: [{ torch: isFlashOn }] });
});

function exportCSV() {
    const formattedData = scanData.map(item => ({
        "Kode Barang": "'" + item.barcode, 
        "Nama Barang": item.nama,
        "Kuantitas": item.qty,
        "Petugas": item.petugas,
        "Waktu Scan": item.timestamp
    }));

    const csv = Papa.unparse(formattedData);
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
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
