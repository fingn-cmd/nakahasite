const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const scrypt = promisify(crypto.scrypt);
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'nakahasite-private';
const dataFiles = [
  'nakahasite_users',
  'nakahasite_orders',
  'nakahasite_settings',
  'nakahasite_spareparts'
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} belum diatur.`);
  return value;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf'
  };
  return types[ext] || 'application/octet-stream';
}

async function migrateAsset(supabase, value, uploadedAssets) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return value;

  const fileName = value.slice('/uploads/'.length);
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new Error(`Path upload lokal tidak valid: ${value}`);
  }

  const localPath = path.join(uploadsDir, fileName);
  if (!fs.existsSync(localPath)) {
    throw new Error(`File yang dirujuk data tidak ditemukan: ${localPath}`);
  }

  const objectPath = `legacy/${fileName}`;
  if (!uploadedAssets.has(objectPath)) {
    const { error } = await supabase.storage.from(bucket).upload(
      objectPath,
      fs.readFileSync(localPath),
      { contentType: contentTypeFor(localPath), upsert: true }
    );
    if (error) throw new Error(`Gagal memindahkan ${fileName}: ${error.message}`);
    uploadedAssets.add(objectPath);
  }
  return objectPath;
}

async function main() {
  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: existingRows, error: selectError } = await supabase
    .from('naka_app_data')
    .select('id');
  if (selectError) {
    throw new Error(`Tidak bisa membaca tabel naka_app_data. Jalankan supabase/schema.sql dulu: ${selectError.message}`);
  }
  if (existingRows.length && !process.argv.includes('--overwrite')) {
    throw new Error('Database sudah berisi data. Hentikan migrasi agar tidak menimpa data; gunakan --overwrite hanya jika memang ingin mengganti seluruh koleksi.');
  }

  const uploadedAssets = new Set();
  const records = [];
  for (const name of dataFiles) {
    const filePath = path.join(dataDir, `${name}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`File data lokal tidak ditemukan: ${filePath}`);

    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (name === 'nakahasite_users') {
      for (const user of payload) {
        if (!user.password) throw new Error(`Password akun ${user.username || user.id} kosong; perbaiki data lokal sebelum migrasi.`);
        if (user.password === 'password123') {
          throw new Error(`Akun ${user.username || user.id} masih memakai password demo. Ganti password semua akun sebelum migrasi.`);
        }
        if (!user.password.startsWith('scrypt$')) user.password = await hashPassword(user.password);
      }
    }
    if (name === 'nakahasite_orders') {
      for (const order of payload) {
        order.photos = await Promise.all(
          (order.photos || []).map(value => migrateAsset(supabase, value, uploadedAssets))
        );
      }
    }
    if (name === 'nakahasite_settings') {
      for (const field of ['logoUrl', 'paymentQrImage']) {
        payload[field] = await migrateAsset(supabase, payload[field], uploadedAssets);
      }
    }
    records.push({ id: name, payload, updated_at: new Date().toISOString() });
  }

  const { error: upsertError } = await supabase.from('naka_app_data').upsert(records);
  if (upsertError) throw new Error(`Gagal menyalin data ke Supabase: ${upsertError.message}`);
  console.log(`Migrasi selesai: ${records.length} koleksi data dan ${uploadedAssets.size} file upload dipindahkan.`);
  console.log('Password staf sudah di-hash; file lokal tidak diubah.');
}

main().catch((error) => {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
});
