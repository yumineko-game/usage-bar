import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getCachedProviders: vi.fn(),
  refreshProviders: vi.fn(),
  refreshProvidersIfStale: vi.fn(),
  getSettingsSnapshot: vi.fn(),
  getStayAwakeStatus: vi.fn().mockResolvedValue(false),
  updateSettings: vi.fn(),
  getUpdateState: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  applyUpdate: vi.fn(),
  dismissUpdate: vi.fn(),
  openReleasePage: vi.fn(),
  setSurfaceMode: vi.fn(),
  dismissTrayPanel: vi.fn(),
  beginFlyoutGesture: vi.fn().mockResolvedValue(undefined),
  endFlyoutGesture: vi.fn().mockResolvedValue(undefined),
  openSettingsWindow: vi.fn(),
  quitApp: vi.fn(),
  getWorkAreaRect: vi.fn(),
  reanchorTrayPanel: vi.fn(),
  resetFlyoutPosition: vi.fn().mockResolvedValue(undefined),
  revealTrayPanelWindow: vi.fn(),
  getAppInfo: vi.fn(),
  getSystemAccentColor: vi.fn(),
  getProviderDetail: vi.fn(),
  openProviderDashboard: vi.fn(),
  openProviderStatusPage: vi.fn(),
  getProviderStatuses: vi.fn(),
  getProviderChartData: vi.fn(),
  getCurrentSurfaceState: vi.fn(),
  getLocaleStrings: vi.fn(),
  setUiLanguage: vi.fn(),
  getDeepSeekPricingStatus: vi.fn().mockResolvedValue(null),
  getUsageSpendSummary: vi.fn(),
  getCodexAccountsState: vi.fn(),
  getTokenAccounts: vi.fn(),
  getProviderAccountUsage: vi.fn(),
  claudeReconciliationState: vi.fn().mockResolvedValue(null),
}));

const eventMocks = vi.hoisted(() => ({
  listen: vi.fn(),
  listeners: new Map<string, Array<(event: { payload: unknown }) => void>>(),
}));

const windowMocks = vi.hoisted(() => ({
  startDragging: vi.fn().mockResolvedValue(undefined),
  // Loosely typed so tests can swap in windows with only the methods they use.
  getCurrentWindow: vi.fn((): Record<string, unknown> => ({
    startDragging: windowMocks.startDragging,
    setSize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    innerSize: vi.fn().mockResolvedValue({ width: 310, height: 200 }),
  })),
  LogicalSize: vi.fn((width: number, height: number) => ({ width, height })),
  PhysicalSize: vi.fn((width: number, height: number) => ({ width, height })),
}));

vi.mock("../lib/tauri", () => tauriMocks);
vi.mock("@tauri-apps/api/event", () => eventMocks);
vi.mock("@tauri-apps/api/window", () => windowMocks);

import TrayPanel from "./TrayPanel";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { TEST_PROVIDER_CATALOG } from "../test/providerCatalog";
import { buildBundle } from "../test/localeHarness";
import type {
  BootstrapState,
  ProviderCatalogEntry,
  ProviderUsageSnapshot,
  SettingsSnapshot,
} from "../types/bridge";

function rateWindow(used: number) {
  return {
    usedPercent: used,
    remainingPercent: 100 - used,
    windowMinutes: null,
    resetsAt: null,
    resetDescription: null,
    isExhausted: false,
    reservePercent: null,
    reserveDescription: null,
  };
}

function provider(id: string, displayName: string, used = 20): ProviderUsageSnapshot {
  return {
    providerId: id,
    displayName,
    primary: rateWindow(used),
    selectedMetric: rateWindow(used),
    primaryLabel: "Monthly",
    secondary: null,
    modelSpecific: null,
    tertiary: null,
    extraRateWindows: [],
    cost: null,
    planName: null,
    accountEmail: null,
    sourceLabel: "auto",
    updatedAt: "2026-05-24T00:00:00Z",
    error: null,
    errorState: "ready",
    pace: null,
    accountOrganization: null,
    trayStatusLabel: null,
    fetchDurationMs: null,
  };
}

function providerWithThreeQuotaWindows(
  id: string,
  displayName: string,
): ProviderUsageSnapshot {
  const snapshot = provider(id, displayName);
  snapshot.secondary = rateWindow(35);
  snapshot.secondaryLabel = "Weekly";
  snapshot.tertiary = rateWindow(50);
  snapshot.tertiaryLabel = "Monthly";
  return snapshot;
}

