// dreamlo-data.js - Complete Data Management Layer with Dreamlo

// ============================================
// CONFIGURATION
// ============================================

const DREAMLO_PUBLIC_KEY = '6a5a0ac18f40bb121856b2cc';
const DREAMLO_PRIVATE_KEY = 'jDm92YKtZke-w_mM71u2iQtQEmMcX5x0utoueI0yKmJQ';
const CACHE_DURATION = 60000; // 1 minute cache for stats

// ============================================
// INITIALIZATION
// ============================================

const dreamlo = new DreamloClient(DREAMLO_PUBLIC_KEY, DREAMLO_PRIVATE_KEY);
const deviceManager = new DeviceManager();
const DEVICE_ID = deviceManager.getDeviceId();
const SESSION_ID = deviceManager.getSessionId();

// Stats cache
let statsCache = new Map();
let cacheTimestamps = new Map();

// ============================================
// DATA TYPE CONSTANTS
// ============================================

const DATA_TYPES = {
    NOVEL_VIEW: 'novel_view',
    CHAPTER_VIEW: 'chapter_view',
    NOVEL_BOOKMARK: 'novel_bookmark',
    NOVEL_LIKE: 'novel_like',
    CHAPTER_LIKE: 'chapter_like',
    LAST_READ: 'last_read',
    NOVEL_RATING: 'novel_rating',
    USER_ACTIVITY: 'user_activity'
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get data key with device and novel
function getDataKey(type, novelId, chapterIndex = null) {
    if (chapterIndex !== null && chapterIndex !== undefined) {
        return `${DEVICE_ID}_${type}_${novelId}_${chapterIndex}`;
    }
    return `${DEVICE_ID}_${type}_${novelId}`;
}

// Get total count key
function getTotalKey(type, novelId, chapterIndex = null) {
    if (chapterIndex !== null && chapterIndex !== undefined) {
        return `TOTAL_${type}_${novelId}_${chapterIndex}`;
    }
    return `TOTAL_${type}_${novelId}`;
}

// Get all entries with caching
async function getEntriesWithCache(key, forceRefresh = false) {
    if (!forceRefresh && cacheTimestamps.has(key)) {
        const timestamp = cacheTimestamps.get(key);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return statsCache.get(key);
        }
    }
    
    const result = await dreamlo.fetchEntries();
    statsCache.set(key, result);
    cacheTimestamps.set(key, Date.now());
    return result;
}

// Get single entry with caching
async function getEntryWithCache(key, name, forceRefresh = false) {
    if (!forceRefresh && cacheTimestamps.has(key)) {
        const timestamp = cacheTimestamps.get(key);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return statsCache.get(key);
        }
    }
    
    const result = await dreamlo.fetchEntry(name);
    statsCache.set(key, result);
    cacheTimestamps.set(key, Date.now());
    return result;
}

// Clear cache for specific key
function clearCache(key) {
    statsCache.delete(key);
    cacheTimestamps.delete(key);
}

// Clear all cache
function clearAllCache() {
    statsCache.clear();
    cacheTimestamps.clear();
}

// ============================================
// NOVEL VIEWS
// ============================================

async function incrementNovelView(novelId) {
    try {
        const userKey = getDataKey(DATA_TYPES.NOVEL_VIEW, novelId);
        const userEntry = await getEntryWithCache(`entry_${userKey}`, userKey);
        const userCount = userEntry ? parseInt(userEntry.score) + 1 : 1;
        
        await dreamlo.submitData(
            userKey, 
            userCount, 
            0, 
            JSON.stringify({ 
                novelId, 
                deviceId: DEVICE_ID,
                sessionId: SESSION_ID,
                lastViewed: new Date().toISOString()
            })
        );

        const totalKey = getTotalKey(DATA_TYPES.NOVEL_VIEW, novelId);
        const totalEntry = await getEntryWithCache(`entry_${totalKey}`, totalKey);
        const totalCount = totalEntry ? parseInt(totalEntry.score) + 1 : 1;
        await dreamlo.submitData(totalKey, totalCount);
        
        // Clear caches
        clearCache(`entry_${userKey}`);
        clearCache(`entry_${totalKey}`);
        clearCache(`novel_stats_${novelId}`);
        
        return true;
    } catch (error) {
        console.error('[Dreamlo] Error incrementing novel view:', error);
        return false;
    }
}

