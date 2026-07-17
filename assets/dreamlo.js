// dreamlo.js - Dreamlo Database Integration Library
class DreamloClient {
    constructor(publicKey, privateKey = null) {
        this.baseUrl = "https://dreamlo.com/lb";
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds cache
    }

    // Fetch all entries with caching
    async fetchEntries(limit = null, forceRefresh = false) {
        const cacheKey = `entries_${limit}`;
        
        if (!forceRefresh && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const url = `${this.baseUrl}/${this.publicKey}/json${limit ? `/${limit}` : ''}`;
            const response = await fetch(url, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            
            const entries = data.dreamlo?.leaderboard?.entry;
            let result = [];
            
            if (entries) {
                result = Array.isArray(entries) ? entries : [entries];
            }
            
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
            
            return result;
        } catch (error) {
            console.error("[Dreamlo] Fetch failed:", error);
            // Return cached data if available
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey).data;
            }
            return [];
        }
    }

    // Fetch single entry by name
    async fetchEntry(name, forceRefresh = false) {
        const cacheKey = `entry_${name}`;
        
        if (!forceRefresh && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const entries = await this.fetchEntries(null, forceRefresh);
            const entry = entries.find(e => e.name === name) || null;
            
            this.cache.set(cacheKey, {
                data: entry,
                timestamp: Date.now()
            });
            
            return entry;
        } catch (error) {
            console.error("[Dreamlo] Fetch entry failed:", error);
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey).data;
            }
            return null;
        }
    }

    // Submit/Update data with retry mechanism
    async submitData(name, score, seconds = 0, text = "", retries = 3) {
        if (!this.privateKey) throw new Error("Private Key required for write operations.");
        
        let attempt = 0;
        while (attempt < retries) {
            try {
                const safeName = encodeURIComponent(name);
                const safeText = encodeURIComponent(text);
                const url = `${this.baseUrl}/${this.privateKey}/add/${safeName}/${score}/${seconds}/${safeText}`;
                
                const response = await fetch(url);
                
                if (response.ok) {
                    // Invalidate cache for this entry
                    this.cache.delete(`entry_${name}`);
                    this.cache.delete('entries_null');
                    return true;
                }
                
                throw new Error(`HTTP error! status: ${response.status}`);
            } catch (error) {
                attempt++;
                console.error(`[Dreamlo] Submit attempt ${attempt} failed:`, error);
                if (attempt === retries) {
                    return false;
                }
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        return false;
    }

    // Delete entry
    async deleteData(name, retries = 3) {
        if (!this.privateKey) throw new Error("Private Key required for delete operations.");
        
        let attempt = 0;
        while (attempt < retries) {
            try {
                const safeName = encodeURIComponent(name);
                const url = `${this.baseUrl}/${this.privateKey}/delete/${safeName}`;
                
                const response = await fetch(url);
                
                if (response.ok) {
                    // Invalidate cache for this entry
                    this.cache.delete(`entry_${name}`);
                    this.cache.delete('entries_null');
                    return true;
                }
                
                throw new Error(`HTTP error! status: ${response.status}`);
            } catch (error) {
                attempt++;
                console.error(`[Dreamlo] Delete attempt ${attempt} failed:`, error);
                if (attempt === retries) {
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        return false;
    }

    // Clear all data (use with caution)
    async clearAll() {
        if (!this.privateKey) throw new Error("Private Key required for clear operations.");
        
        try {
            const url = `${this.baseUrl}/${this.privateKey}/clear`;
            const response = await fetch(url);
            if (response.ok) {
                this.cache.clear();
                return true;
            }
            return false;
        } catch (error) {
            console.error("[Dreamlo] Clear failed:", error);
            return false;
        }
    }

    // Get total count of entries
    async getTotalEntries() {
        const entries = await this.fetchEntries();
        return entries.length;
    }

    // Search entries by name pattern
    async searchEntries(pattern) {
        const entries = await this.fetchEntries();
        const regex = new RegExp(pattern, 'i');
        return entries.filter(entry => regex.test(entry.name));
    }

    // Get entries by prefix
    async getEntriesByPrefix(prefix) {
        const entries = await this.fetchEntries();
        return entries.filter(entry => entry.name.startsWith(prefix));
    }
}

// Device ID Generator - Persistent per device
class DeviceManager {
    constructor() {
        this.deviceId = this.getOrCreateDeviceId();
        this.sessionId = this.getOrCreateSessionId();
    }

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = this.generateDeviceId();
            localStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    }

    getOrCreateSessionId() {
        let sessionId = sessionStorage.getItem('sessionId');
        if (!sessionId) {
            sessionId = this.generateSessionId();
            sessionStorage.setItem('sessionId', sessionId);
        }
        return sessionId;
    }

    generateDeviceId() {
        // Multiple fingerprinting techniques for better uniqueness
        const fingerprints = [];
        
        // Canvas fingerprint
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(100, 10, 50, 50);
            ctx.fillStyle = '#069';
            ctx.fillText('Device ID', 10, 50);
            fingerprints.push(canvas.toDataURL());
        } catch (e) {
            fingerprints.push('canvas_error');
        }

        // Screen information
        fingerprints.push(
            screen.width,
            screen.height,
            screen.colorDepth,
            navigator.hardwareConcurrency || 0,
            navigator.deviceMemory || 0
        );

        // Timezone and language
        fingerprints.push(
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
            navigator.language || 'unknown',
            navigator.languages?.join(',') || 'unknown'
        );

        // Plugin information
        try {
            const plugins = Array.from(navigator.plugins || [])
                .map(p => p.name)
                .join(',');
            fingerprints.push(plugins);
        } catch (e) {
            fingerprints.push('plugins_error');
        }

        // Random and timestamp
        const random = Math.random().toString(36).substring(2, 10);
        const timestamp = Date.now().toString(36);
        
        // Hash the combined fingerprint
        const combined = fingerprints.join('_') + random + timestamp;
        const hash = this.hashString(combined);
        
        return `DEV_${hash}`;
    }

    generateSessionId() {
        const random = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now().toString(36);
        return `SESSION_${random}_${timestamp}`;
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36).substring(0, 16);
    }

    getDeviceId() {
        return this.deviceId;
    }

    getSessionId() {
        return this.sessionId;
    }

    // Check if this is a new device (first visit)
    isNewDevice() {
        return localStorage.getItem('deviceId') === null;
    }
}

// Export untuk browser
if (typeof window !== 'undefined') {
    window.DreamloClient = DreamloClient;
    window.DeviceManager = DeviceManager;
}