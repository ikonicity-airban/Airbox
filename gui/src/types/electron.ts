export interface ExtensionTask {
  name: string;
  version: string;
  author: string;
  description?: string;
  icon?: string;
}

export interface SharedStateAPI {
  get: () => Promise<Record<string, unknown>>;
  set: (newState: Record<string, unknown>) => Promise<boolean>;
  discordrpc: (animeName: string, episode: string) => Promise<boolean>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
  marketplace: (animeManga: string) => void;
  extensions: (
    taskType: string,
    animeManga: string,
    extensionName?: string,
    repoOwner?: string,
    repoBaseUrl?: string,
    minAppVersion?: string
  ) => Promise<unknown>;
  getMarketplace: (activeType: string) => Promise<unknown>;
}

declare global {
  interface Window {
    sharedStateAPI?: SharedStateAPI;
    Capacitor?: unknown;
  }
}
