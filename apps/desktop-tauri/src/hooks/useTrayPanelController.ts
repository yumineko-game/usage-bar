import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { BootstrapState, TrayPanelStyle } from "../types/bridge";
import {
  dismissTrayPanel,
  getSystemAccentColor,
  openSettingsWindow,
  quitApp as quitApplication,
} from "../lib/tauri";
import { useProviders } from "./useProviders";
import { useSettings } from "./useSettings";
import { useUpdateState } from "./useUpdateState";
import { useLocale } from "./useLocale";
import { useProviderSwitcherKeys } from "./useProviderSwitcherKeys";
import { useSurfaceTarget } from "./useSurfaceMode";
import { useTrayPanelLayout } from "./useTrayPanelLayout";
import type { MenuFooterRow } from "../components/MenuSurface";
import { orderProviderSnapshots } from "../lib/providerOrder";
import { clampTrayPanelWidth, clampTrayScalePercent } from "../lib/trayScale";
import {
  hydrateProviderSlots,
  orderedEnabledProviderSlots,
} from "../lib/trayProviders";

const TRAY_INITIAL_REFRESH_DELAY_MS = 250;
const DENSE_OVERVIEW_THRESHOLD = 32;
const TRAY_CONTROLS_HEIGHT = 104;
const TRAY_CARD_HEIGHT = 75;
const TRAY_CARD_HEIGHT_BY_PROVIDER: Readonly<Record<string, number>> = {
  antigravity: 125,
  codex: 105,
};

/**
 * Controller for the tray flyout surface — state, memos, effects, and
 * handlers. JSX stays in `TrayPanel`.
 */
