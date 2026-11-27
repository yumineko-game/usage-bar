import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import type {
  BootstrapState,
  ProviderCatalogEntry,
  ProviderUsageSnapshot,
  SettingsTabId,
  SettingsUpdate,
} from "../../types/bridge";
import { useLocale } from "../../hooks/useLocale";
import { reorderVisibleProviders } from "../../lib/tauri";
import codexbarIcon from "../../assets/codexbar-icon.png";
import {
  SIDEBAR_PANES,
  canUndoProviderOrder,
  filterProvidersByQuery,
  nextEnabledProviders,
  type ProviderOrderUndo,
  type SidebarPane,
} from "./settingsTabs";
import {
  ProvidersSidebar,
  type ProviderSidebarRow,
  type ProviderSidebarStatus,
} from "./providers/ProvidersSidebar";

// White glyphs on the pane chips, standing in for the macOS SF Symbols.
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const PANE_GLYPHS: Record<Exclude<SettingsTabId, "providers" | "about">, ReactElement> = {
  general: (
    <Glyph>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </Glyph>
  ),
};

function PaneChip({ pane }: { pane: SidebarPane }) {
  if (pane.chip === null || pane.id === "about") {
    return <img className="settings-sidebar__app-icon" src={codexbarIcon} alt="" aria-hidden />;
  }
  return (
    <span className={`settings-sidebar__chip settings-sidebar__chip--${pane.chip}`} aria-hidden>
      {PANE_GLYPHS[pane.id]}
    </span>
  );
}

/** Fetch state of one provider for its sidebar dot. */
function deriveProviderStatus(
  isEnabled: boolean,
  snap: ProviderUsageSnapshot | null,
): ProviderSidebarStatus {
  if (!isEnabled) return "disabled";
  if (!snap) return "loading";
  if (snap.error) return "error";
  const updatedMs = new Date(snap.updatedAt).getTime();
  if (Number.isFinite(updatedMs) && (Date.now() - updatedMs) / 60_000 > 10) return "stale";
  return "ok";
}

interface SettingsSidebarProps {
  settings: BootstrapState["settings"];
  /** Provider catalog in the saved provider order. */
  providers: ProviderCatalogEntry[];
  snapshots: ProviderUsageSnapshot[];
  set: (patch: SettingsUpdate) => void;
  saving: boolean;
  activeTab: SettingsTabId;
  /** Provider shown while `activeTab` is `providers`. */
  selectedProviderId: string | null;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  onSelectPane: (tab: SettingsTabId) => void;
  onSelectProvider: (providerId: string) => void;
}

/**
 * Settings navigation and searchable provider list.
 */
export function SettingsSidebar({
  settings,
  providers,
  snapshots,
  set,
  saving,
  activeTab,
  selectedProviderId,
  searchText,
  onSearchTextChange,
  onSelectPane,
  onSelectProvider,
}: SettingsSidebarProps) {
  const { t } = useLocale();
  // Local order so a reorder shows at once, before `reorder_providers` settles.
  const [ordered, setOrdered] = useState(providers);
  const [prevProviders, setPrevProviders] = useState(providers);
  if (providers !== prevProviders) {
    setPrevProviders(providers);
    setOrdered(providers);
  }

  const enabled = useMemo(() => new Set(settings.enabledProviders), [settings.enabledProviders]);
  const enabledCount = ordered.filter((p) => enabled.has(p.id)).length;
  // The last saved order change, for Undo. It goes stale once the order moves again.
  const [undo, setUndo] = useState<ProviderOrderUndo | null>(null);
  const undoable = canUndoProviderOrder(undo, ordered.map((p) => p.id));
  const rows: ProviderSidebarRow[] = useMemo(() => {
    const snapshotMap = new Map(snapshots.map((s) => [s.providerId, s]));
    return filterProvidersByQuery(ordered, searchText).map((p) => {
      const isOn = enabled.has(p.id);
      return {
        id: p.id,
        displayName: p.displayName,
        enabled: isOn,
        status: deriveProviderStatus(isOn, snapshotMap.get(p.id) ?? null),
      };
    });
  }, [enabled, ordered, searchText, snapshots]);

  const toggleEnabled = (id: string, on: boolean) => {
    set({ enabledProviders: nextEnabledProviders(ordered, enabled, id, on) });
  };

  /** Shows `ids` at once; the saved order follows from the command. */
  const showOrder = (ids: string[]) => {
    const byId = new Map(ordered.map((p) => [p.id, p]));
    setOrdered(ids.map((id) => byId.get(id)).filter((p): p is ProviderCatalogEntry => Boolean(p)));
  };

  const handleReorder = (ids: string[]) => {
    const entry: ProviderOrderUndo = {
      before: ordered.map((p) => p.id),
      after: ids,
      restoreAlphabetical: null,
    };
    showOrder(ids);
    setUndo(entry);
    void reorderVisibleProviders(ids).catch(() => {
      setOrdered(providers);
      setUndo((current) => (current === entry ? null : current));
    });
  };

  const undoOrder = () => {
    if (!undo || !undoable || saving) return;
    const entry = undo;
    setUndo(null);
    showOrder(entry.before);
    void reorderVisibleProviders(entry.before).catch(() => setOrdered(providers));
  };

  return (
    <aside
      className="settings-sidebar"
      aria-label={t("SettingsSidebarAriaLabel")}
      onKeyDown={(e) => {
        // Ctrl+Z undoes the last provider order change, unless a text field has focus.
        if (!undoable || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if (e.key.toLowerCase() !== "z") return;
        if ((e.target as HTMLElement).closest("input, textarea")) return;
        e.preventDefault();
        undoOrder();
      }}
    >
      <div className="settings-sidebar__toolbar">
        <div className="settings-sidebar__search">
          <svg
            className="settings-sidebar__search-icon"
            viewBox="0 0 16 16"
            width={12}
            height={12}
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            type="search"
            className="settings-sidebar__search-input"
            placeholder={t("ProviderSidebarSearch")}
            aria-label={t("ProviderSidebarSearch")}
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchText) {
                e.preventDefault();
                onSearchTextChange("");
              }
            }}
          />
          {searchText && (
            <button
              type="button"
              className="settings-sidebar__search-clear"
              aria-label={t("ProviderSidebarClearSearch")}
              title={t("ProviderSidebarClearSearch")}
              onClick={() => onSearchTextChange("")}
            >
              <svg viewBox="0 0 16 16" width={10} height={10} aria-hidden>
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="settings-sidebar__scroll">
        <ul className="settings-sidebar__panes">
          {SIDEBAR_PANES.map((pane) => {
            const active = activeTab === pane.id;
            return (
              <li key={pane.id}>
                <button
                  type="button"
                  className={`settings-sidebar__pane${active ? " settings-sidebar__pane--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  data-pane-id={pane.id}
                  onClick={() => onSelectPane(pane.id)}
                >
                  <PaneChip pane={pane} />
                  <span className="settings-sidebar__label">{t(pane.labelKey)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="settings-sidebar__section-header">
          <span>{t("TabProviders")}</span>
          <span className="settings-sidebar__count">
            {t("SettingsSidebarProvidersOnCount").replace("{}", String(enabledCount))}
          </span>
        </div>
        <ProvidersSidebar
          providers={rows}
          selectedId={activeTab === "providers" ? selectedProviderId : null}
          canReorder={!searchText.trim()}
          onSelect={onSelectProvider}
          onReorder={handleReorder}
          onToggleEnabled={toggleEnabled}
          disabled={saving}
        />
      </div>
    </aside>
  );
}
