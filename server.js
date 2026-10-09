const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { promisify } = require('util');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (Boolean(SUPABASE_URL) !== Boolean(SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY harus diatur bersama.');
}

if (process.env.VERCEL && !supabaseConfigured) {
  throw new Error('Konfigurasi Supabase belum lengkap. Atur SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;
const sessionSecret = process.env.SESSION_SECRET || (process.env.VERCEL ? '' : crypto.randomBytes(32).toString('hex'));
if (!sessionSecret) {
  throw new Error('SESSION_SECRET wajib diatur di environment Vercel.');
}
const scrypt = promisify(crypto.scrypt);
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'nakahasite-private';

app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Uploaded files stay in memory until written to local disk or Supabase Storage.
const uploadDir = path.join(__dirname, 'public', 'uploads');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

function limitTotalUpload(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'Total ukuran upload maksimal 3 MB.' });
  }
  next();
}

// JSON File Database Paths
const USERS_FILE = path.join(__dirname, 'data', 'nakahasite_users.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'nakahasite_orders.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'nakahasite_settings.json');
const SPAREPARTS_FILE = path.join(__dirname, 'data', 'nakahasite_spareparts.json');

// Local JSON files are used only for development; deployed data is stored in Supabase.
async function readData(filePath, fallback = []) {
  const key = path.basename(filePath, '.json');
  if (supabase) {
    const { data, error } = await supabase
      .from('naka_app_data')
      .select('payload')
      .eq('id', key)
      .maybeSingle();
    if (error) throw new Error(`Gagal membaca data ${key} dari Supabase: ${error.message}`);
    return data ? data.payload : fallback;
  }

  if (!fs.existsSync(filePath)) return fallback;
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content || JSON.stringify(fallback));
}

