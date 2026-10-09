// Frontend Application Logic - Superprof Exact Layout & WhatsApp Pipeline (08988972433)

const ADMIN_WHATSAPP = '628988972433';

// State
let allTeachers = [];
let categoriesList = [];

let currentFilter = {
  subject: 'Semua',
  classType: 'all',
  maxRate: 500000,
  maxDistance: 25,
  isNativeSpeaker: false,
  firstLessonFree: false,
  city: 'Semua Kota',
  search: '',
  sort: 'recommended'
};

const SUBJECT_ICONS = {
  'Matematika': '📐',
  'Bahasa Inggris': '🇬🇧',
  'Mengaji': '📖',
  'Bahasa Mandarin': '🇨🇳',
  'Fisika': '⚛️',
  'Piano': '🎹',
  'Bahasa Jepang': '🇯🇵',
  'Menyanyi': '🎤',
  'Bahasa Arab': '🇸🇦',
  'Kimia': '🧪',
  'Bahasa Jerman': '🇩🇪',
  'Menggambar': '🎨',
  'Akuntansi': '📊',
  'Personal Trainer': '🏋️',
  'Public Speaker': '🎙️',
  'Gitar': '🎸',
  'Bahasa Indonesia': '🇮🇩',
  'Biologi': '🧬'
};

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadCategories();
  loadTeachers();
  loadSchools();
  loadBlogPreview();
});

function initEventListeners() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  // Hero Search Form
  const heroSearchForm = document.getElementById('heroSearchForm');
  if (heroSearchForm) {
    heroSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = document.getElementById('heroSubjectSelect').value;
      const city = document.getElementById('heroCitySelect').value;
      
      currentFilter.subject = subject;
      currentFilter.city = city;
      updateActiveCategoryPill(subject);
      updateHeroSubjectHighlight(subject);
      applyFilters();

      const el = document.getElementById('marketplace-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Hero Subject Select Change
  const heroSubjectSelect = document.getElementById('heroSubjectSelect');
  if (heroSubjectSelect) {
    heroSubjectSelect.addEventListener('change', (e) => {
      updateHeroSubjectHighlight(e.target.value);
    });
  }

  // WhatsApp Form Submit
  const waBookingForm = document.getElementById('waBookingForm');
  if (waBookingForm) {
    waBookingForm.addEventListener('submit', handleWaFormSubmit);
  }
}

function updateHeroSubjectHighlight(subject) {
  const el = document.getElementById('heroSubjectHighlight');
  if (el) {
    el.textContent = (subject === 'Semua' || !subject) ? 'Terbaik' : subject;
  }
}

// ---------------------- CATEGORIES ---------------------- //

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.success) {
      categoriesList = data.categories;
      renderCategoryPills(categoriesList);
      populateHeroSubjectDropdown(categoriesList);
    }
  } catch (err) {
    console.error('Gagal memuat kategori:', err);
  }
}

