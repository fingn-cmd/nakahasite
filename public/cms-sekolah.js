// CMS Sekolah - Isolated School Dashboard & Registration
// Ensure schools only see & manage their OWN profile and brochure

const SCHOOL_STORAGE_KEY = 'masadepan_current_school_id';
let currentSchool = null;
let uploadedBrochureFileName = '';
let uploadedBrochureUrl = '';

document.addEventListener('DOMContentLoaded', () => {
  initSchoolCmsEvents();
  checkSchoolSession();
});

function initSchoolCmsEvents() {
  // School image URL preview
  const imageUrlInput = document.getElementById('cmsSchoolImageUrl');
  const imagePreview = document.getElementById('cmsSchoolImagePreview');
  if (imageUrlInput && imagePreview) {
    imageUrlInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) imagePreview.src = url;
    });
  }

  // School image file upload
  const imageFileInput = document.getElementById('cmsSchoolFileInput');
  if (imageFileInput) {
    imageFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        Swal.showLoading();
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        Swal.close();
        if (data.success) {
          imagePreview.src = data.url;
          imageUrlInput.value = data.url;
          Swal.fire({ icon: 'success', title: 'Foto Berhasil Diunggah!', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'Gagal Unggah Foto', text: data.message });
        }
      } catch (err) {
        Swal.close();
        console.error('Upload school image error:', err);
      }
    });
  }

  // School brochure PDF upload
  const brochureFileInput = document.getElementById('cmsSchoolBrochureInput');
  const brochureDisplay = document.getElementById('cmsSchoolBrochureDisplay');
  if (brochureFileInput && brochureDisplay) {
    brochureFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        Swal.showLoading();
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        Swal.close();
        if (data.success) {
          uploadedBrochureFileName = data.fileName;
          uploadedBrochureUrl = data.url;
          brochureDisplay.innerHTML = `
            <span class="text-emerald-700 font-extrabold flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
              <i class="fa-solid fa-file-circle-check text-emerald-600"></i>
              <span>${data.fileName}</span>
              <a href="${data.url}" target="_blank" class="text-blue-600 underline text-[11px] ml-1">(Buka File)</a>
            </span>
          `;
          Swal.fire({
            icon: 'success',
            title: 'Brosur PPDB Berhasil Diunggah!',
            text: `Berkas ${data.fileName} terhubung dengan profil sekolah.`,
            timer: 1600,
            showConfirmButton: false
          });
        } else {
          Swal.fire({ icon: 'error', title: 'Gagal Unggah Brosur', text: data.message });
        }
      } catch (err) {
        Swal.close();
        console.error('Upload brochure error:', err);
      }
    });
  }

  // Form submission
  const form = document.getElementById('schoolCmsForm');
  if (form) {
    form.addEventListener('submit', handleSchoolFormSubmit);
  }

  // Enter key on login input
  const loginInput = document.getElementById('schoolLoginInput');
  if (loginInput) {
    loginInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginSchoolWithCredential();
      }
    });
  }
}

// -------- SESSION MANAGEMENT --------

async function checkSchoolSession() {
  const savedId = localStorage.getItem(SCHOOL_STORAGE_KEY);
  if (savedId) {
    try {
      const res = await fetch(`/api/schools/${savedId}`);
      const data = await res.json();
      if (data.success && data.school) {
        showSchoolEditor(data.school);
        return;
      }
    } catch (e) {
      console.warn('School session check failed:', e);
    }
  }
  showSchoolGateway();
}

function showSchoolGateway() {
  currentSchool = null;
  document.getElementById('schoolGatewayView').classList.remove('hidden');
  document.getElementById('schoolEditorView').classList.add('hidden');
  const authHeader = document.getElementById('schoolAuthHeader');
  if (authHeader) {
    authHeader.classList.add('hidden');
    authHeader.classList.remove('flex');
  }
}

