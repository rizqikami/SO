// File: script.js
// Aplikasi Stock Opname Mobile v2.0 with Camera Barcode Scanner

// Global States
let catalog = []; // Stores products loaded from item.csv
let scannedItems = []; // Stores currently scanned/counted products
let html5QrCode = null; // Html5Qrcode instance
let isScanning = false; // Scanner running state

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

// Try loading default catalog or from cache
async function initCatalog() {
    const statusText = document.getElementById("status-text");
    const countBadge = document.getElementById("catalog-count");

    // Try reading cache first
    const cachedCatalog = localStorage.getItem("so_catalog_cache");
    if (cachedCatalog) {
        try {
            catalog = JSON.parse(cachedCatalog);
            setCatalogStatus("Berhasil (Cache)", "text-green-800", "bg-green-50", "border-green-200", catalog.length);
            return;
        } catch (e) {
            console.warn("Gagal parse cache katalog:", e);
        }
    }

    // Try fetching auto-load item.csv
    try {
        const response = await fetch("item.csv");
        if (!response.ok) throw new Error("File default item.csv tidak ditemukan");
        
        const csvText = await response.text();
        parseAndSetCatalog(csvText);
    } catch (err) {
        console.log("Auto fetch item.csv gagal (biasanya CORS pada file://):", err);
        if (catalog.length === 0) {
            setCatalogStatus("Pilih file item.csv...", "text-yellow-800", "bg-yellow-50", "border-yellow-200", 0);
        }
    }
}

