export default (source, actions) => {
  source.addEventListener("message", ({ data }) => {
    const { id, message } = JSON.parse(data);
    if (id in actions) actions[id](message);
    else if (id === "ping") console.log("[server] keep alive ping")
    else console.error(`${id} - Supported: ${Object.keys(actions)}`);
  });
  source.addEventListener("open", () => console.log("Connected"), false);
  source.addEventListener("error", (e) => {
    if (e.eventPhase == EventSource.CLOSED) source.close();
    if (e.target.readyState == EventSource.CLOSED) {
      console.log("Disconnected");
    } else if (e.target.readyState == EventSource.CONNECTING) {
      console.log("Connecting...");
    }
  });
};
