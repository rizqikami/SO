// File: script.js
// Aplikasi Stock Opname Mobile v2.0 with Camera Barcode Scanner

// Global States
let catalog = []; // Stores products loaded from item.csv
let scannedItems = []; // Stores currently scanned/counted products
let html5QrCode = null; // Html5Qrcode instance
let isScanning = false; // Scanner running state
let isScanPaused = false; // To prevent rapid-fire scanning

// Init elements on DOM load
document.addEventListener("DOMContentLoaded", () => {
    // 1. Load Operator Name from local storage
    const savedOperator = localStorage.getItem("so_operator_name");
    if (savedOperator) {
        document.getElementById("operator-name").value = savedOperator;
    }

    // Save operator name on change
    document.getElementById("operator-name").addEventListener("input", (e) => {
        localStorage.setItem("so_operator_name", e.target.value.trim());
    });

    // 2. Load scanned items from local storage (Auto-Save)
    const savedScanned = localStorage.getItem("so_scanned_items");
    if (savedScanned) {
        try {
            scannedItems = JSON.parse(savedScanned);
            renderCountedItems();
        } catch (e) {
            console.error("Gagal memuat data tersimpan:", e);
            scannedItems = [];
        }
    }

    // 3. Load Catalog
    initCatalog();

    // 4. Setup Camera / Scanner
    initCameraList();

    // 5. Setup Action Event Listeners
    document.getElementById("btn-toggle-scan").addEventListener("click", toggleScanner);
    document.getElementById("toggle-flash").addEventListener("click", toggleFlashlight);
    document.getElementById("catalog-file-input").addEventListener("change", handleManualCatalogUpload);
    document.getElementById("product-search").addEventListener("input", handleSearchInput);
    document.getElementById("clear-search").addEventListener("click", clearSearch);
    document.getElementById("manual-name").addEventListener("input", updateManualAddButtonState);
    document.getElementById("btn-manual-add").addEventListener("click", handleManualFormAdd);
    document.getElementById("btn-export-csv").addEventListener("click", handleExportCSV);
    document.getElementById("btn-reset-data").addEventListener("click", handleResetData);
    updateManualAddButtonState();

    // Hide search suggestions when clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#product-search") && !e.target.closest("#search-suggestions")) {
            document.getElementById("search-suggestions").classList.add("hidden");
        }
    });
});

// ==========================================
// 1. FEEDBACK & UX FUNCTIONS
// ==========================================

// Play scanner sound beep using Web Audio API
function playSuccessBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = "sine";
        // Nice dual high beep like professional scanners
        oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); 
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.08); // 80ms beep
    } catch (e) {
        console.warn("Audio beep blocked or unsupported:", e);
    }
}

// Mobile vibrate feedback
function triggerVibration() {
    if (navigator.vibrate) {
        navigator.vibrate(80); // Vibrate 80ms
    }
}

// Flash visual indicator on scan success
function flashIndicator() {
    const indicator = document.getElementById("scan-indicator");
    indicator.classList.remove("hidden");
    setTimeout(() => {
        indicator.classList.add("hidden");
    }, 500);
}

// ==========================================
// 2. CATALOG MANAGEMENT (item.csv)
// ==========================================

function getCatalogRemoteUrls() {
    const base = (window.CATALOG_REMOTE_BASE_URL || "").replace(/\/+$/, "");
    if (!base) {
        return { metaUrl: "", csvUrl: "" };
    }

    return {
        metaUrl: `${base}/catalog-meta.json`,
        csvUrl: `${base}/item.csv`
    };
}

async function fetchRemoteCatalogMeta(metaUrl) {
    if (!metaUrl) return null;

    const response = await fetch(metaUrl, {
        cache: "no-cache",
        headers: {
            "Pragma": "no-cache",
            "Cache-Control": "no-cache"
        }
    });

    if (!response.ok) {
        throw new Error("Metadata katalog tidak tersedia");
    }

    const meta = await response.json();
    return meta && meta.version ? String(meta.version) : null;
}

