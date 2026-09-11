/**
 * LookaMusic — Electron Desktop Preload Script
 *
 * Exposes a minimal, secure bridge to the renderer without node integration.
 */
const { contextBridge } = require("electron");

const desktopBridge = {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld("lookaDesktop", desktopBridge);
contextBridge.exposeInMainWorld("lucaDesktop", desktopBridge);