function renderCategoryPills(categories) {
  const container = document.getElementById('categoryPillsContainer');
  if (!container) return;

  let html = `
    <button onclick="quickFilterSubject('Semua')" class="category-tab ${currentFilter.subject === 'Semua' ? 'active' : ''} flex items-center gap-1.5 cursor-pointer">
      <span>🌟</span>
      <span>Semua Kategori</span>
    </button>
  `;

  categories.forEach(cat => {
    const icon = SUBJECT_ICONS[cat.name] || '📚';
    const isActive = currentFilter.subject.toLowerCase() === cat.name.toLowerCase();
    html += `
      <button onclick="quickFilterSubject('${cat.name}')" class="category-tab ${isActive ? 'active' : ''} flex items-center gap-1.5 cursor-pointer">
        <span>${icon}</span>
        <span>${cat.name}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'} font-extrabold">${cat.count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function populateHeroSubjectDropdown(categories) {
  const select = document.getElementById('heroSubjectSelect');
  if (!select) return;

  let html = `<option value="Semua">Semua Mata Pelajaran</option>`;
  categories.forEach(cat => {
    const icon = SUBJECT_ICONS[cat.name] || '📚';
    html += `<option value="${cat.name}">${icon} ${cat.name} (${cat.count} Guru)</option>`;
  });
  select.innerHTML = html;
}

window.quickFilterSubject = function(subjectName) {
  currentFilter.subject = subjectName;
  updateActiveCategoryPill(subjectName);
  updateHeroSubjectHighlight(subjectName);
  
  const heroSelect = document.getElementById('heroSubjectSelect');
  if (heroSelect) heroSelect.value = subjectName;

  applyFilters();
  const el = document.getElementById('marketplace-section');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

function updateActiveCategoryPill(subjectName) {
  const pills = document.querySelectorAll('.category-tab');
  pills.forEach(pill => {
    if (subjectName === 'Semua') {
      if (pill.textContent.includes('Semua Kategori')) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    } else {
      if (pill.textContent.includes(subjectName)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    }
  });

  const badge = document.getElementById('activeSubjectBadge');
  if (badge) {
    if (subjectName !== 'Semua') {
      badge.textContent = subjectName;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// ---------------------- FILTERS ---------------------- //

window.toggleNativeSpeakerFilter = function() {
  currentFilter.isNativeSpeaker = !currentFilter.isNativeSpeaker;
  const btn = document.getElementById('btnNativeSpeaker');
  if (btn) {
    if (currentFilter.isNativeSpeaker) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
  applyFilters();
};

window.toggleFreeLessonFilter = function() {
  currentFilter.firstLessonFree = !currentFilter.firstLessonFree;
  const btn = document.getElementById('btnFreeLesson');
  if (btn) {
    if (currentFilter.firstLessonFree) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
  applyFilters();
};

window.resetFilters = function() {
  currentFilter = {
    subject: 'Semua',
    classType: 'all',
    maxRate: 500000,
    maxDistance: 25,
    isNativeSpeaker: false,
    firstLessonFree: false,
    city: 'Semua Kota',
    search: '',
    sort: 'recommended'
  };

  const heroSelect = document.getElementById('heroSubjectSelect');
  if (heroSelect) heroSelect.value = 'Semua';
  const heroCity = document.getElementById('heroCitySelect');
  if (heroCity) heroCity.value = 'Semua Kota';

  const filterClassType = document.getElementById('filterClassType');
  if (filterClassType) filterClassType.value = 'all';
  const filterRate = document.getElementById('filterRate');
  if (filterRate) filterRate.value = '500000';
  const filterDistance = document.getElementById('filterDistance');
  if (filterDistance) filterDistance.value = '25';
  const sortBySelect = document.getElementById('sortBySelect');
  if (sortBySelect) sortBySelect.value = 'recommended';

  const btnNative = document.getElementById('btnNativeSpeaker');
  if (btnNative) btnNative.classList.remove('active');
  const btnFree = document.getElementById('btnFreeLesson');
  if (btnFree) btnFree.classList.remove('active');

  updateActiveCategoryPill('Semua');
  updateHeroSubjectHighlight('Semua');
  applyFilters();
};

// ---------------------- TEACHERS DIRECTORY ---------------------- //

async function loadTeachers() {
  await applyFilters();
}

async function applyFilters() {
  const container = document.getElementById('teachersGrid');
  const emptyState = document.getElementById('emptyState');
  const countEl = document.getElementById('totalTeachersCount');

  // Read from filter elements if present
  const filterClassType = document.getElementById('filterClassType');
  if (filterClassType) currentFilter.classType = filterClassType.value;
  const filterRate = document.getElementById('filterRate');
  if (filterRate) currentFilter.maxRate = parseInt(filterRate.value, 10);
  const filterDistance = document.getElementById('filterDistance');
  if (filterDistance) currentFilter.maxDistance = parseInt(filterDistance.value, 10);
  const sortBySelect = document.getElementById('sortBySelect');
  if (sortBySelect) currentFilter.sort = sortBySelect.value;

  const params = new URLSearchParams();
  if (currentFilter.subject && currentFilter.subject !== 'Semua') {
    params.append('subject', currentFilter.subject);
  }
  if (currentFilter.classType && currentFilter.classType !== 'all') {
    params.append('classType', currentFilter.classType);
  }
  if (currentFilter.maxRate && currentFilter.maxRate < 500000) {
    params.append('maxRate', currentFilter.maxRate);
  }
  if (currentFilter.maxDistance && currentFilter.maxDistance < 25) {
    params.append('maxDistance', currentFilter.maxDistance);
  }
  if (currentFilter.isNativeSpeaker) {
    params.append('isNativeSpeaker', 'true');
  }
  if (currentFilter.firstLessonFree) {
    params.append('firstLessonFree', 'true');
  }
  if (currentFilter.city && currentFilter.city !== 'Semua Kota') {
    params.append('city', currentFilter.city);
  }
  if (currentFilter.sort) {
    params.append('sort', currentFilter.sort);
  }

  try {
    const res = await fetch(`/api/teachers?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      allTeachers = data.teachers;
      if (countEl) countEl.textContent = data.total;

      if (data.teachers.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
        renderTeacherCards(data.teachers);
      }
    }
  } catch (err) {
    console.error('Error fetching teachers:', err);
  }
}

