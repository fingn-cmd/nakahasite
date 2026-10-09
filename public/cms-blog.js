// CMS Blog & Press Release - SEO-First Article Manager
// Manages article list + editor with Google rich snippet, sitelinks & meta tags

let allBlogsAdmin = [];
let currentArticle = null;
let sitelinkRowCount = 0;

document.addEventListener('DOMContentLoaded', () => {
  initBlogCmsEvents();
  loadAdminBlogList();
  createNewArticle(); // Start with empty form
});

function initBlogCmsEvents() {
  // Form submit
  const form = document.getElementById('blogCmsForm');
  if (form) form.addEventListener('submit', handleBlogFormSubmit);

  // Live SEO preview
  const titleInput = document.getElementById('blogTitle');
  const metaTitleInput = document.getElementById('blogMetaTitle');
  const metaDescInput = document.getElementById('blogMetaDescription');
  const slugInput = document.getElementById('blogSlug');

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      // Auto-generate slug from title
      const slug = titleInput.value.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      if (slugInput) slugInput.value = slug;

      // Auto-fill meta title if empty
      if (metaTitleInput && !metaTitleInput.value) {
        metaTitleInput.value = `${titleInput.value} | MasaDepanAnak`;
        updateSeoPreview();
      }
      updateSeoPreview();
    });
  }

  if (metaTitleInput) {
    metaTitleInput.addEventListener('input', () => {
      const count = document.getElementById('metaTitleCount');
      if (count) count.textContent = `${metaTitleInput.value.length}/60 karakter`;
      updateSeoPreview();
    });
  }

  if (metaDescInput) {
    metaDescInput.addEventListener('input', () => {
      const count = document.getElementById('metaDescCount');
      if (count) count.textContent = `${metaDescInput.value.length}/160 karakter`;
      updateSeoPreview();
    });
  }

  if (slugInput) {
    slugInput.addEventListener('input', updateSeoPreview);
  }

  // Blog image file upload
  const imgFileInput = document.getElementById('blogImageFileInput');
  if (imgFileInput) {
    imgFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          const urlInput = document.getElementById('blogCoverImage');
          if (urlInput) urlInput.value = data.url;
          Swal.fire({ icon: 'success', title: 'Gambar Diunggah!', timer: 1200, showConfirmButton: false });
        }
      } catch (e) { console.error(e); }
    });
  }

  // Add default 2 sitelinks on init
  addSitelinkRow('Guru Privat Terbaik', '/#marketplace-section', 'Temukan guru les privat terverifikasi di MasaDepanAnak.');
  addSitelinkRow('Direktori Sekolah', '/#sekolah-section', 'Info preschool, SD, SMP, SMA, dan bimbel terlengkap.');
}

function updateSeoPreview() {
  const title = document.getElementById('blogMetaTitle')?.value ||
                document.getElementById('blogTitle')?.value || '';
  const desc = document.getElementById('blogMetaDescription')?.value ||
               document.getElementById('blogExcerpt')?.value || '';
  const slug = document.getElementById('blogSlug')?.value || 'slug-artikel';

  const previewTitle = document.getElementById('googlePreviewTitle');
  const previewUrl = document.getElementById('googlePreviewUrl');
  const previewDesc = document.getElementById('googlePreviewDesc');

  if (previewTitle) previewTitle.textContent = title || 'Judul Artikel | MasaDepanAnak';
  if (previewUrl) previewUrl.textContent = `https://masadepananak.id › blog › ${slug}`;
  if (previewDesc) previewDesc.textContent = desc || 'Meta deskripsi artikel akan tampil di sini...';
}

// -------- BLOG LIST (ADMIN PANEL) --------

async function loadAdminBlogList() {
  try {
    const res = await fetch('/api/blogs');
    const data = await res.json();
    if (data.success) {
      allBlogsAdmin = data.blogs;
      renderAdminBlogList(data.blogs);

      const badge = document.getElementById('blogTotalBadge');
      if (badge) badge.textContent = `${data.total} Artikel`;
    }
  } catch (err) {
    console.error('Failed to load blog list:', err);
  }
}

