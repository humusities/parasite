import { shell, app } from "electron";
import http from "http";
import createSwarmHTTP from "@humusities/inhabit";

import {
  DictEmitter,
  createDirectorySelector,
  createListener,
  stream,
} from "./utils/utils.js";

const createActions = async ({
  client: createPeersListener,
  server: createWebdavInstance,
  join: joinTopic,
  leave: leaveTopic,
}) => {
  const directorySelector = createDirectorySelector();
  const peers = await createPeersListener();
  const instances = new DictEmitter();
  const topics = new DictEmitter();
  const get = (url, name) => new URLSearchParams(url).get(name);

  return {
    addTopic: ({ url }, res) => {
      const topic = get(url, "/addTopic?name");
      joinTopic(topic);
      topics.add(topic, topic);
      res.end();
    },
    removeTopic: ({ url }, res) => {
      const topic = get(url, "/removeTopic?name");
      leaveTopic(topic);
      topics.delete(topic);
      res.end();
    },
    closeApp: (_, res) => {
      res.end();
      app.quit();
    },
    open: ({ url }, res) => {
      shell.openExternal(get(url, "/open?url"));
      res.end();
    },
    streamTopics: (_, res) =>
      stream(res, topics.values(), topics, ["add", "delete"]),
    streamPeers: (_, res) =>
      stream(res, peers.values(), peers, ["add", "delete"]),
    streamHosting: (_, res) =>
      stream(res, instances.values(), instances, ["add", "delete"]),
    removeHosting: (req, res) => {
      instances
        .keys()
        .filter((key) => key === get(req.url, "/removeHosting?dir"))
        .forEach((key) => {
          instances.get(key).destroy();
          instances.delete(key);
        });
      res.end();
    },
    requestHosting: (_, res) => {
      directorySelector
        .get()
        .catch(console.error)
        .then((dir) => {
          if (dir && !instances.has(dir))
            createWebdavInstance(dir).then((instance) => {
              instances.add(instance.root, instance);
              console.log(instances);
            });
        });
      res.end();
    },
  };
};

export default () =>
  Promise.resolve(createSwarmHTTP())
    .then(createActions)
    .then(createListener)
    .then(http.createServer)
    .then((server) => server.listen(0))
    .then((server) => server.address())
    .then(({ address: host, port }) => ({ host, port }));