function settings(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    enabledProviders: ["codex", "claude"],
    refreshIntervalSecs: 300,
    adaptiveRefresh: false,
    refreshAllProvidersOnMenuOpen: false,
    statusChecksEnabled: true,
  lowPowerMode: false,
    startAtLogin: false,
    startMinimized: false,
    showNotifications: true,
    soundEnabled: true,
    notificationSoundTheme: "windows",
    notificationSoundPaths: {
      predictiveWarning: null,
      highUsage: null,
      criticalUsage: null,
      exhausted: null,
      statusIssue: null,
      sessionDepleted: null,
      sessionRestored: null,
    },
    highUsageThreshold: 70,
    criticalUsageThreshold: 90,
    predictivePaceWarningEnabled: false,
    predictivePaceWarningLeadHours: 0,
    credentialExpiryNotificationsEnabled: false,
    trayIconMode: "single",
    switcherShowsIcons: true,
    menuBarShowsHighestUsage: false,
    menuBarShowsPercent: false,
    menuBarIconStyle: "bars",
    mergedOverviewSelectedProviders: [],
    mergedOverviewAllAccounts: false,
    quotaWarningMarkersVisible: true,
    workdayTickStyle: "subtle",
    menuBarColorPace: false,
    menuBarColorByProvider: false,
    menuBarPaceReservePositive: false,
    providersSortedAlphabetically: false,
    showAsUsed: true,
    showAllTokenAccountsInMenu: false,
    enableAnimations: true,
    resetTimeRelative: true,
    showResetWhenExhausted: false,
    menuBarDisplayMode: "detailed",
    overviewLayout: "detailed",
    hidePersonalInfo: false,
    updateChannel: "stable",
    autoDownloadUpdates: false,
    installUpdatesOnQuit: false,
    globalShortcut: "Ctrl+Shift+U",
    switcherShortcuts: {},
    codexCustomSessionsDirs: [],
    antigravityAdditionalProfileHomes: [],
    uiLanguage: "english",
    uiLanguageFollowsSystem: false,
    theme: "dark",
    windowScalePercent: 125,
    trayScalePercent: 100,
    trayPanelStyle: "modern",
    trayPanelWidth: 310,
    trayPanelAlwaysOnTop: false,
    trayPanelMovable: false,
    powertoysStatusPipeEnabled: false,
    shareUsageWithCli: false,
    claudeAvoidKeychainPrompts: false,
    codexSparkUsageVisible: true,
    disableKeychainAccess: false,
    providerMetrics: {},
    floatBarEnabled: false,
    floatBarOpacity: 80,
    floatBarScale: 100,
    floatBarOrientation: "horizontal",
    floatBarStyle: "floating",
    floatBarClickThrough: false,
    floatBarProviderIds: [],
    floatBarDarkText: false,
    floatBarShowResetInline: false,
    floatBarShowCost: false,
    floatBarShowWeekly: false,
    claudeDailyRoutinesUsageVisible: true,
    claudeAllowReadingClaudeCodeCredentials: false,
    alibabaTokenPlanRegion: "cn",
    weeklyProgressWorkDays: null,
    costSummaryDisplayStyle: "compact",
    providerAccentColors: {},
    ...overrides,
  };
}

function bootstrap(
  settingsOverrides: Partial<SettingsSnapshot> = {},
  catalog: ProviderCatalogEntry[] = [],
): BootstrapState {
  return {
    contractVersion: "v1",
    providers: catalog,
    settings: settings(settingsOverrides),
  };
}

/** The first `count` test providers, enabled and ordered as in the catalog. */
function overviewOrder(count: number): Partial<SettingsSnapshot> {
  const ids = TEST_PROVIDER_CATALOG.slice(0, count).map(([id]) => id);
  return { enabledProviders: ids, providerOrder: ids };
}

function overviewCatalog(count: number): ProviderCatalogEntry[] {
  return TEST_PROVIDER_CATALOG.slice(0, count).map(([id, displayName]) => ({
    id,
    displayName,
    cookieDomain: null,
  }));
}

function renderTrayPanel(
  providers: ProviderUsageSnapshot[],
  settingsOverrides: Partial<SettingsSnapshot> = {},
  catalog: ProviderCatalogEntry[] = [],
) {
  tauriMocks.getCachedProviders.mockResolvedValue(providers);
  const snapshot = settings(settingsOverrides);
  tauriMocks.getSettingsSnapshot.mockResolvedValue(snapshot);
  return render(
    <LocaleProvider>
      <TrayPanel
        state={{
          ...bootstrap(settingsOverrides, catalog),
          settings: snapshot,
        }}
      />
    </LocaleProvider>,
  );
}

function providerLinks(id: string) {
  return {
    dashboardUrl: `https://${id}.example/usage`,
    statusPageUrl: `https://status.${id}.example`,
  };
}

function emitEvent(event: string, payload: unknown) {
  for (const listener of eventMocks.listeners.get(event) ?? []) {
    listener({ payload });
  }
}

