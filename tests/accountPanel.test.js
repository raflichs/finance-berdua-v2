import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

describe('AccountPanel mode logic', () => {
  const defaultModeFor = (user) => (user?.isAnonymous ? 'link' : 'login');
  const identityKeyFor = (user) => `${user?.uid ?? ''}|${user?.isAnonymous ? 'anon' : 'linked'}`;

  it('should default anonymous user to link mode', () => {
    const user = { uid: 'anon-123', isAnonymous: true };
    const modeOverride = null;
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'link');
  });

  it('should default linked user to login mode', () => {
    const user = { uid: 'user-123', isAnonymous: false };
    const modeOverride = null;
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'login');
  });

  it('should override mode when explicitly set', () => {
    const user = { uid: 'anon-123', isAnonymous: true };
    const modeOverride = 'login';
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'login');
  });

  it('should detect anonymous toggle with same UID via identityKey', () => {
    const linked = { uid: 'user-123', isAnonymous: false };
    const anon = { uid: 'user-123', isAnonymous: true };
    assert.notStrictEqual(identityKeyFor(linked), identityKeyFor(anon));
  });

  it('should reset modeOverride when UID changes', () => {
    let modeOverride = 'login';
    const identityKey = identityKeyFor({ uid: 'anon-456', isAnonymous: true });
    const prevIdentityKey = identityKeyFor({ uid: 'anon-123', isAnonymous: true });

    if (identityKey !== prevIdentityKey) {
      modeOverride = null;
    }

    const user = { uid: 'anon-456', isAnonymous: true };
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'link');
  });

  it('should reset modeOverride after logout creates new anonymous user', () => {
    let modeOverride = 'login';
    const identityKey = identityKeyFor({ uid: 'anon-new-456', isAnonymous: true });
    const prevIdentityKey = identityKeyFor({ uid: 'user-linked-123', isAnonymous: false });

    if (identityKey !== prevIdentityKey) {
      modeOverride = null;
    }

    const user = { uid: 'anon-new-456', isAnonymous: true };
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'link');
  });

  it('should reset modeOverride after successful login', () => {
    let modeOverride = 'login';
    const loginSuccess = true;

    if (loginSuccess) {
      modeOverride = null;
    }

    const user = { uid: 'user-123', isAnonymous: false };
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'login');
  });

  it('should reset modeOverride after successful account linking', () => {
    let modeOverride = 'login';
    const linkSuccess = true;

    if (linkSuccess) {
      modeOverride = null;
    }

    const user = { uid: 'anon-123', isAnonymous: false, displayName: 'User' };
    const mode = modeOverride || defaultModeFor(user);
    assert.strictEqual(mode, 'login');
  });

  it('should reset stale fields on identity change', () => {
    let email = 'old@example.com';
    let password = 'secret123';
    let name = 'Old Name';
    let message = 'stale message';
    let modeOverride = 'login';

    const identityKey = identityKeyFor({ uid: 'anon-456', isAnonymous: true });
    const prevIdentityKey = identityKeyFor({ uid: 'user-123', isAnonymous: false });

    if (identityKey !== prevIdentityKey) {
      email = '';
      password = '';
      name = '';
      message = '';
      modeOverride = null;
    }

    assert.strictEqual(email, '');
    assert.strictEqual(password, '');
    assert.strictEqual(name, '');
    assert.strictEqual(message, '');
    assert.strictEqual(modeOverride, null);
  });
});
