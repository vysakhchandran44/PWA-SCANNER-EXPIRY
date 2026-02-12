/**
 * BOOTS PHARMACY - Backwall Tracker v4.1.0
 * - Fixed GS1 parsing for expiry & batch
 * - Product not found → can update name
 * - PERMANENT master data
 * - INSTANT history saves
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
        
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
          historyStore.createIndex('gtin14', 'gtin14', { unique: false });
          historyStore.createIndex('gtinBatch', ['gtin14', 'batch'], { unique: false });
        }
        
        if (!db.objectStoreNames.contains('master')) {
          const masterStore = db.createObjectStore('master', { keyPath: 'barcode' });
          masterStore.createIndex('name', 'name', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  },
  
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
  
  async addMaster(item) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('master', 'readwrite');
      const store = tx.objectStore('master');
      const request = store.put(item);
      request.onsuccess = () => resolve();
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
// GS1 PARSER - FIXED FOR EXPIRY & BATCH
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
  
  console.log('Parsing GS1:', code);
  
  // Check if it has parentheses format (01)(17)(10) etc
  if (code.includes('(')) {
    result.isGS1 = true;
    
    // GTIN (01)
    const gtinMatch = code.match(/\(01\)(\d{14})/);
    if (gtinMatch) {
      result.gtin14 = gtinMatch[1];
      result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
    }
    
    // Expiry (17)
    const expiryMatch = code.match(/\(17\)(\d{6})/);
    if (expiryMatch) {
      const parsed = parseExpiryDate(expiryMatch[1]);
      result.expiryISO = parsed.iso;
      result.expiryDDMMYY = parsed.ddmmyy;
      result.expiryDisplay = parsed.display;
    }
    
    // Batch (10) - can contain letters and numbers
    const batchMatch = code.match(/\(10\)([^\(]+)/);
    if (batchMatch) {
      result.batch = batchMatch[1].trim();
    }
    
    // Serial (21)
    const serialMatch = code.match(/\(21\)([^\(]+)/);
    if (serialMatch) {
      result.serial = serialMatch[1].trim();
    }
    
    // Quantity (30)
    const qtyMatch = code.match(/\(30\)(\d+)/);
    if (qtyMatch) {
      result.qty = parseInt(qtyMatch[1]) || 1;
    }
  }
  // Raw GS1 without parentheses: 01...17...10...
  else if (code.match(/^01\d{14}/)) {
    result.isGS1 = true;
    
    // GTIN: 01 + 14 digits
    result.gtin14 = code.substring(2, 16);
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
    
    let remaining = code.substring(16);
    console.log('After GTIN, remaining:', remaining);
    
    // Look for 17 (expiry) - 17 + 6 digits YYMMDD
    const exp17Idx = remaining.indexOf('17');
    if (exp17Idx !== -1 && remaining.length >= exp17Idx + 8) {
      const expiryStart = exp17Idx + 2;
      const yymmdd = remaining.substring(expiryStart, expiryStart + 6);
      if (/^\d{6}$/.test(yymmdd)) {
        const parsed = parseExpiryDate(yymmdd);
        result.expiryISO = parsed.iso;
        result.expiryDDMMYY = parsed.ddmmyy;
        result.expiryDisplay = parsed.display;
        console.log('Found expiry:', yymmdd, '→', result.expiryDisplay);
        
        // Update remaining after expiry
        remaining = remaining.substring(0, exp17Idx) + remaining.substring(expiryStart + 6);
      }
    }
    
    // Look for 10 (batch) - 10 + variable length (ends at next AI or end)
    const batch10Idx = remaining.indexOf('10');
    if (batch10Idx !== -1) {
      let batchStart = batch10Idx + 2;
      let batchEnd = remaining.length;
      
      // Find next AI (21, 30, etc.)
      const nextAIs = ['21', '30', '37', '11', '13', '15', '16'];
      for (const ai of nextAIs) {
        const aiIdx = remaining.indexOf(ai, batchStart);
        if (aiIdx !== -1 && aiIdx < batchEnd) {
          batchEnd = aiIdx;
        }
      }
      
      result.batch = remaining.substring(batchStart, batchEnd).trim();
      console.log('Found batch:', result.batch);
    }
    
    // Look for 21 (serial)
    const serial21Idx = remaining.indexOf('21');
    if (serial21Idx !== -1) {
      let serialStart = serial21Idx + 2;
      let serialEnd = remaining.length;
      
      const nextAIs = ['10', '30', '37'];
      for (const ai of nextAIs) {
        const aiIdx = remaining.indexOf(ai, serialStart);
        if (aiIdx !== -1 && aiIdx < serialEnd) {
          serialEnd = aiIdx;
        }
      }
      
      result.serial = remaining.substring(serialStart, serialEnd).trim();
    }
    
    // Look for 30 (quantity)
    const qty30Idx = remaining.indexOf('30');
    if (qty30Idx !== -1) {
      const qtyMatch = remaining.substring(qty30Idx + 2).match(/^(\d+)/);
      if (qtyMatch) {
        result.qty = parseInt(qtyMatch[1]) || 1;
      }
    }
  }
  // Plain barcode (EAN-13, GTIN-14, etc.)
  else {
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 14) {
      result.gtin14 = digits.padStart(14, '0');
      result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
    }
  }
  
  console.log('Parsed result:', result);
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
// PRODUCT MATCHING
// ========================================
function buildMasterIndex(masterData) {
  const idx = { exact: new Map(), last8: new Map(), all: [] };
  
  for (const item of masterData) {
    const barcode = String(item.barcode).replace(/\D/g, '');
    const name = item.name || item.productName || '';
    
    if (!barcode || !name) continue;
    
    idx.exact.set(barcode, name);
    
    const gtin14 = barcode.padStart(14, '0');
    idx.exact.set(gtin14, name);
    
    if (gtin14.startsWith('0')) {
      idx.exact.set(gtin14.slice(1), name);
    }
    
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
  
  if (idx.exact.has(gtin14)) {
    return { name: idx.exact.get(gtin14), type: 'EXACT' };
  }
  
  if (idx.exact.has(gtin13)) {
    return { name: idx.exact.get(gtin13), type: 'EXACT' };
  }
  
  const last8 = gtin14.slice(-8);
  if (idx.last8.has(last8)) {
    const matches = idx.last8.get(last8);
    if (matches.length === 1) {
      return { name: matches[0].name, type: 'LAST8' };
    }
  }
  
  // SEQ-6 matching
  const searchStr = gtin14.slice(-10);
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
    
    const backCamIdx = State.availableCameras.findIndex(c => 
      c.label.toLowerCase().includes('back') || 
      c.label.toLowerCase().includes('rear') ||
      c.label.toLowerCase().includes('environment')
    );
    
    State.currentCameraIndex = backCamIdx >= 0 ? backCamIdx : 0;
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
      () => {}
    );
    
    State.scannerActive = true;
    document.getElementById('btnStartScanner').textContent = '⏹️ Stop Scanner';
    document.getElementById('scannerOverlay').style.display = 'flex';
    
    haptic('medium');
  } catch (err) {
    console.error('Scanner start error:', err);
    showToast('Could not start scanner: ' + err.message, 'error');
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
}

async function onScanSuccess(decodedText) {
  await stopScanner();
  haptic('success');
  
  const resultEl = document.getElementById('scanResult');
  const resultDataEl = document.getElementById('scanResultData');
  resultDataEl.textContent = decodedText;
  resultEl.classList.add('show');
  
  const manualInput = document.getElementById('scanManualInput');
  if (manualInput) {
    manualInput.value = decodedText;
  }
  
  await processScan(decodedText);
}

async function scanImageFile(file) {
  showLoading(true);
  
  try {
    const tempScanner = new Html5Qrcode('reader');
    const result = await tempScanner.scanFile(file, false);
    tempScanner.clear();
    
    haptic('success');
    
    const resultEl = document.getElementById('scanResult');
    const resultDataEl = document.getElementById('scanResultData');
    resultDataEl.textContent = result;
    resultEl.classList.add('show');
    
    document.getElementById('scanManualInput').value = result;
    
    await processScan(result);
  } catch (err) {
    showToast('Could not read barcode from image', 'error');
  }
  
  showLoading(false);
}

// ========================================
// PROCESS SCAN - WITH PRODUCT UPDATE
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
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 5) {
      parsed.gtin14 = digits.padStart(14, '0');
      parsed.gtin13 = parsed.gtin14.slice(1);
    } else {
      showToast('Invalid barcode format', 'error');
      return;
    }
  }
  
  // Match product
  const match = matchProduct(parsed.gtin14, parsed.gtin13);
  
  // Check for existing entry (smart inventory merge)
  let existingEntry = null;
  if (parsed.batch) {
    existingEntry = await DB.findByGtinBatch(parsed.gtin14, parsed.batch);
  }
  
  if (existingEntry) {
    existingEntry.qty = (existingEntry.qty || 1) + parsed.qty;
    existingEntry.timestamp = Date.now();
    await DB.updateHistory(existingEntry);
    showToast(`+${parsed.qty} qty (total: ${existingEntry.qty})`, 'success');
  } else {
    // Determine product name
    let productName = match.name;
    let matchType = match.type;
    
    // If product not found, mark as "Product Name Unknown"
    if (!productName || matchType === 'NONE') {
      productName = 'Product Name Unknown';
      matchType = 'NONE';
    }
    
    const entry = {
      raw: parsed.raw,
      gtin14: parsed.gtin14,
      gtin13: parsed.gtin13,
      name: productName,
      matchType: matchType,
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
    
    // If product not found, show edit modal immediately
    if (matchType === 'NONE') {
      showToast('Product not found - please enter name', 'warning');
      setTimeout(() => editItem(id), 500);
    } else {
      showToast(`Added: ${entry.name}`, 'success');
    }
  }
  
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
// REFRESH DISPLAYS
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
  history.sort((a, b) => b.timestamp - a.timestamp);
  
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
    const isUnknown = item.name === 'Product Name Unknown' || item.matchType === 'NONE';
    
    return `
      <div class="history-item ${status} ${isUnknown ? 'unknown-product' : ''}" data-id="${item.id}">
        <div class="item-header">
          <span class="item-name ${isUnknown ? 'needs-update' : ''}">${escapeHtml(item.name || 'Unknown')}</span>
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
          <button class="item-action-btn ${isUnknown ? 'highlight' : ''}" onclick="editItem(${item.id})">✏️ ${isUnknown ? 'Add Name' : 'Edit'}</button>
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
  
  State.masterIndex = buildMasterIndex(master);
  console.log('Master index rebuilt:', master.length, 'products');
}

// ========================================
// EDIT & DELETE - WITH MASTER UPDATE
// ========================================
async function editItem(id) {
  const item = await DB.getHistory(id);
  
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  
  document.getElementById('editItemId').value = id;
  document.getElementById('editName').value = item.name === 'Product Name Unknown' ? '' : (item.name || '');
  document.getElementById('editQty').value = item.qty || 1;
  document.getElementById('editRms').value = item.rms || '';
  
  document.getElementById('editModal').classList.add('show');
  
  // Focus on name field if product unknown
  if (item.name === 'Product Name Unknown' || !item.name) {
    setTimeout(() => document.getElementById('editName').focus(), 100);
  }
}

async function saveEdit() {
  const id = parseInt(document.getElementById('editItemId').value);
  const name = document.getElementById('editName').value.trim();
  const qty = parseInt(document.getElementById('editQty').value) || 1;
  const rms = document.getElementById('editRms').value.trim();
  
  if (!name) {
    showToast('Please enter product name', 'warning');
    return;
  }
  
  const item = await DB.getHistory(id);
  
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  
  item.name = name;
  item.qty = qty;
  item.rms = rms;
  item.matchType = 'MANUAL'; // Mark as manually updated
  
  await DB.updateHistory(item);
  
  // SAVE TO MASTER DATABASE - so next time this barcode is scanned, it will be recognized!
  if (name && item.gtin14) {
    await DB.addMaster({ barcode: item.gtin14, name: name });
    await refreshMasterStats();
    console.log('Saved to master:', item.gtin14, '→', name);
  }
  
  closeEditModal();
  await refreshAll();
  
  showToast('Saved! Product added to database.', 'success');
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
// MASTER DATA
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
    
    const header = lines[0].toLowerCase();
    const delimiter = header.includes('\t') ? '\t' : ',';
    const headers = header.split(delimiter).map(h => h.trim().replace(/['"]/g, ''));
    
    const barcodeIdx = headers.findIndex(h => 
      ['barcode', 'gtin', 'ean', 'upc', 'code', 'sku', 'productcode'].includes(h)
    );
    const nameIdx = headers.findIndex(h => 
      ['name', 'productname', 'product_name', 'description', 'product', 'item'].includes(h)
    );
    
    if (barcodeIdx === -1) {
      showToast('No barcode column found', 'error');
      showLoading(false);
      return;
    }
    
    if (!append) {
      await DB.clearMaster();
    }
    
    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map(c => c.trim().replace(/['"]/g, ''));
      const barcode = cols[barcodeIdx];
      const name = nameIdx >= 0 ? cols[nameIdx] : '';
      
      if (barcode) {
        items.push({ barcode, name });
      }
    }
    
    const count = await DB.addMasterBulk(items);
    
    await refreshMasterStats();
    showToast(`${append ? 'Appended' : 'Uploaded'} ${count} products`, 'success');
  } catch (err) {
    showToast('Failed to process file', 'error');
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
  
  downloadFile(csv, `boots-export-${formatDate(new Date())}.csv`, 'text/csv');
  showToast('Export downloaded', 'success');
}

// ========================================
// BACKUP & RESTORE
// ========================================
async function downloadBackup() {
  const history = await DB.getAllHistory();
  const master = await DB.getAllMaster();
  
  const backup = {
    version: '4.1.0',
    timestamp: Date.now(),
    history: history,
    master: master
  };
  
  const json = JSON.stringify(backup, null, 2);
  downloadFile(json, `boots-backup-${formatDate(new Date())}.json`, 'application/json');
  showToast('Backup downloaded', 'success');
}

async function restoreBackup(file) {
  showLoading(true);
  
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    
    if (backup.history) {
      await DB.clearHistory();
      for (const item of backup.history) {
        delete item.id;
        await DB.addHistory(item);
      }
    }
    
    if (backup.master) {
      await DB.clearMaster();
      await DB.addMasterBulk(backup.master);
    }
    
    await refreshMasterStats();
    await refreshAll();
    
    showToast('Backup restored', 'success');
  } catch (err) {
    showToast('Failed to restore', 'error');
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
  if (overlay) overlay.classList.toggle('show', show);
}

function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  
  switch (type) {
    case 'light': navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(30); break;
    case 'success': navigator.vibrate([30, 50, 30]); break;
    case 'error': navigator.vibrate([100, 50, 100]); break;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
  
  if (pageId !== 'scan' && State.scannerActive) {
    stopScanner();
  }
  
  if (pageId === 'scan') {
    document.getElementById('scanResult')?.classList.remove('show');
  }
  
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
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
  });
  
  document.getElementById('btnMenu')?.addEventListener('click', openSideMenu);
  document.getElementById('menuOverlay')?.addEventListener('click', closeSideMenu);
  document.getElementById('closeSideMenu')?.addEventListener('click', closeSideMenu);
  
  document.getElementById('btnStartScanner')?.addEventListener('click', startScanner);
  document.getElementById('btnSwitchCamera')?.addEventListener('click', switchCamera);
  document.getElementById('btnUploadImage')?.addEventListener('click', () => {
    document.getElementById('fileInputImage')?.click();
  });
  
  document.getElementById('btnProcessManual')?.addEventListener('click', () => {
    const input = document.getElementById('scanManualInput');
    if (input && input.value.trim()) {
      processScan(input.value.trim());
      input.value = '';
    }
  });
  
  document.getElementById('btnProcessPaste')?.addEventListener('click', () => {
    const input = document.getElementById('pasteInput');
    if (input && input.value.trim()) {
      processMultipleCodes(input.value.trim());
      input.value = '';
    }
  });
  
  document.getElementById('searchHistory')?.addEventListener('input', (e) => {
    State.searchQuery = e.target.value;
    refreshHistory();
  });
  
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      State.currentFilter = tab.dataset.filter;
      refreshHistory();
    });
  });
  
  document.getElementById('btnUploadMaster')?.addEventListener('click', () => {
    document.getElementById('fileInputMaster')?.click();
  });
  
  document.getElementById('fileInputMaster')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadMasterFile(e.target.files[0], false);
      e.target.value = '';
    }
  });
  
  document.getElementById('btnAppendMaster')?.addEventListener('click', () => {
    document.getElementById('fileInputAppend')?.click();
  });
  
  document.getElementById('fileInputAppend')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadMasterFile(e.target.files[0], true);
      e.target.value = '';
    }
  });
  
  document.getElementById('fileInputImage')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      scanImageFile(e.target.files[0]);
      e.target.value = '';
    }
  });
  
  document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('menuExport')?.addEventListener('click', () => {
    closeSideMenu();
    exportCSV();
  });
  
  document.getElementById('btnBackup')?.addEventListener('click', downloadBackup);
  document.getElementById('menuBackup')?.addEventListener('click', () => {
    closeSideMenu();
    downloadBackup();
  });
  
  document.getElementById('btnRestore')?.addEventListener('click', () => {
    document.getElementById('fileInputRestore')?.click();
  });
  
  document.getElementById('fileInputRestore')?.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      restoreBackup(e.target.files[0]);
      e.target.value = '';
    }
  });
  
  document.getElementById('btnClearHistory')?.addEventListener('click', async () => {
    if (confirm('Clear ALL history? This cannot be undone.')) {
      await DB.clearHistory();
      await refreshAll();
      showToast('History cleared', 'success');
    }
  });
  
  document.getElementById('closeEditModal')?.addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit')?.addEventListener('click', closeEditModal);
  document.getElementById('saveEdit')?.addEventListener('click', saveEdit);
  
  document.getElementById('editModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal();
  });
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

// ========================================
// INITIALIZATION
// ========================================
async function init() {
  console.log('BOOTS PHARMACY - Backwall Tracker v4.1.0');
  
  try {
    await DB.init();
    await refreshMasterStats();
    await refreshAll();
    setupEventListeners();
    updateOnlineStatus();
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err));
    }
    
    console.log('App ready!');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to initialize app', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
