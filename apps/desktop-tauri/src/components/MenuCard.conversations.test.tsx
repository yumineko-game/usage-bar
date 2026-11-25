import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getProviderChartData: vi.fn(),
  getUsageSpendSummary: vi.fn(),
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
import type {
  CodexWorkspacesSessionUsage,
  ProviderUsageSnapshot,
  SpendContract,
  UsageSpendSummary,
} from "../types/bridge";
import MenuCard from "./MenuCard";

const window0 = makeRateWindow(10, { reserveWillLastToReset: false, reserveEtaSeconds: null });

function snapshot(providerId: string): ProviderUsageSnapshot {
  return makeUsageSnapshot(providerId, {
    displayName: providerId === "codex" ? "Codex" : "Claude",
    primary: window0,
    selectedMetric: window0,
    errorState: "unknown",
    fetchDurationMs: null,
  });
}

function session(id: string, displayTitle: string): CodexWorkspacesSessionUsage {
  return {
    id,
    projectId: "proj-1",
    displayTitle,
    cwd: null,
    startedAt: null,
    latestActivity: "2026-10-19T09:00:00Z",
    totals: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, totalTokens: 120 },
    costEstimate: { knownUsd: 0.25, unknownTokens: 0 },
    topModel: "gpt-5-codex",
    turnPerformance: null,
  };
}

function summary(title: string): UsageSpendSummary {
  return {
    rows: [],
    contract: {
      providerId: "codex",
      reportingPeriod: "rolling:30",
      conversations: [session("synthetic-session-1", title)],
    } as SpendContract,
    reportingPeriod: "rolling:30",
    reportingDay: "2026-10-20",
    dashboardTimezone: "UTC",
    costTrackingEnabled: true,
  };
}

function card(providerId: string) {
  return (
    <LocaleProvider>
      <MenuCard
        provider={snapshot(providerId)}
        display={{ hideEmail: false, resetTimeRelative: true }}
      />
    </LocaleProvider>
  );
}

describe("MenuCard conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.claudeAccountsList.mockResolvedValue([]);
    tauriMocks.getLocaleStrings.mockResolvedValue(buildBundle({}));
    tauriMocks.getDeepSeekPricingStatus.mockResolvedValue(null);
    tauriMocks.getProviderChartData.mockResolvedValue(null);
    tauriMocks.getUsageSpendSummary.mockResolvedValue(summary("Refactor the parser"));
  });

  it("keeps Codex conversations and their spend outside the usage card", async () => {
    render(card("codex"));
    await screen.findByRole("progressbar");
    expect(screen.queryByRole("button", { name: "CardConversationsTitle" })).not.toBeInTheDocument();
    expect(screen.queryByText("Refactor the parser")).not.toBeInTheDocument();
    expect(tauriMocks.getUsageSpendSummary).not.toHaveBeenCalled();
  });
});
