// CMS Logic for Isolated Teacher Dashboard & Registration
// Ensures teachers only see & manage their OWN profile and CV

const STORAGE_KEY = 'masadepan_current_teacher_id';
let currentTeacher = null;
let uploadedCvFileName = '';

document.addEventListener('DOMContentLoaded', () => {
  initCmsEvents();
  checkCurrentSession();
});

function initCmsEvents() {
  // Subject dropdown 'Lainnya' toggle
  const subjectSelect = document.getElementById('cmsSubject');
  const customGroup = document.getElementById('customSubjectGroup');
  if (subjectSelect && customGroup) {
    subjectSelect.addEventListener('change', (e) => {
      if (e.target.value === 'Lainnya') {
        customGroup.classList.remove('hidden');
      } else {
        customGroup.classList.add('hidden');
      }
    });
  }

  // Avatar URL Input Preview
  const avatarInput = document.getElementById('cmsAvatarUrl');
  const avatarPreview = document.getElementById('cmsAvatarPreview');
  if (avatarInput && avatarPreview) {
    avatarInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) avatarPreview.src = url;
    });
  }

  // Avatar File Upload
  const avatarFileInput = document.getElementById('cmsAvatarFileInput');
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async (e) => {
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
          avatarPreview.src = data.url;
          avatarInput.value = data.url;
          Swal.fire({
            icon: 'success',
            title: 'Foto Berhasil Diunggah!',
            text: 'Foto profil Anda siap ditampilkan.',
            timer: 1500,
            showConfirmButton: false
          });
        } else {
          Swal.fire({ icon: 'error', title: 'Gagal Unggah Foto', text: data.message || 'Terjadi kesalahan.' });
        }
      } catch (err) {
        Swal.close();
        console.error('Upload avatar error:', err);
      }
    });
  }

  // CV File Upload
  const cvFileInput = document.getElementById('cmsCvFileInput');
  const cvDisplay = document.getElementById('cmsCvFileNameDisplay');
  if (cvFileInput && cvDisplay) {
    cvFileInput.addEventListener('change', async (e) => {
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
          uploadedCvFileName = data.fileName;
          cvDisplay.innerHTML = `
            <span class="text-emerald-700 font-extrabold flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
              <i class="fa-solid fa-file-circle-check text-emerald-600"></i>
              <span>${data.fileName}</span>
              <a href="${data.url}" target="_blank" class="text-blue-600 underline text-[11px] ml-1">(Buka File)</a>
            </span>
          `;
          Swal.fire({
            icon: 'success',
            title: 'Dokumen CV Berhasil Diunggah!',
            text: `Berkas ${data.fileName} telah terhubung dengan profil Anda.`,
            timer: 1600,
            showConfirmButton: false
          });
        } else {
          Swal.fire({ icon: 'error', title: 'Gagal Unggah CV', text: data.message || 'Terjadi kesalahan.' });
        }
      } catch (err) {
        Swal.close();
        console.error('Upload CV error:', err);
      }
    });
  }

  // Form Submit
  const form = document.getElementById('teacherCmsForm');
  if (form) {
    form.addEventListener('submit', handleTeacherFormSubmit);
  }

  // Enter key on Login input
  const loginInput = document.getElementById('teacherLoginInput');
  if (loginInput) {
    loginInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginTeacherWithCredential();
      }
    });
  }
}

// Check if teacher is already logged in
async function checkCurrentSession() {
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (savedId) {
    try {
      const res = await fetch(`/api/teachers/${savedId}`);
      const data = await res.json();
      if (data.success && data.teacher) {
        showTeacherEditor(data.teacher);
        return;
      }
    } catch (e) {
      console.warn('Session check failed:', e);
    }
  }

  // If no valid session, show gateway view
  showGatewayView();
}

