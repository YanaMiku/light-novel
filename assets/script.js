// script.js - Light Novel Reader with Dreamlo Integration
// ============================================================

// State management
let novels = [];
let filteredNovels = [];
let bookmarks = [];
let lastRead = null;
let currentPage = 1;
let novelsPerPage = 24;
let previousData = null;
let autoRefreshInterval = null;

// Base URL for subdirectory
const BASE_URL = '/light-novel';

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// Dreamlo state
let dreamloAPI = null;
let deviceId = null;
let dreamloReady = false;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load Dreamlo first
    await loadDreamlo();
    
    // Load data
    await loadFromLocalStorage();
    await loadNovels();
    
    // Setup features
    setupAutoRefresh();
    setupEventListeners();
    highlightCurrentPage();
    loadTheme();
    loadReaderToolbarSetting();
    
    // Update UI
    await updateUI();
});

// ============================================================
// DREAMLO INITIALIZATION
// ============================================================

async function loadDreamlo() {
    return new Promise((resolve) => {
        // Check if DreamloAPI is already loaded
        if (typeof window.DreamloAPI !== 'undefined') {
            dreamloAPI = window.DreamloAPI;
            deviceId = dreamloAPI.DEVICE_ID;
            dreamloReady = true;
            console.log('[Dreamlo] API loaded successfully. Device ID:', deviceId);
            resolve();
            return;
        }

        // Wait for script to load
        let attempts = 0;
        const maxAttempts = 50;
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof window.DreamloAPI !== 'undefined') {
                dreamloAPI = window.DreamloAPI;
                deviceId = dreamloAPI.DEVICE_ID;
                dreamloReady = true;
                clearInterval(checkInterval);
                console.log('[Dreamlo] API loaded successfully. Device ID:', deviceId);
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.warn('[Dreamlo] API failed to load, using localStorage fallback');
                dreamloReady = false;
                resolve();
            }
        }, 100);
    });
}

// ============================================================
// LOCAL STORAGE (Fallback)
// ============================================================

function loadFromLocalStorage() {
    try {
        if (!dreamloReady) {
            bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
            lastRead = JSON.parse(localStorage.getItem('lastRead')) || null;
        } else {
            // Still load from localStorage for compatibility
            bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
            lastRead = JSON.parse(localStorage.getItem('lastRead')) || null;
        }
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        bookmarks = [];
        lastRead = null;
    }
}

function saveBookmarks() {
    if (!dreamloReady) {
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    }
}

function saveLastReadLocal(novelId, chapterIndex) {
    lastRead = { novelId, chapterIndex };
    if (!dreamloReady) {
        localStorage.setItem('lastRead', JSON.stringify(lastRead));
    }
}

// ============================================================
// THEME FUNCTIONS
// ============================================================

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.className = savedTheme === 'light' ? 'light-theme' : '';
    
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
}

function toggleTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
}

// ============================================================
// READER TOOLBAR SETTINGS
// ============================================================

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

// ============================================================
// IMAGE HANDLING
// ============================================================

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

// ============================================================
// BOOKMARK FUNCTIONS
// ============================================================

async function toggleCardBookmark(event, novelId) {
    event.stopPropagation();
    
    let isBookmarked = false;
    
    if (dreamloReady) {
        isBookmarked = await dreamloAPI.toggleBookmark(novelId);
    } else {
        const index = bookmarks.indexOf(novelId);
        if (index === -1) {
            bookmarks.push(novelId);
            isBookmarked = true;
        } else {
            bookmarks.splice(index, 1);
            isBookmarked = false;
        }
        saveBookmarks();
    }
    
    const btn = event.currentTarget;
    if (isBookmarked) {
        btn.classList.add('bookmarked');
        btn.innerHTML = '<i class="fas fa-bookmark"></i>';
    } else {
        btn.classList.remove('bookmarked');
        btn.innerHTML = '<i class="far fa-bookmark"></i>';
    }
    
    // Update bookmark page if open
    if (window.location.pathname === '/light-novel/bookmark.html' || 
        window.location.pathname === '/light-novel/bookmark') {
        await loadBookmarks();
    }
}

// ============================================================
// AUTO REFRESH SYSTEM
// ============================================================

function setupAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        checkForUpdates();
    }, 5000);
}

async function checkForUpdates() {
    try {
        const response = await fetch(`${BASE_URL}/data/novels.json?t=${Date.now()}`);
        const newData = await response.json();
        
        if (previousData && JSON.stringify(previousData) !== JSON.stringify(newData)) {
            console.log('Data updated, refreshing...');
            novels = newData;
            previousData = newData;
            await updateUI();
        } else if (!previousData) {
            previousData = newData;
        }
    } catch (e) {
        console.error('Error checking for updates:', e);
    }
}