// Render Exact Superprof Teacher Cards
function renderTeacherCards(teachers) {
  const container = document.getElementById('teachersGrid');
  if (!container) return;

  container.innerHTML = teachers.map(t => {
    const nativeBadge = t.isNativeSpeaker ? `
      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
        <i class="fa-solid fa-earth-americas text-xs"></i> Penutur Asli
      </span>
    ` : '';

    const superTutorBadge = (t.isSuperTutor || t.rating >= 4.9) ? `
      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-300">
        <i class="fa-solid fa-bolt text-amber-500"></i> Super Tutor
      </span>
    ` : '';

    const freeLessonBadge = t.firstLessonFree ? `
      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-spPink-light text-spPink border border-spPink/30">
        <i class="fa-solid fa-gift"></i> 1 Jam Pertama Gratis
      </span>
    ` : '';

    const classTypeBadges = (t.classTypes || []).map(type => {
      if (type === 'home') return '<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold"><i class="fa-solid fa-house text-slate-500 mr-1"></i>Ke Rumah</span>';
      if (type === 'online') return '<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold"><i class="fa-solid fa-video text-emerald-600 mr-1"></i>Online</span>';
      if (type === 'studio') return '<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold"><i class="fa-solid fa-school text-spPink mr-1"></i>Di Tempat Guru</span>';
      return '';
    }).join(' ');

    const formattedRate = 'Rp ' + (t.hourlyRate || 0).toLocaleString('id-ID');
    const subjectIcon = SUBJECT_ICONS[t.subject] || '📚';

    return `
      <div class="superprof-card p-5 sm:p-6 flex flex-col md:flex-row gap-5 items-start relative group">
        
        <!-- Left: Photo with Superprof frame -->
        <div class="w-full md:w-36 flex flex-row md:flex-col items-center gap-3 text-center shrink-0">
          <div class="relative">
            <img src="${t.avatar}" alt="${t.name}" class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-slate-100 shadow-xs group-hover:scale-102 transition-transform" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'">
            <div class="absolute -bottom-2 -right-1 bg-white px-2 py-0.5 rounded-full text-[11px] font-black text-slate-900 border border-slate-200 shadow-xs flex items-center gap-1">
              <i class="fa-solid fa-star text-amber-400"></i> ${t.rating ? t.rating.toFixed(1) : '5.0'}
            </div>
          </div>

          <div class="text-left md:text-center flex-1 md:flex-none">
            <span class="text-[11px] font-bold text-slate-500 block">(${t.reviewCount || 12} ulasan)</span>
            <div class="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              <i class="fa-solid fa-location-dot text-rose-500"></i>
              <span>${t.city || 'Jakarta'} • ${t.distanceKm || 3} km</span>
            </div>
          </div>
        </div>

        <!-- Middle: Bio, Subject & Details (Superprof Format) -->
        <div class="flex-1 space-y-2 w-full text-left">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-900 text-white">
              <span>${subjectIcon}</span>
              <span>${t.subject}</span>
            </span>
            ${superTutorBadge}
            ${nativeBadge}
            ${freeLessonBadge}
          </div>

          <div>
            <h3 class="text-lg font-black text-slate-900 flex items-center gap-1.5 group-hover:text-spPink transition-colors">
              <span>${t.name}</span>
              <i class="fa-solid fa-circle-check text-spPink text-xs" title="Guru Terverifikasi"></i>
            </h3>
            <p class="text-xs font-bold text-slate-700 mt-0.5 line-clamp-2">
              ${t.headline}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
              ⚡ Respon ${t.responseTime} (${t.responseRate}%)
            </span>
            <div class="flex items-center gap-1">
              ${classTypeBadges}
            </div>
          </div>

          <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">
            ${t.bio}
          </p>
        </div>

        <!-- Right: Pricing & Pink Superprof Action Button -->
        <div class="w-full md:w-48 flex flex-col justify-between items-start md:items-end border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 shrink-0 space-y-3">
          <div class="text-left md:text-right w-full">
            <span class="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Tarif</span>
            <div class="text-xl font-black text-slate-900">
              ${formattedRate}
              <span class="text-xs font-normal text-slate-500">/ jam</span>
            </div>
            ${t.firstLessonFree ? '<p class="text-[10px] font-extrabold text-spPink mt-0.5">🎉 1 Jam Pertama Gratis</p>' : ''}
          </div>

          <div class="w-full space-y-2">
            <!-- Magenta/Pink Superprof Button -->
            <button onclick="openWaBookingModal('${t.id}')" class="btn-superprof w-full py-2.5 px-3 text-xs flex items-center justify-center gap-1.5">
              <i class="fa-brands fa-whatsapp text-sm"></i>
              <span>Pesan via WhatsApp</span>
            </button>
            <button onclick="viewTeacherDetail('${t.id}')" class="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5">
              <i class="fa-regular fa-id-card"></i>
              <span>Lihat CV & Profil</span>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

// ---------------------- WHATSAPP ORDER MODAL (08988972433) ---------------------- //

window.openWaBookingModal = async function(teacherId) {
  try {
    const res = await fetch(`/api/teachers/${teacherId}`);
    const data = await res.json();
    if (!data.success) return;

    const t = data.teacher;
    document.getElementById('waTeacherId').value = t.id;
    document.getElementById('waTeacherNameVal').value = t.name;
    document.getElementById('waSubjectVal').value = t.subject;
    document.getElementById('waRateVal').value = 'Rp ' + (t.hourlyRate || 0).toLocaleString('id-ID');

    document.getElementById('waTutorAvatar').src = t.avatar;
    document.getElementById('waTutorName').textContent = `${t.name} (${t.subject})`;
    document.getElementById('waTutorPrice').textContent = `Tarif: Rp ${(t.hourlyRate || 0).toLocaleString('id-ID')} / jam ${t.firstLessonFree ? '• 1 Jam Pertama Gratis' : ''}`;

    const modal = document.getElementById('waOrderModal');
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    console.error('Error opening WA modal:', err);
  }
};

window.closeWaOrderModal = function() {
  const modal = document.getElementById('waOrderModal');
  if (modal) modal.classList.add('hidden');
};

async function handleWaFormSubmit(e) {
  e.preventDefault();

  const teacherId = document.getElementById('waTeacherId').value;
  const teacherName = document.getElementById('waTeacherNameVal').value;
  const subject = document.getElementById('waSubjectVal').value;
  const rate = document.getElementById('waRateVal').value;

  const parentName = document.getElementById('waParentName').value.trim();
  const studentName = document.getElementById('waStudentName').value.trim();
  const classType = document.getElementById('waClassType').value;
  const schedule = document.getElementById('waSchedule').value.trim() || 'Fleksibel';
  const notes = document.getElementById('waNotes').value.trim() || 'Persiapan belajar dan ujian';

  const waText = `Halo Admin MasaDepanAnak, saya ingin memesan guru les privat:%0A%0A` +
    `📌 *GURU PILIHAN:* ${encodeURIComponent(teacherName)} (${encodeURIComponent(subject)})%0A` +
    `💵 *TARIF:* ${encodeURIComponent(rate)} / jam%0A` +
    `👤 *NAMA PEMESAN / ORANG TUA:* ${encodeURIComponent(parentName)}%0A` +
    `👶 *NAMA & KELAS ANAK:* ${encodeURIComponent(studentName)}%0A` +
    `🏠 *MODE KELAS:* ${encodeURIComponent(classType)}%0A` +
    `📅 *JADWAL YANG DIINGINKAN:* ${encodeURIComponent(schedule)}%0A` +
    `📝 *CATATAN / TARGET:* ${encodeURIComponent(notes)}%0A%0A` +
    `Mohon info ketersediaan jadwal guru tersebut. Terima kasih!`;

  try {
    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId,
        parentName,
        studentName,
        phone: ADMIN_WHATSAPP,
        classType: classType.includes('Online') ? 'online' : 'home',
        requestedDate: schedule,
        notes: `[Via WA 08988972433] ${notes}`
      })
    });
  } catch (e) {}

  closeWaOrderModal();

  const waUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${waText}`;
  window.open(waUrl, '_blank');
}

// ---------------------- TEACHER DETAIL & CV MODAL ---------------------- //

window.viewTeacherDetail = async function(teacherId) {
  try {
    const res = await fetch(`/api/teachers/${teacherId}`);
    const data = await res.json();
    if (!data.success) return;

    const t = data.teacher;
    const modalBody = document.getElementById('teacherModalBody');
    const modal = document.getElementById('teacherDetailModal');
    if (!modalBody || !modal) return;

    const formattedRate = 'Rp ' + (t.hourlyRate || 0).toLocaleString('id-ID');
    const subjectIcon = SUBJECT_ICONS[t.subject] || '📚';

    const educationList = (t.cv?.education || []).map(item => `
      <li class="flex items-start gap-2 text-xs text-slate-700 font-medium">
        <i class="fa-solid fa-graduation-cap text-spPink mt-0.5"></i>
        <span>${item}</span>
      </li>
    `).join('') || '<li class="text-xs text-slate-400">Pendidikan terverifikasi.</li>';

    const experienceList = (t.cv?.experience || []).map(item => `
      <li class="flex items-start gap-2 text-xs text-slate-700 font-medium">
        <i class="fa-solid fa-briefcase text-slate-700 mt-0.5"></i>
        <span>${item}</span>
      </li>
    `).join('') || '<li class="text-xs text-slate-400">Pengalaman mengajar terverifikasi.</li>';

    const cvFileName = t.cv?.cvFileName || 'Dokumen_CV_Terverifikasi.pdf';

    modalBody.innerHTML = `
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-5 border-b border-slate-200">
        <img src="${t.avatar}" class="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200 shadow-2xs">
        <div class="flex-1">
          <div class="flex flex-wrap items-center gap-1.5 mb-1">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-900 text-white">
              ${subjectIcon} ${t.subject}
            </span>
            ${t.isNativeSpeaker ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-900">Penutur Asli</span>' : ''}
            ${t.firstLessonFree ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-spPink-light text-spPink">1 Jam Gratis</span>' : ''}
          </div>
          <h2 class="text-xl font-black text-slate-900">${t.name}</h2>
          <p class="text-xs font-bold text-slate-600 mt-0.5">${t.headline}</p>
          <div class="flex items-center gap-3 text-xs text-slate-500 mt-1.5 font-semibold">
            <span><i class="fa-solid fa-star text-amber-500"></i> ${t.rating} (${t.reviewCount} ulasan)</span>
            <span><i class="fa-solid fa-location-dot text-rose-500"></i> ${t.city}</span>
          </div>
        </div>
        <div class="text-left sm:text-right shrink-0 bg-slate-100 p-3.5 rounded-2xl border border-slate-200">
          <span class="text-[10px] text-slate-500 font-black uppercase block">Tarif Les</span>
          <span class="text-xl font-black text-slate-900">${formattedRate}</span>
          <span class="text-xs text-slate-500">/ jam</span>
        </div>
      </div>

      <div class="space-y-5 py-5">
        <div>
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-user text-spPink"></i> Tentang Guru & Pendekatan Belajar
          </h4>
          <p class="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-line">${t.bio}</p>
        </div>

        <div>
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-lightbulb text-spPink"></i> Metodologi & Silabus Pengajaran
          </h4>
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line">
            ${t.methodology || 'Pendekatan personal sesuai kurikulum sekolah anak.'}
          </div>
        </div>

        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <i class="fa-solid fa-file-pdf text-rose-500"></i> Riwayat CV & Sertifikasi Guru
            </h4>
            <span class="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              CV Terlampir
            </span>
          </div>
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Pendidikan:</p>
            <ul class="space-y-1 pl-1">${educationList}</ul>
          </div>
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Pengalaman Mengajar:</p>
            <ul class="space-y-1 pl-1">${experienceList}</ul>
          </div>
          <div class="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold">
            <span><i class="fa-solid fa-paperclip mr-1 text-slate-500"></i> File: ${cvFileName}</span>
            <span class="text-emerald-700">✅ Terverifikasi Admin</span>
          </div>
        </div>

        <!-- Action CTAs -->
        <div class="pt-2 flex flex-col sm:flex-row gap-3">
          <button onclick="closeTeacherModal(); openWaBookingModal('${t.id}')" class="btn-superprof flex-1 py-3 px-4 text-xs flex items-center justify-center gap-2">
            <i class="fa-brands fa-whatsapp text-base"></i>
            <span>Pesan Guru Ini via WhatsApp (08988972433)</span>
          </button>
          <button onclick="closeTeacherModal()" class="px-5 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors">
            Tutup
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (err) {
    console.error('Error opening detail:', err);
  }
};

window.closeTeacherModal = function() {
  const modal = document.getElementById('teacherDetailModal');
  if (modal) modal.classList.add('hidden');
};

// ---------------------- SCHOOL DIRECTORY ---------------------- //

async function loadSchools() {
  const grid = document.getElementById('schoolsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/schools?sort=rating');
    const data = await res.json();

    if (data.success) {
      if (data.schools.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full py-14 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
            <i class="fa-solid fa-building-columns text-3xl mb-3 opacity-30"></i>
            <p class="font-black text-slate-700 text-sm">Belum ada sekolah terdaftar.</p>
            <p class="text-xs mt-1">Jadilah yang pertama mendaftarkan lembaga Anda.</p>
            <a href="cms-sekolah.html" class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl">
              <i class="fa-solid fa-plus"></i>
              Daftarkan Sekolah
            </a>
          </div>
        `;
        return;
      }
      renderSchoolCards(data.schools);
    }
  } catch (err) {
    console.error('Failed to load schools:', err);
    if (grid) grid.innerHTML = `
      <div class="col-span-full py-10 text-center text-slate-400">
        <p class="text-xs">Gagal memuat direktori. Server belum berjalan?</p>
      </div>
    `;
  }
}

