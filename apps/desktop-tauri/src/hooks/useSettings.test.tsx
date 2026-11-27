import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const eventMocks = vi.hoisted(() => {
  const listeners: Record<string, () => void> = {};
  return {
    listeners,
    listen: vi.fn((name: string, cb: () => void) => {
      listeners[name] = cb;
      return Promise.resolve(() => {
        delete listeners[name];
      });
    }),
  };
});

const tauriMocks = vi.hoisted(() => ({
  getSettingsSnapshot: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => eventMocks);
vi.mock("../lib/tauri", () => tauriMocks);

import { useSettings } from "./useSettings";
import type { SettingsSnapshot } from "../types/bridge";

const profileHomes = (id: number) => [`C:/profile-${id}`];
const snapshot = (id: number) =>
  ({ antigravityAdditionalProfileHomes: profileHomes(id) }) as SettingsSnapshot;

describe("useSettings live sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-fetches the snapshot when settings-changed fires from another window", async () => {
    tauriMocks.getSettingsSnapshot.mockResolvedValue(snapshot(100));
    // Stable identity: the hook's bootstrap effect keys on `initial`, so a new
    // object each render would loop forever.
    const initial = snapshot(100);
    const { result } = renderHook(() => useSettings(initial));

    // The hook registers a "settings-changed" listener.
    await waitFor(() =>
      expect(eventMocks.listeners["settings-changed"]).toBeTypeOf("function"),
    );

    // The detached Settings window saved a profile choice.
    tauriMocks.getSettingsSnapshot.mockResolvedValue(snapshot(175));
    await act(async () => {
      eventMocks.listeners["settings-changed"]();
    });

    await waitFor(() =>
      expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(175)),
    );
  });

  it("unsubscribes the listener on unmount", async () => {
    const unlisten = vi.fn();
    eventMocks.listen.mockResolvedValueOnce(unlisten);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(snapshot(100));

    const initial = snapshot(100);
    const { unmount } = renderHook(() => useSettings(initial));
    await waitFor(() => expect(eventMocks.listen).toHaveBeenCalled());

    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });
});

describe("useSettings update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.getSettingsSnapshot.mockResolvedValue(snapshot(100));
  });

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it("applies the patch before the shell answers and keeps saving off for a fast save", async () => {
    const pending = deferred<SettingsSnapshot>();
    tauriMocks.updateSettings.mockReturnValueOnce(pending.promise);
    const initial = snapshot(100);
    const { result } = renderHook(() => useSettings(initial));
    // Let the bootstrap snapshot fetch settle so it cannot overwrite the update.
    await act(async () => {});

    let done!: Promise<void>;
    act(() => {
      done = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
    });

    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(150));
    expect(result.current.saving).toBe(false);

    await act(async () => {
      pending.resolve(snapshot(150));
      await done;
    });
    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(150));
    expect(result.current.saving).toBe(false);
  });

  it("reports saving only once a save is slow", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<SettingsSnapshot>();
      tauriMocks.updateSettings.mockReturnValueOnce(pending.promise);
      const initial = snapshot(100);
      const { result } = renderHook(() => useSettings(initial));

      let done!: Promise<void>;
      act(() => {
        done = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
      });
      expect(result.current.saving).toBe(false);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.saving).toBe(true);

      await act(async () => {
        pending.resolve(snapshot(150));
        await done;
      });
      expect(result.current.saving).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a stale response that arrives after a newer save", async () => {
    const first = deferred<SettingsSnapshot>();
    const second = deferred<SettingsSnapshot>();
    tauriMocks.updateSettings
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const initial = snapshot(100);
    const { result } = renderHook(() => useSettings(initial));
    await act(async () => {});

    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(125) });
    });
    act(() => {
      b = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
    });

    await act(async () => {
      second.resolve(snapshot(150));
      await b;
    });
    await act(async () => {
      first.resolve(snapshot(125));
      await a;
    });

    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(150));
  });

  it("ignores a stale failure that arrives after a newer save succeeded", async () => {
    const first = deferred<SettingsSnapshot>();
    const second = deferred<SettingsSnapshot>();
    tauriMocks.updateSettings
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const initial = snapshot(100);
    const { result } = renderHook(() => useSettings(initial));
    await act(async () => {});

    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(125) });
    });
    act(() => {
      b = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
    });
    await act(async () => {
      second.resolve(snapshot(150));
      await b;
    });
    tauriMocks.getSettingsSnapshot.mockClear();
    await act(async () => {
      first.reject(new Error("disk busy"));
      await a;
    });

    expect(result.current.error).toBeNull();
    expect(tauriMocks.getSettingsSnapshot).not.toHaveBeenCalled();
    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(150));
  });

  it("reports a failed profile save and reverts to the saved value", async () => {
    const onDisk = snapshot(100);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(onDisk);
    tauriMocks.updateSettings.mockRejectedValueOnce(new Error("disk busy"));
    const { result } = renderHook(() => useSettings(onDisk));
    await act(async () => {});

    await act(async () => {
      await result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
    });

    expect(result.current.error).toBe("disk busy");
    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(100));
  });

  it("does not let a broadcast refresh undo a save that is still pending", async () => {
    const pending = deferred<SettingsSnapshot>();
    tauriMocks.updateSettings.mockReturnValueOnce(pending.promise);
    const initial = snapshot(100);
    const { result } = renderHook(() => useSettings(initial));
    await waitFor(() =>
      expect(eventMocks.listeners["settings-changed"]).toBeTypeOf("function"),
    );

    let done!: Promise<void>;
    act(() => {
      done = result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
    });
    // An earlier save's broadcast re-fetches the file before this save lands.
    tauriMocks.getSettingsSnapshot.mockResolvedValue(snapshot(100));
    await act(async () => {
      eventMocks.listeners["settings-changed"]();
    });
    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(150));

    await act(async () => {
      pending.resolve(snapshot(150));
      await done;
    });
    expect(result.current.settings.antigravityAdditionalProfileHomes).toEqual(profileHomes(150));
  });

  it("does not restart the saving delay when a second save overlaps", async () => {
    vi.useFakeTimers();
    try {
      const first = deferred<SettingsSnapshot>();
      const second = deferred<SettingsSnapshot>();
      tauriMocks.updateSettings
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const initial = snapshot(100);
      const { result } = renderHook(() => useSettings(initial));

      act(() => {
        void result.current.update({ antigravityAdditionalProfileHomes: profileHomes(125) });
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        void result.current.update({ antigravityAdditionalProfileHomes: profileHomes(150) });
      });
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(result.current.saving).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