async function writeData(filePath, data) {
  const key = path.basename(filePath, '.json');
  if (supabase) {
    const { error } = await supabase
      .from('naka_app_data')
      .upsert({ id: key, payload: data, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Gagal menyimpan data ${key} ke Supabase: ${error.message}`);
    return;
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user,
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function readSessionToken(token) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.user || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
    return decoded.user;
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;
  const [algorithm, saltHex, hashHex] = storedPassword.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
    return storedPassword === password;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function storeUpload(file, folder) {
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const objectPath = `${folder}/${name}`;

  if (!supabase) {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, name), file.buffer);
    return `/uploads/${name}`;
  }

  const { error } = await supabase.storage.from(storageBucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw new Error(`Gagal mengunggah file ke Supabase Storage: ${error.message}`);
  return objectPath;
}

async function resolveStoredUrl(value) {
  if (!value || value.startsWith('/uploads/') || /^https?:\/\//i.test(value)) return value;
  if (!supabase) return value;

  const { data, error } = await supabase.storage.from(storageBucket).createSignedUrl(value, 60 * 60);
  if (error) throw new Error(`Gagal membuat tautan file: ${error.message}`);
  return data.signedUrl;
}

async function presentOrder(order) {
  if (!order) return order;
  return {
    ...order,
    photos: await Promise.all((order.photos || []).map(resolveStoredUrl))
  };
}

async function presentSettings(settings) {
  return {
    ...settings,
    logoUrl: await resolveStoredUrl(settings.logoUrl),
    paymentQrImage: await resolveStoredUrl(settings.paymentQrImage)
  };
}

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Akses ditolak: Token autentikasi tidak ditemukan.' });
  }

  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  const session = readSessionToken(token);

  if (!session) {
    return res.status(401).json({ error: 'Sesi telah kedaluwarsa atau tidak valid. Silakan login kembali.' });
  }

  req.user = session;
  next();
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Akses dibatasi: Hanya Owner yang berhak mengakses menu ini.' });
  }
  next();
}

// ==========================================
// 1. AUTHENTICATION & SESSION ENDPOINTS
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const users = await readData(USERS_FILE, []);
  const user = users.find(u =>
    (u.username.toLowerCase() === username.toLowerCase() || (u.email && u.email.toLowerCase() === username.toLowerCase())) &&
    u.active !== false
  );

  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ error: 'Username atau password salah, atau akun dinonaktifkan.' });
  }

  const sessionData = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    phone: user.phone,
    email: user.email,
    commissionRate: user.commissionRate || 0,
    loginAt: new Date().toISOString()
  };

  res.json({
    message: 'Login berhasil',
    token: createSessionToken(sessionData),
    user: sessionData
  });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  res.json({ message: 'Logout berhasil' });
});

// ==========================================
// 2. USER & STAFF MANAGEMENT (OWNER ONLY)
// ==========================================

app.get('/api/users', authenticate, async (req, res) => {
  const users = await readData(USERS_FILE, []);
  // If not owner, only return staff list for assignee dropdown (without sensitive info)
  if (req.user.role !== 'owner') {
    const publicTechnicians = users
      .filter(u => u.active !== false)
      .map(u => ({ id: u.id, name: u.name, role: u.role, phone: u.phone }));
    return res.json(publicTechnicians);
  }

  // Owner sees full staff list
  const sanitized = users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    phone: u.phone,
    email: u.email,
    commissionRate: u.commissionRate || 0,
    active: u.active !== false,
    createdAt: u.createdAt
  }));
  res.json(sanitized);
});

app.post('/api/users', authenticate, requireOwner, async (req, res) => {
  const { username, password, name, role, phone, email, commissionRate } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Username, password, nama, dan role wajib diisi.' });
  }

  const users = await readData(USERS_FILE, []);
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Username sudah digunakan oleh staf lain.' });
  }

  const newUser = {
    id: 'usr-' + Date.now(),
    username: username.trim(),
    password: await hashPassword(password),
    name: name.trim(),
    role: role, // 'owner' | 'technician' | 'staff'
    phone: phone || '',
    email: email || '',
    commissionRate: Number(commissionRate) || 0,
    active: true,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await writeData(USERS_FILE, users);

  const { password: _password, ...safeUser } = newUser;
  res.status(201).json({ message: 'Staf baru berhasil didaftarkan.', user: safeUser });
});

app.put('/api/users/:id', authenticate, requireOwner, async (req, res) => {
  const { id } = req.params;
  const { name, role, phone, email, commissionRate, active, password } = req.body;

  const users = await readData(USERS_FILE, []);
  const index = users.findIndex(u => u.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Akun staf tidak ditemukan.' });
  }

  if (name) users[index].name = name.trim();
  if (role) users[index].role = role;
  if (phone !== undefined) users[index].phone = phone;
  if (email !== undefined) users[index].email = email;
  if (commissionRate !== undefined) users[index].commissionRate = Number(commissionRate);
  if (active !== undefined) users[index].active = Boolean(active);
  if (password) users[index].password = await hashPassword(password);

  await writeData(USERS_FILE, users);
  const { password: _password, ...safeUser } = users[index];
  res.json({ message: 'Data staf berhasil diperbarui.', user: safeUser });
});

// ==========================================
// 3. SERVICE ORDER MANAGEMENT & LIFECYCLE
// ==========================================

// GET /api/orders - Filterable list
app.get('/api/orders', authenticate, async (req, res) => {
  const { status, search, category, assignee, branchId, month, year } = req.query;
  let orders = await readData(ORDERS_FILE, []);

  // Filter by branch
  if (branchId && branchId !== 'Semua') {
    orders = orders.filter(o => o.branchId === branchId);
  }

  // Filter by status
  if (status && status !== 'Semua') {
    orders = orders.filter(o => o.status === status);
  }

  // Filter by category
  if (category && category !== 'Semua') {
    orders = orders.filter(o => o.category === category);
  }

  // Filter by assignee
  if (assignee && assignee !== 'Semua') {
    orders = orders.filter(o => o.assignedToId === assignee || o.assignedTo === assignee);
  }

  // Filter by month & year
  if (year && month) {
    orders = orders.filter(o => {
      const d = new Date(o.createdAt);
      return d.getFullYear() === Number(year) && (d.getMonth() + 1) === Number(month);
    });
  }

  // Filter by search query (Customer name, phone, ticketNo, device, serialOrImei)
  if (search) {
    const q = search.toLowerCase();
    orders = orders.filter(o => 
      (o.ticketNo && o.ticketNo.toLowerCase().includes(q)) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.customerPhone && o.customerPhone.includes(q)) ||
      (o.deviceModel && o.deviceModel.toLowerCase().includes(q)) ||
      (o.serialOrImei && o.serialOrImei.toLowerCase().includes(q)) ||
      (o.issueDescription && o.issueDescription.toLowerCase().includes(q))
    );
  }

  // Sort: default to 'oldest' (urutan pertama kali dibuat / FIFO) as requested
  const sort = req.query.sort || 'oldest';
  if (sort === 'newest') {
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    // 'oldest' = pertama kali dibuat
    orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  res.json(await Promise.all(orders.map(presentOrder)));
});

// GET /api/orders/:id
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const orders = await readData(ORDERS_FILE, []);
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan servis tidak ditemukan.' });
  }
  res.json(await presentOrder(order));
});

// POST /api/orders - Create New Order with Photos & Signature
app.post('/api/orders', authenticate, upload.array('photos', 6), limitTotalUpload, async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      category,
      deviceModel,
      serialOrImei,
      branchId,
      issueDescription,
      conditionNotes,
      accessories,
      estimatedCost,
      downPayment,
      assignedToId,
      customerSignature,
      sendQuoteNow
    } = req.body;

    if (!customerName || !customerPhone || !deviceModel || !issueDescription) {
      return res.status(400).json({ error: 'Nama pelanggan, nomor WA, tipe barang, dan keluhan wajib diisi.' });
    }

    const orders = await readData(ORDERS_FILE, []);
    const users = await readData(USERS_FILE, []);
    const settings = await readData(SETTINGS_FILE, {});

    // Resolve branch
    const branches = settings.branches || [];
    let selectedBranch = branches.find(b => b.id === branchId);
    if (!selectedBranch) {
      selectedBranch = branches[0] || { id: 'br-1', name: 'Cabang Utama' };
    }

    // Generate unique Ticket No: NKH-YYMM-XXX
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const countThisMonth = orders.filter(o => {
      const d = new Date(o.createdAt);
      return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === (now.getMonth() + 1);
    }).length + 1;
    const ticketNo = `NKH-${yy}${mm}-${String(countThisMonth).padStart(3, '0')}`;

    // Tokenized URL token for secure public tracking
    const trackingToken = 'nkh-' + crypto.randomBytes(4).toString('hex');

    // Parse photos uploaded via multer
    const photoUrls = req.files
      ? await Promise.all(req.files.map(file => storeUpload(file, 'orders')))
      : [];

    // Parse accessories
    let parsedAccessories = [];
    if (accessories) {
      try {
        parsedAccessories = typeof accessories === 'string' ? JSON.parse(accessories) : accessories;
      } catch (e) {
        parsedAccessories = accessories.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // Resolve assigned technician
    let assignedName = 'Belum Ditugaskan';
    if (assignedToId) {
      const tech = users.find(u => u.id === assignedToId);
      if (tech) assignedName = tech.name;
    }

    const isQuotePending = sendQuoteNow === true || sendQuoteNow === 'true';

    const newOrder = {
      id: 'ord-' + Date.now(),
      ticketNo: ticketNo,
      trackingToken: trackingToken,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim().replace(/^0/, '62').replace(/[^\d]/g, ''),
      category: category || 'gadget',
      deviceModel: deviceModel.trim(),
      serialOrImei: serialOrImei ? serialOrImei.trim() : '',
      branchId: selectedBranch.id,
      branchName: selectedBranch.name,
      issueDescription: issueDescription.trim(),
      conditionNotes: conditionNotes ? conditionNotes.trim() : 'Kondisi fisik standar, tidak ada lecet parah.',
      accessories: parsedAccessories,
      photos: photoUrls,
      customerSignature: customerSignature || null,
      status: 'Pesanan Diterima',
      quoteStatus: isQuotePending ? 'pending' : 'none',
      quoteApprovedAt: null,
      quoteDeclinedReason: '',
      paymentConfirmation: {
        status: 'none',
        confirmedAt: null,
        notes: ''
      },
      assignedTo: assignedName,
      assignedToId: assignedToId || null,
      estimatedCost: Number(estimatedCost) || 0,
      finalCost: Number(estimatedCost) || 0,
      serviceFee: Number(estimatedCost) || 0,
      sparepartsUsed: [],
      downPayment: Number(downPayment) || 0,
      paymentStatus: Number(downPayment) > 0 ? 'partial' : 'unpaid',
      paymentMethod: Number(downPayment) > 0 ? 'Tunai (DP)' : '-',
      technicianNotes: isQuotePending ? 'Estimasi biaya siap dikirim ke pelanggan untuk persetujuan (Online Quote).' : 'Unit berhasil didaftarkan di meja penerimaan.',
      timeline: [
        {
          status: 'Pesanan Diterima',
          timestamp: new Date().toISOString(),
          note: `Unit diterima dan didokumentasikan di meja intake (${selectedBranch.name}).` + (serialOrImei ? ` [SN/IMEI: ${serialOrImei}]` : ''),
          actor: req.user.name
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    };

    if (isQuotePending) {
      newOrder.timeline.push({
        status: 'Pesanan Diterima',
        timestamp: new Date().toISOString(),
        note: `Estimasi biaya Rp ${Number(estimatedCost || 0).toLocaleString('id-ID')} diterbitkan untuk persetujuan pelanggan via tracking link.`,
        actor: req.user.name
      });
    }

    orders.unshift(newOrder);
    await writeData(ORDERS_FILE, orders);

    res.status(201).json({
      message: 'Pesanan servis berhasil dibuat.',
      order: await presentOrder(newOrder)
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Gagal membuat tiket servis: ' + err.message });
  }
});

// PUT /api/orders/:id/status - Update Service Status & Lifecycle
app.put('/api/orders/:id/status', authenticate, async (req, res) => {
  const { id } = req.params;
  const { status, note, finalCost, serviceFee, sparepartsUsed, paymentStatus, paymentMethod, assignedToId } = req.body;

  const validStatuses = [
    'Pesanan Diterima',
    'Sedang Dikerjakan',
    'Menunggu Stok / Sparepart',
    'Selesai',
    'Selesai & Diambil',
    'Gagal Servis / Batal'
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status pesanan tidak valid.' });
  }

  const orders = await readData(ORDERS_FILE, []);
  const index = orders.findIndex(o => o.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Pesanan servis tidak ditemukan.' });
  }

  const order = orders[index];
  const previousStatus = order.status;
  const now = new Date().toISOString();

  order.status = status;
  order.updatedAt = now;

  // If status is "Selesai & Diambil" -> lock transaction to completedAt
  if (status === 'Selesai & Diambil') {
    order.completedAt = now;
    order.paymentStatus = 'paid';
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (finalCost !== undefined) order.finalCost = Number(finalCost);
  }

  // If status is "Gagal Servis / Batal" -> exclude from revenue, finalCost = 0
  if (status === 'Gagal Servis / Batal') {
    order.completedAt = now;
    order.finalCost = 0;
    order.serviceFee = 0;
    order.sparepartsUsed = [];
    order.paymentStatus = 'cancelled';
  }

  // Optional updates
  if (finalCost !== undefined && status !== 'Gagal Servis / Batal') {
    order.finalCost = Number(finalCost);
  }
  if (serviceFee !== undefined && status !== 'Gagal Servis / Batal') {
    order.serviceFee = Number(serviceFee);
  }
  if (sparepartsUsed && status !== 'Gagal Servis / Batal') {
    order.sparepartsUsed = sparepartsUsed;
  }
  if (paymentStatus) {
    order.paymentStatus = paymentStatus;
  }

  // Update assignee if specified
  if (assignedToId) {
    const users = await readData(USERS_FILE, []);
    const tech = users.find(u => u.id === assignedToId);
    if (tech) {
      order.assignedTo = tech.name;
      order.assignedToId = tech.id;
    }
  }

  if (note) {
    order.technicianNotes = note;
  }

  // Add timeline event
  order.timeline.push({
    status: status,
    timestamp: now,
    note: note || `Status diperbarui dari "${previousStatus}" menjadi "${status}"`,
    actor: req.user.name
  });

  await writeData(ORDERS_FILE, orders);

  res.json({
    message: `Status pesanan berhasil diubah menjadi ${status}`,
    order: await presentOrder(order)
  });
});

// PUT /api/orders/:id - Update full order details (Edit Pesanan & Harga)
app.put('/api/orders/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const orders = await readData(ORDERS_FILE, []);
  const index = orders.findIndex(o => o.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Pesanan servis tidak ditemukan.' });
  }

  const order = orders[index];

  // If branch changed, resolve new branchName
  if (updates.branchId && updates.branchId !== order.branchId) {
    const settings = await readData(SETTINGS_FILE, {});
    const branches = settings.branches || [];
    const b = branches.find(br => br.id === updates.branchId);
    if (b) {
      order.branchId = b.id;
      order.branchName = b.name;
    }
  }

  // If assignedToId changed, resolve new technician name
  if (updates.assignedToId !== undefined) {
    if (updates.assignedToId) {
      const users = await readData(USERS_FILE, []);
      const tech = users.find(u => u.id === updates.assignedToId);
      if (tech) {
        order.assignedTo = tech.name;
        order.assignedToId = tech.id;
      }
    } else {
      order.assignedTo = 'Belum Ditugaskan';
      order.assignedToId = '';
    }
  }

  // Update text & info fields
  if (updates.customerName) order.customerName = updates.customerName.trim();
  if (updates.customerPhone) order.customerPhone = updates.customerPhone.trim().replace(/^0/, '62').replace(/[^\d]/g, '');
  if (updates.category) order.category = updates.category;
  if (updates.deviceModel) order.deviceModel = updates.deviceModel.trim();
  if (updates.serialOrImei !== undefined) order.serialOrImei = updates.serialOrImei.trim();
  if (updates.issueDescription) order.issueDescription = updates.issueDescription.trim();
  if (updates.conditionNotes !== undefined) order.conditionNotes = updates.conditionNotes.trim();
  if (updates.accessories !== undefined) {
    order.accessories = typeof updates.accessories === 'string' ? updates.accessories.split(',').map(s => s.trim()).filter(Boolean) : updates.accessories;
  }

  // Update financial & pricing fields
  if (updates.estimatedCost !== undefined) order.estimatedCost = Number(updates.estimatedCost);
  if (updates.downPayment !== undefined) order.downPayment = Number(updates.downPayment);
  if (updates.serviceFee !== undefined) order.serviceFee = Number(updates.serviceFee);
  if (updates.finalCost !== undefined) order.finalCost = Number(updates.finalCost);
  if (updates.paymentStatus) order.paymentStatus = updates.paymentStatus;
  if (updates.paymentMethod) order.paymentMethod = updates.paymentMethod;

  // Update status & notes
  if (updates.status) order.status = updates.status;
  if (updates.technicianNotes !== undefined) order.technicianNotes = updates.technicianNotes;

  const now = new Date().toISOString();
  order.updatedAt = now;

  if (order.status === 'Selesai & Diambil' && !order.completedAt) {
    order.completedAt = now;
    order.paymentStatus = 'paid';
  } else if (order.status === 'Gagal Servis / Batal') {
    order.completedAt = now;
    order.finalCost = 0;
    order.serviceFee = 0;
  }

  // Timeline record
  if (!order.timeline) order.timeline = [];
  order.timeline.push({
    status: order.status,
    timestamp: now,
    note: `Data pesanan diedit oleh ${req.user.name}. ${updates.editSummary || 'Pembaruan rincian unit/harga.'}`,
    actor: req.user.name
  });

  await writeData(ORDERS_FILE, orders);
  res.json({ message: 'Data pesanan dan rincian biaya berhasil diperbarui.', order: await presentOrder(order) });
});

// DELETE /api/orders/:id - Owner only
app.delete('/api/orders/:id', authenticate, requireOwner, async (req, res) => {
  const { id } = req.params;
  let orders = await readData(ORDERS_FILE, []);
  const initialLength = orders.length;
  orders = orders.filter(o => o.id !== id);

  if (orders.length === initialLength) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  await writeData(ORDERS_FILE, orders);
  res.json({ message: 'Pesanan servis berhasil dihapus.' });
});

// ==========================================
// 4. PUBLIC CUSTOMER TRACKING ENDPOINT
// ==========================================

// Safe projection for public customer tracking page
app.get('/api/track/:token', async (req, res) => {
  const { token } = req.params;
  const orders = await readData(ORDERS_FILE, []);
  const order = orders.find(o => o.trackingToken === token);

  if (!order) {
    return res.status(404).json({ error: 'Tautan tracking tidak valid atau tiket tidak ditemukan.' });
  }

  const settings = await readData(SETTINGS_FILE, {});

  // Project only public customer-facing attributes
  const publicOrder = {
    ticketNo: order.ticketNo,
    customerName: order.customerName,
    deviceModel: order.deviceModel,
    serialOrImei: order.serialOrImei || '',
    branchId: order.branchId,
    branchName: order.branchName || (settings.branches && settings.branches[0] ? settings.branches[0].name : 'Cabang Utama'),
    category: order.category,
    issueDescription: order.issueDescription,
    conditionNotes: order.conditionNotes,
    accessories: order.accessories || [],
    photos: await Promise.all((order.photos || []).map(resolveStoredUrl)),
    customerSignature: order.customerSignature || null,
    status: order.status,
    quoteStatus: order.quoteStatus || 'none', // 'none' | 'pending' | 'accepted' | 'declined'
    quoteApprovedAt: order.quoteApprovedAt || null,
    quoteDeclinedReason: order.quoteDeclinedReason || '',
    paymentConfirmation: order.paymentConfirmation || { status: 'none', confirmedAt: null, notes: '' },
    assignedTo: order.assignedTo,
    estimatedCost: order.estimatedCost,
    finalCost: order.finalCost,
    serviceFee: order.serviceFee,
    sparepartsUsed: order.sparepartsUsed || [],
    downPayment: order.downPayment || 0,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    technicianNotes: order.technicianNotes,
    timeline: order.timeline,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    store: {
      name: settings.storeName || 'Nakahasite Service Hub',
      phone: settings.phone || '081234567890',
      address: settings.address || 'Workshop & Service Center',
      tagline: settings.tagline || '',
      logoUrl: await resolveStoredUrl(settings.logoUrl || null),
      paymentQrImage: await resolveStoredUrl(settings.paymentQrImage || '/uploads/sample-qris.svg')
    }
  };

  res.json(publicOrder);
});

// Customer Online Quote Approval (Accept / Decline)
app.post('/api/track/:token/quote', async (req, res) => {
  const { token } = req.params;
  const { action, reason } = req.body; // action: 'accept' | 'decline'
  const orders = await readData(ORDERS_FILE, []);
  const order = orders.find(o => o.trackingToken === token);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const now = new Date().toISOString();
  if (action === 'accept') {
    order.quoteStatus = 'accepted';
    order.quoteApprovedAt = now;
    // Auto advance status to 'Sedang Dikerjakan' if in intake/hold
    if (order.status === 'Pesanan Diterima' || order.status === 'Menunggu Stok / Sparepart') {
      order.status = 'Sedang Dikerjakan';
    }
    order.timeline.push({
      status: order.status,
      timestamp: now,
      note: `Pelanggan MENYETUJUI estimasi biaya perbaikan (Rp ${Number(order.estimatedCost || 0).toLocaleString('id-ID')}) via Online Tracking Link. Pengerjaan disetujui.`,
      actor: `${order.customerName} (Online Approval)`
    });
  } else if (action === 'decline') {
    order.quoteStatus = 'declined';
    order.quoteDeclinedReason = reason || 'Ditolak oleh pelanggan tanpa alasan spesifik.';
    order.timeline.push({
      status: order.status,
      timestamp: now,
      note: `Pelanggan MENOLAK estimasi biaya perbaikan via Online Link. Alasan: ${order.quoteDeclinedReason}`,
      actor: `${order.customerName} (Online Decline)`
    });
  } else {
    return res.status(400).json({ error: 'Aksi persetujuan tidak valid.' });
  }

  order.updatedAt = now;
  await writeData(ORDERS_FILE, orders);

  res.json({
    message: action === 'accept' ? 'Terima kasih! Estimasi biaya berhasil disetujui.' : 'Pemberitahuan penolakan telah dikirimkan ke teknisi.',
    quoteStatus: order.quoteStatus,
    status: order.status
  });
});

// Customer Online Payment Confirmation (QRIS / Transfer)
app.post('/api/track/:token/confirm-payment', async (req, res) => {
  const { token } = req.params;
  const { notes, method } = req.body;
  const orders = await readData(ORDERS_FILE, []);
  const order = orders.find(o => o.trackingToken === token);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const now = new Date().toISOString();
  order.paymentConfirmation = {
    status: 'pending_verification',
    confirmedAt: now,
    method: method || 'QRIS / Transfer Bank',
    notes: notes || 'Pelanggan telah memindai QRIS dan menyelesaikan pembayaran.'
  };

  order.timeline.push({
    status: order.status,
    timestamp: now,
    note: `Pelanggan mengonfirmasi pembayaran (${order.paymentConfirmation.method}): "${order.paymentConfirmation.notes}". Menunggu verifikasi kasir.`,
    actor: `${order.customerName} (Payment Confirmation)`
  });

  order.updatedAt = now;
  await writeData(ORDERS_FILE, orders);

  res.json({
    message: 'Konfirmasi pembayaran berhasil dikirimkan ke kasir.',
    paymentConfirmation: order.paymentConfirmation
  });
});

// Staff / Owner: Send Quote to Customer via WA & set quoteStatus = pending
app.put('/api/orders/:id/send-quote', authenticate, async (req, res) => {
  const { id } = req.params;
  const { estimatedCost, note } = req.body;
  const orders = await readData(ORDERS_FILE, []);
  const order = orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  if (estimatedCost !== undefined) {
    order.estimatedCost = Number(estimatedCost);
    order.finalCost = Number(estimatedCost);
  }
  if (note) {
    order.technicianNotes = note;
  }

  const now = new Date().toISOString();
  order.quoteStatus = 'pending';
  order.updatedAt = now;
  order.timeline.push({
    status: order.status,
    timestamp: now,
    note: `Penawaran estimasi biaya Rp ${Number(order.estimatedCost).toLocaleString('id-ID')} diterbitkan untuk persetujuan online pelanggan.`,
    actor: req.user.name
  });

  await writeData(ORDERS_FILE, orders);

  const settings = await readData(SETTINGS_FILE, {});
  const rawTemplate = settings.whatsappQuoteTemplate || "Halo *{nama_pelanggan}*, estimasi biaya perbaikan *{nama_barang}* di *{nama_toko}* adalah *{estimasi_biaya}*. Silakan setujui/tolak via link: {link_tracking}";
  const trackingUrl = `${req.protocol}://${req.get('host')}/track/${order.trackingToken}`;
  const waMsg = rawTemplate
    .replace(/{nama_pelanggan}/g, order.customerName)
    .replace(/{nama_toko}/g, settings.storeName || 'Nakahasite Service Hub')
    .replace(/{nama_cabang}/g, order.branchName || '')
    .replace(/{nomor_tiket}/g, order.ticketNo)
    .replace(/{nama_barang}/g, order.deviceModel)
    .replace(/{estimasi_biaya}/g, `Rp ${Number(order.estimatedCost).toLocaleString('id-ID')}`)
    .replace(/{catatan_teknisi}/g, order.technicianNotes || 'Pemeriksaan awal komponen')
    .replace(/{link_tracking}/g, trackingUrl);

  res.json({
    message: 'Penawaran estimasi biaya siap dikirimkan.',
    order: await presentOrder(order),
    waMessage: waMsg,
    customerPhone: order.customerPhone
  });
});

// Staff / Owner: Verify Customer Payment -> Mark as Paid
app.put('/api/orders/:id/verify-payment', authenticate, async (req, res) => {
  const { id } = req.params;
  const orders = await readData(ORDERS_FILE, []);
  const order = orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const now = new Date().toISOString();
  if (!order.paymentConfirmation) order.paymentConfirmation = {};
  order.paymentConfirmation.status = 'verified';
  order.paymentConfirmation.verifiedAt = now;
  order.paymentConfirmation.verifiedBy = req.user.name;
  order.paymentStatus = 'paid';
  order.paymentMethod = order.paymentConfirmation.method || 'QRIS BCA';

  order.timeline.push({
    status: order.status,
    timestamp: now,
    note: `Pembayaran pelanggan (Rp ${Number(order.finalCost || order.estimatedCost).toLocaleString('id-ID')}) diverifikasi & disahkan LUNAS oleh ${req.user.name}.`,
    actor: req.user.name
  });

  order.updatedAt = now;
  await writeData(ORDERS_FILE, orders);

  res.json({ message: 'Pembayaran berhasil diverifikasi menjadi Lunas.', order: await presentOrder(order) });
});

// Web Route: /track/:token serves public track.html
app.get('/track/:token', async (req, res) => {
  res.sendFile('track.html', { root: path.join(__dirname, 'public') });
});

// ==========================================
// 5. BRANCHES & MULTI-LOCATION MANAGEMENT
// ==========================================

app.get('/api/branches', async (req, res) => {
  const settings = await readData(SETTINGS_FILE, {});
  res.json(settings.branches || []);
});

app.post('/api/branches', authenticate, requireOwner, async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nama cabang wajib diisi.' });
  }

  const settings = await readData(SETTINGS_FILE, {});
  if (!settings.branches) settings.branches = [];

  const newBranch = {
    id: 'br-' + Date.now(),
    name: name.trim(),
    address: address ? address.trim() : '',
    phone: phone ? phone.trim() : '',
    isDefault: settings.branches.length === 0
  };

  settings.branches.push(newBranch);
  await writeData(SETTINGS_FILE, settings);
  res.status(201).json({ message: 'Cabang baru berhasil ditambahkan.', branch: newBranch });
});