function showGatewayView() {
  currentTeacher = null;
  document.getElementById('cmsGatewayView').classList.remove('hidden');
  document.getElementById('cmsEditorView').classList.add('hidden');
  document.getElementById('authStatusHeader').classList.add('hidden');
  document.getElementById('authStatusHeader').classList.remove('flex');
}

// Start New Registration Flow
window.startRegistrationFlow = function() {
  currentTeacher = null;
  resetFormFields();

  document.getElementById('cmsTeacherProfileName').textContent = 'Pendaftaran Profil Guru Baru';
  document.getElementById('cmsTeacherProfileSubtext').textContent = 'Isi data diri Anda dengan lengkap. Profil akan langsung tayang di katalog pencarian.';
  document.getElementById('cmsCurrentIdBadge').textContent = 'Mode: Pendaftaran Baru';
  document.getElementById('cmsSubmitBtnLabel').textContent = 'Daftar & Publikasikan Profil Guru ke Website';
  document.getElementById('cmsDeleteBtn').classList.add('hidden');

  document.getElementById('cmsGatewayView').classList.add('hidden');
  document.getElementById('cmsEditorView').classList.remove('hidden');
  document.getElementById('authStatusHeader').classList.add('hidden');
  document.getElementById('authStatusHeader').classList.remove('flex');

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Login Existing Teacher
window.loginTeacherWithCredential = async function() {
  const input = document.getElementById('teacherLoginInput');
  const credential = input.value.trim();

  if (!credential) {
    Swal.fire({
      icon: 'warning',
      title: 'Nomor WA / Email Belum Diisi',
      text: 'Silakan masukkan nomor WhatsApp atau email yang Anda gunakan saat mendaftar.',
      confirmButtonColor: '#FF4365'
    });
    return;
  }

  try {
    Swal.showLoading();
    const res = await fetch('/api/teachers/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    const data = await res.json();
    Swal.close();

    if (data.success && data.teacher) {
      localStorage.setItem(STORAGE_KEY, data.teacher.id);
      showTeacherEditor(data.teacher);
      Swal.fire({
        icon: 'success',
        title: `Selamat Datang, ${data.teacher.name.split(' ')[0]}! 👋`,
        text: 'Dashboard profil privat Anda telah dibuka.',
        timer: 1500,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Akun Tidak Ditemukan',
        text: data.message || 'Nomor WhatsApp atau email tidak terdaftar. Silakan lakukan pendaftaran baru.',
        confirmButtonColor: '#FF4365'
      });
    }
  } catch (err) {
    Swal.close();
    console.error('Login error:', err);
    Swal.fire({ icon: 'error', title: 'Kesalahan Jaringan', text: 'Gagal terhubung ke server.' });
  }
};

// Show Isolated Editor for the Logged-In Teacher
function showTeacherEditor(teacher) {
  currentTeacher = teacher;

  document.getElementById('cmsGatewayView').classList.add('hidden');
  document.getElementById('cmsEditorView').classList.remove('hidden');

  // Header status
  const authHeader = document.getElementById('authStatusHeader');
  authHeader.classList.remove('hidden');
  authHeader.classList.add('flex');
  document.getElementById('teacherHeaderBadge').innerHTML = `
    <i class="fa-solid fa-user-check text-emerald-400 mr-1"></i>
    <span>${teacher.name.split(' ')[0]} (${teacher.subject})</span>
  `;

  // Banner
  document.getElementById('cmsActiveAvatarBadge').src = teacher.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
  document.getElementById('cmsTeacherProfileName').textContent = teacher.name;
  document.getElementById('cmsTeacherProfileSubtext').textContent = `Mata Pelajaran: ${teacher.subject} • Tarif: Rp ${teacher.hourlyRate.toLocaleString('id-ID')}/jam`;
  document.getElementById('cmsCurrentIdBadge').textContent = `ID: ${teacher.id}`;
  document.getElementById('cmsSubmitBtnLabel').textContent = `Simpan & Perbarui Profil Saya`;
  document.getElementById('cmsDeleteBtn').classList.remove('hidden');

  // Fill Form fields
  document.getElementById('cmsName').value = teacher.name || '';
  
  const subSelect = document.getElementById('cmsSubject');
  const customInput = document.getElementById('cmsCustomSubject');
  const customGroup = document.getElementById('customSubjectGroup');
  
  const options = Array.from(subSelect.options).map(o => o.value);
  if (options.includes(teacher.subject)) {
    subSelect.value = teacher.subject;
    customGroup.classList.add('hidden');
  } else {
    subSelect.value = 'Lainnya';
    customInput.value = teacher.subject;
    customGroup.classList.remove('hidden');
  }

  document.getElementById('cmsHeadline').value = teacher.headline || '';
  document.getElementById('cmsPhone').value = teacher.phone || '';
  document.getElementById('cmsBio').value = teacher.bio || '';

  document.getElementById('cmsEducation').value = (teacher.cv?.education || []).join('\n');
  document.getElementById('cmsExperience').value = (teacher.cv?.experience || []).join('\n');

  uploadedCvFileName = teacher.cv?.cvFileName || '';
  const cvDisplay = document.getElementById('cmsCvFileNameDisplay');
  if (uploadedCvFileName) {
    cvDisplay.innerHTML = `
      <span class="text-emerald-700 font-extrabold flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
        <i class="fa-solid fa-file-circle-check text-emerald-600"></i>
        <span>${uploadedCvFileName}</span>
      </span>
    `;
  } else {
    cvDisplay.textContent = 'Belum ada file dipilih';
  }

  document.getElementById('cmsAvatarUrl').value = teacher.avatar || '';
  document.getElementById('cmsAvatarPreview').src = teacher.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
  document.getElementById('cmsHourlyRate').value = teacher.hourlyRate || 150000;
  document.getElementById('cmsFirstLessonFree').checked = Boolean(teacher.firstLessonFree);
  document.getElementById('cmsIsNativeSpeaker').checked = Boolean(teacher.isNativeSpeaker);

  const classCheckboxes = document.querySelectorAll('input[name="cmsClassTypes"]');
  classCheckboxes.forEach(cb => {
    cb.checked = (teacher.classTypes || []).includes(cb.value);
  });

  document.getElementById('cmsCity').value = teacher.city || 'Jakarta Selatan';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFormFields() {
  document.getElementById('teacherCmsForm').reset();
  document.getElementById('cmsAvatarPreview').src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
  document.getElementById('cmsCvFileNameDisplay').textContent = 'Belum ada file dipilih';
  uploadedCvFileName = '';
}

// Return to Gateway view
window.returnToGateway = function() {
  showGatewayView();
};

// Logout
window.logoutTeacher = function() {
  localStorage.removeItem(STORAGE_KEY);
  currentTeacher = null;
  showGatewayView();
  Swal.fire({
    icon: 'info',
    title: 'Berhasil Keluar',
    text: 'Sesi akun guru Anda telah ditutup.',
    timer: 1200,
    showConfirmButton: false
  });
};

// Form Submit Handler
async function handleTeacherFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('cmsName').value.trim();
  const subVal = document.getElementById('cmsSubject').value;
  const customSub = document.getElementById('cmsCustomSubject').value.trim();
  const subject = subVal === 'Lainnya' ? (customSub || 'Keahlian Umum') : subVal;

  const headline = document.getElementById('cmsHeadline').value.trim();
  const phone = document.getElementById('cmsPhone').value.trim();
  const bio = document.getElementById('cmsBio').value.trim();

  const education = document.getElementById('cmsEducation').value.split('\n').map(s => s.trim()).filter(Boolean);
  const experience = document.getElementById('cmsExperience').value.split('\n').map(s => s.trim()).filter(Boolean);

  const avatar = document.getElementById('cmsAvatarUrl').value.trim() || document.getElementById('cmsAvatarPreview').src;
  const hourlyRate = parseInt(document.getElementById('cmsHourlyRate').value, 10) || 100000;
  const firstLessonFree = document.getElementById('cmsFirstLessonFree').checked;
  const isNativeSpeaker = document.getElementById('cmsIsNativeSpeaker').checked;

  const classTypes = [];
  document.querySelectorAll('input[name="cmsClassTypes"]:checked').forEach(cb => classTypes.push(cb.value));

  const city = document.getElementById('cmsCity').value;

  const payload = {
    name,
    subject,
    categories: [subject],
    headline,
    phone,
    email: currentTeacher?.email || `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@masadepananak.id`,
    bio,
    methodology: 'Bimbingan personal interaktif disesuaikan dengan kebutuhan anak.',
    levels: ['SD', 'SMP', 'SMA'],
    cv: {
      education: education.length > 0 ? education : ['Pendidikan Terverifikasi'],
      experience: experience.length > 0 ? experience : ['Pengalaman Mengajar Profesional'],
      certifications: ['Sertifikasi Pendidik Resmi'],
      cvFileName: uploadedCvFileName || 'CV_Guru_MasaDepanAnak.pdf'
    },
    avatar,
    hourlyRate,
    firstLessonFree,
    isNativeSpeaker,
    classTypes: classTypes.length > 0 ? classTypes : ['online', 'home'],
    city,
    responseTime: '15 menit',
    responseRate: 100
  };

  const isEdit = currentTeacher && currentTeacher.id;
  const url = isEdit ? `/api/teachers/${currentTeacher.id}` : '/api/teachers';
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

    if (data.success && data.teacher) {
      // Save session
      localStorage.setItem(STORAGE_KEY, data.teacher.id);
      showTeacherEditor(data.teacher);

      Swal.fire({
        icon: 'success',
        title: isEdit ? 'Perubahan Berhasil Disimpan! 🎉' : 'Pendaftaran Sukses & Langsung Tayang! 🚀',
        html: `
          <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
            <p>Profil guru atas nama <b>${name}</b> telah terpasang di sistem.</p>
            <p>• <b>Mata Pelajaran:</b> ${subject}</p>
            <p>• <b>Tarif:</b> Rp ${hourlyRate.toLocaleString('id-ID')}/jam</p>
            <p>• <b>WhatsApp:</b> ${phone}</p>
            <p class="text-emerald-600 font-bold">Data Anda tersimpan secara privat dan dapat Anda kelola kapan saja.</p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: '👁️ Buka & Cek di Halaman Utama',
        cancelButtonText: 'Tetap di Dashboard Saya',
        confirmButtonColor: '#FF4365',
        cancelButtonColor: '#475569'
      }).then((result) => {
        if (result.isConfirmed) {
          window.open('index.html', '_blank');
        }
      });
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: data.message || 'Terjadi kesalahan saat menyimpan.' });
    }
  } catch (err) {
    Swal.close();
    console.error('Save teacher error:', err);
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: 'Gagal menghubungi server.' });
  }
}

// Delete Profile
window.deleteCurrentTeacher = async function() {
  if (!currentTeacher || !currentTeacher.id) return;

  const result = await Swal.fire({
    title: 'Hapus Profil Guru Anda?',
    text: 'Setelah dihapus, profil Anda tidak akan muncul lagi di website pencarian.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Ya, Hapus Profil',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      Swal.showLoading();
      const res = await fetch(`/api/teachers/${currentTeacher.id}`, { method: 'DELETE' });
      const data = await res.json();
      Swal.close();

      if (data.success) {
        localStorage.removeItem(STORAGE_KEY);
        currentTeacher = null;
        showGatewayView();
        Swal.fire({ icon: 'success', title: 'Profil Telah Dihapus', timer: 1400, showConfirmButton: false });
      }
    } catch (err) {
      Swal.close();
      console.error('Delete error:', err);
    }
  }
};