describe("TrayPanel provider grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMocks.listeners.clear();
    tauriMocks.claudeReconciliationState.mockResolvedValue(null);
    tauriMocks.getDeepSeekPricingStatus.mockResolvedValue(null);
    tauriMocks.getUsageSpendSummary.mockResolvedValue({ rows: [], models: [] });
    tauriMocks.beginFlyoutGesture.mockResolvedValue(undefined);
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "UsageBar",
      version: "0.70.0",
      buildNumber: "1",
      updateChannel: "stable",
      tagline: "",
    });
    tauriMocks.getSystemAccentColor.mockResolvedValue(null);
    tauriMocks.getProviderDetail.mockResolvedValue({
      dashboardUrl: null,
      statusPageUrl: null,
    });
    tauriMocks.openProviderDashboard.mockResolvedValue(undefined);
    tauriMocks.openProviderStatusPage.mockResolvedValue(undefined);
    tauriMocks.getProviderStatuses.mockResolvedValue([]);
    tauriMocks.openSettingsWindow.mockResolvedValue(undefined);
    tauriMocks.refreshProviders.mockResolvedValue(undefined);
    tauriMocks.refreshProvidersIfStale.mockResolvedValue(undefined);
    tauriMocks.dismissTrayPanel.mockResolvedValue(undefined);
    tauriMocks.reanchorTrayPanel.mockResolvedValue(undefined);
    tauriMocks.resetFlyoutPosition.mockResolvedValue(undefined);
    windowMocks.startDragging.mockResolvedValue(undefined);
    tauriMocks.getWorkAreaRect.mockResolvedValue({
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
    });
    tauriMocks.getCurrentSurfaceState.mockResolvedValue({
      mode: "trayPanel",
      target: { kind: "summary" },
    });
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());
    tauriMocks.updateSettings.mockResolvedValue(settings());
    tauriMocks.getUpdateState.mockResolvedValue({
      status: "idle",
      version: null,
      error: null,
      progress: null,
      releaseUrl: null,
      canDownload: false,
      canApply: false,
      lastCheckedAt: null,
    });
    tauriMocks.getProviderChartData.mockResolvedValue({
      providerId: "codex",
      costHistory: [],
      creditsHistory: [],
      usageBreakdown: [],
      localUsage: null,
    });
    tauriMocks.getLocaleStrings.mockResolvedValue(
      buildBundle({
        ActionRefresh: "Refresh",
        OverviewSpendProviderCoverage: "{} of {} providers have spend",
        UpdatesTitle: "Updates",
        MenuQuit: "Quit",
        MenuSettings: "Settings...",
        PanelMenu: "Menu",
        TrayMenuSwitchAccount: "Switch Account...",
        AddAccountEllipsis: "Add Account...",
        TrayMenuUsageDashboard: "Usage Dashboard",
        TrayMenuStatusPage: "Status Page",
        PanelAllProviders: "All providers",
        PanelAllProvidersShort: "All",
        PanelLeftSuffix: "left",
        PanelShowAllProviders: "Show all providers",
        PanelShowFewerProviders: "Show fewer providers",
        PanelUsedSuffix: "used",
        ServiceStatusPartialOutage: "Partial outage",
        UpdatedMinutesAgo: "{} minutes ago",
      }),
    );
    eventMocks.listen.mockImplementation(
      (event: string, handler: (event: { payload: unknown }) => void) => {
        const listeners = eventMocks.listeners.get(event) ?? [];
        listeners.push(handler);
        eventMocks.listeners.set(event, listeners);
        return Promise.resolve(() => {});
      },
    );
  });
  afterEach(() => {
    // Unmount before restoring mocks: a still-mounted panel can re-run an
    // effect against a restored (undefined-returning) mock.
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows no move strip while Movable panel is off", async () => {
    const { container, unmount } = renderTrayPanel([provider("cursor", "Cursor", 20)]);
    await waitFor(() => {
      expect(container.querySelector(".provider-grid")).not.toBeNull();
    });
    expect(container.querySelector(".tray-move-handle")).toBeNull();
    expect(container.querySelector(".tray-panel-reveal--movable")).toBeNull();
    // Unmount while the mocks still resolve; the shared afterEach resets
    // them before the automatic cleanup runs.
    unmount();
  });

  it("reveals regardless of the shared surface-mode snapshot (TrayPanel now runs in its own dedicated window)", async () => {
    tauriMocks.getCurrentSurfaceState.mockResolvedValue({
      mode: "settings",
      target: { kind: "settings", tab: "general" },
    });

    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);

    await waitFor(() => {
      expect(container.querySelector(".tray-panel-reveal--ready")).not.toBeNull();
    });
  });

  it("removes a disabled provider's card as soon as settings change", async () => {
    const { container } = renderTrayPanel([
      provider("codex", "Codex", 35),
      provider("claude", "Claude", 20),
    ]);
    await waitFor(() => expect(container.querySelector("#card-codex")).not.toBeNull());
    expect(container.querySelector("#card-claude")).not.toBeNull();

    // The shell prunes the disabled provider from its cache before broadcasting.
    tauriMocks.getCachedProviders.mockResolvedValue([provider("claude", "Claude", 20)]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings({ enabledProviders: ["claude"] }));
    await act(async () => emitEvent("settings-changed", null));

    await waitFor(() => expect(container.querySelector("#card-codex")).toBeNull());
    expect(container.querySelector("#card-claude")).not.toBeNull();
  });

  it("dismisses the tray panel on unmodified Escape", async () => {
    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);

    await waitFor(() => {
      expect(container.querySelector(".tray-panel-reveal--ready")).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(tauriMocks.dismissTrayPanel).toHaveBeenCalledTimes(1);
    });
  });

  it("does not dismiss the tray panel on modified Escape", async () => {
    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);

    await waitFor(() => {
      expect(container.querySelector(".tray-panel-reveal--ready")).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: "Escape", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Escape", shiftKey: true });
    fireEvent.keyDown(window, { key: "Escape", altKey: true });
    fireEvent.keyDown(window, { key: "Escape", metaKey: true });

    expect(tauriMocks.dismissTrayPanel).not.toHaveBeenCalled();
  });

  it("keeps the existing Ctrl+R tray shortcut", async () => {
    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);

    await waitFor(() => {
      expect(container.querySelector(".tray-panel-reveal--ready")).not.toBeNull();
    });
    tauriMocks.refreshProviders.mockClear();

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });

    await waitFor(() => {
      expect(tauriMocks.refreshProviders).toHaveBeenCalledTimes(1);
    });
  });

  it("localizes static tray panel labels in Japanese", async () => {
    tauriMocks.getLocaleStrings.mockResolvedValue(
      buildBundle(
        {
          ActionRefresh: "更新",
          CostTitle: "コスト",
          UpdatesTitle: "アップデート",
          MenuQuit: "終了",
          MenuSettings: "設定...",
          PanelAllProviders: "すべてのプロバイダー",
          PanelAllProvidersShort: "すべて",
          PanelLatestTokens: "最新トークン",
          CostPeriodShortDays: "{}日",
          PanelPeriodCost: "{}間のコスト",
          PanelPeriodTokens: "{}間のトークン",
          PanelTopModelPrefix: "トップモデル",
          PanelEstimatedFromLocalLogs: "ローカルログから推定",
          UpdatedDaysAgo: "{}日前",
        },
        "japanese",
      ),
    );
    const { container } = renderTrayPanel([provider("codex", "Codex", 35)]);

    await waitFor(() => {
      expect(
        container.querySelector('.provider-grid__item[aria-label="すべてのプロバイダー"]'),
      ).not.toBeNull();
    });
    expect(container.querySelector(".provider-grid__item")?.textContent).toContain("すべて");
    expect(screen.getByText("更新")).toBeInTheDocument();
    expect(screen.getByText("設定...")).toBeInTheDocument();
    expect(await screen.findByText("アップデート")).toBeInTheDocument();
    expect(screen.getByText("終了")).toBeInTheDocument();
    expect(container.querySelector(".card-dash")).toBeNull();
    expect(tauriMocks.getUsageSpendSummary).not.toHaveBeenCalled();
  });

  it("localizes the expanded dense grid collapse label in Japanese", async () => {
    tauriMocks.getLocaleStrings.mockResolvedValue(
      buildBundle(
        {
          PanelAllProviders: "すべてのプロバイダー",
          PanelAllProvidersShort: "すべて",
          PanelShowAllProviders: "すべてのプロバイダーを表示",
          PanelShowFewerProviders: "表示を減らす",
        },
        "japanese",
      ),
    );
    const providers = TEST_PROVIDER_CATALOG.map(([id, displayName], index) =>
      provider(id, displayName, (index * 7) % 100),
    );

    const { container } = renderTrayPanel(providers);

    await waitFor(() => {
      expect(container.querySelector(".provider-grid--compact")).not.toBeNull();
    });

    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '.provider-grid__item--more[aria-label="すべてのプロバイダーを表示"]',
      )!,
    );

    expect(await screen.findByText("表示を減らす")).toBeInTheDocument();
  });

  it.each([
    [1, true],
    [2, true],
    [5, true],
    [6, false],
    [12, false],
  ])("uses expected density for %i providers plus overview", async (providerCount, shouldBeSparse) => {
      const providers = [
        provider("codex", "Codex"),
        provider("claude", "Claude"),
        provider("copilot", "GitHub Copilot"),
        provider("cursor", "Cursor"),
        provider("gemini", "Gemini"),
        provider("kiro", "Kiro"),
        provider("zai", "z.ai"),
        provider("minimax", "MiniMax"),
        provider("vertexai", "Vertex AI"),
        provider("augment", "Augment"),
        provider("opencode", "OpenCode"),
        provider("kimi", "Kimi"),
      ].slice(0, providerCount);

      const { container } = renderTrayPanel(providers);

      await waitFor(() => {
        expect(container.querySelector(".provider-grid")).not.toBeNull();
      });

      const grid = container.querySelector(".provider-grid");
      expect(grid?.classList.contains("provider-grid--sparse")).toBe(
        shouldBeSparse,
      );
    },
  );

  it("renders providers in settings catalog order instead of fetch completion order", async () => {
    const catalog: ProviderCatalogEntry[] = [
      { id: "codex", displayName: "Codex", cookieDomain: null },
      { id: "claude", displayName: "Claude", cookieDomain: null },
      { id: "cursor", displayName: "Cursor", cookieDomain: null },
      { id: "factory", displayName: "Factory", cookieDomain: null },
      { id: "gemini", displayName: "Gemini", cookieDomain: null },
    ];
    const providers = [
      provider("gemini", "Gemini", 10),
      provider("cursor", "Cursor", 20),
      { ...provider("codex", "Codex", 80), error: "Authentication required" },
      provider("factory", "Factory", 30),
      { ...provider("claude", "Claude", 40), error: "Claude sign-in missing" },
    ];

    const { container } = renderTrayPanel(
      providers,
      { enabledProviders: catalog.map((entry) => entry.id) },
      catalog,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".provider-grid__item")).toHaveLength(6);
    });

    const labels = Array.from(container.querySelectorAll(".provider-grid__item"))
      .map((node) => node.getAttribute("aria-label"));
    expect(labels).toEqual([
      "All providers",
      "Codex",
      "Claude",
      "Cursor",
      "Factory",
      "Gemini",
    ]);
    expect(
      Array.from(container.querySelectorAll(".card-header__name")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Codex", "Claude", "Cursor", "Factory", "Gemini"]);
  });

  it("shows all quota rows in compact Overview when explicitly selected (0.62.0 #2616)", async () => {
    const { container } = renderTrayPanel(
      [providerWithThreeQuotaWindows("codex", "Codex")],
      { overviewLayout: "compact" },
    );

    await waitFor(() => {
      expect(container.querySelector(".menu-stack__item")).not.toBeNull();
    });

    expect(container.querySelectorAll(".menu-metric")).toHaveLength(3);
  });

  it("shows every enabled provider on Overview", async () => {
    const providers = TEST_PROVIDER_CATALOG.slice(0, 8).map(([id, displayName], index) =>
      provider(id, displayName, (index * 7) % 100),
    );
    const { container } = renderTrayPanel(providers, overviewOrder(8), overviewCatalog(8));

    await waitFor(() => {
      expect(container.querySelectorAll(".menu-stack__item")).toHaveLength(8);
    });
    expect(
      Array.from(container.querySelectorAll(".card-header__name"), (node) => node.textContent),
    ).toEqual(TEST_PROVIDER_CATALOG.slice(0, 8).map(([, displayName]) => displayName));
  });

  it("ignores a saved Overview filter and shows every provider in order", async () => {
    const providers = TEST_PROVIDER_CATALOG.slice(0, 8).map(([id, displayName], index) =>
      provider(id, displayName, (index * 7) % 100),
    );
    const { container } = renderTrayPanel(
      providers,
      {
        ...overviewOrder(8),
        mergedOverviewSelectedProviders: ["codex", "claude", "not-present"],
      },
      overviewCatalog(8),
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".menu-stack__item")).toHaveLength(8);
    });
    expect(
      Array.from(container.querySelectorAll(".card-header__name"), (node) => node.textContent),
    ).toEqual(TEST_PROVIDER_CATALOG.slice(0, 8).map(([, displayName]) => displayName));
  });

  it("collapses and expands the full provider catalog in the dense tray grid", async () => {
    const providers = TEST_PROVIDER_CATALOG.map(([id, displayName], index) =>
      provider(id, displayName, (index * 7) % 100),
    );

    const { container } = renderTrayPanel(providers);

    await waitFor(() => {
      expect(container.querySelectorAll(".provider-grid__item")).toHaveLength(
        20,
      );
    });

    const grid = container.querySelector(".provider-grid");
    expect(grid?.classList.contains("provider-grid--sparse")).toBe(false);
    expect(grid?.classList.contains("provider-grid--compact")).toBe(true);
    expect(grid?.getAttribute("data-expanded")).toBe("false");
    expect(grid?.getAttribute("data-provider-count")).toBe(
      String(providers.length + 1),
    );
    expect(container.querySelectorAll(".menu-stack__item")).toHaveLength(4);

    const expand = container.querySelector<HTMLButtonElement>(
      '.provider-grid__item--more[aria-label="Show all providers"]',
    );
    expect(expand).not.toBeNull();
    expect(expand?.textContent).toContain(`+${providers.length - 18}`);

    fireEvent.click(expand!);

    await waitFor(() => {
      expect(container.querySelectorAll(".provider-grid__item")).toHaveLength(
        providers.length + 2,
      );
    });
    expect(grid?.getAttribute("data-expanded")).toBe("true");
    expect(container.querySelectorAll(".menu-stack__item")).toHaveLength(providers.length);
    for (const [id, displayName] of TEST_PROVIDER_CATALOG) {
      expect(
        container.querySelector(`.provider-grid__item[aria-label="${displayName}"]`),
        id,
      ).not.toBeNull();
    }
  });

  it("uses compact provider labels for huge catalogs without losing full accessible labels", async () => {
    const providers = TEST_PROVIDER_CATALOG.slice(0, 36).map(
      ([id, displayName], index) => provider(id, displayName, (index * 7) % 100),
    );

    const { container } = renderTrayPanel(providers);

    await waitFor(() => {
      expect(container.querySelector(".provider-grid--compact")).not.toBeNull();
    });

    const expand = container.querySelector<HTMLButtonElement>(
      '.provider-grid__item--more[aria-label="Show all providers"]',
    );
    expect(expand).not.toBeNull();

    fireEvent.click(expand!);

    await waitFor(() => {
      expect(
        container.querySelector('.provider-grid__item[aria-label="Copilot"]'),
      ).not.toBeNull();
    });

    const copilot = container.querySelector(
      '.provider-grid__item[aria-label="Copilot"]',
    );
    expect(copilot).not.toBeNull();
    expect(copilot?.getAttribute("aria-label")).toBe("Copilot");
    expect(copilot?.querySelector(".provider-grid__label")?.textContent).toBe(
      "Copi",
    );
  });

  it("provider grid indicator follows the show-as-used setting", async () => {
    const { container, rerender } = renderTrayPanel(
      [provider("claude", "Claude", 35)],
      { showAsUsed: true },
    );

    await waitFor(() => {
      const track = container.querySelector<HTMLElement>(
        ".provider-grid__weekly-track",
      );
      expect(track?.style.getPropertyValue("--weekly-pct")).toBe("35%");
    });

    tauriMocks.getCachedProviders.mockResolvedValue([
      provider("claude", "Claude", 35),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings({ showAsUsed: false }));
    rerender(
      <LocaleProvider>
        <TrayPanel state={bootstrap({ showAsUsed: false })} />
      </LocaleProvider>,
    );

    await waitFor(() => {
      const track = container.querySelector<HTMLElement>(
        ".provider-grid__weekly-track",
      );
      expect(track?.style.getPropertyValue("--weekly-pct")).toBe("65%");
    });
  });

  it("omits warning markers even with notification thresholds configured", async () => {
    const { container } = renderTrayPanel([provider("claude", "Claude", 20)], {
      showAsUsed: false,
      highUsageThreshold: 75,
      criticalUsageThreshold: 90,
      providerQuotaWarnings: { claude: { session: { critical: 95 } } },
    });

    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    expect(container.querySelector(".menu-metric__progress-warning")).toBeNull();
  });

  it("renders the default tray panel layout with no legacy window chrome", async () => {
    const { container } = renderTrayPanel([
      provider("claude", "Claude", 35),
      provider("codex", "Codex", 20),
    ]);

    const menu = await screen.findByRole("navigation", { name: "Menu" });
    expect(
      await within(menu).findByRole("button", { name: "Updates" }),
    ).toBeInTheDocument();

    const surface = container.querySelector(".menu-surface");
    expect(surface?.classList.contains("menu-surface--tray")).toBe(true);
    expect(container.querySelector(".menu-surface--popout")).toBeNull();
    expect(container.querySelector(".popout-titlebar")).toBeNull();
    expect(container.querySelector(".popout-scale-shell")).toBeNull();
    expect(container.querySelector(".provider-grid")).not.toBeNull();
    expect(container.querySelector(".tray-move-handle")).toBeNull();
    expect(
      within(menu)
        .getAllByRole("button")
        .map((row) => [row.textContent, row.getAttribute("aria-keyshortcuts")]),
    ).toEqual([
      ["RefreshCtrl+R", "Control+R"],
      ["Settings...Ctrl+,", "Control+,"],
      ["Updates", null],
      ["QuitCtrl+Q", "Control+Q"],
    ]);
    expect(tauriMocks.setSurfaceMode).not.toHaveBeenCalled();
  });

  it("applies the saved Panel scale and the Windows accent to the panel", async () => {
    tauriMocks.getSystemAccentColor.mockResolvedValue("#c42b1c");
    const { container } = renderTrayPanel([provider("claude", "Claude", 35)], {
      trayScalePercent: 150,
    });

    await waitFor(() => {
      expect(
        container
          .querySelector<HTMLElement>(".menu-surface--tray")
          ?.style.getPropertyValue("--mac-selection-bg"),
      ).toBe("#c42b1c");
    });
    const surface = container.querySelector<HTMLElement>(".menu-surface--tray")!;
    expect(surface.style.getPropertyValue("--mac-selection-text")).toBe("#fff");
    expect(surface.style.zoom).toBe("1.5");
  });

  it("follows a new Windows accent the next time the panel takes focus", async () => {
    tauriMocks.getSystemAccentColor.mockResolvedValue("#0078d4");
    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);
    const selectionBg = () =>
      container
        .querySelector<HTMLElement>(".menu-surface--tray")
        ?.style.getPropertyValue("--mac-selection-bg");
    await waitFor(() => expect(selectionBg()).toBe("#0078d4"));

    tauriMocks.getSystemAccentColor.mockResolvedValue("#ffb900");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(selectionBg()).toBe("#ffb900"));
    expect(
      container
        .querySelector<HTMLElement>(".menu-surface--tray")!
        .style.getPropertyValue("--mac-selection-text"),
    ).toBe("#000");
  });

  it("reveals the tray panel if the native resize pass fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    windowMocks.getCurrentWindow.mockReturnValue({
      setSize: vi.fn().mockRejectedValue(new Error("resize failed")),
      close: vi.fn().mockResolvedValue(undefined),
      innerSize: vi.fn().mockResolvedValue({ width: 310, height: 200 }),
    });

    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);

    await waitFor(() => {
      expect(container.querySelector(".tray-panel-reveal--ready")).not.toBeNull();
    });
    expect(warn).toHaveBeenCalledWith("UsageBar tray panel resize failed", expect.any(Error));

    warn.mockRestore();
  });

  it("does not resize the native tray window for usage-only provider updates", async () => {
    const setSize = vi.fn().mockResolvedValue(undefined);
    windowMocks.getCurrentWindow.mockReturnValue({
      setSize,
      close: vi.fn().mockResolvedValue(undefined),
      innerSize: vi.fn().mockResolvedValue({ width: 310, height: 200 }),
    });

    const { container } = renderTrayPanel([provider("claude", "Claude", 35)]);

    await waitFor(() => {
      expect(container.querySelector(".tray-panel-reveal--ready")).not.toBeNull();
    });
    setSize.mockClear();
    tauriMocks.reanchorTrayPanel.mockClear();

    act(() => {
      emitEvent("provider-updated", provider("claude", "Claude", 52));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(setSize).not.toHaveBeenCalled();
    expect(tauriMocks.reanchorTrayPanel).not.toHaveBeenCalled();
  });

  it("opens the dense provider overview without reserving a tall window", async () => {
    const setSize = vi.fn().mockResolvedValue(undefined);
    windowMocks.getCurrentWindow.mockReturnValue({
      setSize,
      close: vi.fn().mockResolvedValue(undefined),
      innerSize: vi.fn().mockResolvedValue({ width: 310, height: 200 }),
    });
    const denseProviders = TEST_PROVIDER_CATALOG.slice(0, 36).map(([id, displayName]) =>
      provider(id, displayName),
    );

    renderTrayPanel(denseProviders, {
      enabledProviders: denseProviders.map((snapshot) => snapshot.providerId),
    });

    await waitFor(() => {
      expect(setSize).toHaveBeenCalledWith(
        expect.objectContaining({ width: 310, height: 200 }),
      );
    });
  });

  it("sizes the native window from the saved panel width and Panel scale", async () => {
    const setSize = vi.fn().mockResolvedValue(undefined);
    windowMocks.getCurrentWindow.mockReturnValue({
      setSize,
      close: vi.fn().mockResolvedValue(undefined),
      innerSize: vi.fn().mockResolvedValue({ width: 630, height: 200 }),
    });

    renderTrayPanel([provider("claude", "Claude", 35)], {
      trayPanelWidth: 420,
      trayScalePercent: 150,
    });

    await waitFor(() => {
      expect(setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 630 }));
    });
  });

  it("reserves the zoomed height for configured providers before their data arrives", async () => {
    const setSize = vi.fn().mockResolvedValue(undefined);
    windowMocks.getCurrentWindow.mockReturnValue({
      setSize,
      close: vi.fn().mockResolvedValue(undefined),
      innerSize: vi.fn().mockResolvedValue({ width: 465, height: 200 }),
    });
    const scrollHeight = vi
      .spyOn(Element.prototype, "scrollHeight", "get")
      .mockReturnValue(100);

    const savedSettings = {
      enabledProviders: ["codex", "antigravity"],
      trayScalePercent: 150,
    };
    const first = renderTrayPanel([provider("codex", "Codex", 61)], savedSettings);

    await waitFor(() => {
      expect(setSize).toHaveBeenCalledWith(
        expect.objectContaining({ width: 465, height: 501 }),
      );
    });
    first.unmount();
    setSize.mockClear();

    scrollHeight.mockReturnValue(700);
    renderTrayPanel([
      provider("codex", "Codex", 61),
      provider("antigravity", "Antigravity", 32),
    ], savedSettings);

    await waitFor(() => {
      expect(setSize).toHaveBeenCalledWith(
        expect.objectContaining({ width: 465, height: 501 }),
      );
    });
  });

});

