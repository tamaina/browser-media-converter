/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  void window.loadURL('about:blank');
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