app.put('/api/branches/:id', authenticate, requireOwner, async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, isDefault } = req.body;

  const settings = await readData(SETTINGS_FILE, {});
  if (!settings.branches) settings.branches = [];
  const index = settings.branches.findIndex(b => b.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Cabang tidak ditemukan.' });
  }

  if (name) settings.branches[index].name = name.trim();
  if (address !== undefined) settings.branches[index].address = address.trim();
  if (phone !== undefined) settings.branches[index].phone = phone.trim();
  if (isDefault) {
    settings.branches.forEach(b => b.isDefault = (b.id === id));
  }

  await writeData(SETTINGS_FILE, settings);
  res.json({ message: 'Data cabang berhasil diperbarui.', branch: settings.branches[index] });
});

app.delete('/api/branches/:id', authenticate, requireOwner, async (req, res) => {
  const { id } = req.params;
  const settings = await readData(SETTINGS_FILE, {});
  if (!settings.branches) settings.branches = [];

  if (settings.branches.length <= 1) {
    return res.status(400).json({ error: 'Tidak dapat menghapus cabang satu-satunya.' });
  }

  settings.branches = settings.branches.filter(b => b.id !== id);
  await writeData(SETTINGS_FILE, settings);
  res.json({ message: 'Cabang berhasil dihapus.' });
});

