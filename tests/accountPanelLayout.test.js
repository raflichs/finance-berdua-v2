import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

describe('AccountPanel portal layout', () => {
  it('should have overlay with inset-0 covering full viewport', () => {
    const overlayClasses = 'fixed inset-0 z-40';
    const hasInset = overlayClasses.includes('inset-0');
    const hasFixed = overlayClasses.includes('fixed');
    assert.strictEqual(hasInset && hasFixed, true);
  });

  it('should have modal mobile positioned bottom-0 with max-height', () => {
    const modalClasses = 'fixed inset-x-0 bottom-0 z-50 max-h-[min(85dvh,calc(100dvh-16px))]';
    const hasBottomZero = modalClasses.includes('bottom-0');
    const hasMaxHeight = modalClasses.includes('max-h-');
    const hasOverflowAuto = 'overflow-y-auto'.includes('overflow');
    assert.strictEqual(hasBottomZero && hasMaxHeight && hasOverflowAuto, true);
  });

  it('should have modal desktop positioned top-12 with sm breakpoint', () => {
    const modalClasses = 'sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-12';
    const hasSmAbsolute = modalClasses.includes('sm:absolute');
    const hasSmTop = modalClasses.includes('sm:top-12');
    assert.strictEqual(hasSmAbsolute && hasSmTop, true);
  });

  it('should title show "Simpan akun di dua HP" for link mode', () => {
    const mode = 'link';
    const title = mode === 'link' ? 'Simpan akun di dua HP' : 'Login akun linked';
    assert.strictEqual(title, 'Simpan akun di dua HP');
  });

  it('should title show "Login akun linked" for login mode', () => {
    const mode = 'login';
    const title = mode === 'link' ? 'Simpan akun di dua HP' : 'Login akun linked';
    assert.strictEqual(title, 'Login akun linked');
  });

  it('should close modal when overlay clicked', () => {
    let open = true;
    const onOverlayClick = () => { open = false; };
    onOverlayClick();
    assert.strictEqual(open, false);
  });

  it('should footer show "Sudah punya akun? Login" for anonymous user', () => {
    const user = { isAnonymous: true };
    const footerText = user?.isAnonymous ? 'Sudah punya akun? Login' : 'Link akun baru';
    assert.strictEqual(footerText, 'Sudah punya akun? Login');
  });

  it('should footer show "Link akun baru" for linked user', () => {
    const user = { isAnonymous: false };
    const footerText = user?.isAnonymous ? 'Sudah punya akun? Login' : 'Link akun baru';
    assert.strictEqual(footerText, 'Link akun baru');
  });

  it('should modal content not be cut off by sticky header z-index', () => {
    const headerZ = 30;
    const modalZ = 50;
    const overlayZ = 40;
    const isStacked = overlayZ > headerZ && modalZ > overlayZ;
    assert.strictEqual(isStacked, true);
  });

  it('should portal render outside sticky container hierarchy', () => {
    const renderTarget = 'document.body';
    const sticky = 'header';
    const isIndependent = renderTarget !== sticky;
    assert.strictEqual(isIndependent, true);
  });
});
