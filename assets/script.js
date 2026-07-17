// ============================================
// STATE MANAGEMENT
// ============================================

let novels = [];
let filteredNovels = [];
let bookmarks = [];
let lastRead = null;
let currentPage = 1;
let novelsPerPage = 24;
let previousData = null;
let autoRefreshInterval = null;
let deviceId = '';
let userLikedNovels = [];
let userLikedChapters = [];

// Base URL for subdirectory
const BASE_URL = '/light-novel';

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Light Novel Reader...');
    
    // Get device ID
    deviceId = getDeviceId();
    console.log(`📱 Device ID: ${deviceId}`);
    
    // Load data from Dreamlo
    await loadFromDreamlo();
    
    // Load local storage as backup
    loadFromLocalStorage();
    
    // Load novels
    await loadNovels();
    
    // Setup auto-refresh
    setupAutoRefresh();
    
    // Setup event listeners
    setupEventListeners();
    
    // Highlight current page
    highlightCurrentPage();
    
    // Update continue reading
    updateContinueReading();
    
    // Load theme
    loadTheme();
    
    // Load reader toolbar setting
    loadReaderToolbarSetting();
    
    console.log('✅ Light Novel Reader initialized successfully');
});

// ============================================
// DATA LOADING FUNCTIONS
// ============================================

/**
 * Load user data from Dreamlo
 */
async function loadFromDreamlo() {
    try {
        console.log('📥 Loading user data from Dreamlo...');
        
        // Load user bookmarks
        const allBookmarks = await UserBookmarksDB.getAll();
        bookmarks = allBookmarks
            .filter(b => b.deviceId === deviceId)
            .map(b => b.novelId);
        console.log(`📑 Loaded ${bookmarks.length} bookmarks`);
        
        // Load user likes for novels
        const allNovelLikes = await UserLikesNovelDB.getAll();
        userLikedNovels = allNovelLikes
            .filter(l => l.deviceId === deviceId)
            .map(l => l.novelId);
        console.log(`❤️ Loaded ${userLikedNovels.length} novel likes`);
        
        // Load user likes for chapters
        const allChapterLikes = await UserLikesChapterDB.getAll();
        userLikedChapters = allChapterLikes
            .filter(l => l.deviceId === deviceId)
            .map(l => `${l.novelId}_${l.chapterIndex}`);
        console.log(`📖 Loaded ${userLikedChapters.length} chapter likes`);
        
        // Load last read
        const lastReadData = await getLastReadFromDreamlo(deviceId);
        if (lastReadData) {
            lastRead = lastReadData;
            console.log(`📚 Last read: ${lastRead.novelId} - Chapter ${lastRead.chapterIndex}`);
        }
        
        // Save to localStorage as backup
        saveBookmarks();
        if (lastRead) {
            saveLastRead(lastRead.novelId, lastRead.chapterIndex);
        }
    } catch (e) {
        console.error('❌ Error loading from Dreamlo:', e);
    }
}

/**
 * Load data from localStorage as fallback
 */
function loadFromLocalStorage() {
    try {
        if (bookmarks.length === 0) {
            const localBookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
            bookmarks = localBookmarks;
        }
        if (!lastRead) {
            lastRead = JSON.parse(localStorage.getItem('lastRead')) || null;
        }
    } catch (e) {
        console.error('❌ Error loading from localStorage:', e);
    }
}

/**
 * Load novels from Dreamlo or seed from local data
 */
