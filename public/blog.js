// Blog Frontend - MasaDepanAnak Press Release & Artikel
// Loads from /api/blogs, renders cards + detail view with SEO metadata

let allBlogs = [];
let currentBlog = null;
let activeCategoryFilter = 'Semua';

const CATEGORY_CONFIG = {
  'Press Release': { icon: '📰', color: 'emerald' },
  'Panduan Sekolah': { icon: '🏫', color: 'blue' },
  'Tips Belajar': { icon: '💡', color: 'amber' },
  'Info Parenting': { icon: '👨‍👩‍👧', color: 'rose' }
};

document.addEventListener('DOMContentLoaded', () => {
  // Check URL param for direct article
  const params = new URLSearchParams(window.location.search);
  const articleSlug = params.get('artikel') || params.get('slug');

  if (articleSlug) {
    loadSingleArticle(articleSlug);
  } else {
    loadBlogList();
  }

  // Blog image upload in CMS (if used from this page)
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
        }
      } catch (e) { console.error(e); }
    });
  }
});

// -------- BLOG LISTING --------

async function loadBlogList(category = null) {
  const grid = document.getElementById('blogCardsGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="col-span-full py-16 text-center text-slate-400">
      <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-500 mb-3"></i>
      <p class="text-xs font-bold">Memuat artikel...</p>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (category && category !== 'Semua') params.append('category', category);

    const res = await fetch(`/api/blogs?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      allBlogs = data.blogs;
      renderBlogCards(data.blogs);
    }
  } catch (err) {
    console.error('Failed to load blogs:', err);
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-rose-500">
        <i class="fa-solid fa-circle-exclamation text-xl mb-2"></i>
        <p class="text-xs font-bold">Gagal memuat artikel. Periksa koneksi server.</p>
      </div>
    `;
  }
}

function renderBlogCards(blogs) {
  const grid = document.getElementById('blogCardsGrid');
  if (!grid) return;

  if (blogs.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-14 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
        <i class="fa-solid fa-newspaper text-3xl mb-3 opacity-30"></i>
        <p class="font-black text-slate-700 text-sm">Belum ada artikel di kategori ini.</p>
        <p class="text-xs mt-1">Gunakan CMS Blog untuk menerbitkan konten pertama.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = blogs.map((blog, i) => {
    const catConf = CATEGORY_CONFIG[blog.category] || { icon: '📄', color: 'slate' };
    const dateStr = blog.publishedAt ? new Date(blog.publishedAt).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric'
    }) : '—';

    const isFeatured = i === 0;

    return `
      <div class="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer ${isFeatured ? 'md:col-span-2 lg:col-span-1' : ''}"
           onclick="openArticleDetail('${blog.slug || blog.id}')">
        <div class="relative overflow-hidden h-44 bg-slate-100">
          <img src="${blog.coverImage || 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'}"
               alt="${blog.title}"
               class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
               onerror="this.src='https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=80'">
          <div class="absolute top-3 left-3">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-sm text-[11px] font-black text-slate-900 shadow-xs border border-white">
              <span>${catConf.icon}</span>
              <span>${blog.category || 'Artikel'}</span>
            </span>
          </div>
        </div>

        <div class="p-5 space-y-3">
          <h2 class="text-sm font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
            ${blog.title}
          </h2>

          <p class="text-xs text-slate-500 leading-relaxed font-medium line-clamp-2">
            ${blog.excerpt || ''}
          </p>

          <div class="flex items-center justify-between pt-1 border-t border-slate-100">
            <div class="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
              <i class="fa-regular fa-calendar"></i>
              <span>${dateStr}</span>
            </div>
            <span class="text-[11px] font-bold text-slate-400">
              <i class="fa-regular fa-clock mr-1"></i>${blog.readingTime || '3 menit baca'}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-black shrink-0">
              <i class="fa-solid fa-user-pen"></i>
            </div>
            <div>
              <p class="text-[11px] font-black text-slate-800 leading-none">${blog.author || 'Tim Editorial'}</p>
              <p class="text-[10px] text-slate-400">${blog.authorRole || 'Editorial Team'}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// -------- CATEGORY FILTER --------

window.filterBlogCategory = function(category) {
  activeCategoryFilter = category;

  // Update active button states
  document.querySelectorAll('.blog-cat-btn').forEach(btn => {
    btn.classList.remove('bg-slate-900', 'text-white', 'shadow-xs', 'active');
    btn.classList.add('bg-white', 'hover:bg-slate-100', 'text-slate-700', 'border', 'border-slate-200');
  });

  const activeBtn = document.querySelector(`.blog-cat-btn[onclick*="${category}"]`) ||
                    document.querySelector('.blog-cat-btn');
  if (activeBtn) {
    activeBtn.classList.add('bg-slate-900', 'text-white', 'shadow-xs', 'active');
    activeBtn.classList.remove('bg-white', 'hover:bg-slate-100', 'text-slate-700', 'border', 'border-slate-200');
  }

  loadBlogList(category === 'Semua' ? null : category);
};

// -------- ARTICLE DETAIL VIEW --------

async function loadSingleArticle(slugOrId) {
  try {
    const res = await fetch(`/api/blogs/${slugOrId}`);
    const data = await res.json();
    if (data.success && data.blog) {
      openArticleDetail(null, data.blog);
    }
  } catch (err) {
    console.error('Failed to load article:', err);
  }
}

window.openArticleDetail = async function(slugOrId, blogData = null) {
  try {
    let blog = blogData;
    if (!blog && slugOrId) {
      const res = await fetch(`/api/blogs/${slugOrId}`);
      const data = await res.json();
      if (!data.success) return;
      blog = data.blog;
    }
    if (!blog) return;

    currentBlog = blog;

    // Switch views
    document.getElementById('blogListingView').classList.add('hidden');
    const detailView = document.getElementById('blogDetailView');
    detailView.classList.remove('hidden');

    // Update SEO meta tags dynamically
    if (blog.metaTitle) document.title = blog.metaTitle;
    const metaDesc = document.getElementById('seoDescription');
    if (metaDesc) metaDesc.setAttribute('content', blog.metaDescription || blog.excerpt || '');
    const ogTitle = document.getElementById('ogTitle');
    if (ogTitle) ogTitle.setAttribute('content', blog.metaTitle || blog.title);
    const ogDesc = document.getElementById('ogDesc');
    if (ogDesc) ogDesc.setAttribute('content', blog.metaDescription || '');
    const ogImg = document.getElementById('ogImage');
    if (ogImg) ogImg.setAttribute('content', blog.coverImage || '');

    // Update Schema JSON-LD
    const schema = document.getElementById('schemaJsonLd');
    if (schema) {
      schema.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": blog.title,
        "image": [blog.coverImage || ''],
        "datePublished": blog.publishedAt,
        "dateModified": blog.updatedAt || blog.publishedAt,
        "author": { "@type": "Person", "name": blog.author || 'Tim Editorial MasaDepanAnak' },
        "publisher": {
          "@type": "Organization",
          "name": "MasaDepanAnak",
          "logo": { "@type": "ImageObject", "url": "http://localhost:3000/logo.png" }
        },
        "description": blog.metaDescription || blog.excerpt || '',
        "keywords": blog.keywords || '',
        "url": blog.canonicalUrl || window.location.href
      });
    }

    // Render category badge
    const catBadge = document.getElementById('articleCategoryBadge');
    if (catBadge) {
      const catConf = CATEGORY_CONFIG[blog.category] || { icon: '📄' };
      catBadge.textContent = `${catConf.icon} ${blog.category || 'Artikel'}`;
    }

    // Render article fields
    const title = document.getElementById('articleTitle');
    if (title) title.textContent = blog.title;

    const author = document.getElementById('articleAuthor');
    if (author) author.textContent = blog.author || 'Tim Humas MasaDepanAnak';

    const role = document.getElementById('articleAuthorRole');
    if (role) role.textContent = blog.authorRole || 'Editorial Team';

    const dateEl = document.getElementById('articleDate');
    if (dateEl) {
      const d = blog.publishedAt ? new Date(blog.publishedAt).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }) : '—';
      dateEl.innerHTML = `<i class="fa-regular fa-calendar mr-1"></i>${d}`;
    }

    const readTime = document.getElementById('articleReadTime');
    if (readTime) readTime.innerHTML = `<i class="fa-regular fa-clock mr-1"></i>${blog.readingTime || '4 menit baca'}`;

    const cover = document.getElementById('articleCoverImage');
    if (cover) {
      cover.src = blog.coverImage || 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=1000&q=80';
      cover.alt = blog.title;
    }

    const excerpt = document.getElementById('articleExcerptLead');
    if (excerpt) excerpt.textContent = blog.excerpt || '';

    const body = document.getElementById('articleBodyContent');
    if (body) body.innerHTML = blog.content || '';

    // Sitelinks
    const sitelinksBox = document.getElementById('articleSitelinksBox');
    const sitelinksList = document.getElementById('articleSitelinksList');
    const sitelinks = blog.sitelinks || [];

    if (sitelinks.length > 0 && sitelinksBox && sitelinksList) {
      sitelinksBox.classList.remove('hidden');
      sitelinksList.innerHTML = sitelinks.map(sl => `
        <a href="${sl.url}" class="block p-3 bg-white rounded-xl border border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors group">
          <p class="text-xs font-black text-emerald-800 group-hover:text-emerald-900">${sl.title}</p>
          <p class="text-[11px] text-slate-500 mt-0.5 leading-snug">${sl.description || ''}</p>
        </a>
      `).join('');
    } else if (sitelinksBox) {
      sitelinksBox.classList.add('hidden');
    }

    // Update URL without reload
    window.history.pushState({}, '', `?artikel=${blog.slug || blog.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    console.error('Error opening article:', err);
  }
};

window.returnToBlogList = function() {
  currentBlog = null;
  document.getElementById('blogDetailView').classList.add('hidden');
  document.getElementById('blogListingView').classList.remove('hidden');
  window.history.pushState({}, '', window.location.pathname);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
