import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getManualCookies: vi.fn(),
  importBrowserCookies: vi.fn(),
  listDetectedBrowsers: vi.fn(),
  removeManualCookie: vi.fn(),
  setManualCookie: vi.fn(),
}));

vi.mock("../../../lib/tauri", () => tauriMocks);
vi.mock("../../../hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

import { CookieSection } from "./CookieSection";

function renderSection() {
  return render(
    <CookieSection providerId="codex" cookieDomain="example.com" />,
  );
}

describe("CookieSection browser detection", () => {
  beforeEach(() => {
    tauriMocks.getManualCookies.mockReset();
    tauriMocks.getManualCookies.mockResolvedValue([]);
    tauriMocks.listDetectedBrowsers.mockReset();
  });

  it("explains that no browser was found and keeps the paste box", async () => {
    tauriMocks.listDetectedBrowsers.mockResolvedValue([]);
    renderSection();

    expect(
      await screen.findByText("NoBrowsersDetectedHint"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "BrowserCookieImportFromBrowser" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("BrowserCookiePlaceholderDefault"),
    ).toBeInTheDocument();
  });

  it("offers browser import and no empty-state hint when browsers exist", async () => {
    tauriMocks.listDetectedBrowsers.mockResolvedValue([
      { browserType: "chrome", displayName: "Google Chrome", profileCount: 1 },
    ]);
    renderSection();

    expect(
      await screen.findByRole("button", {
        name: "BrowserCookieImportFromBrowser",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("NoBrowsersDetectedHint"),
    ).not.toBeInTheDocument();
  });

  it("ignores an earlier provider's browser list after switching providers", async () => {
    let finishOldLookup!: (browsers: {
      browserType: string;
      displayName: string;
      profileCount: number;
    }[]) => void;
    const oldLookup = new Promise((resolve) => {
      finishOldLookup = resolve;
    });
    tauriMocks.listDetectedBrowsers
      .mockReturnValueOnce(oldLookup)
      .mockResolvedValueOnce([
        { browserType: "brave", displayName: "Brave", profileCount: 1 },
      ]);

    const { rerender } = renderSection();
    rerender(<CookieSection providerId="claude" cookieDomain="claude.ai" />);
    expect(await screen.findByText(/Brave/)).toBeInTheDocument();

    await act(async () => {
      finishOldLookup([
        { browserType: "chrome", displayName: "Google Chrome", profileCount: 1 },
      ]);
    });

    expect(screen.getByText(/Brave/)).toBeInTheDocument();
    expect(screen.queryByText(/Google Chrome/)).not.toBeInTheDocument();
  });

  it("does not claim no browsers exist when the lookup fails", async () => {
    tauriMocks.listDetectedBrowsers.mockRejectedValue(new Error("ipc down"));
    renderSection();

    await waitFor(() =>
      expect(tauriMocks.listDetectedBrowsers).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("BrowserCookiePlaceholderDefault"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("NoBrowsersDetectedHint"),
    ).not.toBeInTheDocument();
  });
});
