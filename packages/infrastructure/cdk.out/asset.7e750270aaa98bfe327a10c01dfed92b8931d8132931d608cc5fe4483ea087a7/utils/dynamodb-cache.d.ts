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
interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
}
export declare class DynamoDBCache<T = any> {
    private cache;
    private accessOrder;
    private stats;
    private maxSize;
    private defaultTTL;
    constructor(maxSize?: number, defaultTTL?: number);
    /**
     * Generate cache key from query parameters
     */
    generateKey(tableName: string, params: any): string;
    /**
     * Get cached data if available and not expired
     */
    get(key: string): T | null;
    /**
     * Set cache entry with optional TTL
     */
    set(key: string, data: T, ttl?: number): void;
    /**
     * Invalidate cache entry
     */
    invalidate(key: string): void;
    /**
     * Invalidate all cache entries matching a pattern
     */
    invalidatePattern(pattern: string): void;
    /**
     * Clear all cache entries
     */
    clear(): void;
    /**
     * Evict least recently used entry
     */
    private evictOldest;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Get cache hit rate
     */
    getHitRate(): number;
}
export declare const propertyCache: DynamoDBCache<any>;
export declare const trustScoreCache: DynamoDBCache<any>;
export declare const lineageCache: DynamoDBCache<any>;
export declare const documentCache: DynamoDBCache<any>;
/**
 * Cache decorator for DynamoDB queries
 */
export declare function withCache<T>(cache: DynamoDBCache<T>, keyGenerator: (params: any) => string, ttl?: number): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export {};