async function loadNovels() {
    showLoading();
    try {
        console.log('📚 Loading novels...');
        
        // Get novels from Dreamlo
        let dreamloNovels = await NovelDB.getAll();
        console.log(`📊 Found ${dreamloNovels.length} novels in Dreamlo`);
        
        // If no novels in Dreamlo, initialize from local data
        if (dreamloNovels.length === 0) {
            console.log('🔄 Seeding initial data from local novels.json...');
            
            const response = await fetch(`${BASE_URL}/data/novels.json?t=` + Date.now());
            if (!response.ok) throw new Error('Failed to load novels.json');
            const localNovels = await response.json();
            
            // Seed Dreamlo with initial data
            for (const novel of localNovels) {
                await NovelDB.save({
                    ...novel,
                    id: novel.id,
                    score: 0,
                    seconds: 0,
                    views: 0,
                    likes: 0
                });
                
                // Seed chapters
                for (let i = 0; i < novel.chapters.length; i++) {
                    await ChapterDB.save({
                        id: `${novel.id}_${i}`,
                        novelId: novel.id,
                        chapterIndex: i,
                        title: novel.chapters[i].title,
                        file: novel.chapters[i].file,
                        score: 0,
                        seconds: 0,
                        views: 0,
                        likes: 0
                    });
                }
            }
            
            // Reload from Dreamlo
            dreamloNovels = await NovelDB.getAll();
            console.log(`✅ Seeded ${dreamloNovels.length} novels`);
        }
        
        // Map Dreamlo data to match local format
        novels = dreamloNovels.map(novel => ({
            ...novel,
            chapters: [] // Will be populated separately
        }));
        
        // Load chapters for each novel
        const allChapters = await ChapterDB.getAll();
        for (const novel of novels) {
            novel.chapters = allChapters
                .filter(c => c.novelId === novel.id)
                .sort((a, b) => a.chapterIndex - b.chapterIndex)
                .map(c => ({
                    title: c.title,
                    file: c.file,
                    likes: parseInt(c.likes) || 0,
                    views: parseInt(c.views) || 0
                }));
        }
        
        previousData = [...novels];
        filteredNovels = [...novels];
        
        console.log(`✅ Loaded ${novels.length} novels with chapters`);
        updateUI();
    } catch (error) {
        console.error('❌ Error loading novels:', error);
        showError('Failed to load novels. Please try again.');
    } finally {
        hideLoading();
    }
}

// ============================================
// SAVE FUNCTIONS
// ============================================

/**
 * Save bookmarks to localStorage
 */
function saveBookmarks() {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
}

/**
 * Save last read to localStorage
 */
function saveLastRead(novelId, chapterIndex) {
    if (novelId && chapterIndex !== undefined) {
        lastRead = { novelId, chapterIndex };
        localStorage.setItem('lastRead', JSON.stringify(lastRead));
    }
}

/**
 * Save bookmarks to Dreamlo
 */
async function saveBookmarksToDreamlo() {
    try {
        await syncBookmarksToDreamlo(bookmarks, deviceId);
    } catch (e) {
        console.error('❌ Error saving bookmarks to Dreamlo:', e);
    }
}

// ============================================
// LIKE FUNCTIONS
// ============================================

/**
 * Toggle like for a novel
 */
async function toggleLikeNovel(novelId) {
    const index = userLikedNovels.indexOf(novelId);
    
    if (index === -1) {
        // Add like
        userLikedNovels.push(novelId);
        await UserLikesNovelDB.save({
            id: `${deviceId}_${novelId}`,
            deviceId: deviceId,
            novelId: novelId,
            score: 1,
            seconds: 0,
            timestamp: new Date().toISOString()
        });
        
        // Increment novel likes
        const novel = novels.find(n => n.id === novelId);
        if (novel) {
            novel.likes = (parseInt(novel.likes) || 0) + 1;
            await NovelDB.save({
                ...novel,
                score: parseInt(novel.likes) || 0
            });
        }
        console.log(`❤️ Liked novel: ${novelId}`);
    } else {
        // Remove like
        userLikedNovels.splice(index, 1);
        await UserLikesNovelDB.delete(`${deviceId}_${novelId}`);
        
        // Decrement novel likes
        const novel = novels.find(n => n.id === novelId);
        if (novel && novel.likes > 0) {
            novel.likes = parseInt(novel.likes) - 1;
            await NovelDB.save({
                ...novel,
                score: parseInt(novel.likes) || 0
            });
        }
        console.log(`💔 Unliked novel: ${novelId}`);
    }
    
    updateUI();
}

/**
 * Toggle like for a chapter
 */
