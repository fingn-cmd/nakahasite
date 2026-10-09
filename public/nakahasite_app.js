// ==========================================
// NAKAHASITE SAAS FRONTEND CORE JAVASCRIPT
// ==========================================

let currentUser = null;
let authToken = localStorage.getItem('nakahasite_token') || null;
let cachedOrders = [];
let cachedStaff = [];
let cachedSettings = {};
let cachedBranches = [];
let cachedCategories = [];
let selectedBranchId = 'Semua';
let selectedOrderForUpdate = null;
let selectedOrderForQuote = null;
let currentViewingOrderId = null;
let html5QrScannerInstance = null;

// Currency Formatter
function formatRupiah(num) {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

// Audio Feedback (Subtle Web Audio API beep)
function playBeepSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

// API Fetch Helper with Authorization Header
async function apiRequest(endpoint, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // If body is NOT FormData, set JSON content-type
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  options.headers = headers;

  const res = await fetch(endpoint, options);
  if (res.status === 401) {
    handleSessionExpired();
    throw new Error('Sesi berakhir. Silakan login kembali.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Terjadi kesalahan pada sistem.');
  }

  return data;
}

function handleSessionExpired() {
  localStorage.removeItem('nakahasite_token');
  localStorage.removeItem('nakahasite_user');
  authToken = null;
  currentUser = null;
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

// ==========================================
// 1. AUTHENTICATION & SESSION LIFECYCLE
// ==========================================

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginSubmitBtn');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Memverifikasi...';

  try {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('nakahasite_token', authToken);
    localStorage.setItem('nakahasite_user', JSON.stringify(currentUser));

    initAppView();
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Selamat datang, ${currentUser.name}!`,
      showConfirmButton: false,
      timer: 2000
    });
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Masuk',
      text: err.message,
      confirmButtonColor: '#10b981'
    });
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Masuk ke Dashboard</span> <i class="fa-solid fa-arrow-right text-xs"></i>';
  }
}

async function handleLogout() {
  const result = await Swal.fire({
    title: 'Keluar dari Nakahasite?',
    text: 'Sesi akun Anda saat ini akan diakhiri.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#334155',
    confirmButtonText: 'Ya, Keluar',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    handleSessionExpired();
  }
}

async function checkSavedSession() {
  if (!authToken) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    return;
  }

  try {
    const data = await apiRequest('/api/auth/me');
    currentUser = data.user;
    initAppView();
  } catch (e) {
    handleSessionExpired();
  }
}

function initAppView() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  // Display User info & Role Badge
  document.getElementById('userDisplayName').innerText = currentUser.name;
  const roleBadge = document.getElementById('userRoleBadge');
  roleBadge.innerText = currentUser.role.toUpperCase();

  if (currentUser.role === 'owner') {
    roleBadge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30';
  } else if (currentUser.role === 'technician') {
    roleBadge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30';
  } else {
    roleBadge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
  }

  // RBAC Access Control (Hide Owner tabs if not owner)
  const isOwner = currentUser.role === 'owner';
  document.querySelectorAll('.owner-only').forEach(el => {
    if (isOwner) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  // Load Initial Data
  loadSettings();
  fetchBranches();
  fetchCategories();
  fetchOrders();
  fetchStaffList();
  fetchSpareparts();

  // If owner, pre-fetch monthly report
  if (isOwner) {
    fetchMonthlyReport();
  }

  // Init canvas signature pad
  initSignaturePad();
}

// ==========================================
// 2. TAB SWITCHING NAVIGATION
// ==========================================

function switchTab(tabName) {
  const tabs = ['orders', 'reports', 'staff', 'spareparts', 'settings'];

  tabs.forEach(t => {
    const tabEl = document.getElementById(`tab-${t}`);
    const btnEl = document.getElementById(`tabBtn-${t}`);
    if (tabEl) tabEl.classList.add('hidden');
    if (btnEl) {
      btnEl.classList.remove('border-emerald-400', 'text-emerald-400');
      btnEl.classList.add('border-transparent', 'text-slate-400');
    }
  });

  const activeTab = document.getElementById(`tab-${tabName}`);
  const activeBtn = document.getElementById(`tabBtn-${tabName}`);
  if (activeTab) activeTab.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('border-emerald-400', 'text-emerald-400');
    activeBtn.classList.remove('border-transparent', 'text-slate-400');
  }

  if (tabName === 'reports' && currentUser.role === 'owner') {
    fetchMonthlyReport();
  } else if (tabName === 'staff' && currentUser.role === 'owner') {
    fetchStaffList();
  } else if (tabName === 'spareparts') {
    fetchSpareparts();
  } else if (tabName === 'settings' && currentUser.role === 'owner') {
    fetchBranches();
    fetchCategories();
  }
}

// ==========================================
// 3. MULTI-LOCATION (BRANCH) LOGIC
// ==========================================

function handleBranchSwitch() {
  selectedBranchId = document.getElementById('headerBranchSelect').value;
  const repBranch = document.getElementById('reportBranchSelect');
  if (repBranch && repBranch.value !== selectedBranchId) {
    repBranch.value = selectedBranchId;
  }
  fetchOrders();
  if (currentUser && currentUser.role === 'owner') {
    fetchMonthlyReport();
  }
}

async function fetchBranches() {
  try {
    const branches = await apiRequest('/api/branches');
    cachedBranches = branches;
    renderBranchOptions(branches);
    renderBranchesTable(branches);
  } catch (err) {
    console.error('Error fetching branches:', err);
  }
}

function renderBranchOptions(branches) {
  // 1. Header branch selector
  const hSel = document.getElementById('headerBranchSelect');
  if (hSel) {
    const curVal = hSel.value || selectedBranchId;
    hSel.innerHTML = '<option value="Semua">🏢 Semua Cabang</option>';
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.innerText = `📍 ${b.name}${b.isMain ? ' (Pusat)' : ''}`;
      hSel.appendChild(opt);
    });
    hSel.value = curVal;
  }

  // 2. Report branch selector
  const rSel = document.getElementById('reportBranchSelect');
  if (rSel) {
    const curVal = rSel.value || selectedBranchId;
    rSel.innerHTML = '<option value="Semua">🏢 Semua Cabang (Konsolidasi)</option>';
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.innerText = `📍 ${b.name}`;
      rSel.appendChild(opt);
    });
    rSel.value = curVal;
  }

  // 3. New Order modal branch selector
  const inpBranch = document.getElementById('inpBranch');
  if (inpBranch) {
    inpBranch.innerHTML = '';
    branches.filter(b => b.active !== false).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.innerText = `${b.name}${b.isMain ? ' (Pusat)' : ''}`;
      if (b.id === selectedBranchId && selectedBranchId !== 'Semua') {
        opt.selected = true;
      }
      inpBranch.appendChild(opt);
    });
  }
}

function renderBranchesTable(branches) {
  const tbody = document.getElementById('branchesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  branches.forEach(b => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-850/50 transition';
    tr.innerHTML = `
      <td class="p-3">
        <span class="font-bold text-white block">${b.name}</span>
        ${b.isMain ? '<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">KANTOR PUSAT</span>' : ''}
      </td>
      <td class="p-3 text-slate-300">${b.address || '-'}</td>
      <td class="p-3 text-slate-300 font-mono">${b.phone || '-'}</td>
      <td class="p-3 text-center">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${b.active !== false ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">
          ${b.active !== false ? 'Aktif' : 'Nonaktif'}
        </span>
      </td>
      <td class="p-3 text-center">
        ${!b.isMain ? `
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="toggleBranchActive('${b.id}', ${b.active === false})" class="p-1 rounded bg-surface-800 hover:bg-surface-700 text-slate-300 text-xs" title="${b.active === false ? 'Aktifkan' : 'Nonaktifkan'}">
              <i class="fa-solid fa-power-off text-[11px]"></i>
            </button>
            <button onclick="deleteBranch('${b.id}', '${b.name}')" class="p-1 rounded bg-surface-800 hover:bg-red-600 hover:text-white text-slate-400 text-xs" title="Hapus Cabang">
              <i class="fa-solid fa-trash-can text-[11px]"></i>
            </button>
          </div>
        ` : '<span class="text-[10px] text-slate-500 italic">Pusat</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openNewBranchModal() {
  document.getElementById('newBranchForm').reset();
  const modal = document.getElementById('newBranchModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewBranchModal() {
  const modal = document.getElementById('newBranchModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleCreateBranch(e) {
  e.preventDefault();
  const name = document.getElementById('branchNameInput').value.trim();
  const address = document.getElementById('branchAddressInput').value.trim();
  const phone = document.getElementById('branchPhoneInput').value.trim();

  try {
    await apiRequest('/api/branches', {
      method: 'POST',
      body: JSON.stringify({ name, address, phone })
    });
    closeNewBranchModal();
    fetchBranches();
    Swal.fire('Berhasil', `Cabang "${name}" berhasil ditambahkan.`, 'success');
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

async function toggleBranchActive(id, newActive) {
  try {
    await apiRequest(`/api/branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: newActive })
    });
    fetchBranches();
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

async function deleteBranch(id, name) {
  const result = await Swal.fire({
    title: `Hapus Cabang ${name}?`,
    text: 'Pesanan yang telah dibuat pada cabang ini tetap tersimpan.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#334155',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      await apiRequest(`/api/branches/${id}`, { method: 'DELETE' });
      fetchBranches();
      Swal.fire('Terhapus', 'Cabang berhasil dihapus.', 'success');
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  }
}

// ==========================================
// 4. CUSTOM BUSINESS CATEGORIES LOGIC
// ==========================================

async function fetchCategories() {
  try {
    const categories = await apiRequest('/api/categories');
    cachedCategories = categories;
    renderCategoriesOptions(categories);
    renderCategoriesGrid(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
  }
}

function renderCategoriesOptions(categories) {
  // 1. Populate #inpCategory in #newOrderModal
  const inpCat = document.getElementById('inpCategory');
  if (inpCat) {
    const cur = inpCat.value;
    inpCat.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      inpCat.appendChild(opt);
    });
    if (cur) inpCat.value = cur;
  }

  // 2. Populate #filterCategory in order table filter
  const filterCat = document.getElementById('filterCategory');
  if (filterCat) {
    const cur = filterCat.value || 'Semua';
    filterCat.innerHTML = '<option value="Semua">Semua Kategori</option>';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      filterCat.appendChild(opt);
    });
    filterCat.value = cur;
  }
}

function renderCategoriesGrid(categories) {
  const grid = document.getElementById('categoriesListGrid');
  if (!grid) return;
  grid.innerHTML = '';

  categories.forEach(c => {
    const div = document.createElement('div');
    div.className = 'p-3.5 rounded-2xl bg-surface-850 border border-surface-800 flex items-start justify-between gap-3';
    div.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-sm border border-blue-500/20 shrink-0">
          <i class="fa-solid ${c.icon || 'fa-tag'}"></i>
        </div>
        <div>
          <span class="font-bold text-white text-xs block">${c.name}</span>
          <p class="text-[11px] text-slate-400 mt-0.5">${c.description || '-'}</p>
          <span class="text-[10px] text-slate-500 font-mono mt-1 block">ID: ${c.id}</span>
        </div>
      </div>
      <div>
        ${!c.isDefault ? `
          <button onclick="deleteCategory('${c.id}', '${c.name}')" class="p-1.5 rounded-lg bg-surface-800 hover:bg-red-600 hover:text-white text-slate-400 text-xs transition" title="Hapus Kategori">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        ` : `
          <span class="text-[9px] font-bold px-2 py-0.5 rounded bg-surface-800 text-slate-400 border border-surface-700">DEFAULT</span>
        `}
      </div>
    `;
    grid.appendChild(div);
  });
}

function openNewCategoryModal() {
  document.getElementById('newCategoryForm').reset();
  const modal = document.getElementById('newCategoryModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewCategoryModal() {
  const modal = document.getElementById('newCategoryModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const name = document.getElementById('catNameInput').value.trim();
  const icon = document.getElementById('catIconInput').value;
  const description = document.getElementById('catDescInput').value.trim();

  try {
    await apiRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, icon, description })
    });
    closeNewCategoryModal();
    fetchCategories();
    Swal.fire('Berhasil', `Kategori "${name}" berhasil ditambahkan.`, 'success');
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

async function deleteCategory(id, name) {
  const result = await Swal.fire({
    title: `Hapus Kategori ${name}?`,
    text: 'Pesanan sebelumnya dengan kategori ini tetap aman.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#334155',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      await apiRequest(`/api/categories/${id}`, { method: 'DELETE' });
      fetchCategories();
      Swal.fire('Terhapus', 'Kategori berhasil dihapus.', 'success');
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  }
}

// ==========================================
// 5. BARCODE & IMEI LIVE CAMERA SCANNER
// ==========================================

async function openImeiScannerModal() {
  const modal = document.getElementById('scannerModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const resultBox = document.getElementById('scannerResultBox');
  if (resultBox) {
    resultBox.classList.add('hidden');
    resultBox.innerText = '';
    resultBox.className = 'p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs text-center font-mono font-bold';
  }

  // Clear previous instance if any
  if (html5QrScannerInstance) {
    try {
      await html5QrScannerInstance.stop();
    } catch(e) {}
    html5QrScannerInstance = null;
  }

  try {
    html5QrScannerInstance = new Html5Qrcode("scannerReader");
    const config = {
      fps: 15,
      qrbox: { width: 260, height: 160 },
      aspectRatio: 1.5
    };

    const onScanSuccess = (decodedText, decodedResult) => {
      playBeepSound();

      if (resultBox) {
        resultBox.innerText = `Terdeteksi: ${decodedText}`;
        resultBox.classList.remove('hidden');
      }

      const imeiInput = document.getElementById('inpSerialOrImei');
      if (imeiInput) {
        imeiInput.value = decodedText;
      }

      if (html5QrScannerInstance) {
        html5QrScannerInstance.stop().then(() => {
          html5QrScannerInstance = null;
          setTimeout(() => {
            closeImeiScannerModal();
          }, 600);
        }).catch(() => {
          closeImeiScannerModal();
        });
      } else {
        closeImeiScannerModal();
      }
    };

    // Try starting with back camera, fallback to any camera available
    try {
      await html5QrScannerInstance.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        () => {}
      );
    } catch (camErr) {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        await html5QrScannerInstance.start(
          cameras[0].id,
          config,
          onScanSuccess,
          () => {}
        );
      } else {
        throw new Error('Tidak ada modul kamera yang terdeteksi di perangkat Anda.');
      }
    }

  } catch (err) {
    console.error('Scanner init error:', err);
    if (resultBox) {
      resultBox.innerText = `Akses Kamera: ${err.message || 'Kamera tidak dapat diakses.'}`;
      resultBox.classList.remove('hidden');
      resultBox.className = 'p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs text-center font-mono';
    }
  }
}

async function closeImeiScannerModal() {
  if (html5QrScannerInstance) {
    try {
      await html5QrScannerInstance.stop();
    } catch(e) {}
    html5QrScannerInstance = null;
  }
  const modal = document.getElementById('scannerModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ==========================================
// 6. ORDERS MANAGEMENT & METRICS
// ==========================================

let searchDebounceTimer = null;
function debounceOrdersFetch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(fetchOrders, 300);
}

async function fetchOrders() {
  try {
    const status = document.getElementById('filterStatus').value;
    const category = document.getElementById('filterCategory').value;
    const search = document.getElementById('orderSearchInput').value.trim();
    const sort = document.getElementById('sortOrders') ? document.getElementById('sortOrders').value : 'oldest';

    const queryParams = new URLSearchParams();
    if (status && status !== 'Semua') queryParams.append('status', status);
    if (category && category !== 'Semua') queryParams.append('category', category);
    if (search) queryParams.append('search', search);
    if (sort) queryParams.append('sort', sort);
    if (selectedBranchId && selectedBranchId !== 'Semua') queryParams.append('branchId', selectedBranchId);

    const orders = await apiRequest(`/api/orders?${queryParams.toString()}`);
    cachedOrders = orders;
    renderOrdersTable(orders);
    updateOperationalMetrics(orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
  }
}

function updateOperationalMetrics(allOrders) {
  const activeOrders = allOrders.filter(o => o.status !== 'Selesai & Diambil' && o.status !== 'Gagal Servis / Batal');
  const inProgress = allOrders.filter(o => o.status === 'Sedang Dikerjakan');
  const waitingParts = allOrders.filter(o => o.status === 'Menunggu Stok / Sparepart');
  const readyPickup = allOrders.filter(o => o.status === 'Selesai');
  const completed = allOrders.filter(o => o.status === 'Selesai & Diambil');

  document.getElementById('metricActiveOrders').innerText = activeOrders.length;
  document.getElementById('metricInProgress').innerText = inProgress.length;
  document.getElementById('metricWaitingParts').innerText = waitingParts.length;
  document.getElementById('metricReadyPickup').innerText = readyPickup.length;
  document.getElementById('metricCompletedThisMonth').innerText = completed.length;
  document.getElementById('activeOrdersBadge').innerText = activeOrders.length;
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  const emptyState = document.getElementById('ordersEmptyState');
  tbody.innerHTML = '';

  if (!orders || orders.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  orders.forEach(order => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-850/60 transition group';

    // Status Badge Styling
    let statusClass = 'bg-surface-800 text-slate-300 border-surface-700';
    let statusDot = 'bg-slate-400';
    if (order.status === 'Pesanan Diterima') {
      statusClass = 'bg-blue-950/60 text-blue-400 border-blue-800/80';
      statusDot = 'bg-blue-400';
    } else if (order.status === 'Sedang Dikerjakan') {
      statusClass = 'bg-amber-950/60 text-amber-400 border-amber-800/80';
      statusDot = 'bg-amber-400 animate-pulse';
    } else if (order.status === 'Menunggu Stok / Sparepart') {
      statusClass = 'bg-indigo-950/60 text-indigo-400 border-indigo-800/80';
      statusDot = 'bg-indigo-400';
    } else if (order.status === 'Selesai') {
      statusClass = 'bg-teal-950/60 text-teal-400 border-teal-800/80';
      statusDot = 'bg-teal-400';
    } else if (order.status === 'Selesai & Diambil') {
      statusClass = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80';
      statusDot = 'bg-emerald-400';
    } else if (order.status === 'Gagal Servis / Batal') {
      statusClass = 'bg-red-950/60 text-red-400 border-red-800/80';
      statusDot = 'bg-red-400';
    }

    // Dynamic Category Icon
    let catIcon = 'fa-tag';
    const foundCat = cachedCategories.find(c => c.id === order.category);
    if (foundCat && foundCat.icon) {
      catIcon = foundCat.icon;
    } else if (order.category === 'gadget') catIcon = 'fa-mobile-screen';
    else if (order.category === 'laptop') catIcon = 'fa-laptop';
    else if (order.category === 'vehicle') catIcon = 'fa-motorcycle';
    else if (order.category === 'printing') catIcon = 'fa-print';

    // Photos Thumbnail
    let photoThumbHtml = '<span class="text-[10px] text-slate-500 italic">Tanpa foto</span>';
    if (order.photos && order.photos.length > 0) {
      photoThumbHtml = `
        <div class="flex items-center gap-1">
          <div class="relative w-8 h-8 rounded-lg overflow-hidden border border-surface-700 bg-surface-950">
            <img src="${order.photos[0]}" class="w-full h-full object-cover">
          </div>
          ${order.photos.length > 1 ? `<span class="text-[10px] text-slate-400 font-mono">+${order.photos.length - 1}</span>` : ''}
        </div>
      `;
    }

    // Payment Status Badge
    let payClass = 'bg-slate-800 text-slate-400';
    let payText = 'Belum Bayar';
    if (order.status === 'Gagal Servis / Batal') {
      payClass = 'bg-red-950/50 text-red-400 border border-red-800/60';
      payText = 'Dibatalkan (Rp 0)';
    } else if (order.status === 'Selesai & Diambil' || order.paymentStatus === 'paid') {
      payClass = 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/60';
      payText = 'LUNAS';
    } else if (order.downPayment > 0) {
      payClass = 'bg-amber-950/50 text-amber-400 border border-amber-800/60';
      payText = `DP: ${formatRupiah(order.downPayment)}`;
    }

    // Online Quote Badge
    let quoteBadgeHtml = '';
    if (order.quoteStatus === 'pending') {
      quoteBadgeHtml = `<span class="mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse"><i class="fa-solid fa-clock mr-1"></i>Quote: Menunggu</span>`;
    } else if (order.quoteStatus === 'accepted') {
      quoteBadgeHtml = `<span class="mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800"><i class="fa-solid fa-check mr-1"></i>Quote: Disetujui</span>`;
    } else if (order.quoteStatus === 'declined') {
      quoteBadgeHtml = `<span class="mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800"><i class="fa-solid fa-xmark mr-1"></i>Quote: Ditolak</span>`;
    }

    // Payment Confirmation Alert (When Customer claimed payment via QRIS / WA)
    let paymentConfirmHtml = '';
    if (order.paymentConfirmation && order.paymentConfirmation.status === 'pending_verification') {
      paymentConfirmHtml = `
        <div class="mt-1">
          <button onclick="verifyCustomerPayment('${order.id}')" class="px-2 py-0.5 rounded bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-300 border border-yellow-500/50 text-[10px] font-bold animate-pulse flex items-center gap-1">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Bukti Bayar Masuk! Verifikasi</span>
          </button>
        </div>
      `;
    }

    tr.innerHTML = `
      <td class="p-3.5">
        <span class="font-mono font-bold text-white block">${order.ticketNo}</span>
        <span class="text-[10px] text-slate-400 block">${new Date(order.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
        <span class="text-[10px] text-emerald-400/90 font-medium block truncate mt-0.5">
          <i class="fa-solid fa-store text-[9px] mr-1"></i>${order.branchName || 'Kantor Pusat'}
        </span>
      </td>

      <td class="p-3.5">
        <span class="font-bold text-slate-200 block">${order.customerName}</span>
        <a href="https://wa.me/${order.customerPhone}" target="_blank" class="text-[11px] text-emerald-400 hover:underline flex items-center gap-1">
          <i class="fa-brands fa-whatsapp"></i> ${order.customerPhone}
        </a>
      </td>

      <td class="p-3.5 max-w-[220px]">
        <div class="flex items-center gap-1.5 text-slate-200 font-semibold truncate">
          <i class="fa-solid ${catIcon} text-slate-400 text-xs"></i>
          <span>${order.deviceModel}</span>
        </div>
        ${order.serialOrImei ? `
          <div class="font-mono text-[10px] text-amber-300/90 flex items-center gap-1 mt-0.5" title="IMEI / No. Seri">
            <i class="fa-solid fa-barcode text-xs"></i>
            <span>${order.serialOrImei}</span>
          </div>
        ` : ''}
        <p class="text-[11px] text-slate-400 truncate mt-0.5" title="${order.issueDescription}">${order.issueDescription}</p>
      </td>

      <td class="p-3.5">
        ${photoThumbHtml}
      </td>

      <td class="p-3.5">
        <span class="text-xs text-slate-300 font-medium">${order.assignedTo || 'Belum Ditugaskan'}</span>
      </td>

      <td class="p-3.5">
        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${statusClass}">
          <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
          <span>${order.status}</span>
        </div>
        ${quoteBadgeHtml}
      </td>

      <td class="p-3.5 text-right font-mono">
        <div class="font-bold text-white">${formatRupiah(order.status === 'Gagal Servis / Batal' ? 0 : (order.finalCost || order.estimatedCost))}</div>
        <span class="text-[10px] px-1.5 py-0.2 rounded font-sans font-bold ${payClass}">${payText}</span>
        ${paymentConfirmHtml}
      </td>

      <td class="p-3.5 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <!-- View Full Details Button -->
          <button onclick="openViewOrderModal('${order.id}')" title="Lihat Detail Lengkap Pesanan" class="p-1.5 rounded-lg bg-surface-800 hover:bg-sky-600 hover:text-white text-sky-400 border border-surface-700 transition">
            <i class="fa-solid fa-eye text-xs"></i>
          </button>

          <!-- Edit Order & Pricing Button -->
          <button onclick="openEditOrderModal('${order.id}')" title="Edit Pesanan & Rincian Biaya" class="p-1.5 rounded-lg bg-surface-800 hover:bg-amber-600 hover:text-white text-amber-300 border border-surface-700 transition">
            <i class="fa-solid fa-pen-to-square text-xs"></i>
          </button>

          <!-- Update Status Button -->
          <button onclick="openUpdateStatusModal('${order.id}')" title="Update Status Pengerjaan" class="p-1.5 rounded-lg bg-surface-800 hover:bg-emerald-600 hover:text-white text-slate-300 border border-surface-700 transition">
            <i class="fa-solid fa-arrows-rotate text-xs"></i>
          </button>

          <!-- Send Online Quote Button -->
          <button onclick="openSendQuoteModal('${order.id}')" title="Kirim Penawaran Estimasi (Quote Approval)" class="p-1.5 rounded-lg bg-surface-800 hover:bg-amber-600 hover:text-white text-amber-400 border border-surface-700 transition">
            <i class="fa-solid fa-file-invoice-dollar text-xs"></i>
          </button>

          <!-- WhatsApp 1-Click Button -->
          <button onclick="openWaModal('${order.id}')" title="Kirim Update WhatsApp" class="p-1.5 rounded-lg bg-surface-800 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-surface-700 transition">
            <i class="fa-brands fa-whatsapp text-xs"></i>
          </button>

          <!-- Customer Public Tracking Link Button -->
          <a href="/track/${order.trackingToken}" target="_blank" title="Buka Tracking Link Pelanggan" class="p-1.5 rounded-lg bg-surface-800 hover:bg-blue-600 hover:text-white text-blue-400 border border-surface-700 transition">
            <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
          </a>

          ${currentUser.role === 'owner' ? `
          <!-- Delete Order (Owner Only) -->
          <button onclick="deleteOrder('${order.id}', '${order.ticketNo}')" title="Hapus Pesanan" class="p-1.5 rounded-lg bg-surface-800 hover:bg-red-600 hover:text-white text-slate-400 transition">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 7. NEW ORDER INTAKE MODAL & CANVAS SIGNATURE
// ==========================================

let uploadedPhotoFiles = [];
let sigCanvas, sigCtx;
let isDrawing = false;
let hasDrawnSignature = false;

function initSignaturePad() {
  sigCanvas = document.getElementById('signatureCanvas');
  if (!sigCanvas) return;
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.strokeStyle = '#0f172a';
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';

  const getPos = (e) => {
    const rect = sigCanvas.getBoundingClientRect();
    const scaleX = sigCanvas.width / rect.width;
    const scaleY = sigCanvas.height / rect.height;
    if (e.touches && e.touches[0]) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e) => {
    isDrawing = true;
    hasDrawnSignature = true;
    const pos = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
    e.preventDefault();
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
    e.preventDefault();
  };

  const stopDraw = () => {
    isDrawing = false;
  };

  sigCanvas.addEventListener('mousedown', startDraw);
  sigCanvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDraw);

  sigCanvas.addEventListener('touchstart', startDraw, { passive: false });
  sigCanvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stopDraw);
}

function clearSignatureCanvas() {
  if (sigCtx && sigCanvas) {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    hasDrawnSignature = false;
  }
}

function openNewOrderModal() {
  document.getElementById('newOrderForm').reset();
  uploadedPhotoFiles = [];
  document.getElementById('photoPreviewContainer').innerHTML = '';
  clearSignatureCanvas();

  // Populate Branches in Dropdown
  renderBranchOptions(cachedBranches);

  // Populate Categories in Dropdown
  renderCategoriesOptions(cachedCategories);

  // Populate Assignee Select
  const sel = document.getElementById('inpAssignedTo');
  sel.innerHTML = '<option value="">-- Pilih Teknisi --</option>';
  cachedStaff.filter(s => s.role === 'technician' || s.role === 'owner').forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.innerText = `${t.name} (${t.role.toUpperCase()})`;
    sel.appendChild(opt);
  });

  const modal = document.getElementById('newOrderModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewOrderModal() {
  const modal = document.getElementById('newOrderModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function previewUploadPhotos(event) {
  const files = Array.from(event.target.files);
  uploadedPhotoFiles = files.slice(0, 6); // Max 6 photos

  const preview = document.getElementById('photoPreviewContainer');
  preview.innerHTML = '';

  uploadedPhotoFiles.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'relative w-16 h-16 rounded-xl overflow-hidden border border-surface-700';
      div.innerHTML = `
        <img src="${e.target.result}" class="w-full h-full object-cover">
        <span class="absolute bottom-0 right-0 bg-black/70 text-[9px] px-1 text-slate-300 font-mono">#${i+1}</span>
      `;
      preview.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

async function handleCreateOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('saveOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...';

  try {
    const formData = new FormData();
    formData.append('branchId', document.getElementById('inpBranch').value);
    formData.append('customerName', document.getElementById('inpCustomerName').value);
    formData.append('customerPhone', document.getElementById('inpCustomerPhone').value);
    formData.append('category', document.getElementById('inpCategory').value);
    formData.append('deviceModel', document.getElementById('inpDeviceModel').value);
    formData.append('serialOrImei', document.getElementById('inpSerialOrImei').value.trim());
    formData.append('issueDescription', document.getElementById('inpIssueDescription').value);
    formData.append('conditionNotes', document.getElementById('inpConditionNotes').value);
    formData.append('accessories', document.getElementById('inpAccessories').value);
    formData.append('assignedToId', document.getElementById('inpAssignedTo').value);
    formData.append('estimatedCost', document.getElementById('inpEstimatedCost').value || 0);
    formData.append('downPayment', document.getElementById('inpDownPayment').value || 0);
    formData.append('sendQuoteNow', document.getElementById('inpSendQuoteNow').checked);

    // Photos
    uploadedPhotoFiles.forEach(file => {
      formData.append('photos', file);
    });

    // Signature data URL
    if (hasDrawnSignature && sigCanvas) {
      formData.append('customerSignature', sigCanvas.toDataURL('image/png'));
    }

    const result = await apiRequest('/api/orders', {
      method: 'POST',
      body: formData
    });

    closeNewOrderModal();
    fetchOrders();

    if (document.getElementById('inpSendQuoteNow').checked) {
      // If quote is requested, prompt sending quote WhatsApp
      Swal.fire({
        icon: 'success',
        title: 'Tiket & Penawaran Dibuat!',
        html: `Tiket <b>${result.order.ticketNo}</b> berstatus <b>Menunggu Persetujuan</b>.<br>Kirim tautan persetujuan estimasi ke WhatsApp pelanggan?`,
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#334155',
        confirmButtonText: '<i class="fa-brands fa-whatsapp"></i> Kirim Penawaran WA',
        cancelButtonText: 'Tutup'
      }).then(res => {
        if (res.isConfirmed) {
          openSendQuoteModal(result.order.id);
        }
      });
    } else {
      // Standard WhatsApp Share prompt
      Swal.fire({
        icon: 'success',
        title: 'Tiket Servis Dibuat!',
        html: `Tiket <b>${result.order.ticketNo}</b> berhasil didaftarkan.<br>Kirimkan link tracking langsung ke WhatsApp pelanggan?`,
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#334155',
        confirmButtonText: '<i class="fa-brands fa-whatsapp"></i> Kirim WhatsApp',
        cancelButtonText: 'Tutup'
      }).then(res => {
        if (res.isConfirmed) {
          openWaModal(result.order.id);
        }
      });
    }

  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Membuat Pesanan',
      text: err.message,
      confirmButtonColor: '#10b981'
    });
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Simpan & Buat Tiket Servis</span>';
  }
}

// ==========================================
// 8. UPDATE STATUS & LIFECYCLE
// ==========================================

function openUpdateStatusModal(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;

  selectedOrderForUpdate = order;
  document.getElementById('updOrderId').value = order.id;
  document.getElementById('updTicketSubtitle').innerText = `${order.ticketNo} • ${order.deviceModel} (${order.customerName})`;
  document.getElementById('updStatusSelect').value = order.status;
  document.getElementById('updNote').value = order.technicianNotes || '';

  const serviceFee = order.serviceFee || order.estimatedCost || 0;
  const partsTotal = Math.max(0, (order.finalCost || order.estimatedCost) - serviceFee);
  document.getElementById('updServiceFee').value = serviceFee;
  document.getElementById('updPartsTotal').value = partsTotal;
  document.getElementById('updFinalCost').value = order.finalCost || order.estimatedCost || 0;

  toggleStatusSpecificFields();

  const modal = document.getElementById('updateStatusModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeUpdateStatusModal() {
  const modal = document.getElementById('updateStatusModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleStatusSpecificFields() {
  const status = document.getElementById('updStatusSelect').value;
  const lockNotice = document.getElementById('lockRevenueNotice');
  const failedNotice = document.getElementById('failedRevenueNotice');
  const finSection = document.getElementById('financialInputsSection');

  if (status === 'Selesai & Diambil') {
    lockNotice.classList.remove('hidden');
    failedNotice.classList.add('hidden');
    finSection.classList.remove('hidden');
  } else if (status === 'Gagal Servis / Batal') {
    lockNotice.classList.add('hidden');
    failedNotice.classList.remove('hidden');
    finSection.classList.add('hidden');
  } else if (status === 'Selesai') {
    lockNotice.classList.add('hidden');
    failedNotice.classList.add('hidden');
    finSection.classList.remove('hidden');
  } else {
    lockNotice.classList.add('hidden');
    failedNotice.classList.add('hidden');
    finSection.classList.add('hidden');
  }
}

function calculateTotalFinal() {
  const sFee = Number(document.getElementById('updServiceFee').value) || 0;
  const pCost = Number(document.getElementById('updPartsTotal').value) || 0;
  document.getElementById('updFinalCost').value = sFee + pCost;
}

async function handleUpdateStatus(e) {
  e.preventDefault();
  const orderId = document.getElementById('updOrderId').value;
  const status = document.getElementById('updStatusSelect').value;
  const note = document.getElementById('updNote').value;
  const autoWa = document.getElementById('updAutoWaCheck').checked;

  const payload = { status, note };

  if (status === 'Selesai' || status === 'Selesai & Diambil') {
    const serviceFee = Number(document.getElementById('updServiceFee').value) || 0;
    const finalCost = Number(document.getElementById('updFinalCost').value) || 0;
    const paymentMethod = document.getElementById('updPaymentMethod').value;
    payload.serviceFee = serviceFee;
    payload.finalCost = finalCost;
    payload.paymentMethod = paymentMethod;
  }

  try {
    const updated = await apiRequest(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    closeUpdateStatusModal();
    fetchOrders();

    if (currentUser.role === 'owner') {
      fetchMonthlyReport();
    }

    if (autoWa) {
      openWaModal(orderId);
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Status diperbarui menjadi: ${status}`,
        showConfirmButton: false,
        timer: 2000
      });
    }

  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Memperbarui Status',
      text: err.message,
      confirmButtonColor: '#10b981'
    });
  }
}

async function deleteOrder(orderId, ticketNo) {
  const result = await Swal.fire({
    title: `Hapus Tiket ${ticketNo}?`,
    text: 'Tindakan ini tidak dapat dibatalkan.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#334155',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      await apiRequest(`/api/orders/${orderId}`, { method: 'DELETE' });
      fetchOrders();
      Swal.fire('Terhapus', 'Pesanan servis berhasil dihapus.', 'success');
    } catch (err) {
      Swal.fire('Gagal', err.message, 'error');
    }
  }
}

// ==========================================
// 9. ONLINE QUOTE APPROVAL SYSTEM
// ==========================================

function openSendQuoteModal(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;

  selectedOrderForQuote = order;
  document.getElementById('quoteOrderId').value = order.id;
  document.getElementById('quoteOrderSubtitle').innerText = `${order.ticketNo} • ${order.deviceModel} (${order.customerName})`;
  document.getElementById('quoteEstCostInput').value = order.estimatedCost || 0;
  document.getElementById('quoteNotesInput').value = order.technicianNotes || `Estimasi biaya perbaikan ${order.deviceModel}. Garansi pengerjaan 30 hari.`;

  const modal = document.getElementById('sendQuoteModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSendQuoteModal() {
  const modal = document.getElementById('sendQuoteModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  selectedOrderForQuote = null;
}

async function handleSendQuoteSubmit(e) {
  e.preventDefault();
  const orderId = document.getElementById('quoteOrderId').value;
  const estimatedCost = Number(document.getElementById('quoteEstCostInput').value) || 0;
  const notes = document.getElementById('quoteNotesInput').value.trim();

  try {
    const res = await apiRequest(`/api/orders/${orderId}/send-quote`, {
      method: 'PUT',
      body: JSON.stringify({ estimatedCost, notes })
    });

    closeSendQuoteModal();
    fetchOrders();

    const order = res.order;
    const rawTemplate = cachedSettings.whatsappQuoteTemplate || 
      "Halo *{nama_pelanggan}*,\n\nBerikut estimasi biaya servis untuk *{nama_barang}* di *{nama_toko}*:\n💰 Estimasi: *{estimasi_biaya}*\n\nSilakan klik link berikut untuk *MENYETUJUI (Accept)* atau *MENOLAK (Decline)* estimasi:\n👉 {link_tracking}\n\nTerima kasih!";

    const trackingUrl = `${window.location.origin}/track/${order.trackingToken}`;
    const text = rawTemplate
      .replace(/{nama_pelanggan}/g, order.customerName)
      .replace(/{nama_toko}/g, cachedSettings.storeName || 'Nakahasite Service Hub')
      .replace(/{nama_barang}/g, order.deviceModel)
      .replace(/{estimasi_biaya}/g, formatRupiah(estimatedCost))
      .replace(/{link_tracking}/g, trackingUrl);

    const phone = order.customerPhone.replace(/^0/, '62').replace(/[^\d]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');

    Swal.fire({
      icon: 'success',
      title: 'Penawaran Diterbitkan!',
      text: 'Status diubah ke "Menunggu Persetujuan". WhatsApp terbuka untuk dikirimkan ke pelanggan.',
      confirmButtonColor: '#f59e0b'
    });

  } catch (err) {
    Swal.fire('Gagal Menerbitkan Quote', err.message, 'error');
  }
}

// ==========================================
// 10. DIGITAL PAYMENT VERIFICATION & QRIS
// ==========================================

async function verifyCustomerPayment(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;

  const conf = order.paymentConfirmation || {};
  const totalAmount = conf.amount || order.finalCost || order.estimatedCost;

  const result = await Swal.fire({
    title: 'Verifikasi Pembayaran Pelanggan?',
    html: `
      <div class="text-left text-xs space-y-2 p-3 rounded-xl bg-surface-850 border border-surface-750 font-sans">
        <div><span class="text-slate-400">No. Tiket:</span> <b class="text-white font-mono">${order.ticketNo}</b></div>
        <div><span class="text-slate-400">Pelanggan:</span> <b class="text-white">${order.customerName}</b></div>
        <div><span class="text-slate-400">Unit:</span> <b class="text-slate-200">${order.deviceModel}</b></div>
        <div><span class="text-slate-400">Nominal:</span> <b class="text-emerald-400 font-mono text-sm">${formatRupiah(totalAmount)}</b></div>
        <div><span class="text-slate-400">Metode / Bank:</span> <span class="px-2 py-0.5 rounded bg-surface-800 text-slate-300 font-bold">${conf.method || 'QRIS'}</span></div>
        <div><span class="text-slate-400">Catatan Ref / Pengirim:</span> <span class="text-slate-300">${conf.notes || conf.refNumber || '-'}</span></div>
      </div>
      <p class="text-xs text-amber-300/90 mt-3">Pastikan dana telah masuk di mutasi rekening / QRIS toko Anda sebelum mengesahkan.</p>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#334155',
    confirmButtonText: '<i class="fa-solid fa-check"></i> Ya, Pembayaran Sah (LUNAS)',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      await apiRequest(`/api/orders/${orderId}/verify-payment`, {
        method: 'PUT',
        body: JSON.stringify({ verified: true })
      });
      fetchOrders();
      if (currentUser && currentUser.role === 'owner') {
        fetchMonthlyReport();
      }
      Swal.fire('Berhasil Disahkan', 'Status pembayaran pesanan kini LUNAS.', 'success');
    } catch (err) {
      Swal.fire('Gagal Mengesahkan', err.message, 'error');
    }
  }
}

async function uploadStoreQris() {
  const fileInput = document.getElementById('inpQrisFile');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    Swal.fire('Pilih Berkas', 'Silakan pilih gambar barcode QRIS toko terlebih dahulu.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('qrisImage', fileInput.files[0]);

  try {
    const res = await apiRequest('/api/settings/upload-qris', {
      method: 'POST',
      body: formData
    });

    const preview = document.getElementById('settingsQrisPreview');
    if (preview && res.paymentQrImage) {
      preview.src = res.paymentQrImage;
    }
    cachedSettings.paymentQrImage = res.paymentQrImage;

    Swal.fire('Tersimpan', 'Gambar QRIS toko berhasil diunggah dan otomatis diterapkan ke seluruh halaman tracking pelanggan.', 'success');
  } catch (err) {
    Swal.fire('Gagal Mengunggah QRIS', err.message, 'error');
  }
}

// ==========================================
// 11. 1-CLICK WHATSAPP INTEGRATION
// ==========================================

let activeWaText = '';

function buildWaMessage(order) {
  const rawTemplate = cachedSettings.whatsappTemplate || 
    "Halo *{nama_pelanggan}*,\n\nPesanan servis Anda di *{nama_toko}*:\n🔖 No. Tiket: *{nomor_tiket}*\n📱 Unit: *{nama_barang}*\n🔄 Status Terkini: *{status}*\n💰 Estimasi Biaya: *{estimasi_biaya}*\n\nCek progress & foto fisik di tracking link:\n👉 {link_tracking}\n\nTerima kasih!";

  const trackingUrl = `${window.location.origin}/track/${order.trackingToken}`;
  const cost = order.status === 'Gagal Servis / Batal' ? 'Rp 0 (Batal)' : formatRupiah(order.finalCost || order.estimatedCost);

  return rawTemplate
    .replace(/{nama_pelanggan}/g, order.customerName)
    .replace(/{nama_toko}/g, cachedSettings.storeName || 'Nakahasite Service Hub')
    .replace(/{nomor_tiket}/g, order.ticketNo)
    .replace(/{nama_barang}/g, order.deviceModel)
    .replace(/{status}/g, order.status)
    .replace(/{estimasi_biaya}/g, cost)
    .replace(/{link_tracking}/g, trackingUrl);
}

function openWaModal(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;

  activeWaText = buildWaMessage(order);
  document.getElementById('waMessagePreview').innerText = activeWaText;

  const phone = order.customerPhone.replace(/^0/, '62').replace(/[^\d]/g, '');
  const encodedText = encodeURIComponent(activeWaText);
  document.getElementById('waDirectSendBtn').href = `https://wa.me/${phone}?text=${encodedText}`;

  const modal = document.getElementById('waModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeWaModal() {
  const modal = document.getElementById('waModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function copyWaText() {
  navigator.clipboard.writeText(activeWaText).then(() => {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Teks pesan berhasil disalin ke clipboard!',
      showConfirmButton: false,
      timer: 1800
    });
  });
}

// ==========================================
// 12. MONTHLY FINANCIAL REPORTING (OWNER ONLY)
// ==========================================

async function fetchMonthlyReport() {
  if (!currentUser || currentUser.role !== 'owner') return;

  const month = document.getElementById('reportMonthSelect').value;
  const year = document.getElementById('reportYearSelect').value;
  const branchId = document.getElementById('reportBranchSelect') ? document.getElementById('reportBranchSelect').value : 'Semua';

  try {
    const queryParams = new URLSearchParams({ year, month });
    if (branchId && branchId !== 'Semua') {
      queryParams.append('branchId', branchId);
    }

    const data = await apiRequest(`/api/reports/monthly?${queryParams.toString()}`);
    renderMonthlyReport(data);
  } catch (err) {
    console.error('Error fetching monthly report:', err);
  }
}

function renderMonthlyReport(report) {
  const summary = report.summary;

  document.getElementById('repTotalRevenue').innerText = formatRupiah(summary.totalRevenue);
  document.getElementById('repTotalServiceFee').innerText = formatRupiah(summary.totalServiceFee);
  document.getElementById('repSuccessCount').innerText = `${summary.successfulCount} Unit`;
  document.getElementById('repFailedCount').innerText = `${summary.failedCount} Unit`;
  document.getElementById('repSuccessRate').innerText = `${summary.successRate}%`;
  document.getElementById('repAvgTicket').innerText = `AOV: ${formatRupiah(summary.averageTicket)}`;

  // Category Distribution Bars
  const catList = document.getElementById('repCategoryList');
  catList.innerHTML = '';
  const categories = report.categoryBreakdown;
  const totalRev = summary.totalRevenue || 1;

  if (Object.keys(categories).length === 0) {
    catList.innerHTML = '<p class="text-xs text-slate-500 italic">Belum ada transaksi sukses pada periode ini.</p>';
  } else {
    for (const [catKey, catData] of Object.entries(categories)) {
      const pct = Math.round((catData.revenue / totalRev) * 100);
      const div = document.createElement('div');
      div.className = 'space-y-1';
      div.innerHTML = `
        <div class="flex justify-between text-xs">
          <span class="font-bold text-slate-300 uppercase">${catKey} (${catData.count} unit)</span>
          <span class="font-mono text-emerald-400 font-bold">${formatRupiah(catData.revenue)} (${pct}%)</span>
        </div>
        <div class="w-full h-2 rounded-full bg-surface-800 overflow-hidden">
          <div class="h-full bg-emerald-500 rounded-full" style="width: ${pct}%"></div>
        </div>
      `;
      catList.appendChild(div);
    }
  }

  // Technician Commissions Table
  const techBody = document.getElementById('repTechTableBody');
  techBody.innerHTML = '';
  report.technicianPerformance.forEach(tech => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2.5 font-bold text-slate-200">${tech.name}</td>
      <td class="py-2.5 text-center font-mono">${tech.completedUnits}</td>
      <td class="py-2.5 text-right font-mono text-slate-300">${formatRupiah(tech.generatedRevenue)}</td>
      <td class="py-2.5 text-right font-mono text-amber-400 font-bold">${formatRupiah(tech.estimatedCommission)} (${tech.commissionRate}%)</td>
    `;
    techBody.appendChild(tr);
  });

  // Successful Transactions Log
  const sBody = document.getElementById('repSuccessTableBody');
  sBody.innerHTML = '';
  document.getElementById('repSuccessTableBadge').innerText = `${report.successfulTransactions.length} Transaksi`;

  if (report.successfulTransactions.length === 0) {
    sBody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500 italic">Tidak ada transaksi berstatus Selesai & Diambil di bulan ini.</td></tr>';
  } else {
    report.successfulTransactions.forEach(t => {
      const tr = document.createElement('tr');
      const partsTotal = Math.max(0, t.finalCost - (t.serviceFee || 0));
      tr.innerHTML = `
        <td class="p-3 font-mono font-bold text-white">${t.ticketNo}</td>
        <td class="p-3 text-slate-300">${t.customerName}</td>
        <td class="p-3 text-slate-300">${t.deviceModel}</td>
        <td class="p-3 text-slate-400">${t.assignedTo}</td>
        <td class="p-3 text-right font-mono text-slate-300">${formatRupiah(t.serviceFee)}</td>
        <td class="p-3 text-right font-mono text-slate-300">${formatRupiah(partsTotal)}</td>
        <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatRupiah(t.finalCost)}</td>
        <td class="p-3 text-center"><span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-bold">${t.paymentMethod}</span></td>
      `;
      sBody.appendChild(tr);
    });
  }

  // Failed Transactions Log (Nominal Rp 0)
  const fBody = document.getElementById('repFailedTableBody');
  fBody.innerHTML = '';
  if (report.failedTransactions.length === 0) {
    fBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500 italic">Tidak ada transaksi gagal servis pada periode ini.</td></tr>';
  } else {
    report.failedTransactions.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-3 font-mono font-bold text-red-300">${t.ticketNo}</td>
        <td class="p-3 text-slate-300">${t.customerName}</td>
        <td class="p-3 text-slate-300">${t.deviceModel}</td>
        <td class="p-3 text-slate-400 text-[11px]">${t.issueDescription}</td>
        <td class="p-3 text-red-300 text-[11px]">${t.technicianNotes || '-'}</td>
        <td class="p-3 text-right font-mono font-bold text-slate-500">Rp 0</td>
      `;
      fBody.appendChild(tr);
    });
  }
}

function downloadFinancialCSV() {
  const month = document.getElementById('reportMonthSelect').value;
  const year = document.getElementById('reportYearSelect').value;
  const branchId = document.getElementById('reportBranchSelect') ? document.getElementById('reportBranchSelect').value : 'Semua';

  const queryParams = new URLSearchParams({ year, month });
  if (branchId && branchId !== 'Semua') {
    queryParams.append('branchId', branchId);
  }

  window.open(`/api/export/financial-csv?${queryParams.toString()}`, '_blank');
}

// ==========================================
// 13. STAFF MANAGEMENT (OWNER ONLY)
// ==========================================

async function fetchStaffList() {
  try {
    const staff = await apiRequest('/api/users');
    cachedStaff = staff;

    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    staff.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-3.5">
          <span class="font-bold text-white block">${u.name}</span>
          <span class="text-[11px] text-slate-400">${u.phone || '-'} • ${u.email || '-'}</span>
        </td>
        <td class="p-3.5 font-mono text-slate-300">${u.username}</td>
        <td class="p-3.5">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'owner' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-blue-950 text-blue-300 border border-blue-800'}">
            ${u.role}
          </span>
        </td>
        <td class="p-3.5 text-center font-mono font-bold text-slate-200">${u.commissionRate || 0}%</td>
        <td class="p-3.5 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.active ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}">
            ${u.active ? 'Aktif' : 'Nonaktif'}
          </span>
        </td>
        <td class="p-3.5 text-center">
          ${u.role !== 'owner' ? `
            <button onclick="toggleStaffActive('${u.id}', ${!u.active})" class="px-2.5 py-1 rounded bg-surface-800 hover:bg-surface-700 text-xs text-slate-300 border border-surface-700">
              ${u.active ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          ` : '<span class="text-[10px] text-slate-500 italic">Akun Utama</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error fetching staff:', err);
  }
}

function openNewStaffModal() {
  document.getElementById('newStaffForm').reset();
  const modal = document.getElementById('newStaffModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewStaffModal() {
  const modal = document.getElementById('newStaffModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleCreateStaff(e) {
  e.preventDefault();
  const name = document.getElementById('staffName').value;
  const username = document.getElementById('staffUsername').value;
  const password = document.getElementById('staffPassword').value;
  const role = document.getElementById('staffRole').value;
  const commissionRate = document.getElementById('staffCommission').value;
  const phone = document.getElementById('staffPhone').value;

  try {
    await apiRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, role, commissionRate, phone })
    });

    closeNewStaffModal();
    fetchStaffList();
    Swal.fire('Berhasil', 'Akun staf baru berhasil didaftarkan.', 'success');
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

async function toggleStaffActive(id, newActiveStatus) {
  try {
    await apiRequest(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: newActiveStatus })
    });
    fetchStaffList();
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

// ==========================================
// 14. SPAREPART & INVENTORY CATALOG
// ==========================================

async function fetchSpareparts() {
  try {
    const parts = await apiRequest('/api/spareparts');
    const tbody = document.getElementById('sparepartsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    parts.forEach(p => {
      const isLowStock = p.stock <= 5;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="p-3.5 font-bold text-white">${p.name}</td>
        <td class="p-3.5 uppercase text-[10px] text-slate-400 font-bold">${p.category}</td>
        <td class="p-3.5 text-center font-mono">
          <span class="px-2 py-0.5 rounded font-bold ${isLowStock ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-surface-800 text-slate-200'}">
            ${p.stock} ${p.unit || 'pcs'}
          </span>
        </td>
        <td class="p-3.5 text-right font-mono text-slate-400">${formatRupiah(p.buyPrice)}</td>
        <td class="p-3.5 text-right font-mono font-bold text-emerald-400">${formatRupiah(p.sellPrice)}</td>
        <td class="p-3.5 text-center">
          <button onclick="deleteSparepart('${p.id}')" class="text-slate-500 hover:text-red-400 text-xs">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error fetching spareparts:', err);
  }
}

function openNewSparepartModal() {
  document.getElementById('newSparepartForm').reset();
  const modal = document.getElementById('newSparepartModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeNewSparepartModal() {
  const modal = document.getElementById('newSparepartModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleCreateSparepart(e) {
  e.preventDefault();
  const name = document.getElementById('partName').value;
  const category = document.getElementById('partCategory').value;
  const stock = document.getElementById('partStock').value;
  const buyPrice = document.getElementById('partBuyPrice').value;
  const sellPrice = document.getElementById('partSellPrice').value;

  try {
    await apiRequest('/api/spareparts', {
      method: 'POST',
      body: JSON.stringify({ name, category, stock, buyPrice, sellPrice })
    });
    closeNewSparepartModal();
    fetchSpareparts();
    Swal.fire('Berhasil', 'Suku cadang berhasil ditambahkan.', 'success');
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

async function deleteSparepart(id) {
  try {
    await apiRequest(`/api/spareparts/${id}`, { method: 'DELETE' });
    fetchSpareparts();
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

// ==========================================
// 15. SETTINGS & APP INITIALIZATION
// ==========================================

async function loadSettings() {
  try {
    const s = await apiRequest('/api/settings');
    cachedSettings = s;

    document.getElementById('headerStoreName').innerText = s.storeName || 'Pusat Operasional Servis';
    if (document.getElementById('setStoreName')) {
      document.getElementById('setStoreName').value = s.storeName || '';
      document.getElementById('setPhone').value = s.phone || '';
      document.getElementById('setTagline').value = s.tagline || '';
      document.getElementById('setAddress').value = s.address || '';
      document.getElementById('setWaTemplate').value = s.whatsappTemplate || '';
      if (document.getElementById('setWaQuoteTemplate')) {
        document.getElementById('setWaQuoteTemplate').value = s.whatsappQuoteTemplate || '';
      }
    }

    const logoUrl = s.logoUrl || '/uploads/nakahasite-logo.svg';
    const headerLogo = document.getElementById('headerLogoImg');
    if (headerLogo) headerLogo.src = logoUrl;

    const previewLogo = document.getElementById('settingsLogoPreview');
    if (previewLogo) previewLogo.src = logoUrl;

    if (document.getElementById('settingsQrisPreview') && s.paymentQrImage) {
      document.getElementById('settingsQrisPreview').src = s.paymentQrImage;
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function uploadStoreLogo() {
  const fileInput = document.getElementById('inpLogoFile');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    Swal.fire('Pilih Berkas', 'Silakan pilih file logo toko terlebih dahulu.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('logo', fileInput.files[0]);

  try {
    const res = await apiRequest('/api/settings/upload-logo', {
      method: 'POST',
      body: formData
    });

    const preview = document.getElementById('settingsLogoPreview');
    if (preview && res.logoUrl) preview.src = res.logoUrl;

    const headerLogo = document.getElementById('headerLogoImg');
    if (headerLogo && res.logoUrl) headerLogo.src = res.logoUrl;

    cachedSettings.logoUrl = res.logoUrl;

    Swal.fire('Tersimpan', 'Logo usaha baru berhasil diunggah dan otomatis diterapkan ke seluruh aplikasi serta nota pelanggan.', 'success');
  } catch (err) {
    Swal.fire('Gagal Mengunggah Logo', err.message, 'error');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    storeName: document.getElementById('setStoreName').value,
    phone: document.getElementById('setPhone').value,
    tagline: document.getElementById('setTagline').value,
    address: document.getElementById('setAddress').value,
    whatsappTemplate: document.getElementById('setWaTemplate').value,
    whatsappQuoteTemplate: document.getElementById('setWaQuoteTemplate') ? document.getElementById('setWaQuoteTemplate').value : ''
  };

  try {
    await apiRequest('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    loadSettings();
    Swal.fire('Tersimpan', 'Pengaturan usaha & template WhatsApp berhasil disimpan.', 'success');
  } catch (err) {
    Swal.fire('Gagal', err.message, 'error');
  }
}

// ==========================================
// 16. VIEW ORDER DETAILS MODAL (LIHAT LAGI)
// ==========================================

function openViewOrderModal(orderId) {
  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;

  currentViewingOrderId = order.id;

  // Header & Status
  document.getElementById('viewTicketNo').innerText = order.ticketNo;
  document.getElementById('viewBranchAndDate').innerText = `📍 ${order.branchName || 'Cabang Utama'} • Didaftarkan pada ${new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const statusBadge = document.getElementById('viewStatusBadge');
  statusBadge.innerText = order.status;

  const quoteBadge = document.getElementById('viewQuoteBadge');
  if (order.quoteStatus === 'pending') {
    quoteBadge.classList.remove('hidden');
    quoteBadge.innerText = 'Quote: Menunggu Persetujuan';
    quoteBadge.className = 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse';
  } else if (order.quoteStatus === 'accepted') {
    quoteBadge.classList.remove('hidden');
    quoteBadge.innerText = 'Quote: Disetujui Pelanggan';
    quoteBadge.className = 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800';
  } else if (order.quoteStatus === 'declined') {
    quoteBadge.classList.remove('hidden');
    quoteBadge.innerText = 'Quote: Ditolak Pelanggan';
    quoteBadge.className = 'px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-950 text-red-300 border border-red-800';
  } else {
    quoteBadge.classList.add('hidden');
  }

  // Customer
  document.getElementById('viewCustomerName').innerText = order.customerName;
  document.getElementById('viewCustomerPhone').innerText = order.customerPhone;
  const cleanPhone = order.customerPhone.replace(/^0/, '62').replace(/[^\d]/g, '');
  document.getElementById('viewCustomerWaBtn').href = `https://wa.me/${cleanPhone}`;

  // Unit & Serial
  document.getElementById('viewDeviceModel').innerText = order.deviceModel;
  document.getElementById('viewCategoryBadge').innerText = (order.category || 'Servis').toUpperCase();
  document.getElementById('viewSerialOrImei').innerText = order.serialOrImei ? `No. Seri / IMEI: ${order.serialOrImei}` : 'Tanpa No. Seri / IMEI Tercatat';

  // Issue & Notes
  document.getElementById('viewIssueDesc').innerText = order.issueDescription || '-';
  document.getElementById('viewConditionNotes').innerText = order.conditionNotes || 'Tidak ada catatan kerusakan fisik awal.';

  // Accessories
  const accContainer = document.getElementById('viewAccessoriesList');
  accContainer.innerHTML = '';
  if (order.accessories && order.accessories.length > 0) {
    order.accessories.forEach(acc => {
      const sp = document.createElement('span');
      sp.className = 'px-2 py-0.5 rounded bg-surface-900 text-slate-300 text-[11px] border border-surface-750';
      sp.innerText = acc;
      accContainer.appendChild(sp);
    });
  } else {
    accContainer.innerHTML = '<span class="text-slate-500 italic text-[11px]">Hanya unit barang saja</span>';
  }

  // Photos Gallery
  const photoContainer = document.getElementById('viewPhotosGallery');
  photoContainer.innerHTML = '';
  if (order.photos && order.photos.length > 0) {
    order.photos.forEach((url, i) => {
      const imgDiv = document.createElement('div');
      imgDiv.className = 'relative w-16 h-16 rounded-xl overflow-hidden border border-surface-700 cursor-pointer hover:border-emerald-500 transition group';
      imgDiv.onclick = () => window.open(url, '_blank');
      imgDiv.innerHTML = `
        <img src="${url}" class="w-full h-full object-cover group-hover:scale-105 transition">
        <span class="absolute bottom-0 right-0 bg-black/70 text-[9px] px-1 text-slate-300 font-mono">#${i+1}</span>
      `;
      photoContainer.appendChild(imgDiv);
    });
  } else {
    photoContainer.innerHTML = '<span class="text-slate-500 italic text-[11px]">Tidak ada foto fisik yang diunggah.</span>';
  }

  // Customer Signature
  const sigBox = document.getElementById('viewSignatureBox');
  if (order.customerSignature) {
    if (order.customerSignature.startsWith('data:image/svg') || order.customerSignature.startsWith('<svg')) {
      sigBox.innerHTML = order.customerSignature.replace(/^data:image\/svg\+xml;utf8,/, '');
    } else {
      sigBox.innerHTML = `<img src="${order.customerSignature}" class="h-14 object-contain">`;
    }
  } else {
    sigBox.innerHTML = '<span class="text-slate-400 italic text-[11px]">Persetujuan Digital Terverifikasi</span>';
  }

  // Technician
  document.getElementById('viewAssignedTo').innerText = order.assignedTo || 'Belum Ditugaskan';

  // Pricing & Financial
  const sFee = Number(order.serviceFee) || 0;
  const fCost = Number(order.finalCost || order.estimatedCost) || 0;
  const pCost = Math.max(0, fCost - sFee);

  document.getElementById('viewEstimatedCost').innerText = formatRupiah(order.estimatedCost);
  document.getElementById('viewServiceFee').innerText = formatRupiah(sFee);
  document.getElementById('viewPartsCost').innerText = formatRupiah(pCost);
  document.getElementById('viewDownPayment').innerText = `-${formatRupiah(order.downPayment || 0)}`;
  document.getElementById('viewFinalCost').innerText = formatRupiah(fCost);

  const payBadge = document.getElementById('viewPaymentBadge');
  if (order.paymentStatus === 'paid' || order.status === 'Selesai & Diambil') {
    payBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800';
    payBadge.innerText = 'LUNAS';
  } else if (order.downPayment > 0) {
    payBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800';
    payBadge.innerText = 'DP DITERIMA';
  } else {
    payBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300';
    payBadge.innerText = 'BELUM BAYAR';
  }
  document.getElementById('viewPaymentMethod').innerText = `Metode Pembayaran: ${order.paymentMethod || 'Tunai'}`;

  // Timeline
  const tlContainer = document.getElementById('viewTimelineContainer');
  tlContainer.innerHTML = '';
  if (order.timeline && order.timeline.length > 0) {
    order.timeline.slice().reverse().forEach(tl => {
      const div = document.createElement('div');
      div.className = 'p-2 rounded-xl bg-surface-900 border border-surface-800 space-y-0.5';
      div.innerHTML = `
        <div class="flex justify-between items-center text-[10px]">
          <b class="text-emerald-400 font-bold">${tl.status}</b>
          <span class="text-slate-500">${new Date(tl.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        <p class="text-slate-300 text-[11px]">${tl.note}</p>
        <span class="text-slate-500 text-[9px] block">Oleh: ${tl.actor || 'Sistem'}</span>
      `;
      tlContainer.appendChild(div);
    });
  } else {
    tlContainer.innerHTML = '<span class="text-slate-500 italic text-[11px]">Belum ada catatan timeline.</span>';
  }

  // Public link button
  document.getElementById('viewPublicTrackBtn').href = `/track/${order.trackingToken}`;

  const modal = document.getElementById('viewOrderModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeViewOrderModal() {
  const modal = document.getElementById('viewOrderModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ==========================================
// 17. EDIT ORDER & PRICING MODAL (EDIT LAGI)
// ==========================================

function openEditOrderModal(orderId) {
  closeViewOrderModal();

  const order = cachedOrders.find(o => o.id === orderId);
  if (!order) return;

  document.getElementById('editOrderId').value = order.id;
  document.getElementById('editOrderSubtitle').innerText = `${order.ticketNo} • ${order.deviceModel} (${order.customerName})`;

  // Populate Branches
  const bSel = document.getElementById('editInpBranch');
  bSel.innerHTML = '';
  cachedBranches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.innerText = `${b.name}${b.isMain ? ' (Pusat)' : ''}`;
    if (b.id === order.branchId) opt.selected = true;
    bSel.appendChild(opt);
  });

  // Populate Customer & Device
  document.getElementById('editInpCustomerName').value = order.customerName || '';
  document.getElementById('editInpCustomerPhone').value = order.customerPhone || '';

  // Populate Categories
  const cSel = document.getElementById('editInpCategory');
  cSel.innerHTML = '';
  cachedCategories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = c.name;
    if (c.id === order.category) opt.selected = true;
    cSel.appendChild(opt);
  });

  document.getElementById('editInpDeviceModel').value = order.deviceModel || '';
  document.getElementById('editInpSerialOrImei').value = order.serialOrImei || '';
  document.getElementById('editInpIssueDescription').value = order.issueDescription || '';
  document.getElementById('editInpConditionNotes').value = order.conditionNotes || '';
  document.getElementById('editInpAccessories').value = Array.isArray(order.accessories) ? order.accessories.join(', ') : (order.accessories || '');

  // Populate Technicians
  const tSel = document.getElementById('editInpAssignedTo');
  tSel.innerHTML = '<option value="">-- Belum Ditugaskan --</option>';
  cachedStaff.filter(s => s.role === 'technician' || s.role === 'owner').forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.innerText = `${t.name} (${t.role.toUpperCase()})`;
    if (t.id === order.assignedToId || t.name === order.assignedTo) opt.selected = true;
    tSel.appendChild(opt);
  });

  // Status & Payment
  document.getElementById('editInpStatus').value = order.status || 'Pesanan Diterima';
  document.getElementById('editInpPaymentStatus').value = order.paymentStatus || 'unpaid';
  document.getElementById('editInpPaymentMethod').value = order.paymentMethod || 'Tunai';

  // Pricing
  const sFee = Number(order.serviceFee) || 0;
  const fCost = Number(order.finalCost || order.estimatedCost) || 0;
  const pCost = Math.max(0, fCost - sFee);

  document.getElementById('editInpEstimatedCost').value = order.estimatedCost || 0;
  document.getElementById('editInpDownPayment').value = order.downPayment || 0;
  document.getElementById('editInpServiceFee').value = sFee;
  document.getElementById('editInpPartsCost').value = pCost;
  document.getElementById('editInpFinalCost').value = fCost;

  document.getElementById('editInpTechNotes').value = order.technicianNotes || '';
  document.getElementById('editInpReason').value = '';

  const modal = document.getElementById('editOrderModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeEditOrderModal() {
  const modal = document.getElementById('editOrderModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function calculateEditTotalFinal() {
  const sFee = Number(document.getElementById('editInpServiceFee').value) || 0;
  const pCost = Number(document.getElementById('editInpPartsCost').value) || 0;
  document.getElementById('editInpFinalCost').value = sFee + pCost;
}

async function handleEditOrderSubmit(e) {
  e.preventDefault();
  const orderId = document.getElementById('editOrderId').value;
  const btn = document.getElementById('saveEditOrderBtn');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...';

  const payload = {
    branchId: document.getElementById('editInpBranch').value,
    customerName: document.getElementById('editInpCustomerName').value,
    customerPhone: document.getElementById('editInpCustomerPhone').value,
    category: document.getElementById('editInpCategory').value,
    deviceModel: document.getElementById('editInpDeviceModel').value,
    serialOrImei: document.getElementById('editInpSerialOrImei').value,
    issueDescription: document.getElementById('editInpIssueDescription').value,
    conditionNotes: document.getElementById('editInpConditionNotes').value,
    accessories: document.getElementById('editInpAccessories').value,
    assignedToId: document.getElementById('editInpAssignedTo').value,
    status: document.getElementById('editInpStatus').value,
    paymentStatus: document.getElementById('editInpPaymentStatus').value,
    paymentMethod: document.getElementById('editInpPaymentMethod').value,
    estimatedCost: Number(document.getElementById('editInpEstimatedCost').value) || 0,
    downPayment: Number(document.getElementById('editInpDownPayment').value) || 0,
    serviceFee: Number(document.getElementById('editInpServiceFee').value) || 0,
    finalCost: Number(document.getElementById('editInpFinalCost').value) || 0,
    technicianNotes: document.getElementById('editInpTechNotes').value,
    editSummary: document.getElementById('editInpReason').value.trim()
  };

  try {
    const res = await apiRequest(`/api/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    closeEditOrderModal();
    fetchOrders();

    if (currentUser.role === 'owner') {
      fetchMonthlyReport();
    }

    Swal.fire({
      icon: 'success',
      title: 'Perubahan Disimpan!',
      text: `Data dan rincian harga untuk tiket ${res.order.ticketNo} berhasil diperbarui.`,
      confirmButtonColor: '#10b981'
    });

  } catch (err) {
    Swal.fire('Gagal Menyimpan Perubahan', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Simpan Perubahan Pesanan</span>';
  }
}

// Check saved session on start
document.addEventListener('DOMContentLoaded', checkSavedSession);