// ==========================================
// 6. CUSTOM BUSINESS CATEGORIES
// ==========================================

app.get('/api/categories', async (req, res) => {
  const settings = await readData(SETTINGS_FILE, {});
  res.json(settings.categories || []);
});

app.post('/api/categories', authenticate, requireOwner, async (req, res) => {
  const { name, icon, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }

  const settings = await readData(SETTINGS_FILE, {});
  if (!settings.categories) settings.categories = [];

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('cat-' + Date.now());

  if (settings.categories.some(c => c.id === id)) {
    return res.status(400).json({ error: 'Kategori dengan nama serupa sudah ada.' });
  }

  const newCat = {
    id,
    name: name.trim(),
    icon: icon || 'fa-tag',
    description: description ? description.trim() : ''
  };

  settings.categories.push(newCat);
  await writeData(SETTINGS_FILE, settings);
  res.status(201).json({ message: 'Kategori usaha baru berhasil ditambahkan.', category: newCat });
});

app.delete('/api/categories/:id', authenticate, requireOwner, async (req, res) => {
  const { id } = req.params;
  const settings = await readData(SETTINGS_FILE, {});
  if (!settings.categories) settings.categories = [];

  settings.categories = settings.categories.filter(c => c.id !== id);
  await writeData(SETTINGS_FILE, settings);
  res.json({ message: 'Kategori berhasil dihapus.' });
});

