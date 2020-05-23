import { app, BrowserWindow } from "electron";
import path from "path";

import onWindow from "./controllers/swarm.js";

const newWindow = () =>
  new BrowserWindow({
    width: 300,
    height: 400,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });

app
  .on("activate", () => !BrowserWindow.getAllWindows().length && newWindow())
  .on("window-all-closed", () => process.platform !== "darwin" && app.quit())
  .whenReady()
  .then(newWindow)
  .then((window) => window.loadFile("./app/index.html").then(() => onWindow(window)));
