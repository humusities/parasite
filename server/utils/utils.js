import url from "url";
import { EventEmitter } from "events";

export const writeStreamtHead = (res) =>
  res.writeHead(200, {
    connection: "keep-alive",
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
  });

export const post = (res, id, message) => {
  console.log({ id, message });
  res.write(
    `data: ${JSON.stringify({ id: "log", message: { id, message } })}\n\n`
  );
  return res.write(`data: ${JSON.stringify({ id, message })}\n\n`);
};

export const stream = (res, state, emitter, events) => {
  writeStreamtHead(res);
  const interval = setInterval(() => post(res, "ping"), 60000);
  post(res, "state", state);

  const send = events.reduce(
    (send, event) => ({
      ...send,
      [event]: (data) => post(res, event, data),
    }),
    {}
  );

  events.forEach((event) => {
    // emitter.values().forEach(send[event]);
    emitter.on(event, send[event]);
  });

  res.socket.on("close", () => {
    clearInterval(interval);
    events.forEach((event) => {
      emitter.removeListener(event, send[event]);
    });
  });
};

export const createListener = (actions) => (req, res, ...args) => {
  res.setHeader("access-control-allow-origin", "*");
  const id = decodeURI(url.parse(req.url).pathname).substr(1);
  if (id in actions) return actions[id](req, res, ...args);
  else {
    console.error(`${id} - Supported: ${Object.keys(actions)}`);
    res.end();
  }
};

export class DictEmitter extends EventEmitter {
  constructor() {
    super();
    this.dict = {};
  }
  add(id, data) {
    this.dict[id] = data;
    this.emit("add", data);
  }
  delete(id) {
    this.emit("delete", this.dict[id]);
    delete this.dict[id];
  }
  has(id) {
    return id in this.dict;
  }
  get(id) {
    return this.dict[id];
  }
  keys() {
    return Object.freeze(Object.keys(this.dict));
  }
  values() {
    return Object.freeze(Object.values(this.dict));
  }
}

export const createDirectorySelector = (systemIoOpenDirectory) => {
  let open = false;
  return Object.freeze({
    open,
    get: () => {
      if (open) throw Error("Dialog already opened.");
      open = true;
      return systemIoOpenDirectory()
        .finally((file) => {
          open = false;
          return file;
        });
    },
  });
};