// ==========================================
// 7. MONTHLY FINANCIAL REPORTING (OWNER ONLY)
// ==========================================

app.get('/api/reports/monthly', authenticate, requireOwner, async (req, res) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const year = Number(req.query.year) || currentYear;
  const month = Number(req.query.month) || currentMonth;
  const branchId = req.query.branchId;

  let orders = await readData(ORDERS_FILE, []);
  const users = await readData(USERS_FILE, []);

  // Filter by branch if specified
  if (branchId && branchId !== 'Semua') {
    orders = orders.filter(o => o.branchId === branchId);
  }

  // Filter orders relevant to this month
  // Revenue is strictly counted when completedAt is within selected month & status === "Selesai & Diambil"
  const monthlySuccessfulOrders = orders.filter(o => {
    if (o.status !== 'Selesai & Diambil' || !o.completedAt) return false;
    const d = new Date(o.completedAt);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // Cancelled / Failed orders in this month (strictly excluded from revenue, Rp 0)
  const monthlyFailedOrders = orders.filter(o => {
    if (o.status !== 'Gagal Servis / Batal' || !o.completedAt) return false;
    const d = new Date(o.completedAt);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // Calculate financials
  const totalRevenue = monthlySuccessfulOrders.reduce((sum, o) => sum + (Number(o.finalCost) || 0), 0);
  const totalServiceFee = monthlySuccessfulOrders.reduce((sum, o) => sum + (Number(o.serviceFee) || 0), 0);
  const totalSparepartsCost = monthlySuccessfulOrders.reduce((sum, o) => {
    const partsSum = (o.sparepartsUsed || []).reduce((pSum, p) => pSum + ((Number(p.price) || 0) * (Number(p.qty) || 1)), 0);
    return sum + partsSum;
  }, 0);

  const successfulCount = monthlySuccessfulOrders.length;
  const failedCount = monthlyFailedOrders.length;
  const totalCompletedUnits = successfulCount + failedCount;
  const successRate = totalCompletedUnits > 0 ? Math.round((successfulCount / totalCompletedUnits) * 100) : 100;
  const averageTicket = successfulCount > 0 ? Math.round(totalRevenue / successfulCount) : 0;

  // Breakdown by Category
  const categoryMap = {};
  monthlySuccessfulOrders.forEach(o => {
    const cat = o.category || 'other';
    if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, count: 0 };
    categoryMap[cat].revenue += Number(o.finalCost) || 0;
    categoryMap[cat].count += 1;
  });

  // Breakdown by Technician & Commissions
  const technicianMap = {};
  users.filter(u => u.role === 'technician' || u.role === 'staff').forEach(u => {
    technicianMap[u.id] = {
      name: u.name,
      role: u.role,
      commissionRate: u.commissionRate || 0,
      completedUnits: 0,
      generatedRevenue: 0,
      estimatedCommission: 0
    };
  });

  monthlySuccessfulOrders.forEach(o => {
    if (o.assignedToId && technicianMap[o.assignedToId]) {
      const tech = technicianMap[o.assignedToId];
      const rev = Number(o.finalCost) || 0;
      tech.completedUnits += 1;
      tech.generatedRevenue += rev;
      tech.estimatedCommission += Math.round(rev * (tech.commissionRate / 100));
    }
  });

  res.json({
    period: { year, month },
    summary: {
      totalRevenue,
      totalServiceFee,
      totalSparepartsCost,
      successfulCount,
      failedCount,
      totalCompletedUnits,
      successRate,
      averageTicket
    },
    categoryBreakdown: categoryMap,
    technicianPerformance: Object.values(technicianMap),
    successfulTransactions: monthlySuccessfulOrders.map(o => ({
      ticketNo: o.ticketNo,
      customerName: o.customerName,
      deviceModel: o.deviceModel,
      category: o.category,
      finalCost: o.finalCost,
      serviceFee: o.serviceFee,
      sparepartsUsed: o.sparepartsUsed || [],
      assignedTo: o.assignedTo,
      completedAt: o.completedAt,
      paymentMethod: o.paymentMethod || 'Lunas'
    })),
    failedTransactions: monthlyFailedOrders.map(o => ({
      ticketNo: o.ticketNo,
      customerName: o.customerName,
      deviceModel: o.deviceModel,
      category: o.category,
      issueDescription: o.issueDescription,
      technicianNotes: o.technicianNotes,
      assignedTo: o.assignedTo,
      completedAt: o.completedAt,
      finalCost: 0
    }))
  });
});

// CSV Export for Monthly Report (Owner Only)
app.get('/api/export/financial-csv', authenticate, requireOwner, async (req, res) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const year = Number(req.query.year) || currentYear;
  const month = Number(req.query.month) || currentMonth;

  const orders = await readData(ORDERS_FILE, []);
  const monthlyOrders = orders.filter(o => {
    if (!o.completedAt) return false;
    const d = new Date(o.completedAt);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel
  csv += `LAPORAN KEUANGAN BULANAN NAKAHASITE - PERIODE ${month}/${year}\r\n`;
  csv += `Generated at: ${new Date().toLocaleString('id-ID')}\r\n\r\n`;
  csv += 'No Tiket,Tanggal Selesai,Pelanggan,Unit / Barang,Kategori,Status,Teknisi,Biaya Jasa (Rp),Biaya Sparepart (Rp),Total Akhir (Rp),Metode Bayar\r\n';

  let totalOmzet = 0;
  monthlyOrders.forEach(o => {
    const isSuccess = o.status === 'Selesai & Diambil';
    const revenue = isSuccess ? (Number(o.finalCost) || 0) : 0;
    const serviceFee = isSuccess ? (Number(o.serviceFee) || 0) : 0;
    const partsCost = isSuccess ? (revenue - serviceFee) : 0;
    if (isSuccess) totalOmzet += revenue;

    const dateStr = o.completedAt ? new Date(o.completedAt).toLocaleDateString('id-ID') : '-';
    csv += `"${o.ticketNo}","${dateStr}","${o.customerName}","${o.deviceModel}","${o.category}","${o.status}","${o.assignedTo}","${serviceFee}","${partsCost}","${revenue}","${o.paymentMethod || '-'}"\r\n`;
  });

  csv += `\r\n,,,TOTAL PENDAPATAN BERSIH / OMZET,,,,,"${totalOmzet}",,\r\n`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan_Keuangan_Nakahasite_${year}_${String(month).padStart(2, '0')}.csv"`);
  res.send(csv);
});

// ==========================================
// 6. SPAREPART & INVENTORY ENDPOINTS
// ==========================================

app.get('/api/spareparts', authenticate, async (req, res) => {
  const parts = await readData(SPAREPARTS_FILE, []);
  res.json(parts);
});

app.post('/api/spareparts', authenticate, async (req, res) => {
  const { name, category, stock, buyPrice, sellPrice, unit } = req.body;
  if (!name || sellPrice === undefined) {
    return res.status(400).json({ error: 'Nama barang dan harga jual wajib diisi.' });
  }

  const parts = await readData(SPAREPARTS_FILE, []);
  const newPart = {
    id: 'sp-' + Date.now(),
    name: name.trim(),
    category: category || 'general',
    stock: Number(stock) || 0,
    buyPrice: Number(buyPrice) || 0,
    sellPrice: Number(sellPrice) || 0,
    unit: unit || 'pcs'
  };

  parts.push(newPart);
  await writeData(SPAREPARTS_FILE, parts);
  res.status(201).json({ message: 'Sparepart berhasil ditambahkan.', sparepart: newPart });
});

app.put('/api/spareparts/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const parts = await readData(SPAREPARTS_FILE, []);
  const index = parts.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Sparepart tidak ditemukan.' });
  }

  Object.assign(parts[index], req.body, { id: parts[index].id });
  await writeData(SPAREPARTS_FILE, parts);
  res.json({ message: 'Sparepart berhasil diperbarui.', sparepart: parts[index] });
});

app.delete('/api/spareparts/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  let parts = await readData(SPAREPARTS_FILE, []);
  parts = parts.filter(p => p.id !== id);
  await writeData(SPAREPARTS_FILE, parts);
  res.json({ message: 'Sparepart berhasil dihapus.' });
});