async function getNovelViews(novelId, forceRefresh = false) {
    try {
        const totalKey = getTotalKey(DATA_TYPES.NOVEL_VIEW, novelId);
        const entry = await getEntryWithCache(
            `entry_${totalKey}`, 
            totalKey, 
            forceRefresh
        );
        return entry ? parseInt(entry.score) : 0;
    } catch (error) {
        console.error('[Dreamlo] Error getting novel views:', error);
        return 0;
    }
}

// ============================================
// CHAPTER VIEWS
// ============================================

async function incrementChapterView(novelId, chapterIndex) {
    try {
        const userKey = getDataKey(DATA_TYPES.CHAPTER_VIEW, novelId, chapterIndex);
        const userEntry = await getEntryWithCache(`entry_${userKey}`, userKey);
        const userCount = userEntry ? parseInt(userEntry.score) + 1 : 1;
        
        await dreamlo.submitData(
            userKey, 
            userCount, 
            0, 
            JSON.stringify({ 
                novelId, 
                chapterIndex,
                deviceId: DEVICE_ID,
                sessionId: SESSION_ID,
                lastViewed: new Date().toISOString()
            })
        );

        const totalKey = getTotalKey(DATA_TYPES.CHAPTER_VIEW, novelId, chapterIndex);
        const totalEntry = await getEntryWithCache(`entry_${totalKey}`, totalKey);
        const totalCount = totalEntry ? parseInt(totalEntry.score) + 1 : 1;
        await dreamlo.submitData(totalKey, totalCount);
        
        // Clear caches
        clearCache(`entry_${userKey}`);
        clearCache(`entry_${totalKey}`);
        clearCache(`chapter_stats_${novelId}_${chapterIndex}`);
        
        return true;
    } catch (error) {
        console.error('[Dreamlo] Error incrementing chapter view:', error);
        return false;
    }
}

async function getChapterViews(novelId, chapterIndex, forceRefresh = false) {
    try {
        const totalKey = getTotalKey(DATA_TYPES.CHAPTER_VIEW, novelId, chapterIndex);
        const entry = await getEntryWithCache(
            `entry_${totalKey}`, 
            totalKey, 
            forceRefresh
        );
        return entry ? parseInt(entry.score) : 0;
    } catch (error) {
        console.error('[Dreamlo] Error getting chapter views:', error);
        return 0;
    }
}

// ============================================
// BOOKMARKS
// ============================================

async function toggleBookmark(novelId) {
    try {
        const key = getDataKey(DATA_TYPES.NOVEL_BOOKMARK, novelId);
        const entry = await getEntryWithCache(`entry_${key}`, key);
        
        if (entry) {
            await dreamlo.deleteData(key);
            clearCache(`entry_${key}`);
            clearCache(`bookmarks_${DEVICE_ID}`);
            clearCache(`novel_stats_${novelId}`);
            return false;
        } else {
            await dreamlo.submitData(
                key, 
                1, 
                0, 
                JSON.stringify({ 
                    novelId, 
                    deviceId: DEVICE_ID,
                    sessionId: SESSION_ID,
                    bookmarkedAt: new Date().toISOString()
                })
            );
            clearCache(`entry_${key}`);
            clearCache(`bookmarks_${DEVICE_ID}`);
            clearCache(`novel_stats_${novelId}`);
            return true;
        }
    } catch (error) {
        console.error('[Dreamlo] Error toggling bookmark:', error);
        return false;
    }
}

async function isBookmarked(novelId, forceRefresh = false) {
    try {
        const key = getDataKey(DATA_TYPES.NOVEL_BOOKMARK, novelId);
        const entry = await getEntryWithCache(
            `entry_${key}`, 
            key, 
            forceRefresh
        );
        return !!entry;
    } catch (error) {
        console.error('[Dreamlo] Error checking bookmark:', error);
        return false;
    }
}

