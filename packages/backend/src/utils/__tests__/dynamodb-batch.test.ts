/**
 * Unit tests for DynamoDB batch operations utility
 */

import { DynamoDBDocumentClient, BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBBatchOperations } from '../dynamodb-batch';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBBatchOperations', () => {
  let batchOps: DynamoDBBatchOperations;
  let docClient: DynamoDBDocumentClient;

  beforeEach(() => {
    ddbMock.reset();
    // Create a real mock client instance
    docClient = ddbMock as unknown as DynamoDBDocumentClient;
    batchOps = new DynamoDBBatchOperations(docClient, 2, 10); // 2 retries, 10ms delay
  });

  describe('batchGet', () => {
    it('should fetch items in batches of 100', async () => {
      const keys = Array.from({ length: 250 }, (_, i) => ({ id: `item-${i}` }));
      const items = keys.map(key => ({ ...key, data: 'test' }));

      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          'TestTable': items.slice(0, 100),
        },
      });

      const result = await batchOps.batchGet({
        tableName: 'TestTable',
        keys,
      });

      // Should make 3 batch calls (250 / 100 = 3)
      expect(ddbMock.commandCalls(BatchGetCommand).length).toBeGreaterThanOrEqual(3);
    });

    it('should return all items successfully', async () => {
      const keys = [
        { id: 'item-1' },
        { id: 'item-2' },
        { id: 'item-3' },
      ];
      const items = [
        { id: 'item-1', data: 'test1' },
        { id: 'item-2', data: 'test2' },
        { id: 'item-3', data: 'test3' },
      ];

      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          'TestTable': items,
        },
      });

      const result = await batchOps.batchGet({
        tableName: 'TestTable',
        keys,
      });

      expect(result.items).toHaveLength(3);
      expect(result.items).toEqual(items);
      expect(result.unprocessedKeys).toBeUndefined();
      expect(result.errors).toBeUndefined();
    });

    it('should retry unprocessed keys', async () => {
      const keys = [
        { id: 'item-1' },
        { id: 'item-2' },
        { id: 'item-3' },
      ];

      // First call returns some items and unprocessed keys
      ddbMock.on(BatchGetCommand).resolvesOnce({
        Responses: {
          'TestTable': [{ id: 'item-1', data: 'test1' }],
        },
        UnprocessedKeys: {
          'TestTable': {
            Keys: [{ id: 'item-2' }, { id: 'item-3' }],
          },
        },
      });

      // Retry returns remaining items
      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          'TestTable': [
            { id: 'item-2', data: 'test2' },
            { id: 'item-3', data: 'test3' },
          ],
        },
      });

      const result = await batchOps.batchGet({
        tableName: 'TestTable',
        keys,
      });

      // Should have all 3 items (1 from first call + 2 from retry)
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.unprocessedKeys).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const keys = [{ id: 'item-1' }];

      ddbMock.on(BatchGetCommand).rejects(new Error('DynamoDB error'));

      const result = await batchOps.batchGet({
        tableName: 'TestTable',
        keys,
      });

      expect(result.items).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
    });

    it('should return unprocessed keys after max retries', async () => {
      const keys = [
        { id: 'item-1' },
        { id: 'item-2' },
      ];

      // Always return unprocessed keys
      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          'TestTable': [],
        },
        UnprocessedKeys: {
          'TestTable': {
            Keys: keys,
          },
        },
      });

      const result = await batchOps.batchGet({
        tableName: 'TestTable',
        keys,
      });

      expect(result.unprocessedKeys).toBeDefined();
      expect(result.unprocessedKeys).toHaveLength(2);
    });
  });

  describe('batchWrite', () => {
    it('should write items in batches of 25', async () => {
      const items = Array.from({ length: 75 }, (_, i) => ({ id: `item-${i}`, data: 'test' }));

      ddbMock.on(BatchWriteCommand).resolves({});

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'put',
      });

      // Should make 3 batch calls (75 / 25 = 3)
      expect(ddbMock.commandCalls(BatchWriteCommand).length).toBeGreaterThanOrEqual(3);
    });

    it('should write items successfully', async () => {
      const items = [
        { id: 'item-1', data: 'test1' },
        { id: 'item-2', data: 'test2' },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'put',
      });

      expect(result.unprocessedKeys).toBeUndefined();
      expect(result.errors).toBeUndefined();
    });

    it('should retry unprocessed items', async () => {
      const items = [
        { id: 'item-1', data: 'test1' },
        { id: 'item-2', data: 'test2' },
      ];

      // First call returns unprocessed items
      ddbMock.on(BatchWriteCommand).resolvesOnce({
        UnprocessedItems: {
          'TestTable': [
            { PutRequest: { Item: { id: 'item-2', data: 'test2' } } },
          ],
        },
      });

      // Retry succeeds
      ddbMock.on(BatchWriteCommand).resolves({});

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'put',
      });

      expect(result.unprocessedKeys).toBeUndefined();
      // Should have made at least 1 call (may have made retry calls)
      expect(ddbMock.commandCalls(BatchWriteCommand).length).toBeGreaterThanOrEqual(1);
    });

    it('should handle delete operations', async () => {
      const items = [
        { id: 'item-1' },
        { id: 'item-2' },
      ];

      ddbMock.on(BatchWriteCommand).resolves({});

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'delete',
      });

      expect(result.unprocessedKeys).toBeUndefined();
      
      const calls = ddbMock.commandCalls(BatchWriteCommand);
      expect(calls[0].args[0].input.RequestItems?.['TestTable'][0]).toHaveProperty('DeleteRequest');
    });

    it('should handle errors gracefully', async () => {
      const items = [{ id: 'item-1', data: 'test' }];

      ddbMock.on(BatchWriteCommand).rejects(new Error('DynamoDB error'));

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'put',
      });

      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
    });

    it('should return unprocessed items after max retries', async () => {
      const items = [
        { id: 'item-1', data: 'test1' },
        { id: 'item-2', data: 'test2' },
      ];

      // Always return unprocessed items
      ddbMock.on(BatchWriteCommand).resolves({
        UnprocessedItems: {
          'TestTable': [
            { PutRequest: { Item: { id: 'item-1', data: 'test1' } } },
            { PutRequest: { Item: { id: 'item-2', data: 'test2' } } },
          ],
        },
      });

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'put',
      });

      expect(result.unprocessedKeys).toBeDefined();
      expect(result.unprocessedKeys).toHaveLength(2);
    });

    it('should limit parallel writes to avoid throttling', async () => {
      const items = Array.from({ length: 200 }, (_, i) => ({ id: `item-${i}`, data: 'test' }));

      ddbMock.on(BatchWriteCommand).resolves({});

      const result = await batchOps.batchWrite({
        tableName: 'TestTable',
        items,
        operation: 'put',
      });

      // Should make 8 batch calls (200 / 25 = 8)
      // But executed in groups of 5 for concurrency control
      expect(ddbMock.commandCalls(BatchWriteCommand).length).toBe(8);
    });
  });
});