function renderAdminBlogList(blogs) {
  const container = document.getElementById('blogListContainer');
  if (!container) return;

  if (blogs.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center text-slate-400">
        <i class="fa-solid fa-newspaper text-2xl mb-2 opacity-30"></i>
        <p class="text-xs font-bold">Belum ada artikel.</p>
        <p class="text-[11px] mt-1">Tulis artikel pertama Anda di form sebelah kanan.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = blogs.map(blog => {
    const dateStr = blog.publishedAt ? new Date(blog.publishedAt).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) : '—';
    const isActive = currentArticle && (currentArticle.id === blog.id || currentArticle.slug === blog.slug);

    return `
      <div onclick="editArticle('${blog.id}')"
           class="p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200'} group">
        <div class="flex items-start gap-2.5">
          <div class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-200">
            <img src="${blog.coverImage || ''}" class="w-full h-full object-cover" onerror="this.style.display='none'">
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
              ${blog.title}
            </p>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">${blog.category || 'Artikel'}</span>
              <span class="text-[10px] text-slate-400">${dateStr}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// -------- ARTICLE EDITOR ACTIONS --------

window.createNewArticle = function() {
  currentArticle = null;

  const form = document.getElementById('blogCmsForm');
  if (form) form.reset();

  document.getElementById('editorFormHeading').textContent = 'Tulis Artikel / Press Release Baru';
  document.getElementById('editorFormSubheading').textContent = 'Isi konten dan metadata SEO lengkap di bawah ini.';
  document.getElementById('blogSubmitBtnLabel').textContent = 'Terbitkan Artikel & Simpan Metadata SEO';
  document.getElementById('blogDeleteBtn').classList.add('hidden');

  // Reset default values
  const authorInput = document.getElementById('blogAuthor');
  if (authorInput) authorInput.value = 'Tim Humas MasaDepanAnak';
  const roleInput = document.getElementById('blogAuthorRole');
  if (roleInput) roleInput.value = 'Official Editorial Team';
  const coverInput = document.getElementById('blogCoverImage');
  if (coverInput) coverInput.value = 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=1000&q=80';
  const indexedCheck = document.getElementById('blogIsGoogleIndexed');
  if (indexedCheck) indexedCheck.checked = true;

  // Clear and re-add default sitelinks
  const sitelinksCont = document.getElementById('sitelinksContainer');
  if (sitelinksCont) {
    sitelinksCont.innerHTML = '';
    sitelinkRowCount = 0;
  }
  addSitelinkRow('Guru Privat Terbaik', '/#marketplace-section', 'Temukan guru les privat terverifikasi di MasaDepanAnak.');
  addSitelinkRow('Direktori Sekolah', '/#sekolah-section', 'Info preschool, SD, SMP, SMA, dan bimbel terlengkap.');

  updateSeoPreview();
  renderAdminBlogList(allBlogsAdmin);
};

async function editArticle(blogId) {
  try {
    const res = await fetch(`/api/blogs/${blogId}`);
    const data = await res.json();
    if (!data.success || !data.blog) return;

    const blog = data.blog;
    currentArticle = blog;

    // Update form heading
    document.getElementById('editorFormHeading').textContent = 'Edit Artikel / Press Release';
    document.getElementById('editorFormSubheading').textContent = `Mengedit: ${blog.title.slice(0, 50)}...`;
    document.getElementById('blogSubmitBtnLabel').textContent = 'Simpan Perubahan & Perbarui SEO';
    document.getElementById('blogDeleteBtn').classList.remove('hidden');

    // Fill form fields
    document.getElementById('blogTitle').value = blog.title || '';
    document.getElementById('blogCategory').value = blog.category || 'Press Release';
    document.getElementById('blogSlug').value = blog.slug || '';
    document.getElementById('blogAuthor').value = blog.author || 'Tim Humas MasaDepanAnak';
    document.getElementById('blogAuthorRole').value = blog.authorRole || 'Official Editorial Team';
    document.getElementById('blogCoverImage').value = blog.coverImage || '';
    document.getElementById('blogExcerpt').value = blog.excerpt || '';
    document.getElementById('blogContent').value = blog.content || '';
    document.getElementById('blogMetaTitle').value = blog.metaTitle || '';
    document.getElementById('blogMetaDescription').value = blog.metaDescription || '';
    document.getElementById('blogKeywords').value = blog.keywords || '';
    document.getElementById('blogIsGoogleIndexed').checked = blog.isGoogleIndexed !== false;

    // Sitelinks
    const sitelinksCont = document.getElementById('sitelinksContainer');
    if (sitelinksCont) {
      sitelinksCont.innerHTML = '';
      sitelinkRowCount = 0;
    }
    const sitelinks = blog.sitelinks || [];
    if (sitelinks.length > 0) {
      sitelinks.forEach(sl => addSitelinkRow(sl.title, sl.url, sl.description));
    } else {
      addSitelinkRow('Guru Privat Terbaik', '/#marketplace-section', 'Temukan guru les privat terverifikasi.');
      addSitelinkRow('Direktori Sekolah', '/#sekolah-section', 'Info preschool, SD, SMP, SMA terlengkap.');
    }

    // Update character counts
    const metaTitleCount = document.getElementById('metaTitleCount');
    if (metaTitleCount) metaTitleCount.textContent = `${(blog.metaTitle || '').length}/60 karakter`;
    const metaDescCount = document.getElementById('metaDescCount');
    if (metaDescCount) metaDescCount.textContent = `${(blog.metaDescription || '').length}/160 karakter`;

    updateSeoPreview();
    renderAdminBlogList(allBlogsAdmin);

    // Scroll form into view on mobile
    document.getElementById('blogCmsForm').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('Error loading article for edit:', err);
  }
}

// -------- SITELINKS MANAGER --------

window.addSitelinkRow = function(title = '', url = '', description = '') {
  sitelinkRowCount++;
  const container = document.getElementById('sitelinksContainer');
  if (!container) return;

  const rowId = `sitelink-row-${sitelinkRowCount}`;
  const div = document.createElement('div');
  div.id = rowId;
  div.className = 'grid grid-cols-12 gap-2 items-start bg-white p-3 rounded-xl border border-slate-200';
  div.innerHTML = `
    <div class="col-span-3">
      <input type="text" placeholder="Judul Link" value="${title}"
             class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-600"
             data-field="title" data-row="${sitelinkRowCount}">
    </div>
    <div class="col-span-3">
      <input type="text" placeholder="URL (/#section atau /halaman)" value="${url}"
             class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-mono focus:outline-none focus:border-emerald-600"
             data-field="url" data-row="${sitelinkRowCount}">
    </div>
    <div class="col-span-5">
      <input type="text" placeholder="Deskripsi singkat sitelink..." value="${description}"
             class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:border-emerald-600"
             data-field="description" data-row="${sitelinkRowCount}">
    </div>
    <div class="col-span-1 flex justify-end">
      <button type="button" onclick="removeSitelinkRow('${rowId}')"
              class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
};

window.removeSitelinkRow = function(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
};

function collectSitelinks() {
  const container = document.getElementById('sitelinksContainer');
  if (!container) return [];

  const rows = container.querySelectorAll('[data-field="title"]');
  const sitelinks = [];

  rows.forEach((titleInput) => {
    const rowId = titleInput.dataset.row;
    const urlInput = container.querySelector(`[data-field="url"][data-row="${rowId}"]`);
    const descInput = container.querySelector(`[data-field="description"][data-row="${rowId}"]`);

    const title = titleInput.value.trim();
    const url = urlInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';

    if (title && url) {
      sitelinks.push({ title, url, description });
    }
  });

  return sitelinks;
}

// -------- FORM SUBMIT --------

async function handleBlogFormSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('blogTitle').value.trim();
  const category = document.getElementById('blogCategory').value;
  const slug = document.getElementById('blogSlug').value.trim().replace(/\s+/g, '-').toLowerCase();
  const author = document.getElementById('blogAuthor').value.trim();
  const authorRole = document.getElementById('blogAuthorRole').value.trim();
  const coverImage = document.getElementById('blogCoverImage').value.trim();
  const excerpt = document.getElementById('blogExcerpt').value.trim();
  const content = document.getElementById('blogContent').value.trim();
  const metaTitle = document.getElementById('blogMetaTitle').value.trim() || `${title} | MasaDepanAnak`;
  const metaDescription = document.getElementById('blogMetaDescription').value.trim() || excerpt.slice(0, 160);
  const keywords = document.getElementById('blogKeywords').value.trim();
  const isGoogleIndexed = document.getElementById('blogIsGoogleIndexed').checked;
  const sitelinks = collectSitelinks();

  // Reading time estimate
  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).length;
  const readMins = Math.max(1, Math.ceil(wordCount / 200));
  const readingTime = `${readMins} menit baca`;

  const payload = {
    title,
    category,
    slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    author,
    authorRole,
    coverImage,
    excerpt,
    content,
    metaTitle,
    metaDescription,
    keywords,
    isGoogleIndexed,
    robots: isGoogleIndexed ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' : 'noindex, nofollow',
    readingTime,
    sitelinks,
    publishedAt: new Date().toISOString()
  };

  const isEdit = currentArticle && currentArticle.id;
  const url = isEdit ? `/api/blogs/${currentArticle.id}` : '/api/blogs';
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

    if (data.success && data.blog) {
      currentArticle = data.blog;

      // Reload list
      await loadAdminBlogList();

      Swal.fire({
        icon: 'success',
        title: isEdit ? 'Artikel Diperbarui! ✏️' : 'Artikel Diterbitkan! 🚀',
        html: `
          <div class="text-left text-xs text-slate-600 space-y-2 mt-2">
            <p><b>${title}</b> telah terbit di website.</p>
            <p>• <b>Kategori:</b> ${category}</p>
            <p>• <b>Slug:</b> /${data.blog.slug}</p>
            <p>• <b>Google Index:</b> ${isGoogleIndexed ? '✅ Aktif' : '❌ Nonaktif'}</p>
            ${sitelinks.length > 0 ? `<p>• <b>Sitelinks:</b> ${sitelinks.length} link tersimpan</p>` : ''}
            <p class="text-emerald-600 font-bold">Cek sitemap Google: <a href="/sitemap.xml" target="_blank" class="underline">/sitemap.xml</a></p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: '👁️ Lihat di Halaman Blog',
        cancelButtonText: 'Tetap di CMS',
        confirmButtonColor: '#059669',
        cancelButtonColor: '#475569'
      }).then((result) => {
        if (result.isConfirmed) {
          window.open(`blog.html?artikel=${data.blog.slug}`, '_blank');
        }
      });
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal Menerbitkan', text: data.message || 'Terjadi kesalahan.' });
    }
  } catch (err) {
    Swal.close();
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: 'Gagal menghubungi server.' });
  }
}

// -------- DELETE ARTICLE --------

window.deleteCurrentArticle = async function() {
  if (!currentArticle || !currentArticle.id) return;

  const result = await Swal.fire({
    title: 'Hapus Artikel Ini?',
    text: `"${currentArticle.title}" akan dihapus permanen dari website dan Google Index.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Ya, Hapus Artikel',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      Swal.showLoading();
      const res = await fetch(`/api/blogs/${currentArticle.id}`, { method: 'DELETE' });
      const data = await res.json();
      Swal.close();

      if (data.success) {
        currentArticle = null;
        await loadAdminBlogList();
        createNewArticle();
        Swal.fire({ icon: 'success', title: 'Artikel Telah Dihapus', timer: 1400, showConfirmButton: false });
      }
    } catch (err) {
      Swal.close();
      console.error('Delete article error:', err);
    }
  }
};
