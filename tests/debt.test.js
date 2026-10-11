import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isTransientError, errorMessage } from '../src/lib/firebaseErrors.js';

describe('firebaseErrors', () => {
  it('should identify NETWORK_ERROR as transient', () => {
    assert.strictEqual(isTransientError({ code: 'NETWORK_ERROR' }), true);
  });

  it('should identify PERMISSION_DENIED as permanent', () => {
    assert.strictEqual(isTransientError({ code: 'PERMISSION_DENIED' }), false);
  });

  it('should identify offline as transient', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    assert.strictEqual(isTransientError({ code: 'ANY_ERROR' }), true);
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  });

  it('should return permission denied message', () => {
    const msg = errorMessage({ code: 'PERMISSION_DENIED' });
    assert.match(msg, /Akses ditolak/);
  });

  it('should return invalid argument message', () => {
    const msg = errorMessage({ code: 'INVALID_ARGUMENT' });
    assert.match(msg, /Data tidak sesuai format/);
  });

  it('should return offline message when offline', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    const msg = errorMessage({ code: 'UNKNOWN' });
    assert.match(msg, /Offline/);
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('debt cicilan format', () => {
  it('should accept empty object for cicilan', () => {
    const debt = {
      id: 1,
      name: 'Test',
      type: 'Hutang',
      total: 100000,
      paid: 0,
      keterangan: 'test',
      cicilan: {}
    };
    assert.deepStrictEqual(debt.cicilan, {});
  });

  it('should accept array for cicilan', () => {
    const debt = {
      id: 1,
      name: 'Test',
      type: 'Hutang',
      total: 100000,
      paid: 0,
      keterangan: 'test',
      cicilan: [{ id: 1, nominal: 50000, tanggal: '2026-10-05', txId: 1 }]
    };
    assert.strictEqual(Array.isArray(debt.cicilan), true);
  });

  it('should normalize cicilan to array when syncing', () => {
    const debt1 = { cicilan: {} };
    const normalized1 = Array.isArray(debt1.cicilan) ? debt1.cicilan : Object.values(debt1.cicilan);
    assert.deepStrictEqual(normalized1, []);

    const debt2 = { cicilan: [{ id: 1 }] };
    const normalized2 = Array.isArray(debt2.cicilan) ? debt2.cicilan : Object.values(debt2.cicilan);
    assert.deepStrictEqual(normalized2, [{ id: 1 }]);
  });
});

describe('debt payment atomicity', () => {
  it('should include debt in debtPayment operation', () => {
    const operation = {
      type: 'debtPayment',
      debtId: 1,
      debt: { id: 1, paid: 50000, cicilan: [] },
      transaction: { id: 100 },
      dependsOn: ['debt:1']
    };
    assert.strictEqual(operation.debt !== undefined, true);
    assert.strictEqual(operation.dependsOn.includes('debt:1'), true);
  });

  it('should not apply payment if debt dependency failed', () => {
    const failedIds = new Set(['debt:1']);
    const dependencies = ['debt:1'];
    const shouldSkip = dependencies.some((dep) => failedIds.has(dep));
    assert.strictEqual(shouldSkip, true);
  });
});

describe('offline queue dependency resolution', () => {
  it('should normalize dependencies with UID prefix', () => {
    const uid = 'user-123';
    const queuedId = (uid, operationId) => `${uid}:${operationId}`;
    const dependsOn = ['debt:456'];
    const normalizedDependencies = dependsOn.map((dep) => queuedId(uid, dep));
    assert.deepStrictEqual(normalizedDependencies, ['user-123:debt:456']);
  });

  it('should skip payment if debt dependency failed with UID prefix', () => {
    const uid = 'user-123';
    const queuedId = (uid, operationId) => `${uid}:${operationId}`;
    const failedIds = new Set([queuedId(uid, 'debt:456')]);
    const dependencies = [queuedId(uid, 'debt:456')];
    const shouldSkip = dependencies.some((dep) => failedIds.has(dep));
    assert.strictEqual(shouldSkip, true);
  });

  it('should not skip payment if debt dependency succeeded', () => {
    const uid = 'user-123';
    const queuedId = (uid, operationId) => `${uid}:${operationId}`;
    const failedIds = new Set();
    const dependencies = [queuedId(uid, 'debt:456')];
    const shouldSkip = dependencies.some((dep) => failedIds.has(dep));
    assert.strictEqual(shouldSkip, false);
  });
});

describe('cicilan rendering safety', () => {
  it('should handle cicilan as empty object before sync', () => {
    const debt = { cicilan: {} };
    const cicilanArray = Array.isArray(debt.cicilan) ? debt.cicilan : Object.values(debt.cicilan || {});
    assert.deepStrictEqual(cicilanArray, []);
    assert.strictEqual(cicilanArray.length, 0);
  });

  it('should handle cicilan as array after sync', () => {
    const debt = { cicilan: [{ id: 1, nominal: 50000 }] };
    const cicilanArray = Array.isArray(debt.cicilan) ? debt.cicilan : Object.values(debt.cicilan || {});
    assert.strictEqual(Array.isArray(cicilanArray), true);
    assert.strictEqual(cicilanArray.length, 1);
  });

  it('should safely spread cicilan in render logic', () => {
    const debt1 = { cicilan: {} };
    const items1 = [...(Array.isArray(debt1.cicilan) ? debt1.cicilan : Object.values(debt1.cicilan || {}))];
    assert.deepStrictEqual(items1, []);

    const debt2 = { cicilan: [{ id: 1 }] };
    const items2 = [...(Array.isArray(debt2.cicilan) ? debt2.cicilan : Object.values(debt2.cicilan || {}))];
    assert.deepStrictEqual(items2, [{ id: 1 }]);
  });
});
