import { Fragment, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { BootstrapState, ProviderUsageSnapshot } from "../types/bridge";
import { resetFlyoutPosition } from "../lib/tauri";
import { useTrayPanelController } from "../hooks/useTrayPanelController";
import { useStayAwakeStatus } from "../hooks/useStayAwakeStatus";
import MenuCard from "../components/MenuCard";
import MenuSurface, { MenuEmpty } from "../components/MenuSurface";
import UpdateBanner from "../components/UpdateBanner";
import ProviderGrid from "../components/ProviderGrid";
import PanelResizeHandle from "../components/PanelResizeHandle";
import AgentSessions from "../components/AgentSessions";
import { accentSelectionStyle } from "../lib/menuSelection";
import { expandOverviewAccountRows, type OverviewEntry } from "../lib/overviewAccountRows";
import { useCodexAccountsState } from "../hooks/useCodexAccountsState";
import { useClaudeTokenOverviewAccounts } from "../hooks/useClaudeTokenOverviewAccounts";
import { useClaudeSwapOverviewAccounts } from "../hooks/useClaudeSwapOverviewAccounts";

/**
 * Tray popover surface — two modes like macOS CodexBar:
 * 1. Overview (default): provider grid + all cards stacked
 * 2. Detail: click a provider in grid → show only that provider's card
 */
export default function TrayPanel({ state }: { state: BootstrapState }) {
  const stayAwakeHeld = useStayAwakeStatus();
  const {
    t,
    settings,
    isRefreshing,
    refreshingProviderIds,
    hasCachedData,
    trayScale,
    panelStyle,
    panelWidth,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
    handleResizeGestureEnd,
    accentColor,
    sorted,
    gridProviders,
    selectedProviderId,
    gridExpanded,
    setGridExpanded,
    visibleProviders,
    footerGroups,
    statusLine,
    updateState,
    checkNow,
    download,
    apply,
    dismiss,
    openRelease,
    openSettings,
    handleGridClick,
    handleReorder,
    handleGestureStart,
    handleGestureEnd,
    revealClassName,
  } = useTrayPanelController(state);
  // Read the cached Codex account store only while "Show all accounts in Overview" is on.
  const codexAccounts = useCodexAccountsState({
    enabled: settings.mergedOverviewAllAccounts === true,
  });
  // Saved Claude token accounts and their cached usage, under the same setting.
  const claudeTokenAccounts = useClaudeTokenOverviewAccounts({
    enabled: settings.mergedOverviewAllAccounts === true,
  });
  // claude-swap/tcr pool accounts and their cached usage, under the same setting.
  const claudeSwapAccounts = useClaudeSwapOverviewAccounts({
    enabled: settings.mergedOverviewAllAccounts === true,
  });

  const surfaceStyle = {
    zoom: trayScale,
    ...accentSelectionStyle(accentColor),
  } as CSSProperties;
  const hoverHighlight = settings.highlightMenuCardsOnHover ?? true;
  const movable = settings.trayPanelMovable ?? false;
  const containerClassName = movable
    ? `${revealClassName} tray-panel-reveal--movable`
    : revealClassName;
  const moveHandle = movable ? <TrayMoveHandle hint={t("TrayMoveHandleHint")} /> : null;

  const resizeHandles = (["left", "right"] as const).map((side) => (
    <PanelResizeHandle
      key={side}
      side={side}
      width={panelWidth}
      zoom={trayScale}
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeEnd={handleResizeEnd}
      onResizeGestureEnd={handleResizeGestureEnd}
    />
  ));

  const banner = (
    <UpdateBanner
      updateState={updateState}
      onCheck={checkNow}
      onDownload={download}
      onApply={apply}
      onDismiss={dismiss}
      onOpenRelease={openRelease}
    />
  );

  const renderProviderCard = (p: ProviderUsageSnapshot, entry: OverviewEntry | null = null) => {
    const isSelected =
      selectedProviderId !== null && p.providerId === selectedProviderId;
    const rowKey = entry?.key ?? p.providerId;
    // An account row's label is already privacy-safe (generic when hidden), so
    // it stays visible; a plain card keeps the account email hidden as before.
    const hideEmail = entry?.accountId != null ? false : settings.hidePersonalInfo;
    return (
      <div
        className={`menu-stack__item${isSelected ? " menu-stack__item--selected" : ""}`}
        id={`card-${rowKey}`}
        key={rowKey}
      >
        <MenuCard
          provider={p}
          isRefreshing={refreshingProviderIds.has(p.providerId)}
          display={{
            hideEmail,
            resetTimeRelative: settings.resetTimeRelative,
            showResetWhenExhausted: settings.showResetWhenExhausted,
            showPace: settings.showPace ?? true,
            showAsUsed: settings.showAsUsed,
          }}
          accentColor={settings.providerAccentColors[p.providerId]}
        />
      </div>
    );
  };

  // Overview: each selected provider, expanded to one row per cached account
  // (Codex managed accounts, claude-swap/tcr pool accounts, Claude token accounts)
  // when the setting is on. Rows never take a provider slot; the cap applies first.
  const cardEntries: OverviewEntry[] =
    selectedProviderId === null && settings.mergedOverviewAllAccounts === true
      ? expandOverviewAccountRows(
          visibleProviders,
          codexAccounts.loaded ? codexAccounts : null,
          {
            hidePersonalInfo: settings.hidePersonalInfo,
            accountWord: t("Account"),
            unavailableText: t("CodexAccountsUsageUnavailable"),
          },
          claudeTokenAccounts.loaded ? claudeTokenAccounts : null,
          claudeSwapAccounts.loaded ? claudeSwapAccounts : null,
        )
      : visibleProviders.map((provider) => ({
          key: provider.providerId,
          provider,
          accountId: null,
        }));

  const stayAwakeStatus = stayAwakeHeld ? (
    <p className="menu-surface__hint" role="status">
      {t("TrayStayAwakeActive")}
    </p>
  ) : null;

  if (sorted.length === 0) {
    return (
      <div className={containerClassName}>
        {moveHandle}
        <MenuSurface banner={banner} footerGroups={footerGroups}
          statusLine={statusLine} style={surfaceStyle} hoverHighlight={hoverHighlight}
          variant={panelStyle}>
          {stayAwakeStatus}
          {settings.agentSessionsEnabled && <AgentSessions key={settings.agentSessionsLocalOnly ? "local-only" : "all-hosts"} />}
          <MenuEmpty
            isLoading={isRefreshing && !hasCachedData}
            onSettings={openSettings}
          />
        </MenuSurface>
        {resizeHandles}
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      {moveHandle}
      <MenuSurface banner={banner} footerGroups={footerGroups}
        statusLine={statusLine} style={surfaceStyle} hoverHighlight={hoverHighlight}
        variant={panelStyle}>
        {stayAwakeStatus}
        {settings.agentSessionsEnabled && <AgentSessions key={settings.agentSessionsLocalOnly ? "local-only" : "all-hosts"} />}
        <ProviderGrid
          providers={gridProviders}
          selectedProviderId={selectedProviderId}
          showAsUsed={settings.showAsUsed}
          showProviderIcons={settings.switcherShowsIcons}
          variant={panelStyle}
          expanded={gridExpanded}
          onExpandedChange={setGridExpanded}
          onSelect={handleGridClick}
          onReorder={handleReorder}
          onGestureStart={handleGestureStart}
          onGestureEnd={handleGestureEnd}
        />
        <div className="provider-grid__divider" />
        <div className="menu-stack">
          {cardEntries.map((entry, idx) => (
            <Fragment key={entry.key}>
              {idx > 0 && <div className="menu-stack__sep" />}
              {renderProviderCard(entry.provider, entry)}
            </Fragment>
          ))}
        </div>
      </MenuSurface>
      {resizeHandles}
    </div>
  );
}

/**
 * The move strip of the **Movable panel** setting: a thin band along the top
 * of the panel with a small grab bar. Dragging it moves the window
 * (`startDragging` enters the native Win32 move loop; the backend records
 * where the panel lands when that loop ends and keeps the panel open while
 * the button is held). Double-clicking it anchors the panel to the tray
 * again. Primary button only, so a right-click doesn't start a drag.
 */
function TrayMoveHandle({ hint }: { hint: string }) {
  return (
    <div
      className="tray-move-handle"
      aria-hidden
      title={hint}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (e.detail === 2) {
          void resetFlyoutPosition().catch((err) =>
            console.error("[tray-move] resetFlyoutPosition failed:", err),
          );
          return;
        }
        void getCurrentWindow()
          .startDragging()
          .catch((err) => console.error("[tray-move] startDragging failed:", err));
      }}
    >
      <span className="tray-move-handle__grip" />
    </div>
  );
}