async function getBookmarkedNovels(forceRefresh = false) {
    try {
        const cacheKey = `bookmarks_${DEVICE_ID}`;
        if (!forceRefresh && cacheTimestamps.has(cacheKey)) {
            const timestamp = cacheTimestamps.get(cacheKey);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return statsCache.get(cacheKey) || [];
            }
        }
        
        const entries = await dreamlo.fetchEntries();
        const bookmarks = entries.filter(entry => 
            entry.name.includes(DATA_TYPES.NOVEL_BOOKMARK) && 
            entry.name.includes(DEVICE_ID)
        );
        
        const result = bookmarks.map(entry => {
            const parts = entry.name.split('_');
            return parts[parts.length - 1];
        });
        
        statsCache.set(cacheKey, result);
        cacheTimestamps.set(cacheKey, Date.now());
        
        return result;
    } catch (error) {
        console.error('[Dreamlo] Error getting bookmarks:', error);
        return [];
    }
}

// ============================================
// LAST READ
// ============================================

async function saveLastRead(novelId, chapterIndex) {
    try {
        const key = getDataKey(DATA_TYPES.LAST_READ, novelId);
        await dreamlo.submitData(
            key, 
            chapterIndex, 
            Math.floor(Date.now() / 1000),
            JSON.stringify({ 
                novelId, 
                chapterIndex,
                deviceId: DEVICE_ID,
                sessionId: SESSION_ID,
                lastRead: new Date().toISOString()
            })
        );
        clearCache(`entry_${key}`);
        clearCache(`last_read_${DEVICE_ID}`);
        clearCache(`novel_stats_${novelId}`);
        return true;
    } catch (error) {
        console.error('[Dreamlo] Error saving last read:', error);
        return false;
    }
}

async function getLastRead(novelId, forceRefresh = false) {
    try {
        const key = getDataKey(DATA_TYPES.LAST_READ, novelId);
        const entry = await getEntryWithCache(
            `entry_${key}`, 
            key, 
            forceRefresh
        );
        if (entry) {
            const data = JSON.parse(entry.text);
            return data.chapterIndex;
        }
        return null;
    } catch (error) {
        console.error('[Dreamlo] Error getting last read:', error);
        return null;
    }
}

async function getLastReadAll(forceRefresh = false) {
    try {
        const cacheKey = `last_read_${DEVICE_ID}`;
        if (!forceRefresh && cacheTimestamps.has(cacheKey)) {
            const timestamp = cacheTimestamps.get(cacheKey);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return statsCache.get(cacheKey) || [];
            }
        }
        
        const entries = await dreamlo.fetchEntries();
        const lastReads = entries.filter(entry => 
            entry.name.includes(DATA_TYPES.LAST_READ) && 
            entry.name.includes(DEVICE_ID)
        );
        
        const result = lastReads.map(entry => {
            const data = JSON.parse(entry.text);
            return {
                novelId: data.novelId,
                chapterIndex: data.chapterIndex,
                lastRead: data.lastRead
            };
        }).sort((a, b) => new Date(b.lastRead) - new Date(a.lastRead));
        
        statsCache.set(cacheKey, result);
        cacheTimestamps.set(cacheKey, Date.now());
        
        return result;
    } catch (error) {
        console.error('[Dreamlo] Error getting last read all:', error);
        return [];
    }
}

// ============================================
// NOVEL LIKES
// ============================================

