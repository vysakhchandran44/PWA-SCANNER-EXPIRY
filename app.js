/**
 * Pharmacy Tracker v4.0.0
 * - Light theme with stable performance
 * - No PIN system
 * - PERMANENT master data (stored in browser)
 * - INSTANT history saves
 * - Real-time updates
 */

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  EXPIRY_SOON_DAYS: 90,
  DB_NAME: 'PharmacyTrackerDB',
  DB_VERSION: 3
};

// ========================================
// STATE
// ========================================
const State = {
  db: null,
  masterIndex: { exact: new Map(), last8: new Map(), all: [] },
  currentFilter: 'all',
  searchQuery: '',
  scannerActive: false,
  html5QrCode: null,
  availableCameras: [],
  currentCameraIndex: 0
};

// ========================================
// DATABASE - PERMANENT STORAGE
// ========================================
const DB = {
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      
      request.onerror = () => {
        console.error('DB Error:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        State.db = request.result;
        console.log('Database opened successfully');
        resolve();
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        console.log('Upgrading database...');
        
        // History store
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
          historyStore.createIndex('gtin14', 'gtin14', { unique: false });
          historyStore.createIndex('gtinBatch', ['gtin14', 'batch'], { unique: false });
        }
        
        // Master store - PERMANENT product database
        if (!db.objectStoreNames.contains('master')) {
          const masterStore = db.createObjectStore('master', { keyPath: 'barcode' });
          masterStore.createIndex('name', 'name', { unique: false });
        }
        
        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  },
  
  // ===== HISTORY OPERATIONS =====
  async addHistory(item) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.add(item);
      request.onsuccess = () => {
        console.log('History added, ID:', request.result);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  async updateHistory(item) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async getHistory(id) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async deleteHistory(id) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async getAllHistory() {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },
  
  async findByGtinBatch(gtin14, batch) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const index = store.index('gtinBatch');
      const request = index.get([gtin14, batch || '']);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async clearHistory() {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  // ===== MASTER DATA OPERATIONS (PERMANENT) =====
  async addMaster(item) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('master', 'readwrite');
      const store = tx.objectStore('master');
      const request = store.put(item); // put = add or update
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async getMaster(barcode) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('master', 'readonly');
      const store = tx.objectStore('master');
      const request = store.get(barcode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async getAllMaster() {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('master', 'readonly');
      const store = tx.objectStore('master');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },
  
  async clearMaster() {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('master', 'readwrite');
      const store = tx.objectStore('master');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async addMasterBulk(items) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('master', 'readwrite');
      const store = tx.objectStore('master');
      let count = 0;
      
      for (const item of items) {
        store.put(item);
        count++;
      }
      
      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
    });
  }
};

// ========================================
// GS1 PARSER
// ========================================
function parseGS1(code) {
  const result = {
    raw: code,
    gtin14: '',
    gtin13: '',
    expiryISO: '',
    expiryDDMMYY: '',
    expiryDisplay: '',
    batch: '',
    serial: '',
    qty: 1,
    isGS1: false
  };
  
  if (!code || typeof code !== 'string') return result;
  
  code = code.trim().replace(/[\r\n]/g, '');
  
  // Check if it's a GS1 code with AIs
  const hasAI = code.includes('(') || code.match(/^01\d{14}/);
  
  if (!hasAI) {
    // Plain barcode (EAN-13, GTIN-14, etc.)
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 14) {
      result.gtin14 = digits.padStart(14, '0');
      result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
    }
    return result;
  }
  
  result.isGS1 = true;
  
  // Parse AIs
  const patterns = {
    gtin: /\(01\)(\d{14})|\b01(\d{14})/,
    expiry: /\(17\)(\d{6})|\b17(\d{6})/,
    batch: /\(10\)([^\(|\x1d]+)|\b10([A-Za-z0-9]+)/,
    serial: /\(21\)([^\(|\x1d]+)|\b21([A-Za-z0-9]+)/,
    qty: /\(30\)(\d+)|\b30(\d+)/
  };
  
  // GTIN
  const gtinMatch = code.match(patterns.gtin);
  if (gtinMatch) {
    result.gtin14 = gtinMatch[1] || gtinMatch[2];
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
  }
  
  // Expiry
  const expiryMatch = code.match(patterns.expiry);
  if (expiryMatch) {
    const yymmdd = expiryMatch[1] || expiryMatch[2];
    const parsed = parseExpiryDate(yymmdd);
    result.expiryISO = parsed.iso;
    result.expiryDDMMYY = parsed.ddmmyy;
    result.expiryDisplay = parsed.display;
  }
  
  // Batch
  const batchMatch = code.match(patterns.batch);
  if (batchMatch) {
    result.batch = (batchMatch[1] || batchMatch[2] || '').replace(/[|]/g, '').trim();
  }
  
  // Serial
  const serialMatch = code.match(patterns.serial);
  if (serialMatch) {
    result.serial = (serialMatch[1] || serialMatch[2] || '').trim();
  }
  
  // Quantity
  const qtyMatch = code.match(patterns.qty);
  if (qtyMatch) {
    result.qty = parseInt(qtyMatch[1] || qtyMatch[2]) || 1;
  }
  
  return result;
}

function parseExpiryDate(yymmdd) {
  const yy = parseInt(yymmdd.substring(0, 2));
  const mm = parseInt(yymmdd.substring(2, 4));
  let dd = parseInt(yymmdd.substring(4, 6));
  
  const year = 2000 + yy;
  
  // Day 00 = last day of month
  if (dd === 0) {
    dd = new Date(year, mm, 0).getDate();
  }
  
  const iso = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const ddmmyy = `${String(dd).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(yy).padStart(2, '0')}`;
  const display = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${year}`;
  
  return { iso, ddmmyy, display };
}

function getExpiryStatus(expiryISO) {
  if (!expiryISO) return 'unknown';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryISO);
  expiry.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'expired';
  if (diffDays <= CONFIG.EXPIRY_SOON_DAYS) return 'expiring';
  return 'ok';
}

// ========================================
// PRODUCT MATCHING (Uses PERMANENT master data)
// ========================================
function buildMasterIndex(masterData) {
  const idx = { exact: new Map(), last8: new Map(), all: [] };
  
  for (const item of masterData) {
    const barcode = String(item.barcode).replace(/\D/g, '');
    const name = item.name || item.productName || item.ProductName || item.description || '';
    
    if (!barcode || !name) continue;
    
    // Exact match
    idx.exact.set(barcode, name);
    
    // GTIN-14 padded
    const gtin14 = barcode.padStart(14, '0');
    idx.exact.set(gtin14, name);
    
    // GTIN-13
    if (gtin14.startsWith('0')) {
      idx.exact.set(gtin14.slice(1), name);
    }
    
    // Last 8 digits
    if (barcode.length >= 8) {
      const last8 = barcode.slice(-8);
      if (!idx.last8.has(last8)) {
        idx.last8.set(last8, []);
      }
      idx.last8.get(last8).push({ barcode, name });
    }
    
    idx.all.push({ barcode, name });
  }
  
  return idx;
}

function matchProduct(gtin14, gtin13) {
  const idx = State.masterIndex;
  
  // Exact GTIN-14
  if (idx.exact.has(gtin14)) {
    return { name: idx.exact.get(gtin14), type: 'EXACT' };
  }
  
  // Exact GTIN-13
  if (idx.exact.has(gtin13)) {
    return { name: idx.exact.get(gtin13), type: 'EXACT' };
  }
  
  // Last 8 digits
  const last8 = gtin14.slice(-8);
  if (idx.last8.has(last8)) {
    const matches = idx.last8.get(last8);
    if (matches.length === 1) {
      return { name: matches[0].name, type: 'LAST8' };
    } else if (matches.length > 1) {
      return { name: matches[0].name + ' [?]', type: 'AMBIGUOUS' };
    }
  }
  
  // SEQ-6: Find any 6-digit sequence match
  const searchStr = gtin14.slice(-10); // Last 10 digits
  for (const item of idx.all) {
    for (let i = 0; i <= searchStr.length - 6; i++) {
      const seq = searchStr.substring(i, i + 6);
      if (item.barcode.includes(seq)) {
        return { name: item.name, type: 'SEQ6' };
      }
    }
  }
  
  return { name: '', type: 'NONE' };
}

// ========================================
// SCANNER
// ========================================
async function initScanner() {
  try {
    State.availableCameras = await Html5Qrcode.getCameras();
    
    if (State.availableCameras.length === 0) {
      showToast('No camera found', 'error');
      return false;
    }
    
    // Prefer back camera
    const backCamIdx = State.availableCameras.findIndex(c => 
      c.label.toLowerCase().includes('back') || 
      c.label.toLowerCase().includes('rear') ||
      c.label.toLowerCase().includes('environment')
    );
    
    State.currentCameraIndex = backCamIdx >= 0 ? backCamIdx : 0;
    console.log('Cameras found:', State.availableCameras.length);
    return true;
  } catch (err) {
    console.error('Camera init error:', err);
    showToast('Camera access error', 'error');
    return false;
  }
}

async function startScanner() {
  if (State.scannerActive) {
    await stopScanner();
    return;
  }
  
  if (State.availableCameras.length === 0) {
    const init = await initScanner();
    if (!init) return;
  }
  
  const readerEl = document.getElementById('reader');
  if (!readerEl) return;
  
  try {
    State.html5QrCode = new Html5Qrcode('reader', { verbose: false });
    
    const config = {
      fps: 15,
      qrbox: function(viewWidth, viewHeight) {
        const size = Math.floor(Math.min(viewWidth, viewHeight) * 0.7);
        return { width: size, height: size };
      },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR
      ]
    };
    
    await State.html5QrCode.start(
      State.availableCameras[State.currentCameraIndex].id,
      config,
      onScanSuccess,
      () => {} // Ignore scan errors
    );
    
    State.scannerActive = true;
    document.getElementById('btnStartScanner').textContent = '⏹️ Stop Scanner';
    document.getElementById('scannerOverlay').style.display = 'flex';
    
    haptic('medium');
    console.log('Scanner started');
  } catch (err) {
    console.error('Scanner start error:', err);
    
    if (err.toString().includes('NotAllowed')) {
      showToast('Camera permission denied. Please allow camera access.', 'error');
    } else if (err.toString().includes('NotFound')) {
      showToast('No camera found', 'error');
    } else if (err.toString().includes('NotReadable')) {
      showToast('Camera in use by another app', 'error');
    } else {
      showToast('Could not start scanner: ' + err.message, 'error');
    }
  }
}

async function stopScanner() {
  if (!State.scannerActive || !State.html5QrCode) return;
  
  try {
    await State.html5QrCode.stop();
    State.html5QrCode.clear();
  } catch (err) {
    console.error('Scanner stop error:', err);
  }
  
  State.scannerActive = false;
  State.html5QrCode = null;
  document.getElementById('btnStartScanner').textContent = '▶️ Start Scanner';
  document.getElementById('scannerOverlay').style.display = 'none';
  console.log('Scanner stopped');
}

async function switchCamera() {
  if (State.availableCameras.length < 2) {
    showToast('Only one camera available', 'warning');
    return;
  }
  
  State.currentCameraIndex = (State.currentCameraIndex + 1) % State.availableCameras.length;
  
  if (State.scannerActive) {
    await stopScanner();
    setTimeout(() => startScanner(), 300);
  }
  
  haptic('light');
}

async function onScanSuccess(decodedText) {
  console.log('Scanned:', decodedText);
  
  // Stop scanner after successful scan
  await stopScanner();
  
  haptic('success');
  
  // Show scanned data in result area
  const resultEl = document.getElementById('scanResult');
  const resultDataEl = document.getElementById('scanResultData');
  resultDataEl.textContent = decodedText;
  resultEl.classList.add('show');
  
  // Also populate manual entry field
  const manualInput = document.getElementById('scanManualInput');
  if (manualInput) {
    manualInput.value = decodedText;
  }
  
  // Auto-process the scanned data IMMEDIATELY
  await processScan(decodedText);
}

async function scanImageFile(file) {
  showLoading(true);
  
  try {
    const tempScanner = new Html5Qrcode('reader');
    const result = await tempScanner.scanFile(file, false);
    tempScanner.clear();
    
    haptic('success');
    
    // Show result
    const resultEl = document.getElementById('scanResult');
    const resultDataEl = document.getElementById('scanResultData');
    resultDataEl.textContent = result;
    resultEl.classList.add('show');
    
    // Populate manual entry
    const manualInput = document.getElementById('scanManualInput');
    if (manualInput) {
      manualInput.value = result;
    }
    
    // Process IMMEDIATELY
    await processScan(result);
  } catch (err) {
    console.error('Image scan error:', err);
    showToast('Could not read barcode from image', 'error');
  }
  
  showLoading(false);
}

// ========================================
// PROCESS SCAN - INSTANT SAVE
// ========================================
async function processScan(code) {
  if (!code || !code.trim()) {
    showToast('No barcode data', 'warning');
    return;
  }
  
  code = code.trim();
  console.log('Processing:', code);
  
  const parsed = parseGS1(code);
  
  if (!parsed.gtin14 && !parsed.gtin13) {
    // Try to use raw code as barcode
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 5) {
      parsed.gtin14 = digits.padStart(14, '0');
      parsed.gtin13 = parsed.gtin14.slice(1);
    } else {
      showToast('Invalid barcode format', 'error');
      return;
    }
  }
  
  // Match product from PERMANENT master data
  const match = matchProduct(parsed.gtin14, parsed.gtin13);
  
  // Check for existing entry (smart inventory merge)
  let existingEntry = null;
  if (parsed.batch) {
    existingEntry = await DB.findByGtinBatch(parsed.gtin14, parsed.batch);
  }
  
  if (existingEntry) {
    // Update quantity
    existingEntry.qty = (existingEntry.qty || 1) + parsed.qty;
    existingEntry.timestamp = Date.now();
    await DB.updateHistory(existingEntry);
    showToast(`+${parsed.qty} qty (total: ${existingEntry.qty})`, 'success');
    console.log('Updated existing entry');
  } else {
    // Create new entry - SAVE IMMEDIATELY
    const entry = {
      raw: parsed.raw,
      gtin14: parsed.gtin14,
      gtin13: parsed.gtin13,
      name: match.name || 'Unknown Product',
      matchType: match.type,
      expiryISO: parsed.expiryISO,
      expiryDDMMYY: parsed.expiryDDMMYY,
      expiryDisplay: parsed.expiryDisplay,
      batch: parsed.batch,
      serial: parsed.serial,
      qty: parsed.qty,
      rms: '',
      timestamp: Date.now()
    };
    
    const id = await DB.addHistory(entry);
    console.log('Saved new entry with ID:', id);
    showToast(`Added: ${entry.name}`, 'success');
  }
  
  // Refresh displays IMMEDIATELY
  await refreshAll();
}

async function processMultipleCodes(text) {
  if (!text || !text.trim()) {
    showToast('No data to process', 'warning');
    return;
  }
  
  const lines = text.trim().split(/[\r\n]+/).filter(l => l.trim());
  let processed = 0;
  let errors = 0;
  
  showLoading(true);
  
  for (const line of lines) {
    try {
      await processScan(line.trim());
      processed++;
    } catch (err) {
      console.error('Process error:', err);
      errors++;
    }
  }
  
  showLoading(false);
  
  if (errors > 0) {
    showToast(`Processed ${processed}, ${errors} errors`, 'warning');
  } else {
    showToast(`Processed ${processed} items`, 'success');
  }
}

// ========================================
// REFRESH ALL DISPLAYS
// ========================================
async function refreshAll() {
  await Promise.all([
    refreshHistory(),
    refreshStats(),
    refreshRecentItems()
  ]);
}

async function refreshHistory() {
  const history = await DB.getAllHistory();
  
  // Sort by timestamp descending (newest first)
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  // Filter
  let filtered = history;
  
  if (State.currentFilter !== 'all') {
    filtered = history.filter(h => getExpiryStatus(h.expiryISO) === State.currentFilter);
  }
  
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    filtered = filtered.filter(h => 
      (h.name && h.name.toLowerCase().includes(q)) ||
      (h.gtin14 && h.gtin14.includes(q)) ||
      (h.batch && h.batch.toLowerCase().includes(q))
    );
  }
  
  renderHistoryList(filtered);
}

function renderHistoryList(items) {
  const container = document.getElementById('historyList');
  if (!container) return;
  
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No items found</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = items.map(item => {
    const status = getExpiryStatus(item.expiryISO);
    return `
      <div class="history-item ${status}" data-id="${item.id}">
        <div class="item-header">
          <span class="item-name">${escapeHtml(item.name || 'Unknown')}</span>
          <span class="item-qty">×${item.qty || 1}</span>
        </div>
        <div class="item-details">
          <div class="item-detail">
            <span class="item-detail-label">GTIN:</span>
            <span class="item-detail-value">${item.gtin14 || item.gtin13 || '-'}</span>
          </div>
          <div class="item-detail">
            <span class="item-detail-label">Batch:</span>
            <span class="item-detail-value">${item.batch || '-'}</span>
          </div>
          <div class="item-detail">
            <span class="item-detail-label">Expiry:</span>
            <span class="item-expiry ${status}">${item.expiryDisplay || 'N/A'}</span>
          </div>
          <div class="item-detail">
            <span class="item-detail-label">Match:</span>
            <span class="item-detail-value">${item.matchType || '-'}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="item-action-btn" onclick="editItem(${item.id})">✏️ Edit</button>
          <button class="item-action-btn delete" onclick="deleteItem(${item.id})">🗑️ Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function refreshRecentItems() {
  const history = await DB.getAllHistory();
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  const recent = history.slice(0, 3);
  const container = document.getElementById('recentItems');
  if (!container) return;
  
  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-lg);">
        <div class="empty-state-icon">📦</div>
        <div class="empty-state-title">No scans yet</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = recent.map(item => {
    const status = getExpiryStatus(item.expiryISO);
    return `
      <div class="history-item ${status}" style="margin-bottom: var(--space-sm);">
        <div class="item-header">
          <span class="item-name">${escapeHtml(item.name || 'Unknown')}</span>
          <span class="item-qty">×${item.qty || 1}</span>
        </div>
        <div class="item-details">
          <div class="item-detail">
            <span class="item-detail-label">Expiry:</span>
            <span class="item-expiry ${status}">${item.expiryDisplay || 'N/A'}</span>
          </div>
          <div class="item-detail">
            <span class="item-detail-label">Batch:</span>
            <span class="item-detail-value">${item.batch || '-'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function refreshStats() {
  const history = await DB.getAllHistory();
  
  let total = history.length;
  let expiring = 0;
  let expired = 0;
  
  for (const h of history) {
    const status = getExpiryStatus(h.expiryISO);
    if (status === 'expired') expired++;
    else if (status === 'expiring') expiring++;
  }
  
  const totalEl = document.getElementById('statTotal');
  const expiringEl = document.getElementById('statExpiring');
  const expiredEl = document.getElementById('statExpired');
  
  if (totalEl) totalEl.textContent = total;
  if (expiringEl) expiringEl.textContent = expiring;
  if (expiredEl) expiredEl.textContent = expired;
}

async function refreshMasterStats() {
  const master = await DB.getAllMaster();
  const countEl = document.getElementById('masterCount');
  if (countEl) countEl.textContent = master.length;
  
  // Rebuild index from PERMANENT storage
  State.masterIndex = buildMasterIndex(master);
  console.log('Master index rebuilt:', master.length, 'products');
}

// ========================================
// EDIT & DELETE
// ========================================
async function editItem(id) {
  const item = await DB.getHistory(id);
  
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  
  document.getElementById('editItemId').value = id;
  document.getElementById('editName').value = item.name || '';
  document.getElementById('editQty').value = item.qty || 1;
  document.getElementById('editRms').value = item.rms || '';
  
  document.getElementById('editModal').classList.add('show');
}

async function saveEdit() {
  const id = parseInt(document.getElementById('editItemId').value);
  const name = document.getElementById('editName').value.trim();
  const qty = parseInt(document.getElementById('editQty').value) || 1;
  const rms = document.getElementById('editRms').value.trim();
  
  const item = await DB.getHistory(id);
  
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  
  item.name = name;
  item.qty = qty;
  item.rms = rms;
  
  await DB.updateHistory(item);
  
  // Also update PERMANENT master data if name changed
  if (name && item.gtin14) {
    await DB.addMaster({ barcode: item.gtin14, name: name });
    await refreshMasterStats();
  }
  
  closeEditModal();
  await refreshAll();
  
  showToast('Item updated', 'success');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
}

async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  
  await DB.deleteHistory(id);
  await refreshAll();
  
  showToast('Item deleted', 'success');
}

// ========================================
// MASTER DATA - PERMANENT STORAGE
// ========================================
async function uploadMasterFile(file, append = false) {
  showLoading(true);
  
  try {
    const text = await file.text();
    const lines = text.trim().split(/[\r\n]+/);
    
    if (lines.length < 2) {
      showToast('File is empty or invalid', 'error');
      showLoading(false);
      return;
    }
    
    // Parse header
    const header = lines[0].toLowerCase();
    const delimiter = header.includes('\t') ? '\t' : ',';
    const headers = header.split(delimiter).map(h => h.trim().replace(/['"]/g, ''));
    
    // Find columns
    const barcodeIdx = headers.findIndex(h => 
      ['barcode', 'gtin', 'ean', 'upc', 'code', 'sku', 'productcode'].includes(h)
    );
    const nameIdx = headers.findIndex(h => 
      ['name', 'productname', 'product_name', 'description', 'product', 'item'].includes(h)
    );
    
    if (barcodeIdx === -1) {
      showToast('No barcode column found. Expected: Barcode, GTIN, EAN, UPC, Code', 'error');
      showLoading(false);
      return;
    }
    
    // Clear only if NOT appending
    if (!append) {
      await DB.clearMaster();
      console.log('Master data cleared for replacement');
    }
    
    // Prepare items
    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map(c => c.trim().replace(/['"]/g, ''));
      const barcode = cols[barcodeIdx];
      const name = nameIdx >= 0 ? cols[nameIdx] : '';
      
      if (barcode) {
        items.push({ barcode, name });
      }
    }
    
    // Bulk add to PERMANENT storage
    const count = await DB.addMasterBulk(items);
    
    await refreshMasterStats();
    showToast(`${append ? 'Appended' : 'Uploaded'} ${count} products`, 'success');
    console.log(`Master data ${append ? 'appended' : 'uploaded'}:`, count, 'products');
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Failed to process file: ' + err.message, 'error');
  }
  
  showLoading(false);
}

// ========================================
// EXPORT
// ========================================
async function exportCSV() {
  const history = await DB.getAllHistory();
  
  if (history.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }
  
  // Custom header order: RMS | BARCODE | DESCRIPTION | EXPIRY | BATCH | QUANTITY
  const headers = ['RMS', 'BARCODE (GTIN)', 'DESCRIPTION', 'EXPIRY (DDMMYY)', 'BATCH', 'QUANTITY'];
  
  const rows = history.map(h => [
    h.rms || '',
    h.gtin14 || h.gtin13 || '',
    h.name || '',
    h.expiryDDMMYY || '',
    h.batch || '',
    h.qty || 1
  ]);
  
  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  }
  
  downloadFile(csv, `pharmacy-export-${formatDate(new Date())}.csv`, 'text/csv');
  showToast('Export downloaded', 'success');
}

// ========================================
// BACKUP & RESTORE
// ========================================
async function downloadBackup() {
  const history = await DB.getAllHistory();
  const master = await DB.getAllMaster();
  
  const backup = {
    version: '4.0.0',
    timestamp: Date.now(),
    date: new Date().toISOString(),
    history: history,
    master: master
  };
  
  const json = JSON.stringify(backup, null, 2);
  downloadFile(json, `pharmacy-backup-${formatDate(new Date())}.json`, 'application/json');
  showToast('Backup downloaded', 'success');
}

async function restoreBackup(file) {
  showLoading(true);
  
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    
    if (!backup.history && !backup.master) {
      showToast('Invalid backup file', 'error');
      showLoading(false);
      return;
    }
    
    // Restore history
    if (backup.history && backup.history.length > 0) {
      await DB.clearHistory();
      for (const item of backup.history) {
        delete item.id; // Remove old IDs
        await DB.addHistory(item);
      }
    }
    
    // Restore PERMANENT master data
    if (backup.master && backup.master.length > 0) {
      await DB.clearMaster();
      await DB.addMasterBulk(backup.master);
    }
    
    await refreshMasterStats();
    await refreshAll();
    
    showToast(`Restored ${backup.history?.length || 0} history, ${backup.master?.length || 0} products`, 'success');
  } catch (err) {
    console.error('Restore error:', err);
    showToast('Failed to restore backup: ' + err.message, 'error');
  }
  
  showLoading(false);
}

// ========================================
// UTILITIES
// ========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.toggle('show', show);
  }
}

function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  
  switch (type) {
    case 'light': navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(30); break;
    case 'success': navigator.vibrate([30, 50, 30]); break;
    case 'error': navigator.vibrate([100, 50, 100]); break;
    case 'heavy': navigator.vibrate([50, 30, 50]); break;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================================
// NAVIGATION
// ========================================
function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // Show target page
  const page = document.getElementById(`page-${pageId}`);
  if (page) {
    page.classList.add('active');
  }
  
  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
  
  // Stop scanner when leaving scan page
  if (pageId !== 'scan' && State.scannerActive) {
    stopScanner();
  }
  
  // Hide scan result when showing scan page fresh
  if (pageId === 'scan') {
    document.getElementById('scanResult')?.classList.remove('show');
  }
  
  // Close side menu
  closeSideMenu();
  
  haptic('light');
}

function openSideMenu() {
  document.getElementById('menuOverlay')?.classList.add('show');
  document.getElementById('sideMenu')?.classList.add('show');
}

function closeSideMenu() {
  document.getElementById('menuOverlay')?.classList.remove('show');
  document.getElementById('sideMenu')?.classList.remove('show');
}

// ========================================
// ONLINE STATUS
// ========================================
function updateOnlineStatus() {
  const el = document.getElementById('onlineStatus');
  if (!el) return;
  
  if (navigator.onLine) {
    el.textContent = '● Online';
    el.className = 'online-status online';
  } else {
    el.textContent = '○ Offline';
    el.className = 'online-status offline';
  }
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
  });
  
  // Menu
  document.getElementById('btnMenu')?.addEventListener('click', openSideMenu);
  document.getElementById('menuOverlay')?.addEventListener('click', closeSideMenu);
  document.getElementById('closeSideMenu')?.addEventListener('click', closeSideMenu);
  
  // Scanner controls
  document.getElementById('btnStartScanner')?.addEventListener('click', startScanner);
  document.getElementById('btnSwitchCamera')?.addEventListener('click', switchCamera);
  document.getElementById('btnUploadImage')?.addEventListener('click', () => {
    document.getElementById('fileInputImage')?.click();
  });
  
  // Process manual entry from scan page
  document.getElementById('btnProcessManual')?.addEventListener('click', () => {
    const input = document.getElementById('scanManualInput');
    if (input && input.value.trim()) {
      processScan(input.value.trim());
      input.value = '';
    }
  });
  
  // Process paste page
  document.getElementById('btnProcessPaste')?.addEventListener('click', () => {
    const input = document.getElementById('pasteInput');
    if (input && input.value.trim()) {
      processMultipleCodes(input.value.trim());
      input.value = '';
    }
  });
  
  // History search
  document.getElementById('searchHistory')?.addEventListener('input', (e) => {
    State.searchQuery = e.target.value;
    refreshHistory();
  });
  
  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      State.currentFilter = tab.dataset.filter;
      refreshHistory();
    });
  });
  
  // Master data upload
  document.getElementById('btnUploadMaster')?.addEventListener('click', () => {
    document.getElementById('fileInputMaster')?.click();
  });
  
  document.getElementById('fileInputMaster')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadMasterFile(e.target.files[0], false); // Replace
      e.target.value = '';
    }
  });
  
  // Master data append
  document.getElementById('btnAppendMaster')?.addEventListener('click', () => {
    document.getElementById('fileInputAppend')?.click();
  });
  
  document.getElementById('fileInputAppend')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadMasterFile(e.target.files[0], true); // Append
      e.target.value = '';
    }
  });
  
  // Image upload for scanning
  document.getElementById('fileInputImage')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      scanImageFile(e.target.files[0]);
      e.target.value = '';
    }
  });
  
  // Export
  document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('menuExport')?.addEventListener('click', () => {
    closeSideMenu();
    exportCSV();
  });
  
  // Backup
  document.getElementById('btnBackup')?.addEventListener('click', downloadBackup);
  document.getElementById('menuBackup')?.addEventListener('click', () => {
    closeSideMenu();
    downloadBackup();
  });
  
  // Restore
  document.getElementById('btnRestore')?.addEventListener('click', () => {
    document.getElementById('fileInputRestore')?.click();
  });
  
  document.getElementById('fileInputRestore')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      restoreBackup(e.target.files[0]);
      e.target.value = '';
    }
  });
  
  // Clear history
  document.getElementById('btnClearHistory')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear ALL history? This cannot be undone.')) {
      await DB.clearHistory();
      await refreshAll();
      showToast('History cleared', 'success');
    }
  });
  
  // Edit modal
  document.getElementById('closeEditModal')?.addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit')?.addEventListener('click', closeEditModal);
  document.getElementById('saveEdit')?.addEventListener('click', saveEdit);
  
  // Click outside modal to close
  document.getElementById('editModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal();
  });
  
  // Online/offline
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

// ========================================
// INITIALIZATION
// ========================================
async function init() {
  console.log('Pharmacy Tracker v4.0.0 initializing...');
  
  try {
    // Initialize database
    await DB.init();
    console.log('Database initialized');
    
    // Load PERMANENT master data into memory index
    await refreshMasterStats();
    
    // Refresh all displays
    await refreshAll();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update online status
    updateOnlineStatus();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW registration failed:', err));
    }
    
    console.log('Pharmacy Tracker ready!');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to initialize app', 'error');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
