import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeSettings } from "../../../test/fixtures";
import { getTrayVisibilityStatus } from "../../../lib/tauri";
import GeneralTab from "./GeneralTab";

vi.mock("../../../lib/tauri", () => ({ getTrayVisibilityStatus: vi.fn() }));
vi.mock("../../../hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));

describe("Startup settings", () => {
  it("saves the three startup and tray preferences through the existing settings patch", async () => {
    vi.mocked(getTrayVisibilityStatus).mockResolvedValue({ support: "supported", state: "notPromoted" });
    const set = vi.fn();
    render(<GeneralTab settings={makeSettings({ startAtLogin: false, startMinimized: false, promoteTrayIcon: false })} set={set} saving={false} />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    const pin = screen.getByRole("checkbox", { name: "PromoteTrayIconLabel" });
    await waitFor(() => expect(pin).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", { name: "StartAtLogin" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "StartMinimized" }));
    fireEvent.click(pin);
    expect(set.mock.calls).toEqual([[{ startAtLogin: true }], [{ startMinimized: true }], [{ promoteTrayIcon: true }]]);
  });
});
