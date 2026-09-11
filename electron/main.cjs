/**
 * LookaMusic — Electron Desktop Main Process
 *
 * Configured for ultra-low latency audio processing, native window management,
 * and transparent hardware permission handling for microphone and camera.
 */
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");
const http = require("http");

// --- Low-Latency Audio Switches ---
// Reduce audio buffer size to 256 samples (~5.3ms @48kHz) for real-time responsiveness
app.commandLine.appendSwitch("audio-buffer-size", "256");
// Enable exclusive audio mode on platforms that support it (e.g. Windows WASAPI)
app.commandLine.appendSwitch("enable-exclusive-audio");
// Allow audio playback without explicit user click gesture
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// Prevent throttling audio and timers when window is in the background
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PORT = process.env.PORT || 3000;
let mainWindow = null;
let serverInstance = null;

function createWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0d1117",
    title: "LookaMusic — You sing the song. LookaMusic builds the band.",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep audio timing accurate
    },
  });

  // Automatically approve microphone and camera permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "microphone", "camera"];
    if (allowed.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // External links open in the system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.loadURL(targetUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startProductionServer() {
  const next = require("next");
  const nextApp = next({ dev: false, dir: path.join(__dirname, "..") });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handle(req, res);
    });

    // Listen on random available port on localhost
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 3000;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// Ensure single application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (isDev) {
      createWindow(`http://localhost:${PORT}`);
    } else {
      try {
        const prod = await startProductionServer();
        serverInstance = prod.server;
        createWindow(prod.url);
      } catch (err) {
        console.error("Failed to start local desktop server:", err);
        createWindow(`http://localhost:${PORT}`);
      }
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(isDev ? `http://localhost:${PORT}` : "http://127.0.0.1:3000");
      }
    });
  });

  app.on("window-all-closed", () => {
    if (serverInstance) {
      serverInstance.close();
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    if (serverInstance) {
      serverInstance.close();
    }
  });
}