async function toggleNovelLike(novelId) {
    try {
        const userKey = getDataKey(DATA_TYPES.NOVEL_LIKE, novelId);
        const userEntry = await getEntryWithCache(`entry_${userKey}`, userKey);
        
        if (userEntry) {
            // Unlike
            await dreamlo.deleteData(userKey);
            
            const totalKey = getTotalKey(DATA_TYPES.NOVEL_LIKE, novelId);
            const totalEntry = await getEntryWithCache(`entry_${totalKey}`, totalKey);
            if (totalEntry) {
                const newTotal = Math.max(0, parseInt(totalEntry.score) - 1);
                await dreamlo.submitData(totalKey, newTotal);
            }
            
            // Clear caches
            clearCache(`entry_${userKey}`);
            clearCache(`entry_${totalKey}`);
            clearCache(`novel_stats_${novelId}`);
            clearCache(`liked_novels_${DEVICE_ID}`);
            
            const total = await getNovelLikes(novelId, true);
            return { liked: false, total };
        } else {
            // Like
            await dreamlo.submitData(
                userKey, 
                1, 
                0, 
                JSON.stringify({ 
                    novelId, 
                    deviceId: DEVICE_ID,
                    sessionId: SESSION_ID,
                    likedAt: new Date().toISOString()
                })
            );
            
            const totalKey = getTotalKey(DATA_TYPES.NOVEL_LIKE, novelId);
            const totalEntry = await getEntryWithCache(`entry_${totalKey}`, totalKey);
            const newTotal = totalEntry ? parseInt(totalEntry.score) + 1 : 1;
            await dreamlo.submitData(totalKey, newTotal);
            
            // Clear caches
            clearCache(`entry_${userKey}`);
            clearCache(`entry_${totalKey}`);
            clearCache(`novel_stats_${novelId}`);
            clearCache(`liked_novels_${DEVICE_ID}`);
            
            return { liked: true, total: newTotal };
        }
    } catch (error) {
        console.error('[Dreamlo] Error toggling novel like:', error);
        return { liked: false, total: 0 };
    }
}

async function isNovelLiked(novelId, forceRefresh = false) {
    try {
        const key = getDataKey(DATA_TYPES.NOVEL_LIKE, novelId);
        const entry = await getEntryWithCache(
            `entry_${key}`, 
            key, 
            forceRefresh
        );
        return !!entry;
    } catch (error) {
        console.error('[Dreamlo] Error checking novel like:', error);
        return false;
    }
}

async function getNovelLikes(novelId, forceRefresh = false) {
    try {
        const totalKey = getTotalKey(DATA_TYPES.NOVEL_LIKE, novelId);
        const entry = await getEntryWithCache(
            `entry_${totalKey}`, 
            totalKey, 
            forceRefresh
        );
        return entry ? parseInt(entry.score) : 0;
    } catch (error) {
        console.error('[Dreamlo] Error getting novel likes:', error);
        return 0;
    }
}

async function getLikedNovels(forceRefresh = false) {
    try {
        const cacheKey = `liked_novels_${DEVICE_ID}`;
        if (!forceRefresh && cacheTimestamps.has(cacheKey)) {
            const timestamp = cacheTimestamps.get(cacheKey);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return statsCache.get(cacheKey) || [];
            }
        }
        
        const entries = await dreamlo.fetchEntries();
        const likes = entries.filter(entry => 
            entry.name.includes(DATA_TYPES.NOVEL_LIKE) && 
            entry.name.includes(DEVICE_ID)
        );
        
        const result = likes.map(entry => {
            const parts = entry.name.split('_');
            return parts[parts.length - 1];
        });
        
        statsCache.set(cacheKey, result);
        cacheTimestamps.set(cacheKey, Date.now());
        
        return result;
    } catch (error) {
        console.error('[Dreamlo] Error getting liked novels:', error);
        return [];
    }
}

// ============================================
// CHAPTER LIKES
// ============================================

async function toggleChapterLike(novelId, chapterIndex) {
    try {
        const userKey = getDataKey(DATA_TYPES.CHAPTER_LIKE, novelId, chapterIndex);
        const userEntry = await getEntryWithCache(`entry_${userKey}`, userKey);
        
        if (userEntry) {
            // Unlike
            await dreamlo.deleteData(userKey);
            
            const totalKey = getTotalKey(DATA_TYPES.CHAPTER_LIKE, novelId, chapterIndex);
            const totalEntry = await getEntryWithCache(`entry_${totalKey}`, totalKey);
            if (totalEntry) {
                const newTotal = Math.max(0, parseInt(totalEntry.score) - 1);
                await dreamlo.submitData(totalKey, newTotal);
            }
            
            // Clear caches
            clearCache(`entry_${userKey}`);
            clearCache(`entry_${totalKey}`);
            clearCache(`chapter_stats_${novelId}_${chapterIndex}`);
            
            const total = await getChapterLikes(novelId, chapterIndex, true);
            return { liked: false, total };
        } else {
            // Like
            await dreamlo.submitData(
                userKey, 
                1, 
                0, 
                JSON.stringify({ 
                    novelId, 
                    chapterIndex,
                    deviceId: DEVICE_ID,
                    sessionId: SESSION_ID,
                    likedAt: new Date().toISOString()
                })
            );
            
            const totalKey = getTotalKey(DATA_TYPES.CHAPTER_LIKE, novelId, chapterIndex);
            const totalEntry = await getEntryWithCache(`entry_${totalKey}`, totalKey);
            const newTotal = totalEntry ? parseInt(totalEntry.score) + 1 : 1;
            await dreamlo.submitData(totalKey, newTotal);
            
            // Clear caches
            clearCache(`entry_${userKey}`);
            clearCache(`entry_${totalKey}`);
            clearCache(`chapter_stats_${novelId}_${chapterIndex}`);
            
            return { liked: true, total: newTotal };
        }
    } catch (error) {
        console.error('[Dreamlo] Error toggling chapter like:', error);
        return { liked: false, total: 0 };
    }
}