async function loadLocalCatalogFallback() {
    try {
        const response = await fetch(`item.csv?_t=${Date.now()}`, {
            cache: "no-cache",
            headers: {
                "Pragma": "no-cache",
                "Cache-Control": "no-cache"
            }
        });

        if (!response.ok) throw new Error("File default item.csv tidak ditemukan");

        const csvText = await response.text();
        parseAndSetCatalog(csvText);
    } catch (err) {
        console.log("Auto fetch item.csv gagal (offline atau CORS file://):", err);
        if (catalog.length > 0) {
            setCatalogStatus("Katalog Aktif (Cache Offline)", "text-green-800", "bg-green-50", "border-green-200", catalog.length);
        } else {
            setCatalogStatus("Pilih file item.csv...", "text-yellow-800", "bg-yellow-50", "border-yellow-200", 0);
        }
    }
}

// Try loading default catalog or from cache with auto-update
async function initCatalog() {
    const cachedCatalog = localStorage.getItem("so_catalog_cache");
    if (cachedCatalog) {
        try {
            catalog = JSON.parse(cachedCatalog);
            setCatalogStatus("Memeriksa update...", "text-blue-800", "bg-blue-50", "border-blue-200", catalog.length);
        } catch (e) {
            console.warn("Gagal parse cache katalog:", e);
        }
    }

    const remoteUrls = getCatalogRemoteUrls();

    if (!remoteUrls.metaUrl || !remoteUrls.csvUrl) {
        await loadLocalCatalogFallback();
        return;
    }

    try {
        const remoteVersion = await fetchRemoteCatalogMeta(remoteUrls.metaUrl);
        const localVersion = localStorage.getItem("so_catalog_version");

        if (remoteVersion && localVersion && remoteVersion === localVersion && catalog.length > 0) {
            setCatalogStatus("Katalog Aktif (Versi Terbaru)", "text-green-800", "bg-green-50", "border-green-200", catalog.length);
            return;
        }

        const response = await fetch(`${remoteUrls.csvUrl}?_t=${Date.now()}`, {
            cache: "no-cache",
            headers: {
                "Pragma": "no-cache",
                "Cache-Control": "no-cache"
            }
        });

        if (!response.ok) throw new Error("File default item.csv tidak ditemukan di server");

        const csvText = await response.text();
        parseAndSetCatalog(csvText, remoteVersion || localVersion || null);
    } catch (err) {
        console.warn("Remote catalog check gagal, memakai cache lokal:", err);
        if (catalog.length > 0) {
            setCatalogStatus("Katalog Aktif (Cache Offline)", "text-green-800", "bg-green-50", "border-green-200", catalog.length);
        } else {
            await loadLocalCatalogFallback();
        }
    }
}

// Parse CSV and save to cache
function parseAndSetCatalog(csvText, remoteVersion = null) {
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.data && results.data.length > 0) {
                const sampleRow = results.data[0];
                let barcodeKey = "";
                let nameKey = "";

                for (let key in sampleRow) {
                    const normalizedKey = key.toLowerCase().trim();
                    if (normalizedKey.includes("kode") || normalizedKey.includes("barcode") || normalizedKey.includes("sku") || normalizedKey.includes("code")) {
                        barcodeKey = key;
                    }
                    if (normalizedKey.includes("nama") || normalizedKey.includes("name") || normalizedKey.includes("barang") || normalizedKey.includes("produk") || normalizedKey.includes("item")) {
                        nameKey = key;
                    }
                }

                if (!barcodeKey || !nameKey) {
                    const keys = Object.keys(sampleRow);
                    barcodeKey = keys[0];
                    nameKey = keys[1] || keys[0];
                }

                catalog = results.data.map(row => ({
                    barcode: (row[barcodeKey] || "").toString().trim(),
                    name: (row[nameKey] || "").toString().trim()
                })).filter(item => item.name !== "");

                try {
                    localStorage.setItem("so_catalog_cache", JSON.stringify(catalog));
                    if (remoteVersion) {
                        localStorage.setItem("so_catalog_version", remoteVersion);
                    }
                } catch (e) {
                    console.warn("Katalog terlalu besar untuk localStorage cache:", e);
                }

                setCatalogStatus("Katalog Aktif", "text-green-800", "bg-green-50", "border-green-200", catalog.length);
            } else {
                setCatalogStatus("Katalog Kosong", "text-red-800", "bg-red-50", "border-red-200", 0);
            }
        },
        error: function (err) {
            console.error("Gagal parse CSV:", err);
            setCatalogStatus("Error CSV", "text-red-800", "bg-red-50", "border-red-200", 0);
        }
    });
}

