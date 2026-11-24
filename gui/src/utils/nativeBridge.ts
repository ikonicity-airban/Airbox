import { SharedStateAPI } from "../types";

interface RouteDefinition {
  path: string;
  method: "GET" | "POST" | "DELETE";
}

const routeMap: Record<string, RouteDefinition> = {
  "get-shared-state": { path: "/api/state/history", method: "GET" },
  "set-shared-state": { path: "/api/state/history", method: "POST" },
  extensions: { path: "/api/extensions", method: "POST" },
  "check-whats-new": { path: "/api/whats-new", method: "GET" },
  "disable-whats-new": { path: "/api/whats-new/disable", method: "POST" },
  "check-for-update": { path: "/api/update/check", method: "GET" },
  "download-update": { path: "/api/update/download", method: "POST" },
  "install-update": { path: "/api/update/install", method: "POST" },
  "set-device-user-agent": { path: "/api/device/user-agent", method: "POST" },
  "ensure-cf-bypass": { path: "/api/cf-bypass", method: "POST" },
  "save-cf-cookies": { path: "/api/cf-bypass/save", method: "POST" },
  "get-settings": { path: "/api/settings/get", method: "POST" },
  "update-setting": { path: "/api/settings/update", method: "POST" },
  "update-settings": { path: "/api/settings/update-multiple", method: "POST" },
  "native-response": { path: "/api/ipc/native-response", method: "POST" },
  "native-cancel": { path: "/api/ipc/native-cancel", method: "POST" },
  "get-app-version": { path: "/api/version", method: "GET" },
  "open-local-path": { path: "/api/local/open", method: "POST" },
};

function invoke<T = any>(channel: string, ...args: unknown[]): Promise<T> {
  const route = routeMap[channel];
  if (!route) {
    return Promise.reject(new Error(`Unknown REST action: ${channel}`));
  }

  const fetchOptions: RequestInit = {
    method: route.method,
    headers: { "Content-Type": "application/json" },
  };

  let url = route.path;
  if (route.method === "POST") {
    fetchOptions.body = JSON.stringify({ args });
  } else if (args.length > 0) {
    url +=
      "?" +
      new URLSearchParams(
        args.map((a, i) => [
          `arg${i}`,
          typeof a === "object" ? JSON.stringify(a) : String(a),
        ]),
      ).toString();
  }

  return fetch(url, fetchOptions).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body.error || `REST request to "${route.path}" failed`);
    }
    return body.result;
  });
}

let eventSource: EventSource | null = null;
const eventListeners = new Map<string, Set<(data: any) => void>>();
const activeCaptchaDialogs = new Map<string, Promise<void>>();
const inFlightNativeRequests = new Map<
  string | number,
  { timeout: ReturnType<typeof setTimeout>; complete: (success: boolean, response: any, error: any) => void }
>();
const NATIVE_REQUEST_TIMEOUT_MS = 30000;

function getRequestDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function dispatchNativeRequest(data: any): Promise<void> {
  const plugin = (window as any).Capacitor?.Plugins?.CloudflareBypass;
  let completed = false;
  const complete = async (success: boolean, response: any, error: any) => {
    if (completed) return;
    completed = true;
    const active = inFlightNativeRequests.get(data.requestId);
    if (active) clearTimeout(active.timeout);
    inFlightNativeRequests.delete(data.requestId);
    await invoke(
      "native-response",
      data.requestId,
      success,
      response,
      error,
    ).catch(() => {});
  };

  if (!plugin) {
    await complete(false, null, "CloudflareBypass plugin is unavailable");
    return;
  }

  const timeout = setTimeout(() => {
    plugin
      .cancelNativeRequests?.({ requestIds: [String(data.requestId)] })
      .catch(() => {});
    complete(false, null, `Native request timeout for ${data.url}`);
  }, NATIVE_REQUEST_TIMEOUT_MS);
  inFlightNativeRequests.set(data.requestId, { timeout, complete });

  try {
    const response = await plugin.nativeRequest({
      requestId: String(data.requestId),
      url: data.url,
      method: data.method || "GET",
      headers: data.headers || {},
      body: data.body ?? null,
    });
    await complete(true, response, null);
  } catch (error: any) {
    await complete(false, null, error?.message || String(error));
  }
}

