const { ipcRenderer, shell } = require("electron");

const peerLink = (host, port) => `http://${host}:${port}`;

ipcRenderer
  .on("connection", (_, { host, port }) => {
    const link = document
      .getElementById("servers")
      .appendChild(Object.assign(document.createElement("li"), { id: port }))
      .appendChild(
        Object.assign(document.createElement("a"), {
          innerText: peerLink(host, port),
          href: peerLink(host, port),
        })
      );

    link.addEventListener("click", (event) => {
      event.preventDefault();
      shell.openExternal(event.target.href);
    });
  })
  .on("disconnection", (_, { port }) => document.getElementById(port).remove())
  .on("server", (_, server) => {
    document.getElementById("create-server").disabled = true;
    document.getElementById("server-info").append(
      Object.assign(document.createElement("span"), {
        innerText: server.root,
      })
    );
  });

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("create-server").addEventListener("click", () => {
    ipcRenderer.send("create");
  });
});