async function toggleLikeChapter(novelId, chapterIndex) {
    const key = `${novelId}_${chapterIndex}`;
    const index = userLikedChapters.indexOf(key);
    
    if (index === -1) {
        // Add like
        userLikedChapters.push(key);
        await UserLikesChapterDB.save({
            id: `${deviceId}_${novelId}_${chapterIndex}`,
            deviceId: deviceId,
            novelId: novelId,
            chapterIndex: chapterIndex,
            score: 1,
            seconds: 0,
            timestamp: new Date().toISOString()
        });
        
        // Increment chapter likes
        const allChapters = await ChapterDB.getAll();
        const chapter = allChapters.find(c => c.novelId === novelId && c.chapterIndex == chapterIndex);
        if (chapter) {
            chapter.likes = (parseInt(chapter.likes) || 0) + 1;
            await ChapterDB.save({
                ...chapter,
                score: parseInt(chapter.likes) || 0
            });
        }
        console.log(`❤️ Liked chapter: ${novelId} - ${chapterIndex}`);
    } else {
        // Remove like
        userLikedChapters.splice(index, 1);
        await UserLikesChapterDB.delete(`${deviceId}_${novelId}_${chapterIndex}`);
        
        // Decrement chapter likes
        const allChapters = await ChapterDB.getAll();
        const chapter = allChapters.find(c => c.novelId === novelId && c.chapterIndex == chapterIndex);
        if (chapter && chapter.likes > 0) {
            chapter.likes = parseInt(chapter.likes) - 1;
            await ChapterDB.save({
                ...chapter,
                score: parseInt(chapter.likes) || 0
            });
        }
        console.log(`💔 Unliked chapter: ${novelId} - ${chapterIndex}`);
    }
    
    updateUI();
}

// ============================================
// VIEW TRACKING FUNCTIONS
// ============================================

/**
 * Track novel view
 */
async function trackNovelView(novelId) {
    try {
        const allNovels = await NovelDB.getAll();
        const novel = allNovels.find(n => n.id === novelId);
        if (novel) {
            novel.views = (parseInt(novel.views) || 0) + 1;
            await NovelDB.save({
                ...novel,
                score: parseInt(novel.likes) || 0
            });
            console.log(`👁️ Novel view tracked: ${novelId} (${novel.views} views)`);
        }
    } catch (e) {
        console.error('❌ Error tracking novel view:', e);
    }
}

/**
 * Track chapter view
 */
async function trackChapterView(novelId, chapterIndex) {
    try {
        const allChapters = await ChapterDB.getAll();
        const chapter = allChapters.find(c => c.novelId === novelId && c.chapterIndex == chapterIndex);
        if (chapter) {
            chapter.views = (parseInt(chapter.views) || 0) + 1;
            await ChapterDB.save({
                ...chapter,
                score: parseInt(chapter.likes) || 0
            });
            console.log(`👁️ Chapter view tracked: ${novelId} - ${chapterIndex} (${chapter.views} views)`);
        }
    } catch (e) {
        console.error('❌ Error tracking chapter view:', e);
    }
}

// ============================================
// BOOKMARK FUNCTIONS
// ============================================

/**
 * Toggle bookmark on card
 */
async function toggleCardBookmark(event, novelId) {
    event.stopPropagation();
    
    const index = bookmarks.indexOf(novelId);
    const btn = event.currentTarget;
    
    if (index === -1) {
        bookmarks.push(novelId);
        btn.classList.add('bookmarked');
        btn.innerHTML = '<i class="fas fa-bookmark"></i>';
        console.log(`📑 Bookmarked: ${novelId}`);
    } else {
        bookmarks.splice(index, 1);
        btn.classList.remove('bookmarked');
        btn.innerHTML = '<i class="far fa-bookmark"></i>';
        console.log(`📑 Unbookmarked: ${novelId}`);
    }
    
    saveBookmarks();
    await saveBookmarksToDreamlo();
    
    // Update bookmark page if open
    if (window.location.pathname === '/light-novel/bookmark.html') {
        loadBookmarks();
    }
}

// ============================================
// THEME FUNCTIONS
// ============================================

/**
 * Load theme from localStorage
 */
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.className = savedTheme === 'light' ? 'light-theme' : '';
    
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
}

/**
 * Toggle theme
 */
function toggleTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
}

// ============================================
// READER TOOLBAR FUNCTIONS
// ============================================

/**
 * Load reader toolbar setting
 */
function loadReaderToolbarSetting() {
    const showToolbar = localStorage.getItem('showReaderToolbar') !== 'false';
    const toolbar = document.getElementById('readerToolbar');
    if (toolbar) {
        if (!showToolbar) {
            toolbar.classList.add('hidden');
        }
    }
    
    const toolbarCheckbox = document.getElementById('showReaderToolbar');
    if (toolbarCheckbox) {
        toolbarCheckbox.checked = showToolbar;
    }
}

/**
 * Toggle reader toolbar
 */
function toggleReaderToolbar(show) {
    const toolbar = document.getElementById('readerToolbar');
    if (toolbar) {
        if (show) {
            toolbar.classList.remove('hidden');
        } else {
            toolbar.classList.add('hidden');
        }
    }
    localStorage.setItem('showReaderToolbar', show);
}

