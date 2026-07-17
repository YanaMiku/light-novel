// ============================================
// DREAMLO CONFIGURATION
// ============================================

// Dreamlo Credentials
const DREAMLO_PRIVATE_CODE = 'xgG-9ksqX0KWaWjmkqtNWgRYkXIvvm2ECB9HANrQR0-A';
const DREAMLO_PUBLIC_CODE = '6a5966a68f40bb1218557b92';

// PERBAIKAN: Gunakan HTTPS untuk menghindari mixed content
const DREAMLO_BASE_URL = `https://dreamlo.com/lb/${DREAMLO_PRIVATE_CODE}`;
const DREAMLO_PUBLIC_URL = `https://dreamlo.com/lb/${DREAMLO_PUBLIC_CODE}`;

// ============================================
// DEVICE ID MANAGEMENT
// ============================================

/**
 * Get or create a unique device ID stored in localStorage
 * This ensures each device has a persistent identity
 * @returns {string} Unique device identifier
 */
function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// ============================================
// DREAMLO DATABASE CLASS
// ============================================

/**
 * DreamloDB - A simple ORM for Dreamlo leaderboard API
 * Uses prefixes in the 'name' field to simulate tables
 */
class DreamloDB {
    /**
     * @param {string} tableName - The table/collection name (used as prefix)
     */
    constructor(tableName) {
        this.tableName = tableName;
    }

    /**
     * Get all records from this table
     * @returns {Promise<Array>} Array of records
     */
    async getAll() {
        try {
            const response = await fetch(`${DREAMLO_PUBLIC_URL}/json`, {
                mode: 'cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // Check if data exists
            if (!data || !data.dreamlo || !data.dreamlo.leaderboard) {
                return [];
            }
            
            // Get entries (can be single object or array)
            let entries = data.dreamlo.leaderboard.entry;
            if (!entries) return [];
            
            // Ensure entries is an array
            if (!Array.isArray(entries)) {
                entries = [entries];
            }
            
            // Filter records by table name prefix
            const records = entries
                .filter(entry => entry.name && entry.name.startsWith(this.tableName + '|'))
                .map(entry => {
                    const parts = entry.name.split('|');
                    const parsedData = this.parseData(entry);
                    return {
                        id: parts[1] || '',
                        ...parsedData,
                        score: parseInt(entry.score) || 0,
                        seconds: parseInt(entry.seconds) || 0,
                        text: entry.text || '',
                        // Dreamlo internal fields
                        _name: entry.name,
                        _score: entry.score,
                        _seconds: entry.seconds,
                        _text: entry.text
                    };
                });
            
            return records;
        } catch (error) {
            console.error(`Error fetching data from Dreamlo table "${this.tableName}":`, error);
            return [];
        }
    }

    /**
     * Parse additional data from text field
     * @param {Object} entry - Dreamlo entry object
     * @returns {Object} Parsed data
     */
    parseData(entry) {
        try {
            if (entry.text) {
                return JSON.parse(entry.text);
            }
        } catch (e) {
            // Not JSON, return empty
        }
        return {};
    }

    /**
     * Get a single record by ID
     * @param {string} id - Record ID
     * @returns {Promise<Object|null>} Record or null if not found
     */
    async get(id) {
        const records = await this.getAll();
        return records.find(record => record.id === id) || null;
    }

    /**
     * Get records by a specific field value
     * @param {string} field - Field name to filter by
     * @param {*} value - Value to match
     * @returns {Promise<Array>} Array of matching records
     */
    async getBy(field, value) {
        const records = await this.getAll();
        return records.filter(record => record[field] === value);
    }

    /**
     * Add or update a record
     * @param {Object} data - Record data
     * @param {string} data.id - Unique identifier (required)
     * @param {number} [data.score=0] - Score value (used for likes)
     * @param {number} [data.seconds=0] - Seconds value (used for additional data)
     * @param {*} [data.*] - Any other data will be stored in text field as JSON
     * @returns {Promise<string|null>} Response text or null on error
     */
    async save(data) {
        try {
            if (!data.id) {
                throw new Error('Record must have an "id" field');
            }

            // Create the name with table prefix
            const name = `${this.tableName}|${data.id}`;
            
            // Extract score and seconds, or use defaults
            const score = parseInt(data.score) || 0;
            const seconds = parseInt(data.seconds) || 0;
            
            // Store additional data as JSON in text field
            const textData = { ...data };
            delete textData.id;
            delete textData.score;
            delete textData.seconds;
            delete textData._name;
            delete textData._score;
            delete textData._seconds;
            delete textData._text;
            
            const text = JSON.stringify(textData);
            
            // Build the URL
            const url = `${DREAMLO_BASE_URL}/add/${encodeURIComponent(name)}/${score}/${seconds}/${encodeURIComponent(text)}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error saving to Dreamlo table "${this.tableName}":`, error);
            return null;
        }
    }

    /**
     * Delete a record by ID
     * @param {string} id - Record ID
     * @returns {Promise<string|null>} Response text or null on error
     */
    async delete(id) {
        try {
            const name = `${this.tableName}|${id}`;
            const url = `${DREAMLO_BASE_URL}/delete/${encodeURIComponent(name)}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error deleting from Dreamlo table "${this.tableName}":`, error);
            return null;
        }
    }