function setCatalogStatus(text, textColor, bgClass, borderClass, count) {
    const statusBox = document.getElementById("catalog-status");
    const statusText = document.getElementById("status-text");
    const countBadge = document.getElementById("catalog-count");

    statusBox.className = `text-xs px-3 py-2 rounded-lg flex items-center justify-between border ${textColor} ${bgClass} ${borderClass}`;
    
    statusText.innerHTML = `<i class="fa-solid fa-circle-check text-green-600 mr-1.5"></i>${text}`;
    if (count === 0) {
        statusText.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-600 mr-1.5"></i>${text}`;
    }
    countBadge.innerText = `${count} Item`;
}

// Handle manual file catalog picker upload
function handleManualCatalogUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        parseAndSetCatalog(event.target.result);
    };
    reader.readAsText(file);
}

// ==========================================
// 3. BARCODE SCANNER CAMERA (html5-qrcode)
// ==========================================

function initCameraList() {
    Html5Qrcode.getCameras().then(devices => {
        const cameraSelect = document.getElementById("camera-select");
        cameraSelect.innerHTML = '<option value="">-- Pilih Kamera --</option>';

        if (devices && devices.length > 0) {
            devices.forEach((device, index) => {
                const option = document.createElement("option");
                option.value = device.id;
                
                let label = device.label || `Kamera ${index + 1}`;
                const cleanLabel = label.toLowerCase();
                
                if (cleanLabel.includes("back") || cleanLabel.includes("rear") || cleanLabel.includes("environment") || cleanLabel.includes("belakang")) {
                    label += " (Rekomendasi)";
                    option.selected = true;
                }
                
                option.text = label;
                cameraSelect.appendChild(option);
            });
        } else {
            cameraSelect.innerHTML = '<option value="">Kamera Tidak Ditemukan</option>';
        }
    }).catch(err => {
        console.warn("Izin kamera ditolak atau tidak ada:", err);
        document.getElementById("camera-select").innerHTML = '<option value="">Izin Kamera Ditolak</option>';
    });
}

function toggleScanner() {
    const cameraSelect = document.getElementById("camera-select");
    const cameraId = cameraSelect.value;

    if (!cameraId) {
        alert("Silakan pilih kamera terlebih dahulu.");
        return;
    }

    if (isScanning) {
        stopScanner();
    } else {
        startScanner(cameraId);
    }
}

function startScanner(cameraId) {
    const readerContainer = document.getElementById("reader-container");
    const btnText = document.getElementById("scan-btn-text");
    const btnIcon = document.getElementById("scan-icon");
    const cameraStatus = document.getElementById("camera-status");
    const btnToggle = document.getElementById("btn-toggle-scan");

    readerContainer.classList.remove("hidden");
    
    isScanning = true;
    btnText.innerText = "Hentikan Scan";
    btnIcon.className = "fa-solid fa-stop";
    btnToggle.className = "px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg btn-active shadow-sm flex items-center gap-1.5";
    cameraStatus.innerText = "Aktif";
    cameraStatus.className = "px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold";

    html5QrCode = new Html5Qrcode("reader");

    const scanConfig = {
        fps: 10,
        qrbox: function(width, height) {
            const size = Math.min(width, height) * 0.75;
            return { width: size, height: size };
        },
        aspectRatio: 1.0
    };

    html5QrCode.start(
        cameraId,
        scanConfig,
        (decodedText, decodedResult) => {
            handleScannedBarcode(decodedText);
        },
        (errorMessage) => {
            // Scanning...
        }
    ).then(() => {
        const hasFlash = html5QrCode.getRunningTrackCapabilities().torch;
        const flashBtn = document.getElementById("toggle-flash");
        if (hasFlash) {
            flashBtn.classList.remove("hidden");
        } else {
            flashBtn.classList.add("hidden");
        }
    }).catch(err => {
        console.error("Gagal menyalakan kamera:", err);
        alert("Gagal mengakses kamera. Pastikan izin kamera aktif.");
        stopScanner();

        const searchInput = document.getElementById("product-search");
        if (searchInput) {
            searchInput.focus();
            searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
}

function stopScanner() {
    const readerContainer = document.getElementById("reader-container");
    const btnText = document.getElementById("scan-btn-text");
    const btnIcon = document.getElementById("scan-icon");
    const cameraStatus = document.getElementById("camera-status");
    const btnToggle = document.getElementById("btn-toggle-scan");
    const flashBtn = document.getElementById("toggle-flash");

    flashBtn.classList.add("hidden");
    readerContainer.classList.add("hidden");

    isScanning = false;
    btnText.innerText = "Mulai Scan";
    btnIcon.className = "fa-solid fa-play";
    btnToggle.className = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg btn-active shadow-sm flex items-center gap-1.5";
    cameraStatus.innerText = "Mati";
    cameraStatus.className = "px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-semibold";

    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
        }).catch(err => {
            console.error("Gagal stop camera:", err);
        });
    }
}