// ==========================================
// 7. STORE SETTINGS ENDPOINTS
// ==========================================

app.get('/api/settings', async (req, res) => {
  const settings = await readData(SETTINGS_FILE, {});
  res.json(await presentSettings(settings));
});

app.put('/api/settings', authenticate, requireOwner, async (req, res) => {
  const currentSettings = await readData(SETTINGS_FILE, {});
  const updatedSettings = Object.assign(currentSettings, req.body);
  await writeData(SETTINGS_FILE, updatedSettings);
  res.json({ message: 'Pengaturan toko berhasil disimpan.', settings: await presentSettings(updatedSettings) });
});

// Upload custom store QRIS image
app.post('/api/settings/upload-qris', authenticate, requireOwner, upload.single('qrisImage'), limitTotalUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Tidak ada file gambar QRIS yang diunggah.' });
  }
  const settings = await readData(SETTINGS_FILE, {});
  settings.paymentQrImage = await storeUpload(req.file, 'store');
  await writeData(SETTINGS_FILE, settings);
  res.json({
    message: 'QR Code QRIS toko berhasil diperbarui.',
    paymentQrImage: await resolveStoredUrl(settings.paymentQrImage)
  });
});

// Upload custom store logo image
app.post('/api/settings/upload-logo', authenticate, requireOwner, upload.single('logo'), limitTotalUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Tidak ada file logo yang diunggah.' });
  }
  const settings = await readData(SETTINGS_FILE, {});
  settings.logoUrl = await storeUpload(req.file, 'store');
  await writeData(SETTINGS_FILE, settings);
  res.json({ message: 'Logo usaha berhasil diperbarui.', logoUrl: await resolveStoredUrl(settings.logoUrl) });
});

// Fallback to index.html for SPA routes (Express 5 compatible)
app.use((req, res) => {
  if (req.path.startsWith('/track/')) {
    return res.sendFile('track.html', { root: path.join(__dirname, 'public') });
  }
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

app.use((err, req, res, next) => {
  console.error('Request failed:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server. Silakan coba lagi.' });
});

let localServer = null;
if (!process.env.VERCEL) {
  localServer = app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` Nakahasite SaaS Service Operations Server`);
    console.log(` Running on: http://localhost:${PORT}`);
    console.log(` Customer Tracking: http://localhost:${PORT}/track/:token`);
    console.log(`===============================================`);
  });
}

module.exports = app;
module.exports.localServer = localServer;
