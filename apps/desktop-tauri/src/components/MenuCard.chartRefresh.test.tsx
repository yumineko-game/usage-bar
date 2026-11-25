import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getProviderChartData: vi.fn(),
  getDeepSeekPricingStatus: vi.fn(),
  getLocaleStrings: vi.fn(),
  setUiLanguage: vi.fn(),
  claudeAccountsList: vi.fn(),
  getCodexAccountsState: vi.fn(),
}));

vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  ...tauriMocks,
}));
vi.mock("@tauri-apps/api/event", () => import("../test/mocks/event"));

import { LocaleProvider } from "../i18n/LocaleProvider";
import { makeRateWindow, makeUsageSnapshot } from "../test/fixtures";
import { buildBundle } from "../test/localeHarness";
import type { ProviderUsageSnapshot } from "../types/bridge";
import MenuCard from "./MenuCard";

function rateWindow(used: number) {
  return makeRateWindow(used, { reserveWillLastToReset: false, reserveEtaSeconds: null });
}

function snapshot(updatedAt: string, used: number): ProviderUsageSnapshot {
  return makeUsageSnapshot("claude", {
    displayName: "Claude",
    primary: rateWindow(used),
    selectedMetric: rateWindow(used),
    sourceLabel: "oauth",
    updatedAt,
    errorState: "unknown",
    fetchDurationMs: null,
  });
}

function card(updatedAt: string, used = 10) {
  return (
    <LocaleProvider>
      <MenuCard
        provider={snapshot(updatedAt, used)}
        display={{ hideEmail: false, resetTimeRelative: true }}
      />
    </LocaleProvider>
  );
}

describe("MenuCard chart refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.claudeAccountsList.mockResolvedValue([]);
    tauriMocks.getLocaleStrings.mockResolvedValue(buildBundle({}));
    tauriMocks.getDeepSeekPricingStatus.mockResolvedValue(null);
    tauriMocks.getProviderChartData.mockResolvedValue({
      providerId: "claude",
      costHistory: [],
      tokensHistory: [],
      creditsHistory: [],
      usageBreakdown: [],
      localUsage: null,
    });
  });

  it("renders updated quota without reading chart data", async () => {
    const { rerender } = render(card("2026-10-07T23:00:00Z"));
    await screen.findByRole("progressbar");
    rerender(card("2026-10-07T23:30:00Z", 12));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "88");
    expect(tauriMocks.getProviderChartData).not.toHaveBeenCalled();
  });
});
