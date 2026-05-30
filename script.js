let inventory = {};
let scanData = JSON.parse(localStorage.getItem('stokOpnameData')) || [];
let isCameraOn = false;
let isFlashOn = false;
const html5QrCode = new Html5Qrcode("reader");

// 1. Inisialisasi Petugas
function cekPetugas() {
    let nama = localStorage.getItem('namaPetugas');
    if (!nama) {
        nama = prompt("Masukkan nama petugas:") || "Anonim";
        localStorage.setItem('namaPetugas', nama);
    }
    document.getElementById("petugas-info").innerText = "Petugas: " + nama;
    return nama;
}
let petugas = cekPetugas();

// 2. Load Database
Papa.parse("item.csv", {
    download: true, header: true, skipEmptyLines: true,
    complete: function(results) {
        results.data.forEach(item => {
            const keys = Object.keys(item);
            inventory[item[keys[0]]] = item[keys[1]];
        });
        updateTable();
    }
});

// 3. Fungsi Kamera
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

function onScanSuccess(decodedText) {
    const name = inventory[decodedText] || "Barang Tidak Ditemukan";
    tambahBarang(decodedText, name);
}

function tambahBarang(barcode, name) {
    scanData.push({ 
        barcode: barcode, nama: name, qty: 1, 
        petugas: petugas, timestamp: new Date().toLocaleTimeString(),
        isLocked: false 
    });
    saveData();
    updateTable();
    document.getElementById("result").innerText = `Terscan: ${name}`;
}

// 4. Update Tabel dengan Fitur Gembok
function updateTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    
    // Urutan: Barang yang belum dikunci di atas, dikunci di bawah
    const sortedData = [...scanData].sort((a, b) => a.isLocked - b.isLocked);
    const uniqueBarcodes = [...new Set(scanData.map(item => item.barcode))];

    sortedData.reverse().forEach((item) => {
        const nomorUrut = uniqueBarcodes.indexOf(item.barcode) + 1;
        const isFirst = scanData.findIndex(d => d.barcode === item.barcode) === scanData.indexOf(item);
        
        const style = item.isLocked ? 'style="background: #e8f5e9;"' : '';
        const lockIcon = item.isLocked ? "🔒" : "🔓";
        
        tbody.innerHTML += `<tr ${style}>
            <td>${isFirst ? "<b>" + nomorUrut + ".</b>" : ""} ${item.nama}<br><small>${item.barcode} | ${item.timestamp}</small></td>
            <td>
                <button onclick="ubahQty('${item.barcode}', -1)" ${item.isLocked ? 'disabled' : ''}>-</button>
                <span onclick="!${item.isLocked} && editManual('${item.barcode}')" style="cursor:pointer; font-weight:bold; text-decoration:${item.isLocked ? 'none' : 'underline'};">${item.qty}</span>
                <button onclick="ubahQty('${item.barcode}', 1)" ${item.isLocked ? 'disabled' : ''}>+</button>
                <button onclick="toggleLock('${item.barcode}')" style="margin-left:5px;">${lockIcon}</button>
            </td>
        </tr>`;
    });
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
        const newQty = prompt("Masukkan jumlah kuantitas:", item.qty);
        if (newQty !== null && !isNaN(newQty)) {
            item.qty = parseInt(newQty);
            saveData();
            updateTable();
        }
    }
}

// 5. Pencarian Manual (Drop-Up)
function cariBarang(query) {
    const resultsDiv = document.getElementById("search-results");
    resultsDiv.innerHTML = "";
    if (query.length < 3) return;
    if(isCameraOn) toggleKamera();

    const filtered = Object.entries(inventory).filter(([code, name]) => 
        name.toLowerCase().includes(query.toLowerCase())
    );
    filtered.forEach(([code, name]) => {
        const btn = document.createElement("button");
        btn.innerText = name;
        btn.onclick = () => {
            tambahBarang(code, name);
            resultsDiv.innerHTML = "";
            document.getElementById("manual-search").value = "";
        };
        resultsDiv.appendChild(btn);
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
    a.href = url; a.download = `StokOpname_${petugas}.csv`; a.click();
}

function resetData() {
    if(confirm("Hapus semua hasil scan dan reset nama petugas?")) {
        localStorage.removeItem('stokOpnameData');
        localStorage.removeItem('namaPetugas');
        setTimeout(() => { location.reload(); }, 100);
    }
}