export function useTrayPanelController(state: BootstrapState) {
  const { settings } = useSettings(state.settings);
  const panelWidth = clampTrayPanelWidth(settings.trayPanelWidth);
  const {
    providers,
    isRefreshing,
    refreshingProviderIds,
    refresh,
    hasCachedData,
    hasLoadedCache,
  } = useProviders({
    initialRefreshDelayMs: TRAY_INITIAL_REFRESH_DELAY_MS,
    forceRefreshOnMount: settings.refreshAllProvidersOnMenuOpen,
  });
  const { updateState, checkNow, download, apply, dismiss, openRelease } =
    useUpdateState();

  const { t } = useLocale();
  const surfaceTarget = useSurfaceTarget("trayPanel");

  const trayScale = clampTrayScalePercent(settings.trayScalePercent) / 100;
  const panelStyle: TrayPanelStyle = settings.trayPanelStyle === "classic" ? "classic" : "modern";

  const [accentColor, setAccentColor] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const readAccent = () => {
      void getSystemAccentColor().then(
        (color) => {
          if (!cancelled) setAccentColor(color);
        },
        () => {},
      );
    };
    readAccent();
    window.addEventListener("focus", readAccent);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", readAccent);
    };
  }, []);

  const sorted = useMemo(
    () =>
      orderProviderSnapshots(
        providers,
        state.providers,
        settings.enabledProviders,
        settings.providerOrder,
      ),
    [providers, settings.enabledProviders, settings.providerOrder, state.providers],
  );
  const denseProviderSlots = useMemo(
    () =>
      orderedEnabledProviderSlots(
        state.providers,
        settings.enabledProviders,
        sorted,
        settings.providerOrder,
      ),
    [settings.enabledProviders, settings.providerOrder, sorted, state.providers],
  );
  const providersById = useMemo(
    () => new Map(sorted.map((provider) => [provider.providerId, provider])),
    [sorted],
  );
  const initialProviderId =
    surfaceTarget?.kind === "provider" ? surfaceTarget.providerId : null;

  // null = overview (all providers), string = single provider detail
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    initialProviderId,
  );
  const [gridExpanded, setGridExpanded] = useState(false);
  const expectsDenseOverview =
    selectedProviderId === null &&
    !gridExpanded &&
    settings.enabledProviders.length + 1 > DENSE_OVERVIEW_THRESHOLD;
  const denseTrayProviders = useMemo(() => {
    if (!expectsDenseOverview) return sorted;
    return hydrateProviderSlots(denseProviderSlots, providersById);
  }, [denseProviderSlots, expectsDenseOverview, providersById, sorted]);

  // What the switcher grid displays: the dense overview shows hydrated slots
  // (with placeholders); everything else shows the sorted providers.
  const gridProviders = expectsDenseOverview ? denseTrayProviders : sorted;

  useEffect(() => {
    setSelectedProviderId(initialProviderId);
  }, [initialProviderId]);

  // Cards to display based on mode
  // Overview: all providers in the grid — non-error first, then errors
  // Detail: only the selected provider's card (macOS shows single provider)
  const visibleProviders = useMemo(() => {
    if (selectedProviderId === null) {
      // Overview: show providers in the same Settings/catalog order as the grid.
      if (sorted.length + 1 > DENSE_OVERVIEW_THRESHOLD && !gridExpanded) {
        return denseTrayProviders.slice(0, 4);
      }
      return sorted;
    }
    // Detail: show ONLY the selected provider (macOS behavior — no appended errors)
    const match = sorted.find((p) => p.providerId === selectedProviderId);
    if (!match) {
      return sorted;
    }
    return [match];
  }, [
    denseTrayProviders,
    sorted,
    selectedProviderId,
    gridExpanded,
  ]);

  const openSettings = useCallback(() => {
    void openSettingsWindow("general").finally(() => {
      void getCurrentWindow().close();
    });
  }, []);
  const openUpdates = useCallback(() => {
    void openSettingsWindow("about").finally(() => {
      void getCurrentWindow().close();
    });
  }, []);
  const quitApp = useCallback(() => {
    void quitApplication();
  }, []);

  const footerGroups: MenuFooterRow[][] = [
    [
      { id: "refresh", label: t("ActionRefresh"), shortcut: "Ctrl+R", onClick: refresh },
      { id: "settings", label: t("MenuSettings"), shortcut: "Ctrl+,", onClick: openSettings },
      {
        id: "about",
        label: t("UpdatesTitle"),
        onClick: openUpdates,
      },
      { id: "quit", label: t("MenuQuit"), shortcut: "Ctrl+Q", onClick: quitApp },
    ],
  ];

  const layoutKey = useMemo(
    () =>
      [
        selectedProviderId ?? "overview",
        gridExpanded ? "expanded" : "collapsed",
        isRefreshing ? "refreshing" : "idle",
        updateState.status,
        updateState.version ?? "",
        updateState.error ?? "",
        expectsDenseOverview ? "dense" : "normal",
        hasLoadedCache ? "cache-ready" : "cache-pending",
        visibleProviders.map((provider) => provider.providerId).join(","),
        trayScale,
      ].join("|"),
    [
      selectedProviderId,
      gridExpanded,
      isRefreshing,
      updateState.status,
      updateState.version,
      updateState.error,
      expectsDenseOverview,
      hasLoadedCache,
      visibleProviders,
      trayScale,
    ],
  );

  const heightSlots = selectedProviderId !== null
    ? [selectedProviderId]
    : (expectsDenseOverview ? denseProviderSlots.slice(0, 4) : denseProviderSlots)
        .map((provider) => provider.id);
  const cardsHeight = heightSlots.reduce(
    (height, id) => height + (TRAY_CARD_HEIGHT_BY_PROVIDER[id] ?? TRAY_CARD_HEIGHT),
    0,
  );
  const { layoutReady } = useTrayPanelLayout({
    canMeasure: hasLoadedCache || sorted.length > 0,
    layoutKey,
    zoom: trayScale,
    baseWidth: panelWidth,
    fixedHeight: TRAY_CONTROLS_HEIGHT + Math.max(TRAY_CARD_HEIGHT, cardsHeight),
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        void dismissTrayPanel().catch(() => {});
        return;
      }
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case "r":
          e.preventDefault();
          refresh();
          break;
        case ",":
          e.preventDefault();
          openSettings();
          break;
        case "q":
          e.preventDefault();
          quitApp();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refresh, openSettings, quitApp]);

  const handleGridClick = useCallback(
    (providerId: string | null) => {
      setSelectedProviderId(providerId);
    },
    [],
  );
  const gridProviderIds = useMemo(
    () => gridProviders.map((provider) => provider.providerId),
    [gridProviders],
  );
  useProviderSwitcherKeys({
    providerIds: gridProviderIds,
    selectedProviderId,
    onSelect: handleGridClick,
  });
  const revealClassName = `tray-panel-reveal${layoutReady ? " tray-panel-reveal--ready" : ""}`;

  return {
    t,
    settings,
    panelStyle,
    panelWidth,
    isRefreshing,
    refreshingProviderIds,
    refresh,
    hasCachedData,
    trayScale,
    accentColor,
    sorted,
    gridProviders,
    selectedProviderId,
    gridExpanded,
    setGridExpanded,
    visibleProviders,
    layoutReady,
    footerGroups,
    updateState,
    checkNow,
    download,
    apply,
    dismiss,
    openRelease,
    openSettings,
    handleGridClick,
    revealClassName,
  };
}