function renderSchoolCards(schools) {
  const grid = document.getElementById('schoolsGrid');
  if (!grid) return;

  grid.innerHTML = schools.slice(0, 6).map(s => {
    const formattedSPP = 'Rp ' + (s.tuitionMonthly || 0).toLocaleString('id-ID');
    const rating = s.rating ? s.rating.toFixed(1) : '5.0';

    return `
      <div class="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer"
           onclick="viewSchoolDetail('${s.id}')">
        
        <!-- School Image -->
        <div class="relative h-40 overflow-hidden bg-slate-100">
          <img src="${s.image || 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80'}"
               alt="${s.name}"
               class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
               onerror="this.src='https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80'">
          <div class="absolute top-3 left-3">
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-sm text-[11px] font-black text-slate-900 shadow-xs">
              ${s.type || 'Sekolah'}
            </span>
          </div>
          <div class="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg shadow-xs">
            <i class="fa-solid fa-star text-amber-400 text-xs"></i>
            <span class="text-[11px] font-black text-slate-900">${rating}</span>
          </div>
        </div>

        <!-- Card Body -->
        <div class="p-4 space-y-2.5">
          <div>
            <h3 class="text-sm font-black text-slate-900 line-clamp-1 group-hover:text-blue-700 transition-colors">${s.name}</h3>
            <p class="text-[11px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
              <i class="fa-solid fa-location-dot text-rose-500"></i>
              ${s.city || 'Jakarta'} · ${s.akreditasi || 'Akreditasi A'}
            </p>
          </div>

          <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">
            ${s.description || 'Lembaga pendidikan berkualitas tinggi.'}
          </p>

          <!-- Facilities Pills -->
          <div class="flex flex-wrap gap-1">
            ${(s.facilities || []).slice(0, 2).map(f => `
              <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">${f}</span>
            `).join('')}
            ${(s.facilities || []).length > 2 ? `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px]">+${s.facilities.length - 2}</span>` : ''}
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-slate-100">
            <div>
              <span class="text-[10px] font-bold text-slate-400 block uppercase">SPP Bulanan</span>
              <span class="text-sm font-black text-slate-900">${formattedSPP}</span>
            </div>
            <a href="https://wa.me/${(s.phone || '628988972433').replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=Halo%2C%20saya%20ingin%20tanya%20informasi%20PPDB%20${encodeURIComponent(s.name)}"
               target="_blank"
               onclick="event.stopPropagation()"
               class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors">
              <i class="fa-brands fa-whatsapp"></i>
              <span>PPDB</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.viewSchoolDetail = async function(schoolId) {
  try {
    const res = await fetch(`/api/schools/${schoolId}`);
    const data = await res.json();
    if (!data.success) return;

    const s = data.school;
    const formattedSPP = 'Rp ' + (s.tuitionMonthly || 0).toLocaleString('id-ID');
    const formattedEntry = s.entryFee > 0 ? 'Rp ' + (s.entryFee).toLocaleString('id-ID') : 'Hubungi Sekolah';
    const waPhone = (s.phone || '628988972433').replace(/[^0-9]/g, '').replace(/^0/, '62');

    const modalBody = document.getElementById('schoolModalBody');
    const modal = document.getElementById('schoolDetailModal');
    if (!modalBody || !modal) return;

    modalBody.innerHTML = `
      <div class="space-y-5">
        <!-- School Header -->
        <div class="flex flex-col sm:flex-row items-start gap-4 pb-5 border-b border-slate-100">
          <img src="${s.image || 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=600&q=80'}"
               alt="${s.name}"
               class="w-full sm:w-36 h-28 rounded-2xl object-cover border border-slate-200 shadow-xs shrink-0">
          <div class="flex-1">
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span class="px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-100 text-blue-900">${s.type}</span>
              <span class="px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-50 text-amber-900 border border-amber-200">
                <i class="fa-solid fa-star text-amber-500 mr-1"></i>${s.rating || 5.0} (${s.reviewCount || 1} ulasan)
              </span>
              ${s.akreditasi ? `<span class="px-2.5 py-0.5 rounded-lg text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-200">${s.akreditasi}</span>` : ''}
            </div>
            <h2 class="text-xl font-black text-slate-900">${s.name}</h2>
            <p class="text-xs text-slate-500 font-semibold mt-0.5">
              <i class="fa-solid fa-location-dot text-rose-500 mr-1"></i>${s.city}${s.address ? ` · ${s.address}` : ''}
            </p>
            <p class="text-xs text-slate-600 mt-1">
              <i class="fa-solid fa-book mr-1 text-blue-600"></i>${s.curriculum || 'Kurikulum Merdeka'}
            </p>
          </div>
        </div>

        <!-- Biaya -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
            <span class="text-[10px] font-black uppercase text-slate-400 block mb-1">SPP Bulanan</span>
            <span class="text-lg font-black text-slate-900">${formattedSPP}</span>
          </div>
          <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
            <span class="text-[10px] font-black uppercase text-slate-400 block mb-1">Uang Masuk / Pangkal</span>
            <span class="text-lg font-black text-slate-900">${formattedEntry}</span>
          </div>
        </div>

        <!-- Deskripsi -->
        <div>
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 mb-1.5 flex items-center gap-1.5">
            <i class="fa-solid fa-info-circle text-blue-600"></i> Profil & Visi Misi
          </h4>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">${s.description || ''}</p>
        </div>

        <!-- Fasilitas -->
        ${s.facilities && s.facilities.length > 0 ? `
        <div>
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 mb-2 flex items-center gap-1.5">
            <i class="fa-solid fa-building text-blue-600"></i> Fasilitas Unggulan
          </h4>
          <div class="flex flex-wrap gap-2">
            ${s.facilities.map(f => `<span class="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 text-xs font-bold border border-blue-100">${f}</span>`).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Program -->
        ${s.programs && s.programs.length > 0 ? `
        <div>
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-900 mb-2 flex items-center gap-1.5">
            <i class="fa-solid fa-star text-amber-500"></i> Program Unggulan
          </h4>
          <ul class="space-y-1">
            ${s.programs.map(p => `
              <li class="flex items-center gap-2 text-xs text-slate-700 font-medium">
                <i class="fa-solid fa-check-circle text-emerald-500"></i>
                <span>${p}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        ` : ''}

        <!-- CTA Buttons -->
        <div class="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <a href="https://wa.me/${waPhone}?text=Halo%2C%20saya%20tertarik%20mendaftarkan%20anak%20ke%20${encodeURIComponent(s.name)}.%20Bisa%20info%20PPDB%20dan%20jadwal%20kunjungan?"
             target="_blank"
             class="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2">
            <i class="fa-brands fa-whatsapp text-base"></i>
            <span>Tanya PPDB via WhatsApp</span>
          </a>
          ${s.brochureUrl ? `
          <a href="${s.brochureUrl}" target="_blank"
             class="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors">
            <i class="fa-solid fa-file-pdf text-rose-500"></i>
            <span>Unduh Brosur PPDB</span>
          </a>
          ` : ''}
          <button onclick="closeSchoolModal()" class="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors">
            Tutup
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (err) {
    console.error('Error viewing school detail:', err);
  }
};

window.closeSchoolModal = function() {
  const modal = document.getElementById('schoolDetailModal');
  if (modal) modal.classList.add('hidden');
};

// ---------------------- BLOG PREVIEW (Homepage) ---------------------- //

async function loadBlogPreview() {
  const grid = document.getElementById('blogPreviewGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/blogs?limit=3');
    const data = await res.json();

    if (data.success && data.blogs.length > 0) {
      grid.innerHTML = data.blogs.map(blog => {
        const dateStr = blog.publishedAt ? new Date(blog.publishedAt).toLocaleDateString('id-ID', {
          day: 'numeric', month: 'short', year: 'numeric'
        }) : '';

        return `
          <a href="blog.html?artikel=${blog.slug || blog.id}"
             class="group bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200">
            <div class="h-36 overflow-hidden bg-slate-100">
              <img src="${blog.coverImage || 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'}"
                   alt="${blog.title}"
                   class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                   onerror="this.src='https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'">
            </div>
            <div class="p-4 space-y-2">
              <span class="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">${blog.category || 'Artikel'}</span>
              <h3 class="text-xs font-black text-slate-900 line-clamp-2 group-hover:text-emerald-700 transition-colors">${blog.title}</h3>
              <p class="text-[11px] text-slate-500">${dateStr} · ${blog.readingTime || '3 menit'}</p>
            </div>
          </a>
        `;
      }).join('');
    } else {
      grid.innerHTML = `
        <div class="col-span-full py-8 text-center text-slate-400">
          <p class="text-xs">Belum ada artikel. <a href="cms-blog.html" class="text-emerald-600 font-bold hover:underline">Tulis artikel pertama →</a></p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Failed to load blog preview:', err);
  }
}
