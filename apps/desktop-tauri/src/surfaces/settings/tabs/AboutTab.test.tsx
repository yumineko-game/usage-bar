import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getAppInfo: vi.fn(),
}));

const updateMocks = vi.hoisted(() => ({
  checkNow: vi.fn(),
  installLatest: vi.fn().mockResolvedValue(undefined),
  download: vi.fn(),
  apply: vi.fn(),
  dismiss: vi.fn(),
  openRelease: vi.fn(),
}));

vi.mock("../../../lib/tauri", () => tauriMocks);
vi.mock("../../../hooks/useLocale", () => ({
  // AboutBuilt keeps its Fluent `{}` placeholder so the rendered date is asserted.
  useLocale: () => ({ t: (key: string) => (key === "AboutBuilt" ? "Built {}" : key) }),
}));
vi.mock("../../../hooks/useUpdateState", () => ({
  useUpdateState: () => ({
    updateState: {
      status: "idle",
      version: null,
      error: null,
      progress: null,
      releaseUrl: null,
      canDownload: false,
      canApply: false,
      lastCheckedAt: null,
    },
    ...updateMocks,
  }),
}));

import AboutTab from "./AboutTab";
describe("AboutTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "UsageBar",
      version: "0.30.3",
      buildNumber: "dev",
      updateChannel: "stable",
      tagline: "Keep agent limits in view.",
    });
  });

  it("starts the GitHub update from one About button", async () => {
    render(<AboutTab />);

    fireEvent.click(await screen.findByRole("button", { name: "AboutCheckForUpdates" }));

    expect(updateMocks.installLatest).toHaveBeenCalledOnce();
    expect(await screen.findByText("AboutUpToDate")).toBeInTheDocument();
  });
});