// ============================================================
// LOAD NOVELS
// ============================================================

async function loadNovels() {
    showLoading();
    try {
        const response = await fetch(`${BASE_URL}/data/novels.json?t=` + Date.now());
        if (!response.ok) throw new Error('Failed to load novels');
        novels = await response.json();
        previousData = [...novels];
        filteredNovels = [...novels];
        await updateUI();
    } catch (error) {
        showError('Failed to load novels. Please try again.');
        console.error(error);
    } finally {
        hideLoading();
    }
}

// ============================================================
// UPDATE UI BASED ON CURRENT PAGE
// ============================================================

async function updateUI() {
    const path = window.location.pathname;
    
    if (path === '/light-novel/' || path === '/light-novel/index.html') {
        await updateHomePage();
    } else if (path === '/light-novel/novel.html') {
        await updateNovelDetailPage();
    } else if (path === '/light-novel/read.html') {
        await updateReaderPage();
    } else if (path === '/light-novel/bookmark.html') {
        await loadBookmarks();
    }
}

// ============================================================
// LOAD BOOKMARKS PAGE
// ============================================================

async function loadBookmarks() {
    const bookmarkGrid = document.getElementById('bookmarkGrid');
    const emptyState = document.getElementById('emptyBookmarks');
    
    if (!bookmarkGrid) return;
    
    let bookmarkedIds = [];
    
    if (dreamloReady) {
        bookmarkedIds = await dreamloAPI.getBookmarkedNovels();
    } else {
        bookmarkedIds = bookmarks;
    }
    
    const bookmarkedNovels = novels.filter(novel => bookmarkedIds.includes(novel.id));
    
    if (bookmarkedNovels.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        bookmarkGrid.innerHTML = '';
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
    let html = '';
    for (const novel of bookmarkedNovels) {
        let stats = { views: 0, likes: 0 };
        if (dreamloReady) {
            stats = await dreamloAPI.getNovelStats(novel.id);
        }
        html += `
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
                    <button class="card-bookmark-btn bookmarked" onclick="toggleCardBookmark(event, '${novel.id}')">
                        <i class="fas fa-bookmark"></i>
                    </button>
                    ${stats.views > 0 ? `<div class="card-views"><i class="fas fa-eye"></i> ${stats.views}</div>` : ''}
                </div>
                <div class="novel-info">
                    <h3 class="novel-title">${novel.title}</h3>
                    <div class="novel-meta">
                        <span class="status ${novel.status.toLowerCase()}">${novel.status}</span>
                        <span><i class="fas fa-file-lines"></i> ${novel.chapters.length}</span>
                    </div>
                    ${stats.likes > 0 ? `<div class="novel-stats"><i class="fas fa-heart"></i> ${stats.likes}</div>` : ''}
                </div>
            </div>
        `;
    }
    bookmarkGrid.innerHTML = html;
}

// ============================================================
// UPDATE CONTINUE READING SECTION
// ============================================================

async function updateContinueReading() {
    const continueSection = document.getElementById('continueReadingSection');
    const continueCard = document.getElementById('continueReadingCard');
    
    if (!continueSection || !continueCard) return;
    
    let lastReadData = null;
    
    if (dreamloReady) {
        const allLastReads = await dreamloAPI.getLastReadAll();
        if (allLastReads.length > 0) {
            // Get the most recent
            const sorted = allLastReads.sort((a, b) => 
                new Date(b.lastRead) - new Date(a.lastRead)
            );
            lastReadData = sorted[0];
        }
    } else if (lastRead) {
        lastReadData = lastRead;
    }
    
    if (!lastReadData) {
        continueSection.classList.add('hidden');
        return;
    }
    
    const novel = novels.find(n => n.id === lastReadData.novelId);
    if (!novel || lastReadData.chapterIndex >= novel.chapters.length) {
        continueSection.classList.add('hidden');
        return;
    }
    
    const chapter = novel.chapters[lastReadData.chapterIndex];
    continueCard.innerHTML = `
        <i class="fas fa-book-open"></i>
        <div class="continue-info">
            <h4>${novel.title}</h4>
            <p>${chapter.title}</p>
        </div>
    `;
    
    continueCard.onclick = () => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novel.id}&chapter=${lastReadData.chapterIndex}`;
    };
    
    continueSection.classList.remove('hidden');
}

// ============================================================
// HOME PAGE
// ============================================================

async function updateHomePage() {
    const novelGrid = document.getElementById('novelGrid');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const sortSelect = document.getElementById('sortSelect');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (!novelGrid) return;
    
    filterNovels();
    
    async function filterNovels() {
        const searchTerm = searchInput?.value.toLowerCase() || '';
        const sortBy = sortSelect?.value || 'az';
        
        filteredNovels = novels.filter(novel => 
            novel.title.toLowerCase().includes(searchTerm)
        );
        
        if (sortBy === 'az') {
            filteredNovels.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortBy === 'latest') {
            filteredNovels.sort((a, b) => new Date(b.created) - new Date(a.created));
        }
        
        currentPage = 1;
        await displayNovels();
    }
    
    async function displayNovels() {
        const start = 0;
        const end = currentPage * novelsPerPage;
        const novelsToShow = filteredNovels.slice(0, end);
        
        let html = '';
        for (const novel of novelsToShow) {
            let isBookmarked = false;
            let stats = { views: 0, likes: 0, isLiked: false };
            
            if (dreamloReady) {
                isBookmarked = await dreamloAPI.isBookmarked(novel.id);
                stats = await dreamloAPI.getNovelStats(novel.id);
            } else {
                isBookmarked = bookmarks.includes(novel.id);
            }
            
            html += `
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
                        <button class="card-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="toggleCardBookmark(event, '${novel.id}')">
                            <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
                        </button>
                        ${stats.views > 0 ? `<div class="card-views"><i class="fas fa-eye"></i> ${stats.views}</div>` : ''}
                    </div>
                    <div class="novel-info">
                        <h3 class="novel-title">${novel.title}</h3>
                        <div class="novel-meta">
                            <span class="status ${novel.status.toLowerCase()}">${novel.status}</span>
                            <span><i class="fas fa-file-lines"></i> ${novel.chapters.length}</span>
                        </div>
                        <div class="novel-stats">
                            ${stats.likes > 0 ? `<span><i class="fas fa-heart ${stats.isLiked ? 'liked' : ''}"></i> ${stats.likes}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        novelGrid.innerHTML = html;
        
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
    
    await displayNovels();
    await updateContinueReading();
}

// ============================================================
// NOVEL DETAIL PAGE
// ============================================================

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
    if (dreamloReady) {
        await dreamloAPI.incrementNovelView(novelId);
    }
    
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
    
    // Get stats
    let stats = { views: 0, likes: 0, isLiked: false };
    let isBookmarked = false;
    let lastReadChapter = null;
    
    if (dreamloReady) {
        stats = await dreamloAPI.getNovelStats(novelId);
        isBookmarked = stats.isBookmarked;
        lastReadChapter = stats.lastRead;
    } else {
        isBookmarked = bookmarks.includes(novel.id);
        lastReadChapter = lastRead?.novelId === novelId ? lastRead.chapterIndex : null;
    }
    
    document.getElementById('chapterCount').innerHTML = `<i class="fas fa-file-lines"></i> ${novel.chapters.length} chapters <i class="fas fa-eye" style="margin-left: 12px;"></i> ${stats.views} views`;
    document.getElementById('novelDescription').textContent = novel.description;
    
    // Detail page bookmark button
    const detailBookmarkBtn = document.getElementById('detailBookmarkBtn');
    if (detailBookmarkBtn) {
        detailBookmarkBtn.innerHTML = isBookmarked ? '<i class="fas fa-bookmark"></i>' : '<i class="far fa-bookmark"></i>';
        detailBookmarkBtn.classList.toggle('bookmarked', isBookmarked);
        detailBookmarkBtn.onclick = async (e) => {
            e.stopPropagation();
            await toggleCardBookmark(e, novel.id);
        };
    }
    
    // Like button
    const likeBtn = document.getElementById('likeBtn');
    if (likeBtn) {
        likeBtn.innerHTML = `
            <i class="fas fa-heart ${stats.isLiked ? 'liked' : ''}"></i>
            <span>${stats.likes}</span>
        `;
        likeBtn.onclick = async () => {
            if (dreamloReady) {
                const result = await dreamloAPI.toggleNovelLike(novelId);
                likeBtn.innerHTML = `
                    <i class="fas fa-heart ${result.liked ? 'liked' : ''}"></i>
                    <span>${result.total}</span>
                `;
            }
        };
    }
    
    // Chapter select dropdown
    const chapterSelect = document.getElementById('chapterSelect');
    chapterSelect.innerHTML = '<option value="">Quick jump to chapter...</option>' + 
        novel.chapters.map((ch, index) => 
            `<option value="${index}" ${lastReadChapter === index ? 'selected' : ''}>${ch.title}</option>`
        ).join('');
    
    chapterSelect.onchange = (e) => {
        if (e.target.value) {
            goToChapter(novelId, parseInt(e.target.value));
        }
    };
    
    // Chapter list
    const chapterList = document.getElementById('chapterList');
    let chapterHtml = '';
    for (let i = 0; i < novel.chapters.length; i++) {
        const ch = novel.chapters[i];
        let chapterStats = { views: 0, likes: 0 };
        if (dreamloReady) {
            chapterStats = {
                views: await dreamloAPI.getChapterViews(novelId, i),
                likes: await dreamloAPI.getChapterLikes(novelId, i)
            };
        }
        const isLastRead = lastReadChapter === i;
        chapterHtml += `
            <div class="chapter-item" onclick="goToChapter('${novelId}', ${i})">
                <span><i class="fas fa-file-lines" style="margin-right: 8px;"></i>${ch.title}</span>
                <div class="chapter-stats">
                    <span><i class="fas fa-eye"></i> ${chapterStats.views}</span>
                    <span><i class="fas fa-heart"></i> ${chapterStats.likes}</span>
                    ${isLastRead ? '<i class="fas fa-book-open" style="color: var(--accent);"></i>' : ''}
                </div>
            </div>
        `;
    }
    chapterList.innerHTML = chapterHtml;
    
    document.getElementById('novelDetail').classList.remove('hidden');
}

// ============================================================
// READER PAGE
// ============================================================

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
    
    // Track chapter view and save last read
    if (dreamloReady) {
        await dreamloAPI.incrementChapterView(novelId, chapterIndex);
        await dreamloAPI.saveLastRead(novelId, chapterIndex);
    } else {
        saveLastReadLocal(novelId, chapterIndex);
    }
    
    document.getElementById('novelTitle').textContent = novel.title;
    document.getElementById('chapterTitle').textContent = chapter.title;
    
    // Chapter select
    const chapterSelect = document.getElementById('chapterSelect');
    chapterSelect.innerHTML = novel.chapters.map((ch, index) => 
        `<option value="${index}" ${index === chapterIndex ? 'selected' : ''}>${ch.title}</option>`
    ).join('');
    
    chapterSelect.onchange = (e) => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${e.target.value}`;
    };
    
    // Navigation buttons
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
    
    // Chapter like button
    const chapterLikeBtn = document.getElementById('chapterLikeBtn');
    if (chapterLikeBtn && dreamloReady) {
        const isLiked = await dreamloAPI.isChapterLiked(novelId, chapterIndex);
        const likes = await dreamloAPI.getChapterLikes(novelId, chapterIndex);
        chapterLikeBtn.innerHTML = `
            <i class="fas fa-heart ${isLiked ? 'liked' : ''}"></i>
            <span>${likes}</span>
        `;
        chapterLikeBtn.onclick = async () => {
            const result = await dreamloAPI.toggleChapterLike(novelId, chapterIndex);
            chapterLikeBtn.innerHTML = `
                <i class="fas fa-heart ${result.liked ? 'liked' : ''}"></i>
                <span>${result.total}</span>
            `;
        };
    }
    
    await loadChapterContent(novelId, chapter.file);
    setupReaderSettings();
}

