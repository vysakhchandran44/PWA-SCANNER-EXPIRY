/**
 * Expiry Tracker v5.0.0
 * Modern PWA for pharmacy expiry tracking
 * Features: GS1 parsing, GTIN-RMS matching, camera scanner, auto-save
 * By VYSAKH
 */

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  DB_NAME: 'ExpiryTrackerDB',
  DB_VERSION: 1,
  EXPIRY_SOON_DAYS: 90
};

// ========================================
// STATE
// ========================================
const State = {
  db: null,
  masterIndex: new Map(),
  masterRMS: new Map(),
  scannerActive: false,
  html5QrCode: null,
  cameras: [],
  currentCamera: 0,
  currentFilter: 'all',
  searchQuery: ''
};

// ========================================
// DATABASE
// ========================================
const DB = {
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        State.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          store.createIndex('gtin', 'gtin', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('master')) {
          const store = db.createObjectStore('master', { keyPath: 'barcode' });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });
  },
  
  // History operations
  async addHistory(item) {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.add(item);
      request.onsuccess = () => resolve(request.result);
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
  
  async getAllHistory() {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
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
  
  async clearHistory() {
    return new Promise((resolve, reject) => {
      const tx = State.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  // Master operations
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
  
  async bulkAddMaster(items) {
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
    gtin: '',
    expiry: '',
    expiryISO: '',
    expiryDisplay: '',
    batch: '',
    serial: '',
    qty: 1
  };
  
  if (!code) return result;
  
  code = code.trim().replace(/[\r\n]/g, '');
  
  // Check for GS1 format
  const hasAI = code.includes('(') || /^01\d{14}/.test(code);
  
  if (!hasAI) {
    // Plain barcode
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 8) {
      result.gtin = digits.padStart(14, '0');
    }
    return result;
  }
  
  // Parse GS1 AIs
  // GTIN (01)
  const gtinMatch = code.match(/\(01\)(\d{14})|01(\d{14})/);
  if (gtinMatch) {
    result.gtin = gtinMatch[1] || gtinMatch[2];
  }
  
  // Expiry (17)
  const expiryMatch = code.match(/\(17\)(\d{6})|17(\d{6})/);
  if (expiryMatch) {
    const yymmdd = expiryMatch[1] || expiryMatch[2];
    result.expiry = yymmdd;
    
    const yy = parseInt(yymmdd.substring(0, 2));
    const mm = parseInt(yymmdd.substring(2, 4));
    let dd = parseInt(yymmdd.substring(4, 6));
    
    const year = 2000 + yy;
    if (dd === 0) dd = new Date(year, mm, 0).getDate();
    
    result.expiryISO = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    result.expiryDisplay = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${year}`;
  }
  
  // Batch (10)
  const batchMatch = code.match(/\(10\)([^\(]+)|10([A-Za-z0-9]+)/);
  if (batchMatch) {
    result.batch = (batchMatch[1] || batchMatch[2] || '').trim();
  }
  
  // Serial (21)
  const serialMatch = code.match(/\(21\)([^\(]+)|21([A-Za-z0-9]+)/);
  if (serialMatch) {
    result.serial = (serialMatch[1] || serialMatch[2] || '').trim();
  }
  
  return result;
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
  State.masterIndex.clear();
  State.masterRMS.clear();
  
  for (const item of masterData) {
    const barcode = String(item.barcode || '').replace(/\D/g, '');
    const name = item.name || '';
    const rms = item.rms || '';
    
    if (!barcode) continue;
    
    // Exact match
    State.masterIndex.set(barcode, name);
    
    // GTIN-14 padded
    const gtin14 = barcode.padStart(14, '0');
    State.masterIndex.set(gtin14, name);
    
    // GTIN-13 (without leading zero)
    if (gtin14.startsWith('0')) {
      State.masterIndex.set(gtin14.slice(1), name);
    }
    
    // Last 8 digits
    if (barcode.length >= 8) {
      const last8 = barcode.slice(-8);
      if (!State.masterIndex.has(last8)) {
        State.masterIndex.set(last8, name);
      }
    }
    
    // RMS mapping
    if (rms) {
      State.masterRMS.set(barcode, rms);
      State.masterRMS.set(gtin14, rms);
    }
  }
}

function matchProduct(gtin) {
  if (!gtin) return { name: '', rms: '' };
  
  // Try exact match
  if (State.masterIndex.has(gtin)) {
    return {
      name: State.masterIndex.get(gtin),
      rms: State.masterRMS.get(gtin) || ''
    };
  }
  
  // Try GTIN-13
  const gtin13 = gtin.startsWith('0') ? gtin.slice(1) : gtin;
  if (State.masterIndex.has(gtin13)) {
    return {
      name: State.masterIndex.get(gtin13),
      rms: State.masterRMS.get(gtin13) || ''
    };
  }
  
  // Try last 8 digits
  const last8 = gtin.slice(-8);
  if (State.masterIndex.has(last8)) {
    return {
      name: State.masterIndex.get(last8),
      rms: State.masterRMS.get(last8) || ''
    };
  }
  
  return { name: '', rms: '' };
}

// ========================================
// PROCESS BARCODE
// ========================================
async function processBarcode(code) {
  if (!code || !code.trim()) return;
  
  code = code.trim();
  console.log('Processing:', code);
  
  const parsed = parseGS1(code);
  
  if (!parsed.gtin) {
    // Try to use raw as barcode
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 5) {
      parsed.gtin = digits.padStart(14, '0');
    } else {
      showToast('Invalid barcode', 'error');
      return;
    }
  }
  
  // Match product
  const match = matchProduct(parsed.gtin);
  
  // Create entry
  const entry = {
    raw: parsed.raw,
    gtin: parsed.gtin,
    name: match.name || 'Unknown Product',
    rms: match.rms || '',
    expiry: parsed.expiry,
    expiryISO: parsed.expiryISO,
    expiryDisplay: parsed.expiryDisplay,
    batch: parsed.batch,
    serial: parsed.serial,
    qty: 1,
    supplier: '',
    returnable: '',
    timestamp: Date.now()
  };
  
  // Save immediately
  const id = await DB.addHistory(entry);
  console.log('Saved entry ID:', id);
  
  showToast(`Added: ${entry.name}`, 'success');
  haptic('success');
  
  // Refresh UI
  await refreshAll();
  
  // Clear input
  const input = document.getElementById('barcodeInput');
  if (input) input.value = '';
}

// ========================================
// SCANNER
// ========================================
async function initScanner() {
  try {
    State.cameras = await Html5Qrcode.getCameras();
    if (State.cameras.length === 0) {
      showToast('No camera found', 'error');
      return false;
    }
    
    // Prefer back camera
    const backIdx = State.cameras.findIndex(c => 
      c.label.toLowerCase().includes('back') || 
      c.label.toLowerCase().includes('rear')
    );
    State.currentCamera = backIdx >= 0 ? backIdx : 0;
    
    return true;
  } catch (err) {
    console.error('Camera init error:', err);
    showToast('Camera access denied', 'error');
    return false;
  }
}

async function toggleScanner() {
  if (State.scannerActive) {
    await stopScanner();
  } else {
    await startScanner();
  }
}

async function startScanner() {
  if (State.cameras.length === 0) {
    const init = await initScanner();
    if (!init) return;
  }
  
  try {
    State.html5QrCode = new Html5Qrcode('reader');
    
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.ITF
      ]
    };
    
    await State.html5QrCode.start(
      State.cameras[State.currentCamera].id,
      config,
      onScanSuccess,
      () => {}
    );
    
    State.scannerActive = true;
    document.getElementById('scannerContainer').classList.add('show');
    document.getElementById('btnScanner').classList.add('active');
    document.getElementById('btnScanner').innerHTML = '<span>⏹️</span> Stop Scanner';
    
    haptic('medium');
  } catch (err) {
    console.error('Scanner error:', err);
    showToast('Scanner error: ' + err.message, 'error');
  }
}

async function stopScanner() {
  if (!State.html5QrCode) return;
  
  try {
    await State.html5QrCode.stop();
    State.html5QrCode.clear();
  } catch (err) {
    console.error('Stop scanner error:', err);
  }
  
  State.scannerActive = false;
  State.html5QrCode = null;
  document.getElementById('scannerContainer').classList.remove('show');
  document.getElementById('btnScanner').classList.remove('active');
  document.getElementById('btnScanner').innerHTML = '<span>📷</span> Open Camera Scanner';
}

async function onScanSuccess(decodedText) {
  console.log('Scanned:', decodedText);
  
  // Stop scanner
  await stopScanner();
  
  // Put in input field
  document.getElementById('barcodeInput').value = decodedText;
  
  // Process immediately
  await processBarcode(decodedText);
}

// ========================================
// UI REFRESH
// ========================================
async function refreshAll() {
  await Promise.all([
    refreshStats(),
    refreshRecent(),
    refreshHistory(),
    refreshMasterCount()
  ]);
}

async function refreshStats() {
  const history = await DB.getAllHistory();
  
  let expired = 0, expiring = 0, ok = 0;
  
  for (const item of history) {
    const status = getExpiryStatus(item.expiryISO);
    if (status === 'expired') expired++;
    else if (status === 'expiring') expiring++;
    else if (status === 'ok') ok++;
  }
  
  document.getElementById('statExpired').textContent = expired;
  document.getElementById('statExpiring').textContent = expiring;
  document.getElementById('statOk').textContent = ok;
}

async function refreshRecent() {
  const history = await DB.getAllHistory();
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  const recent = history.slice(0, 10);
  const container = document.getElementById('recentItems');
  
  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">No items yet</div>
        <div class="empty-text">Scan or paste a barcode to start</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = recent.map(item => renderItemCard(item)).join('');
}

async function refreshHistory() {
  const history = await DB.getAllHistory();
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  let filtered = history;
  
  // Apply filter
  if (State.currentFilter !== 'all') {
    filtered = history.filter(h => getExpiryStatus(h.expiryISO) === State.currentFilter);
  }
  
  // Apply search
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    filtered = filtered.filter(h => 
      (h.name && h.name.toLowerCase().includes(q)) ||
      (h.gtin && h.gtin.includes(q)) ||
      (h.batch && h.batch.toLowerCase().includes(q))
    );
  }
  
  const container = document.getElementById('historyList');
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No items found</div>
        <div class="empty-text">Try a different filter or search</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(item => renderItemCard(item, true)).join('');
}

function renderItemCard(item, showActions = true) {
  const status = getExpiryStatus(item.expiryISO);
  
  return `
    <div class="item-card ${status}" data-id="${item.id}">
      <div class="item-header">
        <div class="item-name">${escapeHtml(item.name || 'Unknown')}</div>
        <div class="item-expiry-badge">${item.expiryDisplay || 'No expiry'}</div>
      </div>
      <div class="item-details">
        <div class="item-detail">
          <span class="item-detail-label">GTIN:</span>
          <span class="item-detail-value">${item.gtin || '-'}</span>
        </div>
        <div class="item-detail">
          <span class="item-detail-label">Batch:</span>
          <span class="item-detail-value">${item.batch || '-'}</span>
        </div>
        <div class="item-detail">
          <span class="item-detail-label">RMS:</span>
          <span class="item-detail-value">${item.rms || '-'}</span>
        </div>
        <div class="item-detail">
          <span class="item-detail-label">Qty:</span>
          <span class="item-detail-value">${item.qty || 1}</span>
        </div>
      </div>
      ${showActions ? `
        <div class="item-actions">
          <button class="item-action-btn edit" onclick="editItem(${item.id})">
            ✏️ Edit
          </button>
          <button class="item-action-btn delete" onclick="deleteItem(${item.id})">
            🗑️ Delete
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

async function refreshMasterCount() {
  const master = await DB.getAllMaster();
  document.getElementById('masterCount').textContent = master.length;
  buildMasterIndex(master);
}

// ========================================
// EDIT/DELETE
// ========================================
async function editItem(id) {
  const item = await DB.getHistory(id);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  
  document.getElementById('editId').value = id;
  document.getElementById('editName').value = item.name || '';
  document.getElementById('editExpiry').value = item.expiryISO || '';
  document.getElementById('editBatch').value = item.batch || '';
  document.getElementById('editQty').value = item.qty || 1;
  document.getElementById('editRms').value = item.rms || '';
  document.getElementById('editSupplier').value = item.supplier || '';
  document.getElementById('editReturnable').value = item.returnable || '';
  
  document.getElementById('editModal').classList.add('show');
}

async function saveEdit() {
  const id = parseInt(document.getElementById('editId').value);
  const item = await DB.getHistory(id);
  
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }
  
  const expiryISO = document.getElementById('editExpiry').value;
  let expiryDisplay = '';
  
  if (expiryISO) {
    const d = new Date(expiryISO);
    expiryDisplay = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  
  item.name = document.getElementById('editName').value;
  item.expiryISO = expiryISO;
  item.expiryDisplay = expiryDisplay;
  item.batch = document.getElementById('editBatch').value;
  item.qty = parseInt(document.getElementById('editQty').value) || 1;
  item.rms = document.getElementById('editRms').value;
  item.supplier = document.getElementById('editSupplier').value;
  item.returnable = document.getElementById('editReturnable').value;
  
  await DB.updateHistory(item);
  
  // Update master if name changed
  if (item.name && item.gtin) {
    await DB.addMaster({ barcode: item.gtin, name: item.name, rms: item.rms });
    await refreshMasterCount();
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
// MASTER DATA
// ========================================
async function uploadMaster(file, append = false) {
  showLoading(true);
  
  try {
    const text = await file.text();
    const lines = text.trim().split(/[\r\n]+/);
    
    if (lines.length < 2) {
      showToast('Invalid file', 'error');
      showLoading(false);
      return;
    }
    
    // Parse header
    const header = lines[0].toLowerCase();
    const delim = header.includes('\t') ? '\t' : ',';
    const headers = header.split(delim).map(h => h.trim().replace(/['"]/g, ''));
    
    const barcodeIdx = headers.findIndex(h => 
      ['barcode', 'gtin', 'ean', 'code'].includes(h)
    );
    const nameIdx = headers.findIndex(h => 
      ['name', 'description', 'product'].includes(h)
    );
    const rmsIdx = headers.findIndex(h => 
      ['rms', 'rms code', 'rmscode'].includes(h)
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
      const cols = lines[i].split(delim).map(c => c.trim().replace(/['"]/g, ''));
      const barcode = cols[barcodeIdx];
      const name = nameIdx >= 0 ? cols[nameIdx] : '';
      const rms = rmsIdx >= 0 ? cols[rmsIdx] : '';
      
      if (barcode) {
        items.push({ barcode, name, rms });
      }
    }
    
    const count = await DB.bulkAddMaster(items);
    await refreshMasterCount();
    
    showToast(`${append ? 'Appended' : 'Uploaded'} ${count} products`, 'success');
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Upload failed: ' + err.message, 'error');
  }
  
  showLoading(false);
}

async function resetMaster() {
  if (!confirm('Reset all product data?')) return;
  
  await DB.clearMaster();
  await refreshMasterCount();
  
  showToast('Master data reset', 'success');
}

// ========================================
// EXPORT
// ========================================
async function exportData() {
  const history = await DB.getAllHistory();
  
  if (history.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }
  
  // Headers: RMS | BARCODE | DESCRIPTION | EXPIRY | BATCH | QTY | RETURNABLE | SUPPLIER
  const headers = ['RMS', 'BARCODE', 'DESCRIPTION', 'EXPIRY', 'BATCH', 'QTY', 'RETURNABLE', 'SUPPLIER'];
  
  const rows = history.map(h => [
    h.rms || '',
    h.gtin || '',
    h.name || '',
    h.expiryDisplay || '',
    h.batch || '',
    h.qty || 1,
    h.returnable || '',
    h.supplier || ''
  ]);
  
  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
  }
  
  downloadFile(csv, `expiry-export-${formatDate(new Date())}.csv`, 'text/csv');
  showToast('Export downloaded', 'success');
}

// ========================================
// BACKUP/RESTORE
// ========================================
async function downloadBackup() {
  const history = await DB.getAllHistory();
  const master = await DB.getAllMaster();
  
  const backup = {
    version: '5.0.0',
    timestamp: Date.now(),
    history,
    master
  };
  
  downloadFile(JSON.stringify(backup, null, 2), `backup-${formatDate(new Date())}.json`, 'application/json');
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
      await DB.bulkAddMaster(backup.master);
    }
    
    await refreshAll();
    showToast('Backup restored', 'success');
  } catch (err) {
    console.error('Restore error:', err);
    showToast('Restore failed', 'error');
  }
  
  showLoading(false);
}

async function clearHistory() {
  if (!confirm('Clear all history? This cannot be undone.')) return;
  
  await DB.clearHistory();
  await refreshAll();
  
  showToast('History cleared', 'success');
}

// ========================================
// NAVIGATION
// ========================================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageId}`).classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageId}"]`).classList.add('active');
  
  if (pageId !== 'home' && State.scannerActive) {
    stopScanner();
  }
  
  closeMenu();
  haptic('light');
}

function openMenu() {
  document.getElementById('menuOverlay').classList.add('show');
  document.getElementById('sideMenu').classList.add('show');
}

function closeMenu() {
  document.getElementById('menuOverlay').classList.remove('show');
  document.getElementById('sideMenu').classList.remove('show');
}

function filterItems(filter) {
  State.currentFilter = filter;
  
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.filter-tab[data-filter="${filter}"]`)?.classList.add('active');
  
  refreshHistory();
  showPage('history');
}

// ========================================
// UTILITIES
// ========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show);
}

function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  switch (type) {
    case 'light': navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(30); break;
    case 'success': navigator.vibrate([30, 50, 30]); break;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
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
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
  // Barcode input
  const barcodeInput = document.getElementById('barcodeInput');
  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processBarcode(barcodeInput.value);
    }
  });
  
  // Auto-process on paste
  barcodeInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      processBarcode(barcodeInput.value);
    }, 100);
  });
  
  // Scanner button
  document.getElementById('btnScanner').addEventListener('click', toggleScanner);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.addEventListener('click', () => showPage(nav.dataset.page));
  });
  
  // Menu
  document.getElementById('btnMenu').addEventListener('click', openMenu);
  document.getElementById('menuOverlay').addEventListener('click', closeMenu);
  
  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    State.searchQuery = e.target.value;
    refreshHistory();
  });
  
  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      State.currentFilter = tab.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      refreshHistory();
    });
  });
  
  // File inputs
  document.getElementById('fileMaster').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadMaster(e.target.files[0], false);
      e.target.value = '';
    }
  });
  
  document.getElementById('fileAppend').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadMaster(e.target.files[0], true);
      e.target.value = '';
    }
  });
  
  document.getElementById('fileRestore').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      restoreBackup(e.target.files[0]);
      e.target.value = '';
    }
  });
  
  // Edit modal
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal();
  });
}

// ========================================
// INITIALIZE
// ========================================
async function init() {
  console.log('Expiry Tracker v5.0.0 initializing...');
  
  try {
    await DB.init();
    console.log('Database ready');
    
    await refreshMasterCount();
    await refreshAll();
    
    setupEventListeners();
    
    // Focus barcode input
    setTimeout(() => {
      document.getElementById('barcodeInput').focus();
    }, 100);
    
    // Hide splash after animation
    setTimeout(() => {
      document.getElementById('splashScreen').classList.add('hide');
      document.getElementById('app').classList.add('show');
    }, 2500);
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    
    console.log('App ready!');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to initialize', 'error');
  }
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ========================================
// EXTERNAL API LOOKUPS
// ========================================

/**
 * Look up product from external APIs when not found in master
 * Tries: Brocade → Open Food Facts → UPCitemdb
 */
async function lookupExternalAPIs(gtin) {
  const cleanGtin = gtin.replace(/\D/g, '');
  
  // Try Brocade first (best for medicines)
  let result = await lookupBrocade(cleanGtin);
  if (result && result.name) return result;
  
  // Try Open Food Facts
  result = await lookupOpenFoodFacts(cleanGtin);
  if (result && result.name) return result;
  
  // Try UPCitemdb
  result = await lookupUPCItemDB(cleanGtin);
  if (result && result.name) return result;
  
  return null;
}

async function lookupBrocade(gtin) {
  try {
    const gtin14 = gtin.padStart(14, '0');
    const response = await fetch(`https://www.brocade.io/api/items/${gtin14}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      gtin: data.gtin14 || gtin,
      name: data.name || '',
      brand: data.brand_name || '',
      matchType: 'API'
    };
  } catch (e) {
    console.log('Brocade lookup failed:', e.message);
    return null;
  }
}

async function lookupOpenFoodFacts(barcode) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await response.json();
    
    if (data.status !== 1 || !data.product) return null;
    
    return {
      gtin: data.code || barcode,
      name: data.product.product_name || '',
      brand: data.product.brands || '',
      matchType: 'API'
    };
  } catch (e) {
    console.log('OpenFoodFacts lookup failed:', e.message);
    return null;
  }
}

