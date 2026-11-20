'use strict';

const $ = id => document.getElementById(id);
const fields = ['coalUses', 'huskUses', 'coalYield', 'huskYield', 'bagasseYield'];

let db = null;
let storageMode = 'memory';
let memoryRecord = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    let request;
    try {
      request = indexedDB.open('FuelCalcDB', 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('records')) {
        database.createObjectStore('records', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database open failed'));
    request.onblocked = () => reject(new Error('Database open blocked'));
  });
}

function readLatestFromDB() {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('records', 'readonly');
      const request = tx.objectStore('records').get('latest');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Read failed'));
      tx.onerror = () => reject(tx.error || new Error('Read transaction failed'));
    } catch (error) {
      reject(error);
    }
  });
}

function saveToDB(record) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put({ ...record, id: 'latest' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Save failed'));
      tx.onabort = () => reject(tx.error || new Error('Save aborted'));
    } catch (error) {
      reject(error);
    }
  });
}

function tryLocalStorage() {
  try {
    const testKey = '__fuel_calc_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (_) {
    return false;
  }
}

function readLatestFallback() {
  if (storageMode === 'local') {
    try {
      return JSON.parse(window.localStorage.getItem('fuelCalcLatest') || 'null');
    } catch (_) {
      return null;
    }
  }
  return memoryRecord;
}

function saveFallback(record) {
  if (storageMode === 'local') {
    try {
      window.localStorage.setItem('fuelCalcLatest', JSON.stringify(record));
      return 'local';
    } catch (_) {
      storageMode = 'memory';
    }
  }
  memoryRecord = record;
  return 'memory';
}

function n(id) {
  const value = parseFloat($(id).value);
  return Number.isFinite(value) ? value : 0;
}

function fmt(value) {
  return (Number.isFinite(value) ? value : 0).toFixed(3);
}

function uses() {
  const coal = n('coalUses');
  const husk = n('huskUses');
  const bagasse = 100 - coal - husk;

  $('bagasseUses').value = bagasse.toFixed(1);

  return { coal, husk, bagasse };
}

function calculate() {
  const u = uses();
  const steam = n('steam');
  const ys = {
    coal: n('coalYield'),
    husk: n('huskYield'),
    bagasse: n('bagasseYield')
  };

  const vals = {
    coal: u.coal > 0 && ys.coal > 0 ? steam * u.coal / (ys.coal * 100) : 0,
    husk: u.husk > 0 && ys.husk > 0 ? steam * u.husk / (ys.husk * 100) : 0,
    bagasse: u.bagasse > 0 && ys.bagasse > 0 ? steam * u.bagasse / (ys.bagasse * 100) : 0
  };

  $('coalCons').textContent = fmt(vals.coal);
  $('huskCons').textContent = fmt(vals.husk);
  $('bagasseCons').textContent = fmt(vals.bagasse);

  $('rSteam').textContent = fmt(steam) + ' MT';
  $('rCoal').textContent = fmt(vals.coal) + ' MT';
  $('rHusk').textContent = fmt(vals.husk) + ' MT';
  $('rBagasse').textContent = fmt(vals.bagasse) + ' MT';
  const total = vals.coal + vals.husk + vals.bagasse;
  $('rTotal').textContent = fmt(total) + ' MT';

  return { u, ys, steam, vals, total };
}

function validate(x) {
  if (!(x.steam > 0)) return 'Steam Generation 0 से अधिक दर्ज करें।';
  if (x.u.coal < 0 || x.u.husk < 0 || x.u.bagasse < 0) {
    return 'Uses% का कुल 100% से अधिक नहीं होना चाहिए।';
  }
  if (Math.abs(x.u.coal + x.u.husk + x.u.bagasse - 100) > 0.001) {
    return 'तीनों Fuel का Total Uses% ठीक 100% होना चाहिए।';
  }
  for (const [key, label] of [['coal', 'Coal'], ['husk', 'Rice Husk'], ['bagasse', 'Bagasse']]) {
    if (x.u[key] > 0 && (!(x.ys[key] > 0) || x.ys[key] > 100)) {
      return `${label} का Yield% 0 से अधिक और 100 या उससे कम होना चाहिए।`;
    }
  }
  return '';
}

function showLastSaved(record) {
  if (!record) {
    $('lastSaved').textContent = 'No calculation saved yet.';
    return;
  }
  $('lastSaved').textContent =
    'Date & Time: ' + record.savedAt + ' | Steam: ' + fmt(record.steam) + ' MT';
}

async function init() {
  let last = null;

  try {
    db = await openDB();
    storageMode = 'indexedDB';
    last = await readLatestFromDB();
  } catch (_) {
    db = null;
    if (tryLocalStorage()) {
      storageMode = 'local';
      last = readLatestFallback();
    } else {
      storageMode = 'memory';
      last = memoryRecord;
    }
  }

  if (last) {
    for (const id of fields) {
      if (last[id] != null) $(id).value = last[id];
    }
    if (last.steam != null) $('steam').value = last.steam;
    showLastSaved(last);
  } else {
    $('coalUses').value = '0';
    $('huskUses').value = '0';
    $('coalYield').value = '';
    $('huskYield').value = '';
    $('bagasseYield').value = '';
    showLastSaved(null);
  }

  calculate();
}

for (const id of ['steam', ...fields]) {
  $(id).addEventListener('input', () => {
    calculate();
    $('message').textContent = '';
    $('message').style.color = '';
  });
}

$('save').addEventListener('click', async () => {
  const result = calculate();
  const error = validate(result);
  if (error) {
    $('message').style.color = '#b3261e';
    $('message').textContent = error;
    return;
  }

  const savedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  });
  const record = {
    ...Object.fromEntries(fields.map(id => [id, $(id).value])),
    steam: result.steam,
    savedAt,
    consumption: result.vals,
    total: result.total
  };

  try {
    if (storageMode === 'indexedDB' && db) {
      await saveToDB(record);
    } else {
      storageMode = saveFallback(record);
    }
    showLastSaved(record);
    $('message').style.color = '#0b654c';
    $('message').textContent = storageMode === 'memory'
      ? 'Calculation इस session में सेव हुआ है। Browser बंद करने पर डेटा सुरक्षित नहीं रहेगा।'
      : 'Calculation सफलतापूर्वक सेव हो गया।';
  } catch (_) {
    // If IndexedDB fails while saving, try browser storage, then keep the record in memory.
    db = null;
    storageMode = tryLocalStorage() ? 'local' : 'memory';
    const mode = saveFallback(record);
    showLastSaved(record);
    $('message').style.color = mode === 'memory' ? '#9a5b00' : '#0b654c';
    $('message').textContent = mode === 'memory'
      ? 'Calculation इस session में सेव हुआ है। Browser बंद करने पर डेटा सुरक्षित नहीं रहेगा।'
      : 'Calculation Local Storage में सेव हो गया।';
  }
});

$('clear').addEventListener('click', () => {
  $('steam').value = '';
  calculate();
  $('message').textContent = '';
  $('message').style.color = '';
});

init().catch(() => {
  // Do not block calculator operation if browser storage is unavailable.
  storageMode = 'memory';
  calculate();
  $('message').style.color = '#9a5b00';
  $('message').textContent = 'Browser storage उपलब्ध नहीं है। Calculator चालू है; Save किया गया डेटा केवल इस session तक रहेगा।';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