function codexAccountRecord(id: string, emailHint: string) {
  return {
    id,
    nickname: null,
    emailHint,
    authSubject: null,
    providerAccountId: null,
    codexHomePath: `/example/${id}`,
    source: "managedByApp" as const,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    lastAuthenticatedAt: null,
  };
}

function codexAccountUsage(usedPercent: number) {
  return {
    email: null,
    providerAccountId: null,
    plan: "plus",
    allowed: true,
    limitReached: false,
    primaryWindow: { usedPercent, resetAt: null, limitWindowSeconds: 18_000 },
    secondaryWindow: null,
    credits: null,
    updatedAt: "2026-05-24T00:00:00Z",
  };
}

/** Two cached managed Codex accounts: `work` has usage, `home` has none. */
function codexAccountsState() {
  return {
    accounts: [
      codexAccountRecord("acc-work", "work@example.com"),
      codexAccountRecord("acc-home", "home@example.com"),
    ],
    snapshots: { "acc-work": codexAccountUsage(42) },
    displayNames: {
      "acc-work": "work@example.com",
      "acc-home": "home@example.com",
    },
    accountOrdinals: { "acc-work": 1, "acc-home": 2 },
    needsAuthentication: {},
  };
}

describe("TrayPanel overview account rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMocks.listeners.clear();
    tauriMocks.claudeReconciliationState.mockResolvedValue(null);
    tauriMocks.getDeepSeekPricingStatus.mockResolvedValue(null);
    tauriMocks.getUsageSpendSummary.mockResolvedValue({ rows: [], models: [] });
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "UsageBar",
      version: "0.70.0",
      buildNumber: "1",
      updateChannel: "stable",
      tagline: "",
    });
    tauriMocks.getSystemAccentColor.mockResolvedValue(null);
    tauriMocks.getProviderDetail.mockResolvedValue({ dashboardUrl: null, statusPageUrl: null });
    tauriMocks.getProviderStatuses.mockResolvedValue([]);
    tauriMocks.getWorkAreaRect.mockResolvedValue({ x: 0, y: 0, width: 1440, height: 900 });
    tauriMocks.getCurrentSurfaceState.mockResolvedValue({
      mode: "trayPanel",
      target: { kind: "summary" },
    });
    tauriMocks.getUpdateState.mockResolvedValue({
      status: "idle",
      version: null,
      error: null,
      progress: null,
      releaseUrl: null,
      canDownload: false,
      canApply: false,
      lastCheckedAt: null,
    });
    tauriMocks.getLocaleStrings.mockResolvedValue(buildBundle({ ActionRefresh: "Refresh" }));
    tauriMocks.updateSettings.mockResolvedValue(settings());
    tauriMocks.getCodexAccountsState.mockResolvedValue(codexAccountsState());
    // One saved Claude token account by default, so Claude keeps its single card.
    tauriMocks.getTokenAccounts.mockResolvedValue(
      claudeTokenAccountsBridge([["tok-work", "Team Alpha"]]),
    );
    tauriMocks.getProviderAccountUsage.mockResolvedValue(claudeProviderAccountUsage({}));
    tauriMocks.getProviderChartData.mockResolvedValue({
      providerId: "codex",
      costHistory: [],
      creditsHistory: [],
      usageBreakdown: [],
      localUsage: null,
    });
    eventMocks.listen.mockImplementation(
      (event: string, handler: (event: { payload: unknown }) => void) => {
        const listeners = eventMocks.listeners.get(event) ?? [];
        listeners.push(handler);
        eventMocks.listeners.set(event, listeners);
        return Promise.resolve(() => {});
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  /** Eight catalog providers; the default Overview shows the first six, codex among them. */
  function overviewProviders() {
    return TEST_PROVIDER_CATALOG.slice(0, 8).map(([id, displayName], index) =>
      provider(id, displayName, (index * 7) % 100),
    );
  }

  it("keeps one card per provider even when legacy all-account Overview was enabled", async () => {
    const { container } = renderTrayPanel(overviewProviders(), { ...overviewOrder(8), mergedOverviewAllAccounts: true }, overviewCatalog(8));

    await waitFor(() => {
      expect(container.querySelectorAll(".menu-stack__item")).toHaveLength(8);
    });
    expect(container.querySelector("#card-codex")).not.toBeNull();
    expect(container.querySelector("#card-codex\\/account\\/acc-work")).toBeNull();
    expect(tauriMocks.getCodexAccountsState).not.toHaveBeenCalled();
  });

});

function claudeTokenAccountsBridge(accounts: Array<[id: string, label: string]>) {
  return {
    providerId: "claude",
    support: {
      providerId: "claude",
      displayName: "Claude",
      title: "Claude token accounts",
      subtitle: "",
      placeholder: "",
    },
    accounts: accounts.map(([id, label], index) => ({
      id,
      label,
      addedAt: "2026-05-01T00:00:00Z",
      lastUsed: null,
      isActive: index === 0,
      claudeConfigDirectory: null,
      claudeConfigDirectoryAvailable: false,
    })),
    activeIndex: 0,
  };
}

function claudeAccountUsageEntry(usedPercent: number) {
  return {
    primary: { usedPercent, windowMinutes: 300, resetsAt: null },
    secondary: null,
    updatedAt: "2026-05-24T00:00:00Z",
  };
}

function claudeProviderAccountUsage(accounts: Record<string, ReturnType<typeof claudeAccountUsageEntry>>) {
  return { providerId: "claude", accounts };
}
