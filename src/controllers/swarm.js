import { ipcMain as ipc, dialog } from "electron";
import createSwarmHTTP from "@humusities/inhabit";

const swarmHTTP = createSwarmHTTP();
const peersPromise = swarmHTTP.client();

export default async ({ webContents }) => {
  const peers = await peersPromise;
  const send = {
    disconnection: (peer) => webContents.send("disconnection", peer),
    connection: (peer) => webContents.send("connection", peer),
    server: (server) => webContents.send("server", server),
  };

  peers.toList().forEach(send.connection);
  peers.on("connection", send.connection);
  peers.on("disconnection", send.disconnection);
  webContents.on("closed", () => {
    peers.removeListener("connection", send.connection);
    peers.removeListener("disconnection", send.disconnection);
  });

  ipc.on("create", () =>
    dialog
      .showOpenDialog({ properties: ["openDirectory"] })
      .then(({ filePaths: [filePath] }) => {
        if (filePath) swarmHTTP.server(filePath).then(send.server);
      })
  );
};
