/**
 * Unit tests for DynamoDB caching utility
 */

import { DynamoDBCache } from '../dynamodb-cache';

describe('DynamoDBCache', () => {
  let cache: DynamoDBCache<any>;

  beforeEach(() => {
    cache = new DynamoDBCache(5, 1000); // Small cache for testing
  });

  describe('generateKey', () => {
    it('should generate consistent keys for same parameters', () => {
      const params = { userId: 'user-123', status: 'completed' };
      const key1 = cache.generateKey('Properties', params);
      const key2 = cache.generateKey('Properties', params);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const params1 = { userId: 'user-123', status: 'completed' };
      const params2 = { userId: 'user-456', status: 'completed' };
      const key1 = cache.generateKey('Properties', params1);
      const key2 = cache.generateKey('Properties', params2);
      expect(key1).not.toBe(key2);
    });

    it('should generate keys with sorted parameters', () => {
      const params1 = { userId: 'user-123', status: 'completed' };
      const params2 = { status: 'completed', userId: 'user-123' };
      const key1 = cache.generateKey('Properties', params1);
      const key2 = cache.generateKey('Properties', params2);
      expect(key1).toBe(key2);
    });
  });

  describe('get and set', () => {
    it('should store and retrieve data', () => {
      const key = 'test-key';
      const data = { id: '123', name: 'Test' };
      
      cache.set(key, data);
      const result = cache.get(key);
      
      expect(result).toEqual(data);
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for expired entry', async () => {
      const key = 'test-key';
      const data = { id: '123' };
      
      cache.set(key, data, 100); // 100ms TTL
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result = cache.get(key);
      expect(result).toBeNull();
    });

    it('should update access order on get', () => {
      cache.set('key1', { id: '1' });
      cache.set('key2', { id: '2' });
      cache.set('key3', { id: '3' });
      cache.set('key4', { id: '4' });
      cache.set('key5', { id: '5' });
      
      // Cache is now full (5 items)
      // Access key1 to update its access time
      cache.get('key1');
      
      // Add one more item - should evict the least recently accessed
      // Since key1 was just accessed, key2 should be evicted (oldest access time)
      cache.set('key6', { id: '6' });
      
      // Verify eviction happened
      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('invalidate', () => {
    it('should remove entry from cache', () => {
      const key = 'test-key';
      cache.set(key, { id: '123' });
      
      cache.invalidate(key);
      
      expect(cache.get(key)).toBeNull();
    });

    it('should handle invalidating non-existent key', () => {
      expect(() => cache.invalidate('non-existent')).not.toThrow();
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate all matching keys', () => {
      cache.set('user:123:properties', { id: '1' });
      cache.set('user:123:documents', { id: '2' });
      cache.set('user:456:properties', { id: '3' });
      
      cache.invalidatePattern('user:123:.*');
      
      expect(cache.get('user:123:properties')).toBeNull();
      expect(cache.get('user:123:documents')).toBeNull();
      expect(cache.get('user:456:properties')).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', { id: '1' });
      cache.set('key2', { id: '2' });
      cache.set('key3', { id: '3' });
      
      cache.clear();
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when cache is full', () => {
      // Fill cache to max size (5)
      cache.set('key1', { id: '1' });
      cache.set('key2', { id: '2' });
      cache.set('key3', { id: '3' });
      cache.set('key4', { id: '4' });
      cache.set('key5', { id: '5' });
      
      // Add one more to trigger eviction
      cache.set('key6', { id: '6' });
      
      // key1 should be evicted (oldest)
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key6')).not.toBeNull();
    });
  });

  describe('statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', { id: '1' });
      
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit
      cache.get('key3'); // miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });

    it('should track cache size', () => {
      cache.set('key1', { id: '1' });
      cache.set('key2', { id: '2' });
      
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });

    it('should track evictions', () => {
      // Fill cache beyond max size
      for (let i = 1; i <= 10; i++) {
        cache.set(`key${i}`, { id: `${i}` });
      }
      
      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key1', { id: '1' });
      
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit
      cache.get('key3'); // miss
      
      const hitRate = cache.getHitRate();
      expect(hitRate).toBe(0.5); // 2 hits out of 4 total
    });

    it('should return 0 hit rate for empty cache', () => {
      const hitRate = cache.getHitRate();
      expect(hitRate).toBe(0);
    });
  });

  describe('custom TTL', () => {
    it('should use custom TTL when provided', async () => {
      const key = 'test-key';
      const data = { id: '123' };
      
      cache.set(key, data, 50); // 50ms TTL
      
      // Should be available immediately
      expect(cache.get(key)).toEqual(data);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should be expired
      expect(cache.get(key)).toBeNull();
    });

    it('should use default TTL when not provided', async () => {
      const key = 'test-key';
      const data = { id: '123' };
      
      cache.set(key, data); // Use default TTL (1000ms)
      
      // Should be available after 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(cache.get(key)).toEqual(data);
      
      // Should be expired after 1100ms
      await new Promise(resolve => setTimeout(resolve, 700));
      expect(cache.get(key)).toBeNull();
    });
  });
});
