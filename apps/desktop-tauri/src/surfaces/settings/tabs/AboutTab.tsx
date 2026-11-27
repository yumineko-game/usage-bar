import { useEffect, useState } from "react";
import { useLocale } from "../../../hooks/useLocale";
import { useUpdateState } from "../../../hooks/useUpdateState";
import { getAppInfo } from "../../../lib/tauri";
import { SettingsGroup } from "../../../components/FormControls";
import type { AppInfoBridge } from "../../../types/bridge";

export default function AboutTab() {
  const { t } = useLocale();
  const [appInfo, setAppInfo] = useState<AppInfoBridge | null>(null);
  const { updateState, installLatest, apply, openRelease } = useUpdateState();
  const [hasChecked, setHasChecked] = useState(false);
  useEffect(() => {
    void getAppInfo().then(setAppInfo);
  }, []);

  const handleCheck = () => {
    void installLatest().then(() => setHasChecked(true));
  };

  if (!appInfo) {
    return (
      <section className="settings-section">
        <p className="settings-section__hint">{t("AboutLoading")}</p>
      </section>
    );
  }

  const isBusy =
    updateState.status === "checking" ||
    updateState.status === "downloading";

  return (
    <div className="about-section">
      <SettingsGroup title={t("UpdatesTitle")}>
        <div className="settings-group__row settings-group__row--split">
          <span className="about-update-msg">
            {t("Version")} {appInfo.version}
          </span>
          <button
            type="button"
            className="credential-btn credential-btn--primary"
            disabled={isBusy}
            onClick={handleCheck}
          >
            {updateState.status === "checking"
              ? t("AboutChecking")
              : t("AboutCheckForUpdates")}
          </button>
        </div>

        {updateState.status === "available" && (
          <div className="settings-group__row settings-group__row--split">
            <span className="about-update-msg">
              {t("UpdateAvailableMessage").replace(
                "{}",
                updateState.version ?? "",
              )}
            </span>
            {!updateState.canDownload && (
              <button type="button" className="credential-btn" onClick={openRelease}>
                {t("BannerViewRelease")}
              </button>
            )}
          </div>
        )}

        {updateState.status === "downloading" && (
          <div className="settings-group__row">
            <span className="about-update-msg">
              {t("UpdateDownloading")}
              {updateState.progress != null &&
                ` ${Math.round(updateState.progress * 100)}%`}
            </span>
          </div>
        )}

        {updateState.status === "ready" && (
          <div className="settings-group__row settings-group__row--split">
            <span className="about-update-msg">{t("UpdateReady")}</span>
            {updateState.canApply ? (
              <button type="button" className="credential-btn credential-btn--primary" onClick={apply}>
                {t("BannerInstallRestart")}
              </button>
            ) : (
              <button type="button" className="credential-btn" onClick={openRelease}>
                {t("BannerViewRelease")}
              </button>
            )}
          </div>
        )}

        {updateState.status === "error" && (
          <div className="settings-group__row">
            <span className="about-update-msg">
              {t("ErrorPrefix")} {updateState.error}
            </span>
          </div>
        )}

        {updateState.status === "idle" && hasChecked && (
          <div className="settings-group__row">
            <span className="about-update-msg">{t("AboutUpToDate")}</span>
          </div>
        )}
      </SettingsGroup>
    </div>
  );
}