    /**
     * Delete all records in this table
     * @returns {Promise<boolean>} True if successful
     */
    async clear() {
        try {
            const records = await this.getAll();
            for (const record of records) {
                await this.delete(record.id);
            }
            return true;
        } catch (error) {
            console.error(`Error clearing Dreamlo table "${this.tableName}":`, error);
            return false;
        }
    }

    /**
     * Get count of records in this table
     * @returns {Promise<number>} Number of records
     */
    async count() {
        const records = await this.getAll();
        return records.length;
    }

    /**
     * Check if a record exists
     * @param {string} id - Record ID
     * @returns {Promise<boolean>} True if exists
     */
    async exists(id) {
        const record = await this.get(id);
        return record !== null;
    }

    /**
     * Update a specific field of a record
     * @param {string} id - Record ID
     * @param {string} field - Field name to update
     * @param {*} value - New value
     * @returns {Promise<boolean>} True if successful
     */
    async updateField(id, field, value) {
        try {
            const record = await this.get(id);
            if (!record) return false;
            
            record[field] = value;
            await this.save(record);
            return true;
        } catch (error) {
            console.error(`Error updating field in Dreamlo table "${this.tableName}":`, error);
            return false;
        }
    }

    /**
     * Increment a numeric field
     * @param {string} id - Record ID
     * @param {string} field - Field name to increment
     * @param {number} [amount=1] - Amount to increment by
     * @returns {Promise<boolean>} True if successful
     */
    async increment(id, field, amount = 1) {
        try {
            const record = await this.get(id);
            if (!record) return false;
            
            record[field] = (parseInt(record[field]) || 0) + amount;
            await this.save(record);
            return true;
        } catch (error) {
            console.error(`Error incrementing field in Dreamlo table "${this.tableName}":`, error);
            return false;
        }
    }

    /**
     * Decrement a numeric field
     * @param {string} id - Record ID
     * @param {string} field - Field name to decrement
     * @param {number} [amount=1] - Amount to decrement by
     * @returns {Promise<boolean>} True if successful
     */
    async decrement(id, field, amount = 1) {
        return this.increment(id, field, -amount);
    }

    /**
     * Get records with pagination
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Items per page
     * @returns {Promise<Object>} { data: Array, total: number, page: number, totalPages: number }
     */
    async paginate(page = 1, limit = 10) {
        const records = await this.getAll();
        const total = records.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const end = start + limit;
        
        return {
            data: records.slice(start, end),
            total,
            page,
            totalPages,
            limit
        };
    }
}

// ============================================
// DATABASE COLLECTIONS INSTANCES
// ============================================

