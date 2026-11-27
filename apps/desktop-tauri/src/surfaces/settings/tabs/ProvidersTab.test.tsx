import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ProviderCatalogEntry,
  SettingsSnapshot,
} from "../../../types/bridge";

vi.mock("../providers/ProviderDetailPane", () => ({
  ProviderDetailPane: ({
    providerId,
    cookieDomain,
  }: {
    providerId: string | null;
    cookieDomain?: string | null;
  }) => (
    <div
      data-testid="detail-pane"
      data-cookie={cookieDomain ?? ""}
    >
      {providerId}
    </div>
  ),
}));

import ProvidersTab from "./ProvidersTab";

const codex: ProviderCatalogEntry = { id: "codex", displayName: "Codex", cookieDomain: null };
const claude: ProviderCatalogEntry = {
  id: "claude",
  displayName: "Claude",
  cookieDomain: "claude.ai",
};
const settings = {
  enabledProviders: ["codex", "claude"],
  resetTimeRelative: true,
  providerMetrics: {},
} as unknown as SettingsSnapshot;

describe("ProvidersTab", () => {
  it("shows the sidebar's provider with its own cookie domain", () => {
    render(
      <ProvidersTab
        settings={settings}
        providers={[codex, claude]}
        set={vi.fn()}
        saving={false}
        providerId="claude"
      />,
    );
    const pane = screen.getByTestId("detail-pane");
    expect(pane).toHaveTextContent("claude");
    expect(pane).toHaveAttribute("data-cookie", "claude.ai");
  });

  it("shows no provider for an id outside the catalog", () => {
    render(
      <ProvidersTab
        settings={settings}
        providers={[codex]}
        set={vi.fn()}
        saving={false}
        providerId="nope"
      />,
    );
    const pane = screen.getByTestId("detail-pane");
    expect(pane).toHaveTextContent("");
  });
});
