export const stores = {
  local: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
};
export const grants = new Set<string>();
export const permissionRequests: string[][] = [];
export let allowPermission = true;
const listeners = new Set<
  (changes: Record<string, { newValue?: unknown }>, area: string) => void
>();
function area(name: 'local' | 'session') {
  return {
    async get(key: string | null) {
      return key === null ? { ...stores[name] } : { [key]: stores[name][key] };
    },
    async set(values: Record<string, unknown>) {
      Object.assign(stores[name], values);
      const changes = Object.fromEntries(
        Object.entries(values).map(([key, newValue]) => [key, { newValue }]),
      );
      listeners.forEach((listener) => listener(changes, name));
    },
    async remove(key: string) {
      delete stores[name][key];
      listeners.forEach((listener) => listener({ [key]: {} }, name));
    },
    async setAccessLevel() {},
  };
}
export const fakeBrowser = {
  storage: {
    local: area('local'),
    session: area('session'),
    onChanged: {
      addListener: (
        listener: (
          changes: Record<string, { newValue?: unknown }>,
          area: string,
        ) => void,
      ) => listeners.add(listener),
      removeListener: (
        listener: (
          changes: Record<string, { newValue?: unknown }>,
          area: string,
        ) => void,
      ) => listeners.delete(listener),
    },
  },
  permissions: {
    request: ({ origins }: { origins: string[] }) => {
      permissionRequests.push(origins);
      if (allowPermission) origins.forEach((origin) => grants.add(origin));
      return Promise.resolve(allowPermission);
    },
    contains: ({ origins }: { origins: string[] }) =>
      Promise.resolve(origins.every((origin) => grants.has(origin))),
  },
};
export function resetBrowser(allow = true) {
  stores.local = {};
  stores.session = {};
  grants.clear();
  permissionRequests.length = 0;
  allowPermission = allow;
  listeners.clear();
}