async function lookupUPCItemDB(barcode) {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await response.json();
    
    if (data.code !== 'OK' || !data.items?.length) return null;
    
    return {
      gtin: data.items[0].ean || barcode,
      name: data.items[0].title || '',
      brand: data.items[0].brand || '',
      matchType: 'API'
    };
  } catch (e) {
    console.log('UPCitemdb lookup failed:', e.message);
    return null;
  }
}

// Override the original matchProduct to include API lookup
const originalMatchProduct = matchProduct;
matchProduct = async function(gtin) {
  // First try local master data
  const localResult = originalMatchProduct(gtin);
  
  if (localResult.name) {
    return localResult;
  }
  
  // If not found locally and online, try APIs
  if (navigator.onLine) {
    console.log('Product not in master, trying APIs...');
    const apiResult = await lookupExternalAPIs(gtin);
    
    if (apiResult && apiResult.name) {
      console.log('Found via API:', apiResult.name);
      
      // Auto-save to master for future use
      await DB.addMaster({
        barcode: gtin,
        name: apiResult.name,
        rms: ''
      });
      
      // Rebuild index
      const master = await DB.getAllMaster();
      buildMasterIndex(master);
      
      return {
        name: apiResult.name,
        rms: '',
        matchType: 'API'
      };
    }
  }
  
  return { name: '', rms: '', matchType: 'NONE' };
};