// ============================================
// IMAGE HANDLING FUNCTIONS
// ============================================

/**
 * Handle image load
 */
function handleImageLoad(imgElement) {
    const coverWrapper = imgElement.closest('.cover-wrapper');
    if (coverWrapper) {
        const skeleton = coverWrapper.querySelector('.skeleton');
        if (skeleton) {
            skeleton.style.display = 'none';
        }
    }
    imgElement.style.display = 'block';
}

/**
 * Handle image error
 */
function handleImageError(imgElement) {
    const coverWrapper = imgElement.closest('.cover-wrapper');
    if (coverWrapper) {
        const skeleton = coverWrapper.querySelector('.skeleton');
        if (skeleton) {
            skeleton.classList.add('error-state');
            skeleton.innerHTML = '<i class="fas fa-image"></i>';
            skeleton.style.display = 'flex';
        }
    }
    imgElement.style.display = 'none';
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

/**
 * Update UI based on current page
 */
function updateUI() {
    const path = window.location.pathname;
    
    if (path === '/light-novel/' || path === '/light-novel/index.html') {
        updateHomePage();
    } else if (path === '/light-novel/novel.html') {
        updateNovelDetailPage();
    } else if (path === '/light-novel/read.html') {
        updateReaderPage();
    } else if (path === '/light-novel/bookmark.html') {
        loadBookmarks();
    }
}

/**
 * Load bookmarks page
 */
async function loadBookmarks() {
    const bookmarkGrid = document.getElementById('bookmarkGrid');
    const emptyState = document.getElementById('emptyBookmarks');
    
    if (!bookmarkGrid) return;
    
    const bookmarkedNovels = novels.filter(novel => bookmarks.includes(novel.id));
    
    if (bookmarkedNovels.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        bookmarkGrid.innerHTML = '';
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
    bookmarkGrid.innerHTML = bookmarkedNovels.map(novel => {
        const isLiked = userLikedNovels.includes(novel.id);
        const likes = parseInt(novel.likes) || 0;
        const views = parseInt(novel.views) || 0;
        
        return `
        <div class="novel-card" onclick="goToNovel('${novel.id}')">
            <div class="cover-wrapper cover-9-16">
                <div class="skeleton cover-skeleton"></div>
                <img 
                    src="${novel.cover}" 
                    alt="${novel.title}" 
                    class="novel-cover" 
                    loading="lazy"
                    onload="handleImageLoad(this)"
                    onerror="handleImageError(this)"
                >
                <button class="card-bookmark-btn bookmarked" onclick="event.stopPropagation(); toggleCardBookmark(event, '${novel.id}')">
                    <i class="fas fa-bookmark"></i>
                </button>
                <button class="card-like-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLikeNovel('${novel.id}')">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                    <span class="like-count">${likes}</span>
                </button>
                <div class="card-stats">
                    <span><i class="fas fa-eye"></i> ${views}</span>
                </div>
            </div>
            <div class="novel-info">
                <h3 class="novel-title">${novel.title}</h3>
                <div class="novel-meta">
                    <span class="status ${novel.status.toLowerCase()}">${novel.status}</span>
                    <span><i class="fas fa-file-lines"></i> ${novel.chapters.length}</span>
                </div>
            </div>
        </div>
    `}).join('');
}

/**
 * Update continue reading section
 */
async function updateContinueReading() {
    const continueSection = document.getElementById('continueReadingSection');
    const continueCard = document.getElementById('continueReadingCard');
    
    if (!continueSection || !continueCard || !lastRead) {
        if (continueSection) continueSection.classList.add('hidden');
        return;
    }
    
    const novel = novels.find(n => n.id === lastRead.novelId);
    if (!novel || lastRead.chapterIndex >= novel.chapters.length) {
        continueSection.classList.add('hidden');
        return;
    }
    
    const chapter = novel.chapters[lastRead.chapterIndex];
    continueCard.innerHTML = `
        <i class="fas fa-book-open"></i>
        <div class="continue-info">
            <h4>${novel.title}</h4>
            <p>${chapter.title}</p>
        </div>
        <span class="continue-stats">
            <i class="fas fa-eye"></i> ${parseInt(novel.views) || 0}
        </span>
    `;
    
    continueCard.onclick = () => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novel.id}&chapter=${lastRead.chapterIndex}`;
    };
    
    continueSection.classList.remove('hidden');
}

// ============================================
// HOME PAGE FUNCTIONS
// ============================================

/**
 * Update home page
 */
function updateHomePage() {
    const novelGrid = document.getElementById('novelGrid');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const sortSelect = document.getElementById('sortSelect');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (!novelGrid) return;
    
    filterNovels();
    
    function filterNovels() {
        const searchTerm = searchInput?.value.toLowerCase() || '';
        const sortBy = sortSelect?.value || 'az';
        
        filteredNovels = novels.filter(novel => 
            novel.title.toLowerCase().includes(searchTerm)
        );
        
        if (sortBy === 'az') {
            filteredNovels.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortBy === 'latest') {
            filteredNovels.sort((a, b) => new Date(b.created) - new Date(a.created));
        } else if (sortBy === 'popular') {
            filteredNovels.sort((a, b) => (parseInt(b.views) || 0) - (parseInt(a.views) || 0));
        }
        
        currentPage = 1;
        displayNovels();
    }
    
    function displayNovels() {
        const start = 0;
        const end = currentPage * novelsPerPage;
        const novelsToShow = filteredNovels.slice(0, end);
        
        novelGrid.innerHTML = novelsToShow.map(novel => {
            const isBookmarked = bookmarks.includes(novel.id);
            const isLiked = userLikedNovels.includes(novel.id);
            const likes = parseInt(novel.likes) || 0;
            const views = parseInt(novel.views) || 0;
            
            return `
            <div class="novel-card" onclick="goToNovel('${novel.id}')">
                <div class="cover-wrapper cover-9-16">
                    <div class="skeleton cover-skeleton"></div>
                    <img 
                        src="${novel.cover}" 
                        alt="${novel.title}" 
                        class="novel-cover" 
                        loading="lazy"
                        onload="handleImageLoad(this)"
                        onerror="handleImageError(this)"
                    >
                    <button class="card-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="event.stopPropagation(); toggleCardBookmark(event, '${novel.id}')">
                        <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
                    </button>
                    <button class="card-like-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLikeNovel('${novel.id}')">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span class="like-count">${likes}</span>
                    </button>
                    <div class="card-stats">
                        <span><i class="fas fa-eye"></i> ${views}</span>
                    </div>
                </div>
                <div class="novel-info">
                    <h3 class="novel-title">${novel.title}</h3>
                    <div class="novel-meta">
                        <span class="status ${novel.status.toLowerCase()}">${novel.status}</span>
                        <span><i class="fas fa-file-lines"></i> ${novel.chapters.length}</span>
                    </div>
                </div>
            </div>
        `}).join('');
        
        if (loadMoreBtn) {
            if (end < filteredNovels.length) {
                loadMoreBtn.classList.remove('hidden');
            } else {
                loadMoreBtn.classList.add('hidden');
            }
        }
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterNovels();
            if (searchClear) {
                if (searchInput.value.length > 0) {
                    searchClear.style.display = 'flex';
                } else {
                    searchClear.style.display = 'none';
                }
            }
        });
    }
    
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
                searchClear.style.display = 'none';
                filterNovels();
            }
        });
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', filterNovels);
    }
    
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            displayNovels();
        });
    }
    
    displayNovels();
    updateContinueReading();
}

// ============================================
// NOVEL DETAIL PAGE FUNCTIONS
// ============================================

/**
 * Update novel detail page
 */
async function updateNovelDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const novelId = urlParams.get('id');
    
    if (!novelId) {
        window.location.href = `${BASE_URL}/`;
        return;
    }
    
    const novel = novels.find(n => n.id === novelId);
    if (!novel) {
        showError('Novel not found');
        return;
    }
    
    // Track novel view
    await trackNovelView(novelId);
    
    const coverImg = document.getElementById('novelCover');
    coverImg.src = novel.cover;
    
    coverImg.onload = function() {
        const coverWrapper = this.closest('.cover-wrapper');
        if (coverWrapper) {
            const skeleton = coverWrapper.querySelector('.skeleton');
            if (skeleton) {
                skeleton.style.display = 'none';
            }
        }
        this.style.display = 'block';
    };
    
    coverImg.onerror = function() {
        const coverWrapper = this.closest('.cover-wrapper');
        if (coverWrapper) {
            const skeleton = coverWrapper.querySelector('.skeleton');
            if (skeleton) {
                skeleton.classList.add('error-state');
                skeleton.innerHTML = '<i class="fas fa-image"></i>';
                skeleton.style.display = 'flex';
            }
        }
        this.style.display = 'none';
    };
    
    document.getElementById('novelTitle').textContent = novel.title;
    
    const statusBadge = document.getElementById('novelStatus');
    statusBadge.textContent = novel.status;
    statusBadge.className = `status-badge ${novel.status.toLowerCase()}`;
    
    const likes = parseInt(novel.likes) || 0;
    const views = parseInt(novel.views) || 0;
    document.getElementById('novelStats').innerHTML = `
        <span><i class="fas fa-eye"></i> ${views} views</span>
        <span><i class="fas fa-heart"></i> ${likes} likes</span>
        <span><i class="fas fa-file-lines"></i> ${novel.chapters.length} chapters</span>
    `;
    document.getElementById('novelDescription').textContent = novel.description;
    
    // Detail page bookmark button
    const detailBookmarkBtn = document.getElementById('detailBookmarkBtn');
    const isBookmarked = bookmarks.includes(novel.id);
    if (detailBookmarkBtn) {
        detailBookmarkBtn.innerHTML = isBookmarked ? '<i class="fas fa-bookmark"></i>' : '<i class="far fa-bookmark"></i>';
        detailBookmarkBtn.classList.toggle('bookmarked', isBookmarked);
        detailBookmarkBtn.onclick = (e) => {
            e.stopPropagation();
            toggleCardBookmark(e, novel.id);
        };
    }
    
    // Detail page like button
    const detailLikeBtn = document.getElementById('detailLikeBtn');
    const isLiked = userLikedNovels.includes(novel.id);
    if (detailLikeBtn) {
        detailLikeBtn.innerHTML = `
            <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
            <span>${likes}</span>
        `;
        detailLikeBtn.classList.toggle('liked', isLiked);
        detailLikeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleLikeNovel(novel.id);
        };
    }
    
    const chapterSelect = document.getElementById('chapterSelect');
    chapterSelect.innerHTML = '<option value="">Quick jump to chapter...</option>' + 
        novel.chapters.map((ch, index) => 
            `<option value="${index}">${ch.title} ${ch.likes ? '❤️' : ''}</option>`
        ).join('');
    
    chapterSelect.onchange = (e) => {
        if (e.target.value) {
            goToChapter(novelId, parseInt(e.target.value));
        }
    };
    
    const chapterList = document.getElementById('chapterList');
    chapterList.innerHTML = novel.chapters.map((ch, index) => {
        const isChapterLiked = userLikedChapters.includes(`${novelId}_${index}`);
        const chapterLikes = parseInt(ch.likes) || 0;
        return `
        <div class="chapter-item" onclick="goToChapter('${novelId}', ${index})">
            <span><i class="fas fa-file-lines" style="margin-right: 8px;"></i>${ch.title}</span>
            <div class="chapter-item-actions">
                ${lastRead?.novelId === novelId && lastRead?.chapterIndex === index ? '<i class="fas fa-book-open" style="color: var(--accent); margin-right: 12px;"></i>' : ''}
                <button class="chapter-like-btn ${isChapterLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLikeChapter('${novelId}', ${index})">
                    <i class="${isChapterLiked ? 'fas' : 'far'} fa-heart"></i>
                    <span>${chapterLikes}</span>
                </button>
            </div>
        </div>
    `}).join('');
    
    document.getElementById('novelDetail').classList.remove('hidden');
}

// ============================================
// READER PAGE FUNCTIONS
// ============================================

/**
 * Update reader page
 */
async function updateReaderPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const novelId = urlParams.get('novelId');
    const chapterIndex = parseInt(urlParams.get('chapter') || '0');
    
    if (!novelId || isNaN(chapterIndex)) {
        window.location.href = `${BASE_URL}/`;
        return;
    }
    
    const novel = novels.find(n => n.id === novelId);
    if (!novel || chapterIndex >= novel.chapters.length) {
        showError('Chapter not found');
        return;
    }
    
    const chapter = novel.chapters[chapterIndex];
    
    document.getElementById('novelTitle').textContent = novel.title;
    document.getElementById('chapterTitle').textContent = chapter.title;
    
    // Save last read to Dreamlo
    await saveLastReadToDreamlo(novelId, chapterIndex, deviceId);
    saveLastRead(novelId, chapterIndex);
    
    // Track chapter view
    await trackChapterView(novelId, chapterIndex);
    
    const chapterSelect = document.getElementById('chapterSelect');
    chapterSelect.innerHTML = novel.chapters.map((ch, index) => 
        `<option value="${index}" ${index === chapterIndex ? 'selected' : ''}>${ch.title}</option>`
    ).join('');
    
    chapterSelect.onchange = (e) => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${e.target.value}`;
    };
    
    const prevBtn = document.getElementById('prevChapterBtn');
    const nextBtn = document.getElementById('nextChapterBtn');
    
    prevBtn.disabled = chapterIndex === 0;
    nextBtn.disabled = chapterIndex === novel.chapters.length - 1;
    
    prevBtn.onclick = () => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${chapterIndex - 1}`;
    };
    
    nextBtn.onclick = () => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${chapterIndex + 1}`;
    };
    
    // Reader like button
    const readerLikeBtn = document.getElementById('readerLikeBtn');
    const isLiked = userLikedChapters.includes(`${novelId}_${chapterIndex}`);
    const likes = parseInt(chapter.likes) || 0;
    if (readerLikeBtn) {
        readerLikeBtn.innerHTML = `
            <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
            <span>${likes}</span>
        `;
        readerLikeBtn.classList.toggle('liked', isLiked);
        readerLikeBtn.onclick = async () => {
            await toggleLikeChapter(novelId, chapterIndex);
            // Update UI
            const updatedNovel = novels.find(n => n.id === novelId);
            if (updatedNovel) {
                const updatedChapter = updatedNovel.chapters[chapterIndex];
                const isNowLiked = userLikedChapters.includes(`${novelId}_${chapterIndex}`);
                const newLikes = parseInt(updatedChapter.likes) || 0;
                readerLikeBtn.innerHTML = `
                    <i class="${isNowLiked ? 'fas' : 'far'} fa-heart"></i>
                    <span>${newLikes}</span>
                `;
                readerLikeBtn.classList.toggle('liked', isNowLiked);
            }
        };
    }
    
    await loadChapterContent(novelId, chapter.file);
    setupReaderSettings();
}

