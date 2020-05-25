import { app, BrowserWindow } from "electron";

import createApiServer from "./server/api.js";
import createStaticServer from "./server/static.js";

const encode = encodeURIComponent;
const quit = () => process.platform !== "darwin" && app.quit();
const count = () => BrowserWindow.getAllWindows().length;
const create = () => {
  const win = new BrowserWindow({
    width: 300,
    height: 90,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
  });
  win.setPosition(20, 120);
  return win;
};

createApiServer()
  .then(({ port }) => `http://localhost:${port}`)
  .then((apiURL) =>
    createStaticServer()
      .then(({ port }) => `http://localhost:${port}/?api=${encode(apiURL)}`)
      .then((staticURL) => console.log(staticURL) || staticURL)
      .then((staticURL) => () => !count() && create().loadURL(staticURL))
      .then((createWindow) =>
        app
          .on("window-all-closed", quit)
          .on("activate", createWindow)
          .whenReady()
          .then(createWindow)
      )
  );