// Main data tables
const NovelDB = new DreamloDB('novels');
const ChapterDB = new DreamloDB('chapters');

// User data tables (device-based)
const UserReadsDB = new DreamloDB('user_reads');
const UserBookmarksDB = new DreamloDB('user_bookmarks');
const UserLikesNovelDB = new DreamloDB('user_likes_novel');
const UserLikesChapterDB = new DreamloDB('user_likes_chapter');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sync local bookmarks with Dreamlo
 * @param {Array} localBookmarks - Array of novel IDs
 * @param {string} deviceId - Current device ID
 * @returns {Promise<void>}
 */
async function syncBookmarksToDreamlo(localBookmarks, deviceId) {
    try {
        const allBookmarks = await UserBookmarksDB.getAll();
        const existingBookmarks = allBookmarks.filter(b => b.deviceId === deviceId);
        
        // Remove bookmarks that are no longer in the list
        for (const b of existingBookmarks) {
            if (!localBookmarks.includes(b.novelId)) {
                await UserBookmarksDB.delete(b.id);
            }
        }
        
        // Add new bookmarks
        const existingIds = existingBookmarks.map(b => b.novelId);
        for (const novelId of localBookmarks) {
            if (!existingIds.includes(novelId)) {
                await UserBookmarksDB.save({
                    id: `${deviceId}_${novelId}`,
                    deviceId: deviceId,
                    novelId: novelId,
                    score: 1,
                    seconds: 0,
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.error('Error syncing bookmarks to Dreamlo:', e);
    }
}

/**
 * Sync local likes with Dreamlo
 * @param {Array} localLikes - Array of novel IDs
 * @param {string} deviceId - Current device ID
 * @returns {Promise<void>}
 */
async function syncLikesToDreamlo(localLikes, deviceId) {
    try {
        const allLikes = await UserLikesNovelDB.getAll();
        const existingLikes = allLikes.filter(l => l.deviceId === deviceId);
        
        // Remove likes that are no longer in the list
        for (const l of existingLikes) {
            if (!localLikes.includes(l.novelId)) {
                await UserLikesNovelDB.delete(l.id);
            }
        }
        
        // Add new likes
        const existingIds = existingLikes.map(l => l.novelId);
        for (const novelId of localLikes) {
            if (!existingIds.includes(novelId)) {
                await UserLikesNovelDB.save({
                    id: `${deviceId}_${novelId}`,
                    deviceId: deviceId,
                    novelId: novelId,
                    score: 1,
                    seconds: 0,
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.error('Error syncing likes to Dreamlo:', e);
    }
}

/**
 * Save last read to Dreamlo
 * @param {string} novelId - Novel ID
 * @param {number} chapterIndex - Chapter index
 * @param {string} deviceId - Current device ID
 * @returns {Promise<void>}
 */
async function saveLastReadToDreamlo(novelId, chapterIndex, deviceId) {
    try {
        await UserReadsDB.save({
            id: `${deviceId}_${novelId}_${chapterIndex}_${Date.now()}`,
            deviceId: deviceId,
            novelId: novelId,
            chapterIndex: chapterIndex,
            timestamp: new Date().toISOString(),
            score: 1,
            seconds: 0
        });
    } catch (e) {
        console.error('Error saving last read to Dreamlo:', e);
    }
}

/**
 * Get last read from Dreamlo for a device
 * @param {string} deviceId - Current device ID
 * @returns {Promise<Object|null>} { novelId, chapterIndex } or null
 */
async function getLastReadFromDreamlo(deviceId) {
    try {
        const allReads = await UserReadsDB.getAll();
        const userReads = allReads
            .filter(r => r.deviceId === deviceId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (userReads.length > 0) {
            return {
                novelId: userReads[0].novelId,
                chapterIndex: parseInt(userReads[0].chapterIndex)
            };
        }
        return null;
    } catch (e) {
        console.error('Error getting last read from Dreamlo:', e);
        return null;
    }
}

/**
 * Check if Dreamlo is accessible
 * @returns {Promise<boolean>} True if accessible
 */
async function checkDreamloConnection() {
    try {
        const response = await fetch(`${DREAMLO_PUBLIC_URL}/json`, { 
            method: 'HEAD'
        });
        return response.ok;
    } catch (e) {
        console.error('Dreamlo connection check failed:', e);
        return false;
    }
}

/**
 * Seed initial data from novels.json
 * @returns {Promise<boolean>} True if seeding was successful
 */
async function seedInitialData() {
    try {
        console.log('🌱 Seeding initial data to Dreamlo...');
        
        // Check if data already exists
        const existingNovels = await NovelDB.getAll();
        if (existingNovels.length > 0) {
            console.log(`✅ Data already exists (${existingNovels.length} novels), skipping seed`);
            return true;
        }
        
        // Get the base URL for fetching novels.json
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
        
        // Fetch novels.json
        console.log('📥 Fetching novels.json from:', `${baseUrl}/data/novels.json`);
        const response = await fetch(`${baseUrl}/data/novels.json?t=${Date.now()}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load novels.json: ${response.status} ${response.statusText}`);
        }
        
        const localNovels = await response.json();
        
        if (!localNovels || !Array.isArray(localNovels) || localNovels.length === 0) {
            console.warn('⚠️ No novels found in novels.json');
            return false;
        }
        
        console.log(`📚 Seeding ${localNovels.length} novels to Dreamlo...`);
        
        // Seed novels
        for (const novel of localNovels) {
            // Ensure required fields exist
            const novelData = {
                id: novel.id || `novel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                title: novel.title || 'Untitled Novel',
                cover: novel.cover || '',
                description: novel.description || '',
                status: novel.status || 'Ongoing',
                created: novel.created || new Date().toISOString().split('T')[0],
                views: 0,
                likes: 0,
                score: 0,
                seconds: 0
            };
            
            console.log(`  📖 Saving novel: ${novelData.title}`);
            await NovelDB.save(novelData);
            
            // Seed chapters
            if (novel.chapters && Array.isArray(novel.chapters) && novel.chapters.length > 0) {
                for (let i = 0; i < novel.chapters.length; i++) {
                    const chapter = novel.chapters[i];
                    await ChapterDB.save({
                        id: `${novelData.id}_${i}`,
                        novelId: novelData.id,
                        chapterIndex: i,
                        title: chapter.title || `Chapter ${i + 1}`,
                        file: chapter.file || `chapter${i + 1}.md`,
                        views: 0,
                        likes: 0,
                        score: 0,
                        seconds: 0
                    });
                }
                console.log(`  📑 Saved ${novel.chapters.length} chapters for ${novelData.title}`);
            }
        }
        
        console.log('✅ Seeding complete!');
        
        // Verify seeding
        const verifyNovels = await NovelDB.getAll();
        console.log(`📊 Verification: ${verifyNovels.length} novels in Dreamlo`);
        
        return true;
    } catch (error) {
        console.error('❌ Error seeding initial data:', error);
        console.error('Error details:', error.message);
        return false;
    }
}

// ============================================
// EXPORT FOR GLOBAL USE
// ============================================

// Expose database instances
window.DreamloDB = DreamloDB;
window.NovelDB = NovelDB;
window.ChapterDB = ChapterDB;
window.UserReadsDB = UserReadsDB;
window.UserBookmarksDB = UserBookmarksDB;
window.UserLikesNovelDB = UserLikesNovelDB;
window.UserLikesChapterDB = UserLikesChapterDB;

// Expose helper functions
window.getDeviceId = getDeviceId;
window.syncBookmarksToDreamlo = syncBookmarksToDreamlo;
window.syncLikesToDreamlo = syncLikesToDreamlo;
window.saveLastReadToDreamlo = saveLastReadToDreamlo;
window.getLastReadFromDreamlo = getLastReadFromDreamlo;
window.checkDreamloConnection = checkDreamloConnection;
window.seedInitialData = seedInitialData;

// Expose configuration
window.DREAMLO_PRIVATE_CODE = DREAMLO_PRIVATE_CODE;
window.DREAMLO_PUBLIC_CODE = DREAMLO_PUBLIC_CODE;
window.DREAMLO_BASE_URL = DREAMLO_BASE_URL;
window.DREAMLO_PUBLIC_URL = DREAMLO_PUBLIC_URL;

// ============================================
// INITIALIZATION
// ============================================

console.log('✅ Dreamlo Configuration Loaded');
console.log(`📊 Public Code: ${DREAMLO_PUBLIC_CODE}`);
console.log(`🔒 Private Code: ${DREAMLO_PRIVATE_CODE.substring(0, 10)}...`);

// Auto-connection test
(async function testConnection() {
    console.log('🔍 Testing Dreamlo connection...');
    const connected = await checkDreamloConnection();
    if (connected) {
        console.log('✅ Dreamlo connection successful');
        
        // Check if data exists, if not seed it
        const novels = await NovelDB.getAll();
        if (novels.length === 0) {
            console.log('📚 No data found, starting automatic seeding...');
            await seedInitialData();
        } else {
            console.log(`📚 Found ${novels.length} novels in Dreamlo`);
        }
    } else {
        console.warn('⚠️ Dreamlo connection failed - check your internet connection');
        console.warn('⚠️ The app will still work using cached data if available');
    }
})();

// ============================================
// DEBUG HELPERS (Development only)
// ============================================

// Expose debug helpers in development
if (window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('github.io')) {
    
    window.__dreamloDebug = {
        /**
         * Check all tables
         */
        checkAll: async function() {
            console.log('🔍 Checking all Dreamlo tables...');
            
            const novels = await NovelDB.getAll();
            console.log(`📚 Novels: ${novels.length}`);
            
            const chapters = await ChapterDB.getAll();
            console.log(`📑 Chapters: ${chapters.length}`);
            
            const bookmarks = await UserBookmarksDB.getAll();
            console.log(`🔖 Bookmarks: ${bookmarks.length}`);
            
            const likes = await UserLikesNovelDB.getAll();
            console.log(`❤️ Novel Likes: ${likes.length}`);
            
            const chapterLikes = await UserLikesChapterDB.getAll();
            console.log(`📖 Chapter Likes: ${chapterLikes.length}`);
            
            const reads = await UserReadsDB.getAll();
            console.log(`👁️ Reads: ${reads.length}`);
            
            return { novels, chapters, bookmarks, likes, chapterLikes, reads };
        },
        
        /**
         * Force seed data
         */
        forceSeed: async function() {
            console.log('🔄 Forcing data reseed...');
            await NovelDB.clear();
            await ChapterDB.clear();
            return await seedInitialData();
        },
        
        /**
         * Clear all data
         */
        clearAll: async function() {
            console.log('🗑️ Clearing all data...');
            await NovelDB.clear();
            await ChapterDB.clear();
            await UserReadsDB.clear();
            await UserBookmarksDB.clear();
            await UserLikesNovelDB.clear();
            await UserLikesChapterDB.clear();
            console.log('✅ All data cleared!');
        },
        
        /**
         * Show Dreamlo data
         */
        showData: async function() {
            console.log('📊 Dreamlo Data:');
            const data = await this.checkAll();
            console.log('Novels:', data.novels);
            console.log('Chapters:', data.chapters);
            console.log('Bookmarks:', data.bookmarks);
            console.log('Likes:', data.likes);
            console.log('Chapter Likes:', data.chapterLikes);
            console.log('Reads:', data.reads);
        }
    };
    
    console.log('🐛 Dreamlo Debug Helpers Available:');
    console.log('  - window.__dreamloDebug.checkAll() - Check all tables');
    console.log('  - window.__dreamloDebug.forceSeed() - Force reseed data');
    console.log('  - window.__dreamloDebug.clearAll() - Clear all data');
    console.log('  - window.__dreamloDebug.showData() - Show all data');
}