function cancelInFlightNativeRequests(requestIds: Array<string | number> = []): void {
  const ids = requestIds.map(String);
  const plugin = (window as any).Capacitor?.Plugins?.CloudflareBypass;
  plugin?.cancelNativeRequests?.({ requestIds: ids }).catch(() => {});
  for (const requestId of requestIds) {
    const active = inFlightNativeRequests.get(requestId);
    active?.complete(false, null, "Native request cancelled");
  }
}

function ensureEventSource(): void {
  if (eventSource) return;
  eventSource = new EventSource("/api/ipc/events");

  eventSource.onmessage = (event) => {
    try {
      const { channel, data } = JSON.parse(event.data);

      const listeners = eventListeners.get(channel);
      if (listeners) {
        for (const cb of listeners) cb(data);
      }

      if (channel === "open-external" && data?.url) {
        window.open(data.url, "_blank", "noopener");
      }

      if (channel === "open-file" && data?.path) {
        const plugin = (window as any).Capacitor?.Plugins?.CloudflareBypass;
        if (plugin && plugin.openFile) {
          plugin
            .openFile({ path: data.path, openFolder: !!data.openFolder })
            .catch((err: any) => {
              console.error("[nativeBridge] openFile plugin error:", err);
            });
        }
      }

      if (channel === "native-request" && data?.requestId && data?.url) {
        dispatchNativeRequest(data);
      }

      if (channel === "request-battery-optimization") {
        const CloudflareBypass = (window as any).Capacitor?.Plugins?.CloudflareBypass;
        if (CloudflareBypass?.requestBatteryOptimizationExclusion) {
          CloudflareBypass.requestBatteryOptimizationExclusion().catch(() => {});
        }
      }

      if (channel === "native-cancel" && Array.isArray(data?.requestIds)) {
        cancelInFlightNativeRequests(data.requestIds);
      }

      if (channel === "cf-bypass-request" && data?.url) {
        const CloudflareBypass = (window as any).Capacitor?.Plugins?.CloudflareBypass;
        if (CloudflareBypass) {
          const domain = getRequestDomain(data.url);
          if (activeCaptchaDialogs.has(domain)) return;

          const solvePromise = CloudflareBypass.bypass({
            url: data.url,
            userAgent: data.userAgent,
            referer: data.referer,
          })
            .then(async (res: any) => {
              if (res.cookies && res.userAgent) {
                await invoke(
                  "save-cf-cookies",
                  data.url,
                  res.cookies,
                  res.userAgent,
                  res.clientHints || {},
                );
              }
            })
            .catch((err: any) => {
              console.error("[nativeBridge] Cloudflare bypass rejected:", err);
            })
            .finally(() => {
              if (activeCaptchaDialogs.get(domain) === solvePromise) {
                activeCaptchaDialogs.delete(domain);
              }
            });
          activeCaptchaDialogs.set(domain, solvePromise);
        }
      }

      if (channel === "trigger-install" && data?.path) {
        const CloudflareBypass = (window as any).Capacitor?.Plugins?.CloudflareBypass;
        if (CloudflareBypass) {
          CloudflareBypass.installApk({ path: data.path }).catch((err: any) => {
            console.error("[nativeBridge] Install APK plugin error:", err);
          });
        }
      }

      if (channel === "update-download-progress" && data) {
        const CloudflareBypass = (window as any).Capacitor?.Plugins?.CloudflareBypass;
        if (CloudflareBypass?.updateApkDownloadProgress) {
          CloudflareBypass.updateApkDownloadProgress({
            percent: Math.round(data.percent || 0),
            version: data.version || "",
            apkName: data.apkName || "",
          }).catch(() => {});
        }
      }

      if (channel === "update-downloaded" && data?.path) {
        const CloudflareBypass = (window as any).Capacitor?.Plugins?.CloudflareBypass;
        if (CloudflareBypass?.showApkDownloadedNotification) {
          CloudflareBypass.showApkDownloadedNotification({
            path: data.path,
            version: data.version || "",
            apkName: data.apkName || "",
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[nativeBridge] Error handling EventSource message:", e);
    }
  };

  eventSource.onerror = (err) => {
    console.error("[nativeBridge] EventSource error:", err);
  };
}

function createPolyfill(): SharedStateAPI & Record<string, any> {
  return {
    get: () => invoke("get-shared-state"),
    set: (newState: Record<string, unknown>) => invoke("set-shared-state", newState),
    discordrpc: () => Promise.resolve(true),
    playInMpv: (options: any) => invoke("play-in-mpv", options).catch(() => {}),
    controlMpv: (command: string, args: any) =>
      invoke("control-mpv", command, args).catch(() => {}),
    on: (channel: string, callback: (data: any) => void) => {
      ensureEventSource();
      if (!eventListeners.has(channel)) eventListeners.set(channel, new Set());
      eventListeners.get(channel)!.add(callback);
      return () => {
        eventListeners.get(channel)?.delete(callback);
      };
    },
    marketplace: (AnimeManga: string) => {
      invoke("marketplace", AnimeManga).catch(() => {});
    },
    getMarketplace: async (activeType: string = "Anime") => {
      const res = await fetch(
        `/api/marketplace?type=${encodeURIComponent(activeType)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to fetch marketplace");
      return body;
    },
    getExtensionRepos: async () => {
      const res = await fetch("/api/marketplace/repos");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to fetch repos");
      return body.repos || [];
    },
    addExtensionRepo: async (url: string) => {
      const res = await fetch("/api/marketplace/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to add repository");
      return body;
    },
    removeExtensionRepo: async (owner: string) => {
      const res = await fetch(
        `/api/marketplace/repos/${encodeURIComponent(owner)}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to remove repository");
      return body;
    },
    extensions: (...args: any[]) => (invoke as any)("extensions", ...args),
    checkWhatsNew: () => invoke("check-whats-new"),
    disableWhatsNew: () => invoke("disable-whats-new"),
    ensureCfBypass: (url: string, referer?: string) => invoke("ensure-cf-bypass", url, referer),
    getSettings: (keys: any) => invoke("get-settings", keys),
    updateSetting: (key: string, value: any) => invoke("update-setting", key, value),
    updateSettings: (settingsObj: any) => invoke("update-settings", settingsObj),
    checkForUpdate: () => invoke("check-for-update"),
    downloadUpdate: () => invoke("download-update"),
    installUpdate: () => invoke("install-update"),
    getAppVersion: async (): Promise<string> => {
      try {
        const res = await invoke("get-app-version");
        if (typeof res === "string" && res) return res;
        if (res?.version) return res.version;
        if (res?.result) return res.result;
      } catch (_) {}
      try {
        const resp = await fetch("/api/version");
        if (resp.ok) {
          const body = await resp.json();
          return body?.version || body?.result || "11.0.4";
        }
      } catch (_) {}
      return "11.0.4";
    },
    openLocalPath: (targetPath: string, openFolder: boolean = true) =>
      invoke("open-local-path", {
        customPath: targetPath,
        action: openFolder ? "open_folder" : "open_file",
      }),
    selectDirectory: () =>
      Promise.resolve({
        success: false,
        error: "Folder picker is not supported on mobile",
      }),
    checkWtHealth: (url: string) => invoke("check-wt-health", url),
    cancelNativeRequests: () => invoke("native-cancel"),
  };
}

if (typeof window !== "undefined" && !window.sharedStateAPI) {
  window.sharedStateAPI = createPolyfill();
  (window as any).__STRAWVERSE_MOBILE__ = true;
  setTimeout(() => {
    ensureEventSource();
    invoke("set-device-user-agent", navigator.userAgent).catch((err: any) => {
      console.error("[nativeBridge] Failed to set device User-Agent:", err);
    });
  }, 1000);
}

export const isMobileApp = (): boolean =>
  typeof window !== "undefined" && (window as any).__STRAWVERSE_MOBILE__ === true;
