import { Fragment, type CSSProperties } from "react";
import type { BootstrapState, ProviderUsageSnapshot } from "../types/bridge";
import { useTrayPanelController } from "../hooks/useTrayPanelController";
import MenuCard from "../components/MenuCard";
import MenuSurface, { MenuEmpty } from "../components/MenuSurface";
import UpdateBanner from "../components/UpdateBanner";
import ProviderGrid from "../components/ProviderGrid";
import { accentSelectionStyle } from "../lib/menuSelection";

/**
 * Tray popover surface — two modes like macOS CodexBar:
 * 1. Overview (default): provider grid + all cards stacked
 * 2. Detail: click a provider in grid → show only that provider's card
 */
export default function TrayPanel({ state }: { state: BootstrapState }) {
  const {
    settings,
    isRefreshing,
    refreshingProviderIds,
    hasCachedData,
    trayScale,
    panelStyle,
    accentColor,
    sorted,
    gridProviders,
    selectedProviderId,
    gridExpanded,
    setGridExpanded,
    visibleProviders,
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
  } = useTrayPanelController(state);
  const surfaceStyle = {
    zoom: trayScale,
    ...accentSelectionStyle(accentColor),
  } as CSSProperties;
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

  const renderProviderCard = (p: ProviderUsageSnapshot) => {
    const isSelected =
      selectedProviderId !== null && p.providerId === selectedProviderId;
    return (
      <div
        className={`menu-stack__item${isSelected ? " menu-stack__item--selected" : ""}`}
        id={`card-${p.providerId}`}
        key={p.providerId}
      >
        <MenuCard
          provider={p}
          isRefreshing={refreshingProviderIds.has(p.providerId)}
          display={{
            hideEmail: true,
            resetTimeRelative: settings.resetTimeRelative,
            showPace: true,
            showAsUsed: settings.showAsUsed,
          }}
        />
      </div>
    );
  };

  if (sorted.length === 0) {
    return (
      <div className={revealClassName}>
        <MenuSurface banner={banner} footerGroups={footerGroups}
          style={surfaceStyle}
          variant={panelStyle}>
          <MenuEmpty
            isLoading={isRefreshing && !hasCachedData}
            onSettings={openSettings}
          />
        </MenuSurface>
      </div>
    );
  }

  return (
    <div className={revealClassName}>
      <MenuSurface banner={banner} footerGroups={footerGroups}
        style={surfaceStyle}
        variant={panelStyle}>
        <ProviderGrid
          providers={gridProviders}
          selectedProviderId={selectedProviderId}
          showAsUsed={settings.showAsUsed}
          variant={panelStyle}
          expanded={gridExpanded}
          onExpandedChange={setGridExpanded}
          onSelect={handleGridClick}
        />
        <div className="provider-grid__divider" />
        <div className="menu-stack">
          {visibleProviders.map((provider, idx) => (
            <Fragment key={provider.providerId}>
              {idx > 0 && <div className="menu-stack__sep" />}
              {renderProviderCard(provider)}
            </Fragment>
          ))}
        </div>
      </MenuSurface>
    </div>
  );
}