// ============================================================
// LOAD CHAPTER CONTENT
// ============================================================

async function loadChapterContent(novelId, fileName) {
    showLoading();
    try {
        const response = await fetch(`${BASE_URL}/chapters/${novelId}/${fileName}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to load chapter');
        const content = await response.text();
        
        // Parse markdown with marked
        if (typeof marked !== 'undefined') {
            document.getElementById('chapterContent').innerHTML = marked.parse(content);
        } else {
            // Fallback: just show plain text
            document.getElementById('chapterContent').innerHTML = `<pre>${content}</pre>`;
        }
    } catch (error) {
        showError('Failed to load chapter content');
        console.error(error);
    } finally {
        hideLoading();
    }
}

// ============================================================
// READER SETTINGS
// ============================================================

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

// ============================================================
// NAVIGATION FUNCTIONS
// ============================================================

window.goToNovel = function(novelId) {
    window.location.href = `${BASE_URL}/novel.html?id=${novelId}`;
};

window.goToChapter = function(novelId, chapterIndex) {
    window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${chapterIndex}`;
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function showLoading() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
}

function showError(message) {
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 5000);
    }
}

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

// ============================================================
// EVENT LISTENERS
// ============================================================

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
    
    // Back button handler
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = `${BASE_URL}/`;
        };
    }
}

// ============================================================
// GLOBAL EXPORTS
// ============================================================

window.handleImageLoad = handleImageLoad;
window.handleImageError = handleImageError;
window.toggleCardBookmark = toggleCardBookmark;

// ============================================================
// CLEANUP
// ============================================================

window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});

// ============================================================
// CONSOLE LOG FOR DEBUGGING
// ============================================================

console.log('[Light Novel Reader] Script loaded successfully');
console.log(`[Light Novel Reader] Dreamlo status: ${dreamloReady ? 'Connected' : 'Fallback mode'}`);
if (dreamloReady) {
    console.log(`[Light Novel Reader] Device ID: ${deviceId}`);
}