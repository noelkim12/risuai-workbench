import { describe, expect, it } from 'vitest';

import { isNotificationVisible } from '../src/helpers/notification-visibility';

describe('isNotificationVisible', () => {
  it('reports hidden when the open plugin iframe loses focus to another program', () => {
    expect(isNotificationVisible({ pageVisible: true, panelOpen: true, iframeFocused: false })).toBe(false);
  });

  it('reports visible when the open plugin iframe has focus', () => {
    expect(isNotificationVisible({ pageVisible: true, panelOpen: true, iframeFocused: true })).toBe(true);
  });

  it('does not treat the intentionally hidden plugin iframe as an unfocused window', () => {
    expect(isNotificationVisible({ pageVisible: true, panelOpen: false, iframeFocused: false })).toBe(true);
  });

  it('reports hidden when the browser page itself is hidden', () => {
    expect(isNotificationVisible({ pageVisible: false, panelOpen: false, iframeFocused: false })).toBe(false);
  });
});
