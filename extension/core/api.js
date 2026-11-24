// Shim chrome.* / browser.*
export const api = globalThis.browser ?? globalThis.chrome;
export const hasExt = !!(api && api.runtime && api.runtime.id);
