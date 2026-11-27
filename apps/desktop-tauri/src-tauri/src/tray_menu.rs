use codexbar::locale::{self, LocaleKey};
use codexbar::settings::Language;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TrayMenuEntry {
    pub(crate) id: Option<String>,
    pub(crate) label: String,
    pub(crate) children: Vec<Self>,
    pub(crate) is_separator: bool,
    pub(crate) disabled: bool,
    /// When `Some`, this entry renders as a check/checkbox item.
    /// `true` = checked (enabled), `false` = unchecked (disabled).
    pub(crate) checked: Option<bool>,
}

impl TrayMenuEntry {
    pub(crate) fn item(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: Some(id.into()),
            label: label.into(),
            children: Vec::new(),
            is_separator: false,
            disabled: false,
            checked: None,
        }
    }

    pub(crate) fn separator() -> Self {
        Self {
            id: None,
            label: String::new(),
            children: Vec::new(),
            is_separator: true,
            disabled: false,
            checked: None,
        }
    }

    pub(crate) fn status_row(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: Some(id.into()),
            label: label.into(),
            children: Vec::new(),
            is_separator: false,
            disabled: true,
            checked: None,
        }
    }
}

pub(crate) fn build_tray_menu(
    status_labels: &[(String, String)],
    lang: Language,
) -> Vec<TrayMenuEntry> {
    let mut menu: Vec<TrayMenuEntry> = Vec::new();
    let text = |key| locale::get_text(lang, key);

    // Status rows (one per enabled provider with live usage).
    for (id, label) in status_labels {
        menu.push(TrayMenuEntry::status_row(format!("status_{id}"), label));
    }
    if !status_labels.is_empty() {
        menu.push(TrayMenuEntry::separator());
    }

    menu.push(TrayMenuEntry::item(
        "refresh",
        text(LocaleKey::TrayRefreshAll),
    ));
    menu.push(TrayMenuEntry::item(
        "settings",
        text(LocaleKey::TraySettings),
    ));
    menu.push(TrayMenuEntry::item(
        "check_for_updates",
        text(LocaleKey::TrayCheckForUpdates),
    ));
    menu.push(TrayMenuEntry::item("about", text(LocaleKey::UpdatesTitle)));
    menu.push(TrayMenuEntry::separator());
    menu.push(TrayMenuEntry::item("quit", text(LocaleKey::MenuQuit)));

    menu
}