async function isChapterLiked(novelId, chapterIndex, forceRefresh = false) {
    try {
        const key = getDataKey(DATA_TYPES.CHAPTER_LIKE, novelId, chapterIndex);
        const entry = await getEntryWithCache(
            `entry_${key}`, 
            key, 
            forceRefresh
        );
        return !!entry;
    } catch (error) {
        console.error('[Dreamlo] Error checking chapter like:', error);
        return false;
    }
}

async function getChapterLikes(novelId, chapterIndex, forceRefresh = false) {
    try {
        const totalKey = getTotalKey(DATA_TYPES.CHAPTER_LIKE, novelId, chapterIndex);
        const entry = await getEntryWithCache(
            `entry_${totalKey}`, 
            totalKey, 
            forceRefresh
        );
        return entry ? parseInt(entry.score) : 0;
    } catch (error) {
        console.error('[Dreamlo] Error getting chapter likes:', error);
        return 0;
    }
}

// ============================================
// NOVEL RATINGS (Bonus Feature)
// ============================================

async function rateNovel(novelId, rating) {
    try {
        const key = getDataKey(DATA_TYPES.NOVEL_RATING, novelId);
        const entry = await getEntryWithCache(`entry_${key}`, key);
        
        if (entry) {
            // Update existing rating
            const oldRating = parseInt(entry.score);
            await dreamlo.submitData(
                key, 
                rating, 
                0, 
                JSON.stringify({ 
                    novelId, 
                    deviceId: DEVICE_ID,
                    rating,
                    updatedAt: new Date().toISOString()
                })
            );
        } else {
            // New rating
            await dreamlo.submitData(
                key, 
                rating, 
                0, 
                JSON.stringify({ 
                    novelId, 
                    deviceId: DEVICE_ID,
                    rating,
                    createdAt: new Date().toISOString()
                })
            );
        }
        
        clearCache(`entry_${key}`);
        clearCache(`novel_stats_${novelId}`);
        return true;
    } catch (error) {
        console.error('[Dreamlo] Error rating novel:', error);
        return false;
    }
}

async function getNovelRating(novelId, forceRefresh = false) {
    try {
        const key = getDataKey(DATA_TYPES.NOVEL_RATING, novelId);
        const entry = await getEntryWithCache(
            `entry_${key}`, 
            key, 
            forceRefresh
        );
        return entry ? parseInt(entry.score) : null;
    } catch (error) {
        console.error('[Dreamlo] Error getting novel rating:', error);
        return null;
    }
}

// ============================================
// GET ALL STATS FOR NOVEL
// ============================================

async function getNovelStats(novelId, forceRefresh = false) {
    try {
        const cacheKey = `novel_stats_${novelId}`;
        if (!forceRefresh && cacheTimestamps.has(cacheKey)) {
            const timestamp = cacheTimestamps.get(cacheKey);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return statsCache.get(cacheKey);
            }
        }
        
        const [views, likes, isLiked, isBookmarked, lastRead, rating] = await Promise.all([
            getNovelViews(novelId, forceRefresh),
            getNovelLikes(novelId, forceRefresh),
            isNovelLiked(novelId, forceRefresh),
            isBookmarked(novelId, forceRefresh),
            getLastRead(novelId, forceRefresh),
            getNovelRating(novelId, forceRefresh)
        ]);
        
        const result = {
            views,
            likes,
            isLiked,
            isBookmarked,
            lastRead,
            rating
        };
        
        statsCache.set(cacheKey, result);
        cacheTimestamps.set(cacheKey, Date.now());
        
        return result;
    } catch (error) {
        console.error('[Dreamlo] Error getting novel stats:', error);
        return {
            views: 0,
            likes: 0,
            isLiked: false,
            isBookmarked: false,
            lastRead: null,
            rating: null
        };
    }
}

