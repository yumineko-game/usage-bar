import { useEffect, useState } from "react";
import { Field, SettingsGroup, Toggle } from "../../../components/FormControls";
import { useLocale } from "../../../hooks/useLocale";
import { getTrayVisibilityStatus } from "../../../lib/tauri";
import type { TabProps } from "../settingsTabs";

export default function GeneralTab({ settings, set, saving }: TabProps) {
  const { t } = useLocale();
  const [pinSupported, setPinSupported] = useState(false);

  useEffect(() => {
    let active = true;
    void getTrayVisibilityStatus().then((status) => {
      if (active) setPinSupported(status.support === "supported");
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <SettingsGroup title={t("StartupSettings")}>
      <Field label={t("StartAtLogin")}>
        <Toggle
          variant="switch"
          checked={settings.startAtLogin}
          disabled={saving}
          onChange={(value) => set({ startAtLogin: value })}
        />
      </Field>
      <Field label={t("StartMinimized")} description={t("StartMinimizedHelper")}>
        <Toggle
          variant="switch"
          checked={settings.startMinimized}
          disabled={saving}
          onChange={(value) => set({ startMinimized: value })}
        />
      </Field>
      <Field
        label={t("PromoteTrayIconLabel")}
        description={pinSupported ? t("PromoteTrayIconHelper") : t("PromoteTrayIconUnsupportedHint")}
      >
        <Toggle
          variant="switch"
          checked={settings.promoteTrayIcon ?? false}
          disabled={saving || !pinSupported}
          onChange={(value) => set({ promoteTrayIcon: value })}
        />
      </Field>
    </SettingsGroup>
  );
}
