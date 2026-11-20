
'use strict';

const $ = id => document.getElementById(id);

const fields = [
  'coalUses',
  'huskUses',
  'coalYield',
  'huskYield',
  'bagasseYield'
];

const fuelFields = [
  'coalUses',
  'huskUses',
  'coalYield',
  'huskYield',
  'bagasseYield'
];

let db = null;
let storageMode = 'memory';
let memoryRecords = {};

const DB_NAME = 'FuelCalcDB';
const STORE_NAME = 'records';
const STORAGE_KEY = 'fuelCalcDailyRecords';

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previousDayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return todayKey(date);
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    let request;

    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: 'id'
        });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error || new Error('Database open failed'));
    };

    request.onblocked = () => {
      reject(new Error('Database open blocked'));
    };
  });
}

function dbGet(id) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

function dbSave(record) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');

      tx.objectStore(STORE_NAME).put(record);

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
    const key = '__fuel_calc_test__';

    localStorage.setItem(key, '1');
    localStorage.removeItem(key);

    return true;
  } catch (_) {
    return false;
  }
}

function readLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function saveLocalRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

async function getRecord(dateKey) {
  if (storageMode === 'indexedDB' && db) {
    return await dbGet(dateKey);
  }

  if (storageMode === 'local') {
    return readLocalRecords()[dateKey] || null;
  }

  return memoryRecords[dateKey] || null;
}

async function saveRecord(record) {
  if (storageMode === 'indexedDB' && db) {
    await dbSave(record);
    return;
  }

  if (storageMode === 'local') {
    const records = readLocalRecords();
    records[record.id] = record;
    saveLocalRecords(records);
    return;
  }

  memoryRecords[record.id] = record;
}

function n(id) {
  const value = parseFloat($(id).value);
  return Number.isFinite(value) ? value : 0;
}

function fmt(value) {
  return (Number.isFinite(value) ? value : 0).toFixed(3);
}

function fmt2(value) {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function uses() {
  const coal = n('coalUses');
  const husk = n('huskUses');
  const bagasse = 100 - coal - husk;

  $('bagasseUses').value = fmt2(bagasse);

  return {
    coal,
    husk,
    bagasse
  };
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
    coal: u.coal > 0 && ys.coal > 0
      ? steam * u.coal / (ys.coal * 100)
      : 0,

    husk: u.husk > 0 && ys.husk > 0
      ? steam * u.husk / (ys.husk * 100)
      : 0,

    bagasse: u.bagasse > 0 && ys.bagasse > 0
      ? steam * u.bagasse / (ys.bagasse * 100)
      : 0
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

  return {
    u,
    ys,
    steam,
    vals,
    total
  };
}

function validate(x) {
  if (!(x.steam > 0)) {
    return 'Steam Generation 0 से अधिक दर्ज करें।';
  }

  if (x.u.coal < 0 || x.u.husk < 0 || x.u.bagasse < 0) {
    return 'Uses% का कुल 100% से अधिक नहीं होना चाहिए।';
  }

  if (Math.abs(x.u.coal + x.u.husk + x.u.bagasse - 100) > 0.001) {
    return 'तीनों Fuel का Total Uses% ठीक 100% होना चाहिए।';
  }

  for (const [key, label] of [
    ['coal', 'Coal'],
    ['husk', 'Rice Husk'],
    ['bagasse', 'Bagasse']
  ]) {
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
    'Date & Time: ' + record.savedAt +
    ' | Steam: ' + fmt(record.steam) + ' MT';
}

function setFuelValues(record) {
  if (!record) return;

  for (const id of fuelFields) {
    if (record[id] !== undefined && record[id] !== null) {
      $(id).value = fmt2(Number(record[id]));
    }
  }
}

async function loadTodayAndPrevious() {
  const today = todayKey();
  const previous = previousDayKey();

  const todayRecord = await getRecord(today);

  if (todayRecord) {
    setFuelValues(todayRecord);

    if (todayRecord.steam != null) {
      $('steam').value = todayRecord.steam;
    }

    showLastSaved(todayRecord);
    return;
  }

  const previousRecord = await getRecord(previous);

  if (previousRecord) {
    setFuelValues(previousRecord);
  } else {
    $('coalUses').value = '0.00';
    $('huskUses').value = '0.00';
    $('coalYield').value = '';
    $('huskYield').value = '';
    $('bagasseYield').value = '';
  }

  $('steam').value = '';
  showLastSaved(null);
}

async function init() {
  try {
    await openDB();
    storageMode = 'indexedDB';
  } catch (_) {
    db = null;

    if (tryLocalStorage()) {
      storageMode = 'local';
    } else {
      storageMode = 'memory';
    }
  }

  await loadTodayAndPrevious();
  calculate();
}

for (const id of ['steam', ...fields]) {
  $(id).addEventListener('input', () => {
    calculate();

    $('message').textContent = '';
    $('message').style.color = '';
  });

  if (id !== 'steam') {
    $(id).addEventListener('blur', () => {
      const value = $(id).value;

      if (value !== '' && Number.isFinite(parseFloat(value))) {
        $(id).value = fmt2(parseFloat(value));
      }
    });
  }
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

  const dateKey = todayKey();

  const record = {
    id: dateKey,
    dateKey,
    ...Object.fromEntries(
      fields.map(id => [id, fmt2(n(id))])
    ),
    steam: result.steam,
    savedAt,
    consumption: result.vals,
    total: result.total
  };

  try {
    await saveRecord(record);

    showLastSaved(record);

    $('message').style.color = '#0b654c';
    $('message').textContent = 'Calculation सफलतापूर्वक सेव हो गया।';
  } catch (_) {
    db = null;

    if (tryLocalStorage()) {
      storageMode = 'local';

      try {
        await saveRecord(record);

        showLastSaved(record);
        $('message').style.color = '#0b654c';
        $('message').textContent = 'Calculation Local Storage में सेव हो गया।';

        return;
      } catch (_) {
        storageMode = 'memory';
      }
    } else {
      storageMode = 'memory';
    }

    memoryRecords[dateKey] = record;

    showLastSaved(record);

    $('message').style.color = '#9a5b00';
    $('message').textContent =
      'Calculation इस session में सेव हुआ है। Browser बंद करने पर डेटा सुरक्षित नहीं रहेगा।';
  }
});

$('clear').addEventListener('click', () => {
  $('steam').value = '';

  calculate();

  $('message').textContent = '';
  $('message').style.color = '';
});

init().catch(() => {
  storageMode = 'memory';

  calculate();

  $('message').style.color = '#9a5b00';
  $('message').textContent =
    'Browser storage उपलब्ध नहीं है। Calculator चालू है; Save किया गया डेटा केवल इस session तक रहेगा।';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