// Update processBarcode to handle async matchProduct
const originalProcessBarcode = processBarcode;
processBarcode = async function(code) {
  if (!code || !code.trim()) return;
  
  code = code.trim();
  console.log('Processing:', code);
  
  const parsed = parseGS1(code);
  
  if (!parsed.gtin) {
    const digits = code.replace(/\D/g, '');
    if (digits.length >= 5) {
      parsed.gtin = digits.padStart(14, '0');
    } else {
      showToast('Invalid barcode', 'error');
      return;
    }
  }
  
  // Show loading for API lookup
  showLoading(true);
  
  // Match product (now async with API fallback)
  const match = await matchProduct(parsed.gtin);
  
  showLoading(false);
  
  // Create entry
  const entry = {
    raw: parsed.raw,
    gtin: parsed.gtin,
    name: match.name || 'Unknown Product',
    rms: match.rms || '',
    matchType: match.matchType || 'NONE',
    expiry: parsed.expiry,
    expiryISO: parsed.expiryISO,
    expiryDisplay: parsed.expiryDisplay,
    batch: parsed.batch,
    serial: parsed.serial,
    qty: 1,
    supplier: '',
    returnable: '',
    timestamp: Date.now()
  };
  
  // Save immediately
  const id = await DB.addHistory(entry);
  console.log('Saved entry ID:', id);
  
  // Show appropriate toast
  if (match.matchType === 'API') {
    showToast(`Found via API: ${entry.name}`, 'success');
  } else if (match.name) {
    showToast(`Added: ${entry.name}`, 'success');
  } else {
    showToast('Added: Unknown Product (edit to add name)', 'warning');
  }
  
  haptic('success');
  
  // Refresh UI
  await refreshAll();
  
  // Clear input
  const input = document.getElementById('barcodeInput');
  if (input) input.value = '';
};

console.log('API integration loaded!');
