import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Risu permission preflight', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks DB access through getDatabase before requesting mainDom', async () => {
    const getDatabase = vi.fn().mockResolvedValue({});
    const requestPluginPermission = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('risuai', { getDatabase, requestPluginPermission });

    const { risuUi } = await import('../src/helpers/risu-api');

    await expect(risuUi.requestRequiredPermissions()).resolves.toBe(true);
    expect(getDatabase).toHaveBeenCalledWith([]);
    expect(requestPluginPermission).toHaveBeenCalledWith('mainDom');
  });

  it('stops before mainDom when DB access is denied', async () => {
    const getDatabase = vi.fn().mockResolvedValue(null);
    const requestPluginPermission = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('risuai', { getDatabase, requestPluginPermission });

    const { risuUi } = await import('../src/helpers/risu-api');

    await expect(risuUi.requestRequiredPermissions()).resolves.toBe(false);
    expect(requestPluginPermission).not.toHaveBeenCalled();
  });

  it('lists PocketRisu modules after the permission preflight', async () => {
    const getDatabase = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        modules: [{ id: 'module-1', name: 'Workbench Module', description: 'Live target' }],
      });
    const requestPluginPermission = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('risuai', { getDatabase, requestPluginPermission });

    const [{ createRisuControllerDeps, risuUi }, { HmrController }] = await Promise.all([
      import('../src/helpers/risu-api'),
      import('../src/hmr/controller'),
    ]);
    const controller = new HmrController(createRisuControllerDeps({ onState: () => {}, onEvent: () => {} }));

    await expect(risuUi.requestRequiredPermissions()).resolves.toBe(true);
    await expect(controller.listModuleTargets()).resolves.toEqual([
      { id: 'module-1', name: 'Workbench Module', description: 'Live target' },
    ]);
    expect(getDatabase).toHaveBeenNthCalledWith(1, []);
    expect(getDatabase).toHaveBeenNthCalledWith(2, ['modules']);
  });

  it('starts a fresh permission request when an earlier preflight is still pending', async () => {
    let resolveFirstRequest: (value: object) => void = () => {};
    const firstRequest = new Promise<object>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const getDatabase = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({});
    const requestPluginPermission = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('risuai', { getDatabase, requestPluginPermission });

    const { risuUi } = await import('../src/helpers/risu-api');

    const startupPreflight = risuUi.requestRequiredPermissions();
    const buttonPreflight = risuUi.requestRequiredPermissions();
    const requestCountBeforeResolution = getDatabase.mock.calls.length;
    resolveFirstRequest({});

    await expect(Promise.all([startupPreflight, buttonPreflight])).resolves.toEqual([true, true]);
    expect(requestCountBeforeResolution).toBe(2);
  });
});