window.startSchoolRegistrationFlow = function() {
  currentSchool = null;
  resetSchoolForm();

  document.getElementById('cmsSchoolProfileName').textContent = 'Pendaftaran Lembaga Pendidikan Baru';
  document.getElementById('cmsSchoolProfileSubtext').textContent = 'Isi data sekolah Anda dengan lengkap. Profil akan langsung tayang di direktori.';
  document.getElementById('cmsSchoolIdBadge').textContent = 'Mode: Pendaftaran Baru';
  document.getElementById('cmsSchoolSubmitBtnLabel').textContent = 'Daftar & Publikasikan Sekolah ke Website';
  document.getElementById('cmsSchoolDeleteBtn').classList.add('hidden');

  document.getElementById('schoolGatewayView').classList.add('hidden');
  document.getElementById('schoolEditorView').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.loginSchoolWithCredential = async function() {
  const input = document.getElementById('schoolLoginInput');
  const credential = input.value.trim();

  if (!credential) {
    Swal.fire({
      icon: 'warning',
      title: 'Nomor WA / Email Belum Diisi',
      text: 'Masukkan nomor WhatsApp atau email yang digunakan saat mendaftar.',
      confirmButtonColor: '#2563EB'
    });
    return;
  }

  try {
    Swal.showLoading();
    const res = await fetch('/api/schools/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    const data = await res.json();
    Swal.close();

    if (data.success && data.school) {
      localStorage.setItem(SCHOOL_STORAGE_KEY, data.school.id);
      showSchoolEditor(data.school);
      Swal.fire({
        icon: 'success',
        title: `Selamat Datang! 🏫`,
        text: `Dashboard ${data.school.name} telah dibuka.`,
        timer: 1500,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Lembaga Tidak Ditemukan',
        text: data.message || 'WhatsApp atau email tidak terdaftar. Silakan daftar baru.',
        confirmButtonColor: '#2563EB'
      });
    }
  } catch (err) {
    Swal.close();
    Swal.fire({ icon: 'error', title: 'Kesalahan Jaringan', text: 'Gagal terhubung ke server.' });
  }
};

// -------- SCHOOL EDITOR VIEW --------

function showSchoolEditor(school) {
  currentSchool = school;

  document.getElementById('schoolGatewayView').classList.add('hidden');
  document.getElementById('schoolEditorView').classList.remove('hidden');

  // Header auth badge
  const authHeader = document.getElementById('schoolAuthHeader');
  if (authHeader) {
    authHeader.classList.remove('hidden');
    authHeader.classList.add('flex');
    document.getElementById('schoolHeaderBadge').innerHTML = `
      <i class="fa-solid fa-school text-blue-400 mr-1"></i>
      <span>${school.name.split(' ').slice(0, 3).join(' ')}</span>
    `;
  }

  // Banner
  document.getElementById('cmsActiveSchoolBadge').src = school.image || 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80';
  document.getElementById('cmsSchoolProfileName').textContent = school.name;
  document.getElementById('cmsSchoolProfileSubtext').textContent = `${school.type} • ${school.city} • SPP: Rp ${(school.tuitionMonthly || 0).toLocaleString('id-ID')}/bulan`;
  document.getElementById('cmsSchoolIdBadge').textContent = `ID: ${school.id}`;
  document.getElementById('cmsSchoolSubmitBtnLabel').textContent = `Simpan & Perbarui Profil Sekolah`;
  document.getElementById('cmsSchoolDeleteBtn').classList.remove('hidden');

  // Fill form fields
  document.getElementById('cmsSchoolName').value = school.name || '';
  document.getElementById('cmsSchoolType').value = school.type || 'Preschool & Daycare';
  document.getElementById('cmsSchoolAkreditasi').value = school.akreditasi || 'A (Unggul)';
  document.getElementById('cmsSchoolCurriculum').value = school.curriculum || '';
  document.getElementById('cmsSchoolCity').value = school.city || 'Jakarta Selatan';
  document.getElementById('cmsSchoolTuition').value = school.tuitionMonthly || 750000;
  document.getElementById('cmsSchoolEntryFee').value = school.entryFee || 5000000;
  document.getElementById('cmsSchoolPhone').value = school.phone || '';
  document.getElementById('cmsSchoolAddress').value = school.address || '';
  document.getElementById('cmsSchoolFacilities').value = (school.facilities || []).join('\n');
  document.getElementById('cmsSchoolPrograms').value = (school.programs || []).join('\n');
  document.getElementById('cmsSchoolDescription').value = school.description || '';

  // Image
  document.getElementById('cmsSchoolImageUrl').value = school.image || '';
  document.getElementById('cmsSchoolImagePreview').src = school.image || 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80';

  // Brochure
  uploadedBrochureFileName = school.brochureFileName || '';
  uploadedBrochureUrl = school.brochureUrl || '';
  const brochureDisplay = document.getElementById('cmsSchoolBrochureDisplay');
  if (uploadedBrochureFileName) {
    brochureDisplay.innerHTML = `
      <span class="text-emerald-700 font-extrabold flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
        <i class="fa-solid fa-file-circle-check text-emerald-600"></i>
        <span>${uploadedBrochureFileName}</span>
        ${uploadedBrochureUrl ? `<a href="${uploadedBrochureUrl}" target="_blank" class="text-blue-600 underline text-[11px] ml-1">(Buka)</a>` : ''}
      </span>
    `;
  } else {
    brochureDisplay.textContent = 'Belum ada file dipilih';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSchoolForm() {
  document.getElementById('schoolCmsForm').reset();
  document.getElementById('cmsSchoolImagePreview').src = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80';
  document.getElementById('cmsSchoolBrochureDisplay').textContent = 'Belum ada file dipilih';
  uploadedBrochureFileName = '';
  uploadedBrochureUrl = '';
}

window.returnToSchoolGateway = function() {
  showSchoolGateway();
};

window.logoutSchool = function() {
  localStorage.removeItem(SCHOOL_STORAGE_KEY);
  currentSchool = null;
  showSchoolGateway();
  Swal.fire({
    icon: 'info',
    title: 'Berhasil Keluar',
    text: 'Sesi akun sekolah telah ditutup.',
    timer: 1200,
    showConfirmButton: false
  });
};

// -------- FORM SUBMIT --------

async function handleSchoolFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('cmsSchoolName').value.trim();
  const type = document.getElementById('cmsSchoolType').value;
  const akreditasi = document.getElementById('cmsSchoolAkreditasi').value;
  const curriculum = document.getElementById('cmsSchoolCurriculum').value.trim();
  const city = document.getElementById('cmsSchoolCity').value;
  const tuitionMonthly = parseInt(document.getElementById('cmsSchoolTuition').value, 10) || 750000;
  const entryFee = parseInt(document.getElementById('cmsSchoolEntryFee').value, 10) || 0;
  const phone = document.getElementById('cmsSchoolPhone').value.trim();
  const address = document.getElementById('cmsSchoolAddress').value.trim();
  const facilities = document.getElementById('cmsSchoolFacilities').value.split('\n').map(s => s.trim()).filter(Boolean);
  const programs = document.getElementById('cmsSchoolPrograms').value.split('\n').map(s => s.trim()).filter(Boolean);
  const description = document.getElementById('cmsSchoolDescription').value.trim();
  const image = document.getElementById('cmsSchoolImageUrl').value.trim() ||
                document.getElementById('cmsSchoolImagePreview').src;

  if (!name || !type || !phone) {
    Swal.fire({
      icon: 'warning',
      title: 'Data Wajib Belum Lengkap',
      text: 'Nama sekolah, jenjang/tipe, dan nomor WhatsApp wajib diisi.',
      confirmButtonColor: '#2563EB'
    });
    return;
  }

  const payload = {
    name,
    type,
    gradeLevels: [type],
    akreditasi,
    curriculum,
    city,
    tuitionMonthly,
    entryFee,
    phone,
    address,
    facilities: facilities.length > 0 ? facilities : ['Ruang Kelas Ber-AC', 'Perpustakaan'],
    programs: programs.length > 0 ? programs : ['Program Akademik Unggulan'],
    description,
    image,
    brochureFileName: uploadedBrochureFileName || (currentSchool?.brochureFileName) || 'Brosur_PPDB.pdf',
    brochureUrl: uploadedBrochureUrl || (currentSchool?.brochureUrl) || '',
    email: currentSchool?.email || `info@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}.sch.id`
  };

  const isEdit = currentSchool && currentSchool.id;
  const url = isEdit ? `/api/schools/${currentSchool.id}` : '/api/schools';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    Swal.showLoading();
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    Swal.close();

    if (data.success && data.school) {
      localStorage.setItem(SCHOOL_STORAGE_KEY, data.school.id);
      showSchoolEditor(data.school);

      Swal.fire({
        icon: 'success',
        title: isEdit ? 'Profil Sekolah Diperbarui! 🏫' : 'Sekolah Berhasil Didaftarkan! 🚀',
        html: `
          <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
            <p>Profil <b>${name}</b> kini tayang di direktori MasaDepanAnak.</p>
            <p>• <b>Jenjang:</b> ${type}</p>
            <p>• <b>SPP:</b> Rp ${tuitionMonthly.toLocaleString('id-ID')}/bulan</p>
            <p>• <b>WhatsApp CS:</b> ${phone}</p>
            <p class="text-blue-600 font-bold">Orang tua calon murid kini dapat menemukan sekolah Anda.</p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: '👁️ Lihat di Website',
        cancelButtonText: 'Tetap di Dashboard',
        confirmButtonColor: '#2563EB',
        cancelButtonColor: '#475569'
      }).then((result) => {
        if (result.isConfirmed) {
          window.open('index.html#sekolah-section', '_blank');
        }
      });
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: data.message || 'Terjadi kesalahan.' });
    }
  } catch (err) {
    Swal.close();
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: 'Gagal menghubungi server.' });
  }
}

// -------- DELETE SCHOOL --------

window.deleteCurrentSchool = async function() {
  if (!currentSchool || !currentSchool.id) return;

  const result = await Swal.fire({
    title: 'Hapus Profil Sekolah?',
    text: 'Profil sekolah tidak akan muncul lagi di direktori setelah dihapus.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Ya, Hapus Profil',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      Swal.showLoading();
      const res = await fetch(`/api/schools/${currentSchool.id}`, { method: 'DELETE' });
      const data = await res.json();
      Swal.close();

      if (data.success) {
        localStorage.removeItem(SCHOOL_STORAGE_KEY);
        currentSchool = null;
        showSchoolGateway();
        Swal.fire({ icon: 'success', title: 'Profil Sekolah Telah Dihapus', timer: 1400, showConfirmButton: false });
      }
    } catch (err) {
      Swal.close();
      console.error('Delete school error:', err);
    }
  }
};
