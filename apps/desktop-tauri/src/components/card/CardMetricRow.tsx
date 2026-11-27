import { useEffect, useState } from "react";
import type { RateWindowSnapshot, WorkdayTickStyle } from "../../types/bridge";
import { useLocale } from "../../hooks/useLocale";
import {
  useFormattedResetTime,
  type ResetTimeFormatMode,
} from "../../hooks/useFormattedResetTime";
import { isMonthlyLimitBlockActive } from "../../lib/monthlyLimitBlock";
import { quotaOnlyDescription, windowDetailText } from "../../lib/usageWindows";
import { localizeProviderText } from "../../lib/providerText";
import {
  metricResetText,
  metricRowPresentation,
  type MetricLane,
  type UsageThresholdSettings,
} from "../../lib/metricRowModel";
import UsageProgressBar from "../UsageProgressBar";

export interface MetricEntry {
  id: string;
  label: string;
  snap: RateWindowSnapshot;
  lane: MetricLane;
  resetFormatMode?: ResetTimeFormatMode;
}

export interface MetricRowDisplay {
  resetTimeRelative: boolean;
  showResetWhenExhausted?: boolean;
  showPace?: boolean;
  showAsUsed?: boolean;
  monthlyLimitBlockNow?: number;
  usageThresholds?: UsageThresholdSettings | null;
  quotaWarningMarkersVisible?: boolean;
  weeklyProgressWorkDays?: number | null;
  workdayTickStyle?: WorkdayTickStyle;
}

function useCountdownNow(ticking: boolean): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, [ticking]);
  return Date.now();
}

/** One rate window, with an inline gauge in the tray and more detail in Settings. */
export default function CardMetricRow({
  title,
  snap,
  lane,
  providerId,
  display,
  resetFormatMode,
  tray = false,
}: {
  title: string;
  snap: RateWindowSnapshot;
  lane: MetricLane;
  providerId: string;
  display: MetricRowDisplay;
  resetFormatMode?: ResetTimeFormatMode;
  tray?: boolean;
}) {
  const { t } = useLocale();
  const {
    resetTimeRelative,
    showResetWhenExhausted = false,
    showPace = true,
    showAsUsed = false,
    monthlyLimitBlockNow,
    usageThresholds = null,
    quotaWarningMarkersVisible = true,
    weeklyProgressWorkDays = null,
    workdayTickStyle = "subtle",
  } = display;
  // Upstream 0.69.0 #4091: a longer exhausted pool (Kimi's monthly membership)
  // blocks this window until the pool resets. Raw percentages stay untouched.
  const blocked = isMonthlyLimitBlockActive(
    snap.monthlyLimitBlock,
    monthlyLimitBlockNow ?? Date.now(),
  );
  const isInformational = snap.isInformational === true;
  const informationalReset = useFormattedResetTime(
    isInformational && !blocked ? snap.resetsAt : null,
    null,
    resetTimeRelative,
    resetFormatMode ?? "reset",
  );
  const now = useCountdownNow(!isInformational && !blocked && snap.resetsAt != null);
  const detailText = !tray && localizeProviderText(windowDetailText(snap), t);
  const trayTitle = <span className="menu-metric__title" title={title}>{title}</span>;
  if (blocked) {
    // Upstream `MetricRow` status layout: title plus one secondary status line.
    return (
      <div className={`menu-metric menu-metric--blocked${tray ? " menu-metric--tray" : ""}`}>
        {tray ? trayTitle : <span className="menu-metric__title">{title}</span>}
        <span className="menu-metric__status">{t("PanelBlockedByMonthlyLimit")}</span>
      </div>
    );
  }
  if (isInformational) {
    const description = tray ? quotaOnlyDescription(snap.resetDescription) : snap.resetDescription?.trim();
    const infoPrimary =
      localizeProviderText(description, t) || informationalReset || "—";
    const distinctReset = informationalReset !== infoPrimary ? informationalReset : null;
    if (tray) {
      return (
        <div className="menu-metric menu-metric--tray">
          {trayTitle}
          <span className="menu-metric__status" title={infoPrimary}>{infoPrimary}</span>
          {distinctReset && (
            <span className="menu-metric__reset" title={distinctReset}>{distinctReset}</span>
          )}
        </div>
      );
    }
    return (
      <div className="menu-metric">
        <span className="menu-metric__title">{title}</span>
        <div className="menu-metric__row">
          <span className="menu-metric__pct">{infoPrimary}</span>
          {distinctReset && <span className="menu-metric__reset">{distinctReset}</span>}
        </div>
        {detailText && (
          <div className="menu-metric__detail">{detailText}</div>
        )}
      </div>
    );
  }
  const reset = metricResetText(snap, resetTimeRelative, now, t);
  const row = metricRowPresentation(
    {
      snap,
      lane,
      providerId,
      resetText: reset,
      compact: false,
      tray,
      showAsUsed,
      showResetWhenExhausted,
      paceEnabled: showPace,
      usageThresholds,
      quotaWarningMarkersVisible,
      weeklyProgressWorkDays,
      workdayTickStyle,
      now,
    },
    t,
  );
  if (tray) {
    const deadline = metricResetText(snap, resetTimeRelative, now, t, true);
    return (
      <div className="menu-metric menu-metric--tray">
        {trayTitle}
        <UsageProgressBar bar={row.bar} label={title} inlineValue={row.percentText} paceHint={row.metaText} />
        {deadline && (
          <span className="menu-metric__reset" title={reset ?? deadline}>{deadline}</span>
        )}
      </div>
    );
  }
  return (
    <div className="menu-metric">
      <span className="menu-metric__title">{title}</span>
      <UsageProgressBar bar={row.bar} label={title} paceHint={row.metaText} />
      {(row.percentText || row.resetText) && (
        <div className="menu-metric__head">
          {row.percentText && <span className="menu-metric__percent">{row.percentText}</span>}
          {row.resetText && <span className="menu-metric__reset">{row.resetText}</span>}
        </div>
      )}
      {row.metaText && <div className="menu-metric__meta">{row.metaText}</div>}
      {detailText && (
        <div className="menu-metric__detail">{detailText}</div>
      )}
      {snap.isExhausted && (
        <div className="menu-metric__exhausted">{t("DetailWindowExhausted")}</div>
      )}
    </div>
  );
}
