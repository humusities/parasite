const log = require("electron-log");
const { app } = require("electron");

if (app.isPackaged) {
  [
    "beforeExit",
    "exit",
    "SIGINT",
    "SIGUSR1",
    "SIGUSR2",
    "uncaughtException",
  ].forEach((event) =>
    process.on(event, (err) => {
      log.warn(err.toString());
      process.exit();
    })
  );
}

require = require("esm")(module);
module.exports = require("../src/main.js");