let flashOn = false;
function toggleFlashlight() {
    if (html5QrCode && isScanning) {
        flashOn = !flashOn;
        html5QrCode.applyVideoConstraints({
            advanced: [{ torch: flashOn }]
        }).catch(err => console.warn("Flashlight control failed:", err));
    }
}

let lastScannedBarcode = "";
let lastScannedTime = 0;

function handleScannedBarcode(barcode) {
    if (isScanPaused) return;

    const now = Date.now();
    
    if (barcode === lastScannedBarcode && (now - lastScannedTime) < 3000) {
        return;
    }

    const product = catalog.find(item => item.barcode === barcode);

    lastScannedBarcode = barcode;
    lastScannedTime = now;

    if (product) {
        showScanFeedback(product.name);
        addOrIncrementItem(product.barcode, product.name, 1, false, "Scan Barcode");
    } else {
        showScanFeedback(`Tidak Ditemukan: ${barcode}`);
        triggerVibration();

        const searchInput = document.getElementById("product-search");
        const manualBarcodeInput = document.getElementById("manual-barcode");

        if (searchInput) {
            searchInput.value = barcode;
            searchInput.dispatchEvent(new Event("input"));
            searchInput.focus();
            searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        if (manualBarcodeInput) {
            manualBarcodeInput.value = barcode;
        }
    }
}

function showScanFeedback(name) {
    isScanPaused = true;
    const overlay = document.getElementById("scan-success-overlay");
    const nameDisplay = document.getElementById("success-product-name");
    
    nameDisplay.innerText = name;
    overlay.classList.remove("opacity-0", "pointer-events-none");
    overlay.classList.add("opacity-100");

    setTimeout(() => {
        overlay.classList.remove("opacity-100");
        overlay.classList.add("opacity-0", "pointer-events-none");
        isScanPaused = false;
    }, 2000); 
}

// ==========================================
// 4. MANUAL SEARCH & MANUAL ADD FORM
// ==========================================

// Handle autocomplete input (Diperbaiki agar Teks Nama & Barcode tidak terpotong)
function handleSearchInput(e) {
    const query = e.target.value.trim();
    const suggestionsBox = document.getElementById("search-suggestions");
    const clearBtn = document.getElementById("clear-search");

    if (!query) {
        suggestionsBox.classList.add("hidden");
        clearBtn.classList.add("hidden");
        return;
    }

    clearBtn.classList.remove("hidden");

    const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const pattern = escaped.replace(/%/g, ".*");
    const regex = new RegExp(pattern, "i");

    const matches = catalog.filter(item => 
        regex.test(item.name) || 
        regex.test(item.barcode)
    ).slice(0, 15);

    if (matches.length === 0) {
        suggestionsBox.innerHTML = '<div class="p-3 text-xs text-gray-500 italic">Produk tidak ditemukan di katalog. Silakan ketik nama manual di form bawah.</div>';
        suggestionsBox.classList.remove("hidden");
        return;
    }

    suggestionsBox.innerHTML = "";
    matches.forEach(product => {
        const row = document.createElement("div");
        row.className = "p-2.5 border-b border-gray-100 cursor-pointer hover:bg-blue-50 text-xs transition active:bg-blue-100 space-y-1";
        row.innerHTML = `
            <!-- Nama produk penuh (Bisa berbaris-baris) -->
            <div class="font-bold text-gray-800 text-wrap-full leading-snug">${product.name}</div>
            
            <!-- Barcode & Tombol Pilih di baris bawah -->
            <div class="text-gray-500 text-[11px] flex items-center justify-between gap-2 flex-wrap pt-0.5">
                <span class="font-mono text-wrap-full flex items-center gap-1 min-w-0">
                    <i class="fa-solid fa-barcode text-gray-400 shrink-0"></i>
                    <span class="text-wrap-full">${product.barcode || "Tidak ada barcode"}</span>
                </span>
                <span class="text-blue-600 font-semibold flex items-center gap-1 shrink-0 ml-auto bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    <i class="fa-solid fa-plus-circle text-xs"></i> Pilih
                </span>
            </div>
        `;
        row.addEventListener("click", () => {
            addOrIncrementItem(product.barcode, product.name, 1, false, "Pencarian Katalog");
            clearSearch();
        });
        suggestionsBox.appendChild(row);
    });

    suggestionsBox.classList.remove("hidden");
}

function clearSearch() {
    document.getElementById("product-search").value = "";
    document.getElementById("search-suggestions").classList.add("hidden");
    document.getElementById("clear-search").classList.add("hidden");
}

function updateManualAddButtonState() {
    const nameValue = document.getElementById("manual-name").value.trim();
    const manualAddButton = document.getElementById("btn-manual-add");
    if (nameValue.length === 0) {
        manualAddButton.disabled = true;
    } else {
        manualAddButton.disabled = false;
    }
}

function handleManualFormAdd() {
    const barcode = document.getElementById("manual-barcode").value.trim();
    const name = document.getElementById("manual-name").value.trim();
    const qtyInput = document.getElementById("manual-qty");
    const qty = parseInt(qtyInput.value) || 1;

    if (!name) {
        alert("Nama barang wajib diisi!");
        return;
    }

    addOrIncrementItem(barcode, name, qty, true, "Input Manual Baru");

    document.getElementById("manual-barcode").value = "";
    document.getElementById("manual-name").value = "";
    qtyInput.value = 1;
}

// ==========================================
// 5. STOK OPNAM SCANNED ITEMS LOGIC
// ==========================================

function lockAllItems(exceptItem = null) {
    scannedItems.forEach(item => {
        if (exceptItem && item === exceptItem) {
            item.locked = false;
        } else {
            item.locked = true;
        }
    });
}

function addOrIncrementItem(barcode, name, qty, isManual = false, inputSource = "Scan Barcode") {
    const normalizedBarcode = barcode ? barcode : `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    let existingItem = scannedItems.find(item => {
        if (barcode) {
            return item.barcode === normalizedBarcode;
        } else {
            return item.name === name;
        }
    });

    if (existingItem) {
        lockAllItems(existingItem);
        existingItem.lastUpdated = Date.now();
    } else {
        lockAllItems();
        scannedItems.push({
            barcode: normalizedBarcode,
            name: name,
            quantity: isManual ? qty : 0,
            isManual: isManual || !barcode,
            inputSource: inputSource,
            locked: false,
            lastUpdated: Date.now()
        });
    }

    localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));

    playSuccessBeep();
    triggerVibration();
    flashIndicator();

    renderCountedItems();
}

function editItemQuantity(index, newQty) {
    if (scannedItems[index].locked) return;
    if (isNaN(newQty) || newQty < 0) {
        newQty = 0;
    }
    scannedItems[index].quantity = newQty;
    scannedItems[index].lastUpdated = Date.now();
    localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));
    renderCountedItems();
}

function stepItemQuantity(index, step) {
    if (scannedItems[index].locked) return;
    const currentQty = scannedItems[index].quantity;
    const newQty = currentQty + step;
    if (newQty >= 0) {
        editItemQuantity(index, newQty);
    }
}

function toggleLockItem(index) {
    scannedItems[index].locked = !scannedItems[index].locked;
    localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));
    renderCountedItems();
}

function deleteItem(index) {
    const item = scannedItems[index];
    if (confirm(`Hapus "${item.name}" dari daftar stok opnam?`)) {
        scannedItems.splice(index, 1);
        localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));
        renderCountedItems();
    }
}

// Render daftar barang dihitung (Diperbaiki Layout Bertumpuk agar tidak ada teks terpotong di HP kecil)
function renderCountedItems() {
    const container = document.getElementById("counted-items-container");
    const emptyState = document.getElementById("empty-list-state");
    const uniqueBadge = document.getElementById("unique-items-count");
    const totalQtyBadge = document.getElementById("total-qty-count");

    if (scannedItems.length === 0) {
        emptyState.classList.remove("hidden");
        const rows = container.querySelectorAll(".counted-row");
        rows.forEach(r => r.remove());
        uniqueBadge.innerText = "0";
        totalQtyBadge.innerText = "0";
        return;
    }

    emptyState.classList.add("hidden");

    const uniqueCount = scannedItems.length;
    const totalQty = scannedItems.reduce((acc, curr) => acc + curr.quantity, 0);
    uniqueBadge.innerText = uniqueCount;
    totalQtyBadge.innerText = totalQty;

    const sortedItems = scannedItems
        .map((item, originalIndex) => ({ ...item, originalIndex }))
        .sort((a, b) => b.lastUpdated - a.lastUpdated);

    container.innerHTML = "";
    container.appendChild(emptyState);

    sortedItems.forEach((item, index) => {
        const isLatest = index === 0;
        
        const card = document.createElement("div");
        // Layout kartu diubah dari horizontal menjadi vertikal bertumpuk
        card.className = `counted-row p-3 border rounded-xl flex flex-col gap-2 shadow-sm transition-all duration-300 ${
            isLatest ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-200" : "border-gray-200 bg-white"
        }`;

        const isCustomBarcode = item.barcode.startsWith("MANUAL-");
        const displayBarcode = isCustomBarcode ? "Tidak ada barcode" : item.barcode;
        const tagHTML = item.isManual 
            ? `<span class="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[9px] font-semibold uppercase shrink-0">Manual</span>`
            : `<span class="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[9px] font-semibold uppercase shrink-0">Katalog</span>`;

        const lockIconClass = item.locked ? "fa-lock text-red-600" : "fa-lock-open text-green-600";
        const lockBgClass = item.locked ? "bg-red-50 border-red-200 hover:bg-red-100" : "bg-green-50 border-green-200 hover:bg-green-100";
        const lockTooltip = item.locked ? "Kunci aktif (Klik untuk membuka)" : "Buka kunci (Klik untuk mengunci)";
        const disabledAttr = item.locked ? "disabled" : "";
        const disabledBtnClass = item.locked ? "opacity-30 cursor-not-allowed pointer-events-none" : "hover:bg-gray-100 active:bg-gray-200";
        const inputBgClass = item.locked ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white text-gray-800";

        card.innerHTML = `
            <!-- BARIS ATAS: Nama Barang Penuh (Bisa berlipat jika sangat panjang) -->
            <div class="w-full">
                <h3 class="font-bold text-xs sm:text-sm text-gray-800 text-wrap-full leading-snug">${item.name}</h3>
            </div>
            
            <!-- BARIS BAWAH: Tag & Barcode (Kiri) + Kontrol Jumlah/Aksi (Kanan) -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
                <!-- Tag & Barcode -->
                <div class="flex items-center gap-1.5 min-w-0 max-w-full flex-wrap">
                    ${tagHTML}
                    <span class="text-[11px] text-gray-600 font-mono text-wrap-full flex items-center gap-1">
                        <i class="fa-solid fa-barcode text-gray-400 shrink-0"></i>
                        <span class="text-wrap-full">${displayBarcode}</span>
                    </span>
                </div>

                <!-- Tombol Aksi & Jumlah -->
                <div class="flex items-center gap-1.5 shrink-0 ml-auto">
                    <!-- Lock / Unlock Button -->
                    <button class="p-1.5 border rounded-lg transition active:scale-95 h-8 w-8 flex items-center justify-center ${lockBgClass}" 
                        onclick="toggleLockItem(${item.originalIndex})" title="${lockTooltip}">
                        <i class="fa-solid ${lockIconClass} text-xs"></i>
                    </button>

                    <!-- Quantity controls -->
                    <div class="flex items-center border border-gray-300 rounded-lg overflow-hidden h-8 ${item.locked ? 'bg-gray-100' : 'bg-white'}">
                        <button class="px-2 bg-gray-50 text-gray-600 font-bold text-sm transition ${disabledBtnClass}" 
                            onclick="stepItemQuantity(${item.originalIndex}, -1)" ${disabledAttr}>
                            <i class="fa-solid fa-minus text-[10px]"></i>
                        </button>
                        <input type="number" value="${item.quantity}" min="0" 
                            class="w-10 text-center text-xs font-bold focus:outline-none h-full border-none p-0 ${inputBgClass}"
                            onchange="editItemQuantity(${item.originalIndex}, parseInt(this.value))" ${disabledAttr}>
                        <button class="px-2 bg-gray-50 text-gray-600 font-bold text-sm transition ${disabledBtnClass}" 
                            onclick="stepItemQuantity(${item.originalIndex}, 1)" ${disabledAttr}>
                            <i class="fa-solid fa-plus text-[10px]"></i>
                        </button>
                    </div>

                    <!-- Delete button -->
                    <button class="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition active:scale-95 h-8 w-8 flex items-center justify-center border border-red-100" 
                        onclick="deleteItem(${item.originalIndex})" title="Hapus Barang">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// ==========================================
// 6. EXPORT STOCK OPNAM TO CSV FILE
// ==========================================
function handleExportCSV() {
    const operatorName = document.getElementById("operator-name").value.trim();

    if (!operatorName) {
        alert("PENTING: Harap isi Nama Operator terlebih dahulu di bagian atas!");
        document.getElementById("operator-name").focus();
        return;
    }

    if (scannedItems.length === 0) {
        alert("Daftar stok opnam masih kosong. Silakan scan atau tambah barang terlebih dahulu.");
        return;
    }

    const now = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    let csvContent = "\uFEFF";
    csvContent += `"LAPORAN HASIL STOK OPNAM (SO)"\r\n`;
    csvContent += `"Nama Operator / Pelaku SO:","${operatorName}"\r\n`;
    csvContent += `"Tanggal Penyimpanan:","${dateStr}"\r\n`;
    csvContent += `"Waktu Penyimpanan:","${timeStr}"\r\n`;
    csvContent += `\r\n`;

    csvContent += `"Kode Barang","Nama Barang","Jumlah Terhitung","Metode Input"\r\n`;

    scannedItems.forEach(item => {
        const rawBarcode = item.barcode.startsWith("MANUAL-") ? "" : item.barcode;
        const sourceLabel = item.inputSource || (item.isManual ? "Input Manual Baru" : "Scan Barcode");
        
        const escapedName = item.name.replace(/"/g, '""');
        const escapedBarcode = rawBarcode.replace(/"/g, '""');
        const escapedSource = sourceLabel.replace(/"/g, '""');

        csvContent += `"${escapedBarcode}","${escapedName}","${item.quantity}","${escapedSource}"\r\n`;
    });

    const filename = `SO_${operatorName.replace(/[^a-zA-Z0-9]/g, "_")}_${dateStr.replace(/-/g, "")}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    link.className = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Hasil Stok Opnam berhasil diekspor ke file:\n${filename}`);
}

// Reset/Clear All data
function handleResetData() {
    if (confirm("PENTING: Apakah Anda yakin ingin menghapus semua daftar barang yang dihitung? Semua data akan hilang jika belum diekspor ke CSV!")) {
        scannedItems = [];
        localStorage.removeItem("so_scanned_items");
        renderCountedItems();
        clearSearch();
        alert("Semua data berhasil direset. Silakan mulai sesi stok opnam baru.");
    }
}