/**
 * Load chapter content
 */
async function loadChapterContent(novelId, fileName) {
    showLoading();
    try {
        const response = await fetch(`${BASE_URL}/chapters/${novelId}/${fileName}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to load chapter');
        const content = await response.text();
        
        document.getElementById('chapterContent').innerHTML = marked.parse(content);
    } catch (error) {
        showError('Failed to load chapter content');
        console.error('❌ Error loading chapter content:', error);
    } finally {
        hideLoading();
    }
}

/**
 * Setup reader settings
 */
function setupReaderSettings() {
    const content = document.getElementById('chapterContent');
    const fontSelect = document.getElementById('fontFamilySelect');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    
    const savedFont = localStorage.getItem('readerFont') || 'sans-serif';
    const savedSize = localStorage.getItem('readerFontSize') || '18';
    
    content.className = `chapter-content ${savedFont}`;
    content.style.fontSize = `${savedSize}px`;
    
    if (fontSizeValue) {
        fontSizeValue.textContent = `${savedSize}px`;
    }
    
    if (fontSelect) {
        fontSelect.value = savedFont;
        fontSelect.onchange = (e) => {
            const font = e.target.value;
            content.className = `chapter-content ${font}`;
            localStorage.setItem('readerFont', font);
        };
    }
    
    if (fontSizeSlider) {
        fontSizeSlider.value = savedSize;
        fontSizeSlider.oninput = (e) => {
            const size = e.target.value;
            content.style.fontSize = `${size}px`;
            if (fontSizeValue) {
                fontSizeValue.textContent = `${size}px`;
            }
            localStorage.setItem('readerFontSize', size);
        };
    }
}

// ============================================
// AUTO-REFRESH SYSTEM
// ============================================

/**
 * Setup auto-refresh
 */
function setupAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        checkForUpdates();
    }, 30000); // Check every 30 seconds
}

/**
 * Check for updates
 */
async function checkForUpdates() {
    try {
        const newNovels = await NovelDB.getAll();
        if (newNovels.length > 0 && previousData) {
            const newData = newNovels.map(n => ({
                ...n,
                chapters: [] // Will be populated
            }));
            
            // Update chapters
            const allChapters = await ChapterDB.getAll();
            for (const novel of newData) {
                novel.chapters = allChapters
                    .filter(c => c.novelId === novel.id)
                    .sort((a, b) => a.chapterIndex - b.chapterIndex)
                    .map(c => ({
                        title: c.title,
                        file: c.file,
                        likes: parseInt(c.likes) || 0,
                        views: parseInt(c.views) || 0
                    }));
            }
            
            if (JSON.stringify(previousData) !== JSON.stringify(newData)) {
                console.log('🔄 Data updated, refreshing...');
                novels = newData;
                previousData = newData;
                filteredNovels = [...novels];
                updateUI();
            }
        }
    } catch (e) {
        console.error('❌ Error checking for updates:', e);
    }
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

/**
 * Go to novel page
 */
window.goToNovel = function(novelId) {
    window.location.href = `${BASE_URL}/novel.html?id=${novelId}`;
};

/**
 * Go to chapter page
 */
window.goToChapter = function(novelId, chapterIndex) {
    window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${chapterIndex}`;
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show loading indicator
 */
function showLoading() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

/**
 * Hide loading indicator
 */
function hideLoading() {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

/**
 * Show error message
 */
function showError(message) {
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Highlight current page in navigation
 */
function highlightCurrentPage() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === './' || href === './bookmark.html') {
            if ((currentPath === '/light-novel/' || currentPath === '/light-novel/index.html') && href === './') {
                link.classList.add('active');
            } else if (currentPath === '/light-novel/bookmark.html' && href === './bookmark.html') {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        }
    });
}

// ============================================
// EVENT LISTENERS
// ============================================

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Settings button and modal
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const themeSelect = document.getElementById('themeSelect');
    const showReaderToolbarCheckbox = document.getElementById('showReaderToolbar');
    
    if (settingsBtn && settingsModal) {
        settingsBtn.onclick = () => {
            settingsModal.classList.remove('hidden');
        };
    }
    
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.onclick = () => {
            settingsModal.classList.add('hidden');
        };
        
        window.onclick = (event) => {
            if (event.target === settingsModal) {
                settingsModal.classList.add('hidden');
            }
        };
    }
    
    if (themeSelect) {
        themeSelect.onchange = (e) => {
            toggleTheme(e.target.value);
        };
    }
    
    if (showReaderToolbarCheckbox) {
        showReaderToolbarCheckbox.onchange = (e) => {
            toggleReaderToolbar(e.target.checked);
        };
    }
    
    // Toggle toolbar button in reader
    const toggleToolbarBtn = document.getElementById('toggleToolbarBtn');
    if (toggleToolbarBtn) {
        toggleToolbarBtn.onclick = () => {
            const toolbar = document.getElementById('readerToolbar');
            const isHidden = toolbar.classList.contains('hidden');
            toggleReaderToolbar(isHidden);
        };
    }
    
    // Scroll to top button
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (scrollBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 500) {
                scrollBtn.classList.remove('hidden');
            } else {
                scrollBtn.classList.add('hidden');
            }
        });
        
        scrollBtn.onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }
}

