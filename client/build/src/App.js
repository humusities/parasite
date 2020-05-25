import React, {useRef, useEffect, useState} from "react";
import register from "./../../src/utils/event-source.js";
const usePeers = (apiURL) => {
  const [peers, setPeers] = useState([]);
  useEffect(() => {
    const source = new EventSource(new URL("streamPeers", apiURL));
    register(source, {
      state: (state) => setPeers(state),
      add: (peer) => setPeers((prev) => [...prev, peer]),
      delete: (peer) => setPeers((prev) => prev.filter((p) => p.port !== peer.port)),
      log: console.log
    });
    return () => source.close();
  }, [apiURL]);
  return peers;
};
const open = (apiURL, url) => {
  const requestURL = new URL("open", apiURL);
  requestURL.searchParams.set("url", url);
  fetch(requestURL);
};
const Peer = ({apiURL, host, port, children}) => React.createElement("a", {
  onClick: () => open(apiURL, `http://${host}:${port}`),
  href: "#"
}, children ? children : `${host}:${port}`);
const Peers = ({apiURL}) => {
  const peers = usePeers(apiURL);
  return React.createElement("div", {
    className: "instance"
  }, peers.length ? peers.map(({host, port, static: {address}}, i) => React.createElement(React.Fragment, null, React.createElement("button", null, i + 1), React.createElement("span", null, `${host}:${port}`), React.createElement("div", {
    className: "buttons"
  }, React.createElement("button", {
    onClick: () => open(apiURL, `http://${address.host}:${address.port}`),
    className: "option"
  }, "BROWSE"), React.createElement("button", {
    onClick: () => open(apiURL, `http://${host}:${port}`),
    className: "option"
  }, "WEBDAV")))) : React.createElement("span", {
    className: "fallback"
  }, "No connected peers..."));
};
const useHosting = (apiURL) => {
  const [instances, setInstances] = useState([]);
  useEffect(() => {
    const source = new EventSource(new URL("streamHosting", apiURL));
    register(source, {
      state: (state) => setInstances(state),
      add: (dir) => setInstances((prev) => [...prev, dir]),
      delete: (dir) => setInstances((prev) => prev.filter(({root}) => root !== dir.root)),
      log: console.log
    });
    return () => source.close();
  }, [apiURL]);
  const askHosting = () => fetch(new URL("requestHosting", apiURL));
  return {
    askHosting,
    instances
  };
};
const Instance = ({apiURL, root, host, port}) => {
  const remove = () => {
    const removeURL = new URL("removeHosting", apiURL);
    removeURL.searchParams.set("dir", root);
    fetch(removeURL);
  };
  return React.createElement("div", {
    className: "instance"
  }, React.createElement("button", {
    onClick: remove
  }, "✕"), React.createElement(Peer, {
    apiURL,
    host,
    port
  }, root.split("/").pop()));
};
const Serve = ({apiURL}) => {
  const {askHosting, instances} = useHosting(apiURL);
  return React.createElement(React.Fragment, null, instances.map((instance) => React.createElement(Instance, {
    ...instance,
    apiURL
  })), React.createElement("div", {
    className: classs({
      instance: true,
      disabled: !!instances.length
    })
  }, React.createElement("button", {
    disabled: !!instances.length,
    onClick: askHosting
  }, "+"), React.createElement("span", {
    className: "fallback"
  }, "Share a directory")));
};
const AddTopic = ({apiURL, disabled}) => {
  const ref = useRef();
  const post = (e) => {
    const url = new URL("addTopic", apiURL);
    console.log(ref.current.value);
    url.searchParams.set("name", ref.current.value);
    fetch(url);
    e.preventDefault();
  };
  return React.createElement("form", {
    onSubmit: post,
    className: "instance topic"
  }, React.createElement("button", {
    type: "submit",
    disabled
  }, "+"), React.createElement("input", {
    minlength: "10",
    disabled,
    ref,
    type: "text",
    placeholder: "Enter a topic to join peers..."
  }));
};
const useTopics = (apiURL) => {
  const [peers, setPeers] = useState([]);
  useEffect(() => {
    const source = new EventSource(new URL("streamTopics", apiURL));
    register(source, {
      state: (state) => setPeers(state),
      add: (peer) => setPeers((prev) => [...prev, peer]),
      delete: (peer) => setPeers((prev) => prev.filter((p) => p !== peer)),
      log: console.log
    });
    return () => source.close();
  }, [apiURL]);
  return peers;
};
const Topic = ({apiURL, topic}) => {
  const remove = () => {
    const removeURL = new URL("removeTopic", apiURL);
    removeURL.searchParams.set("name", topic);
    fetch(removeURL);
  };
  return React.createElement("div", {
    className: "instance topic"
  }, React.createElement("button", {
    onClick: remove
  }, "✕"), React.createElement("span", null, topic));
};
const Topics = ({apiURL}) => {
  const topics = useTopics(apiURL);
  return React.createElement(React.Fragment, null, topics.map((topic) => React.createElement(Topic, {
    topic,
    apiURL
  })), React.createElement(AddTopic, {
    apiURL,
    disabled: !!topics.length
  }));
};
const classs = (object) => Object.entries(object).reduce((str, [name, bool]) => `${str}${bool ? ` ${name}` : ""}`, "");
const Tabs = ({apiURL, children}) => {
  const [active, setActive] = useState(0);
  const remove = () => {
    const removeURL = new URL("closeApp", apiURL);
    removeURL.searchParams.set("type", "close");
    fetch(removeURL);
  };
  return React.createElement(React.Fragment, null, React.createElement("nav", null, children.map(({props: {name}}, index) => React.createElement("a", {
    className: classs({
      active: index === active
    }),
    onClick: () => setActive(index)
  }, name)), React.createElement("button", {
    onClick: remove
  }, "✕")), React.createElement("main", null, children[active]));
};
export default ({apiURL = new URLSearchParams(window.location.search).get("api")} = {}) => React.createElement(Tabs, {
  apiURL
}, React.createElement(Topics, {
  name: "Topic",
  apiURL
}), React.createElement(Peers, {
  name: "Peers",
  apiURL
}), React.createElement(Serve, {
  name: "Shared",
  apiURL
}));
