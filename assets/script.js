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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    loadNovels();
    setupAutoRefresh();
    setupEventListeners();
    highlightCurrentPage();
    updateContinueReading();
    loadTheme();
    loadReaderToolbarSetting();
});

// Load from localStorage
function loadFromLocalStorage() {
    try {
        bookmarks = JSON.parse(localStorage.getItem('bookmarks')) || [];
        lastRead = JSON.parse(localStorage.getItem('lastRead')) || null;
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        bookmarks = [];
        lastRead = null;
    }
}

// Save to localStorage
function saveBookmarks() {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
}

function saveLastRead(novelId, chapterIndex) {
    lastRead = { novelId, chapterIndex };
    localStorage.setItem('lastRead', JSON.stringify(lastRead));
}

// Theme functions
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

// Reader toolbar setting
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

// Image handling
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

// Bookmark toggle on card
function toggleCardBookmark(event, novelId) {
    event.stopPropagation();
    
    const index = bookmarks.indexOf(novelId);
    const btn = event.currentTarget;
    
    if (index === -1) {
        bookmarks.push(novelId);
        btn.classList.add('bookmarked');
        btn.innerHTML = '<i class="fas fa-bookmark"></i>';
    } else {
        bookmarks.splice(index, 1);
        btn.classList.remove('bookmarked');
        btn.innerHTML = '<i class="far fa-bookmark"></i>';
    }
    saveBookmarks();
    
    // Update bookmark page if open
    if (window.location.pathname === '/light-novel/bookmark.html') {
        loadBookmarks();
    }
}

// Auto refresh system
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
            updateUI();
        } else if (!previousData) {
            previousData = newData;
        }
    } catch (e) {
        console.error('Error checking for updates:', e);
    }
}

// Load novels
async function loadNovels() {
    showLoading();
    try {
        const response = await fetch(`${BASE_URL}/data/novels.json?t=` + Date.now());
        if (!response.ok) throw new Error('Failed to load novels');
        novels = await response.json();
        previousData = [...novels];
        filteredNovels = [...novels];
        updateUI();
    } catch (error) {
        showError('Failed to load novels. Please try again.');
        console.error(error);
    } finally {
        hideLoading();
    }
}

// Update UI based on current page
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

// Load bookmarks page
function loadBookmarks() {
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
    
    bookmarkGrid.innerHTML = bookmarkedNovels.map(novel => `
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
            </div>
            <div class="novel-info">
                <h3 class="novel-title">${novel.title}</h3>
                <div class="novel-meta">
                    <span class="status ${novel.status.toLowerCase()}">${novel.status}</span>
                    <span><i class="fas fa-file-lines"></i> ${novel.chapters.length}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Update continue reading section
function updateContinueReading() {
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
    `;
    
    continueCard.onclick = () => {
        window.location.href = `${BASE_URL}/read.html?novelId=${novel.id}&chapter=${lastRead.chapterIndex}`;
    };
    
    continueSection.classList.remove('hidden');
}

// Home page functions
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
                    <button class="card-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="toggleCardBookmark(event, '${novel.id}')">
                        <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
                    </button>
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

// Novel detail page
function updateNovelDetailPage() {
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
    
    document.getElementById('chapterCount').innerHTML = `<i class="fas fa-file-lines"></i> ${novel.chapters.length} chapters`;
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
    
    const chapterSelect = document.getElementById('chapterSelect');
    chapterSelect.innerHTML = '<option value="">Quick jump to chapter...</option>' + 
        novel.chapters.map((ch, index) => 
            `<option value="${index}">${ch.title}</option>`
        ).join('');
    
    chapterSelect.onchange = (e) => {
        if (e.target.value) {
            goToChapter(novelId, parseInt(e.target.value));
        }
    };
    
    const chapterList = document.getElementById('chapterList');
    chapterList.innerHTML = novel.chapters.map((ch, index) => `
        <div class="chapter-item" onclick="goToChapter('${novelId}', ${index})">
            <span><i class="fas fa-file-lines" style="margin-right: 8px;"></i>${ch.title}</span>
            ${lastRead?.novelId === novelId && lastRead?.chapterIndex === index ? '<i class="fas fa-book-open" style="color: var(--accent);"></i>' : ''}
        </div>
    `).join('');
    
    document.getElementById('novelDetail').classList.remove('hidden');
}

// Reader page
function updateReaderPage() {
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
    
    saveLastRead(novelId, chapterIndex);
    
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
    
    loadChapterContent(novelId, chapter.file);
    setupReaderSettings();
}

async function loadChapterContent(novelId, fileName) {
    showLoading();
    try {
        const response = await fetch(`${BASE_URL}/chapters/${novelId}/${fileName}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to load chapter');
        const content = await response.text();
        
        document.getElementById('chapterContent').innerHTML = marked.parse(content);
    } catch (error) {
        showError('Failed to load chapter content');
        console.error(error);
    } finally {
        hideLoading();
    }
}

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

// Navigation functions
window.goToNovel = function(novelId) {
    window.location.href = `${BASE_URL}/novel.html?id=${novelId}`;
};

window.goToChapter = function(novelId, chapterIndex) {
    window.location.href = `${BASE_URL}/read.html?novelId=${novelId}&chapter=${chapterIndex}`;
};

// Utility functions
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

// Make functions global
window.handleImageLoad = handleImageLoad;
window.handleImageError = handleImageError;
window.toggleCardBookmark = toggleCardBookmark;

window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});