// ============================================
// BULK OPERATIONS
// ============================================

async function getMultipleNovelStats(novelIds, forceRefresh = false) {
    try {
        const results = {};
        await Promise.all(novelIds.map(async (id) => {
            results[id] = await getNovelStats(id, forceRefresh);
        }));
        return results;
    } catch (error) {
        console.error('[Dreamlo] Error getting multiple novel stats:', error);
        return {};
    }
}

async function getTopNovels(limit = 10, sortBy = 'views') {
    try {
        const entries = await dreamlo.fetchEntries();
        
        // Get all novel view totals
        const novelViews = {};
        entries.forEach(entry => {
            if (entry.name.startsWith('TOTAL_novel_view_')) {
                const novelId = entry.name.replace('TOTAL_novel_view_', '');
                novelViews[novelId] = parseInt(entry.score);
            }
        });
        
        // Sort and get top
        const sorted = Object.entries(novelViews)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id, views]) => ({ id, views }));
        
        return sorted;
    } catch (error) {
        console.error('[Dreamlo] Error getting top novels:', error);
        return [];
    }
}

// ============================================
// USER ACTIVITY TRACKING
// ============================================

async function trackUserActivity(action, data = {}) {
    try {
        const key = `${DEVICE_ID}_${DATA_TYPES.USER_ACTIVITY}_${Date.now()}`;
        await dreamlo.submitData(
            key,
            1,
            0,
            JSON.stringify({
                deviceId: DEVICE_ID,
                sessionId: SESSION_ID,
                action,
                data,
                timestamp: new Date().toISOString()
            })
        );
        return true;
    } catch (error) {
        console.error('[Dreamlo] Error tracking user activity:', error);
        return false;
    }
}

async function getUserActivity(limit = 100) {
    try {
        const entries = await dreamlo.fetchEntries(limit);
        return entries
            .filter(entry => entry.name.includes(DATA_TYPES.USER_ACTIVITY))
            .map(entry => {
                try {
                    return JSON.parse(entry.text);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch (error) {
        console.error('[Dreamlo] Error getting user activity:', error);
        return [];
    }
}

// ============================================
// EXPORTS FOR BROWSER
// ============================================

if (typeof window !== 'undefined') {
    window.DreamloAPI = {
        // Clients
        dreamlo,
        deviceManager,
        
        // Constants
        DEVICE_ID,
        SESSION_ID,
        DATA_TYPES,
        
        // Novel Views
        incrementNovelView,
        getNovelViews,
        
        // Chapter Views
        incrementChapterView,
        getChapterViews,
        
        // Bookmarks
        toggleBookmark,
        isBookmarked,
        getBookmarkedNovels,
        
        // Last Read
        saveLastRead,
        getLastRead,
        getLastReadAll,
        
        // Novel Likes
        toggleNovelLike,
        isNovelLiked,
        getNovelLikes,
        getLikedNovels,
        
        // Chapter Likes
        toggleChapterLike,
        isChapterLiked,
        getChapterLikes,
        
        // Ratings
        rateNovel,
        getNovelRating,
        
        // Stats
        getNovelStats,
        getMultipleNovelStats,
        getTopNovels,
        
        // User Activity
        trackUserActivity,
        getUserActivity,
        
        // Cache Management
        clearCache,
        clearAllCache,
        
        // Utilities
        getDataKey,
        getTotalKey
    };
    
    console.log('[Dreamlo] API initialized successfully');
    console.log(`[Dreamlo] Device ID: ${DEVICE_ID}`);
    console.log(`[Dreamlo] Session ID: ${SESSION_ID}`);
}