// ============================================
// GLOBAL EXPOSURE
// ============================================

// Make functions globally accessible
window.toggleLikeNovel = toggleLikeNovel;
window.toggleLikeChapter = toggleLikeChapter;
window.handleImageLoad = handleImageLoad;
window.handleImageError = handleImageError;
window.toggleCardBookmark = toggleCardBookmark;
window.goToNovel = goToNovel;
window.goToChapter = goToChapter;

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});

// ============================================
// CONSOLE HELPERS (Development)
// ============================================

// Expose some helpful debug functions
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.debug = {
        novels: () => console.log('Novels:', novels),
        bookmarks: () => console.log('Bookmarks:', bookmarks),
        lastRead: () => console.log('Last Read:', lastRead),
        deviceId: () => console.log('Device ID:', deviceId),
        likedNovels: () => console.log('Liked Novels:', userLikedNovels),
        likedChapters: () => console.log('Liked Chapters:', userLikedChapters),
        reload: async () => {
            await loadNovels();
            console.log('Reloaded!');
        },
        clearAll: async () => {
            await NovelDB.clear();
            await ChapterDB.clear();
            await UserReadsDB.clear();
            await UserBookmarksDB.clear();
            await UserLikesNovelDB.clear();
            await UserLikesChapterDB.clear();
            console.log('All data cleared!');
        }
    };
    console.log('🐛 Debug helpers available: window.debug');
}