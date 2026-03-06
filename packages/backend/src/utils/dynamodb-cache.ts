/**
 * DynamoDB Query Result Caching Utility
 * 
 * Implements in-memory caching for frequently accessed DynamoDB queries
 * to reduce latency and costs per Requirement 16.5
 * 
 * Features:
 * - TTL-based cache expiration
 * - LRU eviction for memory management
 * - Cache key generation from query parameters
 * - Automatic cache invalidation
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export class DynamoDBCache<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private accessOrder: Map<string, number>;
  private stats: CacheStats;
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 1000, defaultTTL: number = 300000) {
    this.cache = new Map();
    this.accessOrder = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL; // 5 minutes default
  }

  /**
   * Generate cache key from query parameters
   */
  generateKey(tableName: string, params: any): string {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return `${tableName}:${sortedParams}`;
  }

  /**
   * Get cached data if available and not expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.size--;
      this.stats.misses++;
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, now);
    this.stats.hits++;
    
    return entry.data;
  }

  /**
   * Set cache entry with optional TTL
   */
  set(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    
    // Check if key already exists
    const isUpdate = this.cache.has(key);
    
    // Evict oldest entry if cache is full and this is a new key
    if (this.cache.size >= this.maxSize && !isUpdate) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, now);
    
    // Increment size only for new entries
    if (!isUpdate) {
      this.stats.size++;
    }
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    if (this.cache.delete(key)) {
      this.accessOrder.delete(key);
      this.stats.size--;
    }
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.invalidate(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.stats.size = 0;
  }

  /**
   * Evict least recently used entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size--;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }
}

// Global cache instances for different data types
export const propertyCache = new DynamoDBCache(500, 300000); // 5 minutes TTL
export const trustScoreCache = new DynamoDBCache(500, 600000); // 10 minutes TTL (immutable after calculation)
export const lineageCache = new DynamoDBCache(500, 600000); // 10 minutes TTL (immutable after construction)
export const documentCache = new DynamoDBCache(1000, 180000); // 3 minutes TTL

/**
 * Cache decorator for DynamoDB queries
 */
export function withCache<T>(
  cache: DynamoDBCache<T>,
  keyGenerator: (params: any) => string,
  ttl?: number
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator(args[0]);
      
      // Try to get from cache
      const cachedData = cache.get(cacheKey);
      if (cachedData !== null) {
        console.log(`Cache hit for key: ${cacheKey}`);
        return cachedData;
      }

      // Cache miss - execute original method
      console.log(`Cache miss for key: ${cacheKey}`);
      const result = await originalMethod.apply(this, args);
      
      // Store in cache
      cache.set(cacheKey, result, ttl);
      
      return result;
    };

    return descriptor;
  };
}
