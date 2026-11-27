import type { CSSProperties } from "react";
import type { ProviderUsageSnapshot } from "../types/bridge";
import { useLocale } from "../hooks/useLocale";
import { providerAllowsPace } from "../lib/providerPace";
import { localizeWindowLabel } from "../lib/windowLabels";
import { useMonthlyLimitBlockNow } from "../hooks/useMonthlyLimitBlockNow";
import { providerBarAccent } from "./providers/providerIcons";
import { InventoryItemRow } from "./InventoryRows";
import CardHeader from "./card/CardHeader";
import CardMetricRow, { type MetricEntry } from "./card/CardMetricRow";
import { hideEmailsInText } from "../lib/personalInfo";
import { quotaOnlyDescription } from "../lib/usageWindows";

interface MenuCardProps {
  provider: ProviderUsageSnapshot;
  display: {
    hideEmail: boolean;
    resetTimeRelative: boolean;
    showResetWhenExhausted?: boolean;
    showPace?: boolean;
    showAsUsed?: boolean;
  };
  isRefreshing?: boolean;
  accentColor?: string;
}

/**
 * Upstream `MenuCardView.email(from:)`: the provider-reported email, else the
 * active token-account label. Hide Personal Info shows neither, as upstream
 * `PersonalInfoRedactor.redactEmail` / `redactAccountLabel` blank them
 * (`PersonalInfoRedactor.swift:18`, `emailPlaceholder = ""`).
 */
export function headerAccount(
  provider: Pick<ProviderUsageSnapshot, "accountEmail" | "accountLabel">,
  hideEmail: boolean,
): string | null {
  if (hideEmail) return null;
  return provider.accountEmail?.trim() || provider.accountLabel?.trim() || null;
}

function cardMetrics(
  provider: ProviderUsageSnapshot,
  t: ReturnType<typeof useLocale>["t"],
  language: ReturnType<typeof useLocale>["language"],
): MetricEntry[] {
  const metrics: MetricEntry[] = [];
  if (provider.providerId !== "wayfinder") {
    metrics.push({
      id: "primary",
      label:
        localizeWindowLabel(provider.primaryLabel, t, language, provider.primary.windowMinutes) ||
        t("DetailWindowPrimary"),
      snap: provider.primary,
      lane: "primary",
    });
  }
  if (provider.secondary) {
    metrics.push({
      id: "secondary",
      label: provider.secondaryLabelKey
        ? t(provider.secondaryLabelKey)
        : localizeWindowLabel(provider.secondaryLabel, t, language, provider.secondary.windowMinutes) ||
          t("DetailWindowSecondary"),
      snap: provider.secondary,
      lane: "secondary",
    });
  }
  if (provider.modelSpecific) {
    metrics.push({
      id: "model-specific",
      label: t("DetailWindowModelSpecific"),
      snap: provider.modelSpecific,
      lane: "tertiary",
    });
  }
  if (provider.tertiary) {
    metrics.push({
      id: "tertiary",
      // Upstream 0.48.0: the cadence label (e.g. "Monthly") when the provider names one.
      label: localizeWindowLabel(provider.tertiaryLabel, t, language, provider.tertiary.windowMinutes) ||
        t("DetailWindowTertiary"),
      snap: provider.tertiary,
      lane: "tertiary",
    });
  }
  for (const extra of provider.extraRateWindows ?? []) {
    metrics.push({
      id: `extra-${extra.id}`,
      label:
        localizeWindowLabel(extra.title, t, language, extra.window.windowMinutes, extra.id) ||
        extra.title,
      snap: extra.window,
      lane: "extra",
      resetFormatMode: extra.id === "reset-credits" ? "expires" : "reset",
    });
  }
  // A window the provider keeps for the tray and float bar only (upstream LithosAI has no card bar).
  return metrics.filter(({ snap }) => {
    if (snap.hiddenOnCard) return false;
    return !snap.isInformational || snap.resetsAt != null || !snap.resetDescription?.trim()
      || quotaOnlyDescription(snap.resetDescription) != null;
  });
}

export default function MenuCard({
  provider,
  display,
  isRefreshing = false,
  accentColor,
}: MenuCardProps) {
  const { t, language } = useLocale();
  const { hideEmail, showPace = true } = display;
  const metrics = provider.error ? [] : cardMetrics(provider, t, language);
  const inventory = provider.error ? [] : provider.inventory?.filter((item) => item.id === "reset-credits") ?? [];
  const hasDetails = metrics.length > 0 || inventory.length > 0;
  const monthlyLimitBlockNow = useMonthlyLimitBlockNow(
    metrics.map((metric) => metric.snap.monthlyLimitBlock),
  );
  const metricDisplay = {
    ...display,
    monthlyLimitBlockNow,
    showPace: showPace && providerAllowsPace(
      provider.providerId, provider.sourceLabel, provider.paceAuthoritative,
    ),
  };
  const accent = providerBarAccent(provider.providerId, accentColor);
  const classes = [
    "menu-card",
    hasDetails ? "menu-card--with-details" : "menu-card--header-only",
    provider.error && "menu-card--error",
    isRefreshing && "menu-card--refreshing",
  ];

  return (
    <article
      className={classes.filter(Boolean).join(" ")}
      aria-busy={isRefreshing}
      style={{ "--provider-accent": accent } as CSSProperties}
    >
      <CardHeader
        name={provider.displayName}
        email={provider.providerId === "wayfinder" ? null : headerAccount(provider, hideEmail)}
        plan={null}
        error={hideEmail ? hideEmailsInText(provider.error) : provider.error}
        updatedAt={provider.updatedAt}
        isRefreshing={isRefreshing}
        compact
      />
      {hasDetails && (
        <>
          <div className="menu-card__divider" />
          <section className="menu-card__metrics">
            {metrics.map((metric) => (
              <CardMetricRow
                key={metric.id}
                title={metric.label}
                snap={metric.snap}
                lane={metric.lane}
                providerId={provider.providerId}
                display={metricDisplay}
                resetFormatMode={metric.resetFormatMode}
                tray
              />
            ))}
            {inventory.map((item) => (
              <InventoryItemRow
                key={item.id}
                item={item}
                resetTimeRelative={display.resetTimeRelative}
                lineClassName="menu-metric__inventory"
                expiryClassName="menu-metric__reset"
              />
            ))}
          </section>
        </>
      )}
    </article>
  );
}