// Parse CSV and save to cache
function parseAndSetCatalog(csvText) {
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            if (results.data && results.data.length > 0) {
                // Map headers robustly
                const sampleRow = results.data[0];
                let barcodeKey = "";
                let nameKey = "";

                // Find matching keys
                for (let key in sampleRow) {
                    const normalizedKey = key.toLowerCase().trim();
                    if (normalizedKey.includes("kode") || normalizedKey.includes("barcode") || normalizedKey.includes("sku") || normalizedKey.includes("code")) {
                        barcodeKey = key;
                    }
                    if (normalizedKey.includes("nama") || normalizedKey.includes("name") || normalizedKey.includes("barang") || normalizedKey.includes("produk") || normalizedKey.includes("item")) {
                        nameKey = key;
                    }
                }

                // If mapping fails, fall back to indices
                if (!barcodeKey || !nameKey) {
                    const keys = Object.keys(sampleRow);
                    barcodeKey = keys[0];
                    nameKey = keys[1] || keys[0];
                }

                // Standardize products list
                catalog = results.data.map(row => ({
                    barcode: (row[barcodeKey] || "").toString().trim(),
                    name: (row[nameKey] || "").toString().trim()
                })).filter(item => item.name !== ""); // Skip empty names

                // Save to cache (limit size to ~4.5MB to be safe, standard catalog fits easily)
                try {
                    localStorage.setItem("so_catalog_cache", JSON.stringify(catalog));
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

    // Remove old classes
    statusBox.className = `text-xs px-3 py-2 rounded-lg flex items-center justify-between border ${textColor} ${bgClass} ${borderClass}`;
    
    // Set text
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

// Enumerate cameras and set to select dropdown
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
                
                // Prioritize back cameras for better focusing
                if (cleanLabel.includes("back") || cleanLabel.includes("rear") || cleanLabel.includes("environment") || cleanLabel.includes("belakang")) {
                    label += " (Rekomendasi)";
                    option.selected = true; // Auto select rear camera
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

// Toggle Scanning start/stop
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

// Start Camera scanning
function startScanner(cameraId) {
    const readerContainer = document.getElementById("reader-container");
    const btnText = document.getElementById("scan-btn-text");
    const btnIcon = document.getElementById("scan-icon");
    const cameraStatus = document.getElementById("camera-status");
    const btnToggle = document.getElementById("btn-toggle-scan");

    readerContainer.classList.remove("hidden");
    
    // Set state
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
            // Adaptive square box for EAN / standard barcodes
            const size = Math.min(width, height) * 0.75;
            return { width: size, height: size };
        },
        aspectRatio: 1.0
    };

    html5QrCode.start(
        cameraId,
        scanConfig,
        (decodedText, decodedResult) => {
            // Success handler
            handleScannedBarcode(decodedText);
        },
        (errorMessage) => {
            // Scanning in progress (silent)
        }
    ).then(() => {
        // Show flashlight control if available
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
    });
}

// Stop scanning
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

// Toggle Flashlight/Torch
let flashOn = false;
function toggleFlashlight() {
    if (html5QrCode && isScanning) {
        flashOn = !flashOn;
        html5QrCode.applyVideoConstraints({
            advanced: [{ torch: flashOn }]
        }).catch(err => console.warn("Flashlight control failed:", err));
    }
}

// When a barcode is successfully scanned
let lastScannedBarcode = "";
let lastScannedTime = 0;

function handleScannedBarcode(barcode) {
    const now = Date.now();
    // Debounce barcode scans (avoid double scan in 1.5 seconds)
    if (barcode === lastScannedBarcode && (now - lastScannedTime) < 1500) {
        return;
    }

    lastScannedBarcode = barcode;
    lastScannedTime = now;

    // Look up in loaded catalog
    const product = catalog.find(item => item.barcode === barcode);

    if (product) {
        addOrIncrementItem(product.barcode, product.name, 1);
    } else {
        // If not found in catalog, add it as a new product with barcode
        addOrIncrementItem(barcode, `Produk Baru (Scan: ${barcode})`, 1, true);
    }
}

// ==========================================
// 4. MANUAL SEARCH & MANUAL ADD FORM
// ==========================================

// Handle autocomplete input
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

    // Escape regex special characters except % to support wildcard searches
    const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const pattern = escaped.replace(/%/g, ".*");
    const regex = new RegExp(pattern, "i");

    // Filter catalog matching name or barcode using regex
    const matches = catalog.filter(item => 
        regex.test(item.name) || 
        regex.test(item.barcode)
    ).slice(0, 15); // Show top 15 results

    if (matches.length === 0) {
        suggestionsBox.innerHTML = '<div class="p-3 text-xs text-gray-500 italic">Produk tidak ditemukan di katalog. Silakan ketik nama manual di form bawah.</div>';
        suggestionsBox.classList.remove("hidden");
        return;
    }

    suggestionsBox.innerHTML = "";
    matches.forEach(product => {
        const row = document.createElement("div");
        row.className = "p-3 border-b border-gray-100 cursor-pointer hover:bg-blue-50 text-xs transition active:bg-blue-100";
        row.innerHTML = `
            <div class="font-bold text-gray-800">${product.name}</div>
            <div class="text-gray-500 text-[10px] flex justify-between mt-0.5">
                <span>Barcode: ${product.barcode || "Tidak ada"}</span>
                <span class="text-blue-600 font-semibold flex items-center gap-0.5">
                    <i class="fa-solid fa-plus-circle text-[11px]"></i> Pilih
                </span>
            </div>
        `;
        row.addEventListener("click", () => {
            addOrIncrementItem(product.barcode, product.name, 1);
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

// Handle adding custom/manual item from the form
function handleManualFormAdd() {
    const barcode = document.getElementById("manual-barcode").value.trim();
    const name = document.getElementById("manual-name").value.trim();
    const qtyInput = document.getElementById("manual-qty");
    const qty = parseInt(qtyInput.value) || 1;

    if (!name) {
        alert("Nama barang wajib diisi!");
        return;
    }

    // Add product
    addOrIncrementItem(barcode, name, qty, true);

    // Reset Form
    document.getElementById("manual-barcode").value = "";
    document.getElementById("manual-name").value = "";
    qtyInput.value = 1;
}

// ==========================================
// 5. STOK OPNAM SCANNED ITEMS LOGIC
// ==========================================

// Lock all items in the current list except one optional item
function lockAllItems(exceptItem = null) {
    scannedItems.forEach(item => {
        if (exceptItem && item === exceptItem) {
            item.locked = false;
        } else {
            item.locked = true;
        }
    });
}

// Add or increment item in the stock list
function addOrIncrementItem(barcode, name, qty, isManual = false) {
    // Generate a unique identifier if barcode is empty (manual items without barcodes)
    const normalizedBarcode = barcode ? barcode : `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Try finding in current scanned items list
    let existingItem = scannedItems.find(item => {
        if (barcode) {
            return item.barcode === normalizedBarcode;
        } else {
            // Match items without barcodes by name to avoid splitting same products
            return item.name === name;
        }
    });

    if (existingItem) {
        // Existing product found: lock all others and unlock this one.
        lockAllItems(existingItem);
        existingItem.lastUpdated = Date.now(); // Update timestamp so it pops to top
    } else {
        // New product: lock all previous items and add this one unlocked.
        lockAllItems();
        scannedItems.push({
            barcode: normalizedBarcode,
            name: name,
            quantity: isManual ? qty : 0, // Manual entries keep their input quantity, scan-added items start at 0
            isManual: isManual || !barcode,
            locked: false, // New items default open so operator can enter quantity
            lastUpdated: Date.now()
        });
    }

    // Auto-Save progress
    localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));

    // UI effects
    playSuccessBeep();
    triggerVibration();
    flashIndicator();

    // Re-render
    renderCountedItems();
}

// Edit item quantity directly
function editItemQuantity(index, newQty) {
    if (scannedItems[index].locked) return; // Prevent edit if quantity is locked
    if (isNaN(newQty) || newQty < 0) {
        newQty = 0;
    }
    scannedItems[index].quantity = newQty;
    scannedItems[index].lastUpdated = Date.now();
    localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));
    renderCountedItems();
}

// Increment / Decrement helper
function stepItemQuantity(index, step) {
    if (scannedItems[index].locked) return; // Prevent adjustment if quantity is locked
    const currentQty = scannedItems[index].quantity;
    const newQty = currentQty + step;
    if (newQty >= 0) {
        editItemQuantity(index, newQty);
    }
}

// Toggle Lock/Unlock item quantity
function toggleLockItem(index) {
    scannedItems[index].locked = !scannedItems[index].locked;
    localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));
    renderCountedItems();
}

// Delete item from counting list
function deleteItem(index) {
    const item = scannedItems[index];
    if (confirm(`Hapus "${item.name}" dari daftar stok opnam?`)) {
        scannedItems.splice(index, 1);
        localStorage.setItem("so_scanned_items", JSON.stringify(scannedItems));
        renderCountedItems();
    }
}

// Sort items: Most recently updated/scanned first!
function renderCountedItems() {
    const container = document.getElementById("counted-items-container");
    const emptyState = document.getElementById("empty-list-state");
    const uniqueBadge = document.getElementById("unique-items-count");
    const totalQtyBadge = document.getElementById("total-qty-count");

    // Empty state toggle
    if (scannedItems.length === 0) {
        emptyState.classList.remove("hidden");
        // Clear all list rows except empty state
        const rows = container.querySelectorAll(".counted-row");
        rows.forEach(r => r.remove());
        uniqueBadge.innerText = "0";
        totalQtyBadge.innerText = "0";
        return;
    }

    emptyState.classList.add("hidden");

    // Calculate totals
    const uniqueCount = scannedItems.length;
    const totalQty = scannedItems.reduce((acc, curr) => acc + curr.quantity, 0);
    uniqueBadge.innerText = uniqueCount;
    totalQtyBadge.innerText = totalQty;

    // We sort the scannedItems array clone by lastUpdated descending to render
    // but keep original indices by mapping.
    const sortedItems = scannedItems
        .map((item, originalIndex) => ({ ...item, originalIndex }))
        .sort((a, b) => b.lastUpdated - a.lastUpdated);

    // Render list HTML
    container.innerHTML = "";
    container.appendChild(emptyState); // Keep the empty state div inside container reference

    sortedItems.forEach((item, index) => {
        const isLatest = index === 0; // Highlight the absolute newest scan!
        
        const card = document.createElement("div");
        card.className = `counted-row p-3 border rounded-xl flex items-center justify-between gap-3 shadow-sm transition-all duration-300 ${
            isLatest ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-200" : "border-gray-200 bg-white"
        }`;

        // Tag label (Manual vs Katalog)
        const isCustomBarcode = item.barcode.startsWith("MANUAL-");
        const displayBarcode = isCustomBarcode ? "Tidak ada barcode" : item.barcode;
        const tagHTML = item.isManual 
            ? `<span class="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[9px] font-semibold uppercase">Manual</span>`
            : `<span class="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[9px] font-semibold uppercase">Katalog</span>`;

        // Styling for locked/unlocked state
        const lockIconClass = item.locked ? "fa-lock text-red-600" : "fa-lock-open text-green-600";
        const lockBgClass = item.locked ? "bg-red-50 border-red-200 hover:bg-red-100" : "bg-green-50 border-green-200 hover:bg-green-100";
        const lockTooltip = item.locked ? "Kunci aktif (Klik untuk membuka)" : "Buka kunci (Klik untuk mengunci)";
        const disabledAttr = item.locked ? "disabled" : "";
        const disabledBtnClass = item.locked ? "opacity-30 cursor-not-allowed pointer-events-none" : "hover:bg-gray-100 active:bg-gray-200";
        const inputBgClass = item.locked ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white text-gray-800";

        card.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                    ${tagHTML}
                    <span class="text-[10px] text-gray-500 font-mono">${displayBarcode}</span>
                </div>
                <h3 class="font-bold text-xs text-gray-800 truncate">${item.name}</h3>
            </div>
            
            <div class="flex items-center gap-2">
                <!-- Lock / Unlock Toggle Button -->
                <button class="p-2 border rounded-lg transition active:scale-95 h-8 w-8 flex items-center justify-center ${lockBgClass}" 
                    onclick="toggleLockItem(${item.originalIndex})" title="${lockTooltip}">
                    <i class="fa-solid ${lockIconClass} text-xs"></i>
                </button>

                <!-- Quantity controls -->
                <div class="flex items-center border border-gray-300 rounded-lg overflow-hidden h-8 ${item.locked ? 'bg-gray-100' : 'bg-white'}">
                    <button class="px-2.5 bg-gray-50 text-gray-600 font-bold text-sm transition ${disabledBtnClass}" 
                        onclick="stepItemQuantity(${item.originalIndex}, -1)" ${disabledAttr}>
                        <i class="fa-solid fa-minus text-[10px]"></i>
                    </button>
                    <input type="number" value="${item.quantity}" min="0" 
                        class="w-10 text-center text-xs font-bold focus:outline-none h-full border-none p-0 ${inputBgClass}"
                        onchange="editItemQuantity(${item.originalIndex}, parseInt(this.value))" ${disabledAttr}>
                    <button class="px-2.5 bg-gray-50 text-gray-600 font-bold text-sm transition ${disabledBtnClass}" 
                        onclick="stepItemQuantity(${item.originalIndex}, 1)" ${disabledAttr}>
                        <i class="fa-solid fa-plus text-[10px]"></i>
                    </button>
                </div>

                <!-- Delete button -->
                <button class="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition active:scale-95 h-8 w-8 flex items-center justify-center border border-red-100" 
                    onclick="deleteItem(${item.originalIndex})" title="Hapus Barang">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
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

    // Get current date and time
    const now = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Construct CSV Header metadata
    let csvContent = "\uFEFF"; // UTF-8 BOM to prevent excel parsing glitches
    csvContent += `"LAPORAN HASIL STOK OPNAM (SO)"\r\n`;
    csvContent += `"Nama Operator / Pelaku SO:","${operatorName}"\r\n`;
    csvContent += `"Tanggal Penyimpanan:","${dateStr}"\r\n`;
    csvContent += `"Waktu Penyimpanan:","${timeStr}"\r\n`;
    csvContent += `\r\n`; // Empty spacer line

    // Table headers
    csvContent += `"Kode Barang","Nama Barang","Jumlah Terhitung"\r\n`;

    // Process scanned list rows
    scannedItems.forEach(item => {
        // Exclude internal generated MANUAL prefixes for custom items
        const rawBarcode = item.barcode.startsWith("MANUAL-") ? "" : item.barcode;
        
        // Escape quotes inside product names for valid CSV
        const escapedName = item.name.replace(/"/g, '""');
        const escapedBarcode = rawBarcode.replace(/"/g, '""');

        csvContent += `"${escapedBarcode}","${escapedName}","${item.quantity}"\r\n`;
    });

    // Create Download Trigger link
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

    // Update status indicator or alert success
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
