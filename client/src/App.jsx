import React, { useRef, useEffect, useState } from "react";
import register from "./utils/event-source.js";

const usePeers = (apiURL) => {
  const [peers, setPeers] = useState([]);
  useEffect(() => {
    const source = new EventSource(new URL("streamPeers", apiURL));
    register(source, {
      state: (state) => setPeers(state),
      add: (peer) => setPeers((prev) => [...prev, peer]),
      delete: (peer) =>
        setPeers((prev) => prev.filter((p) => p.port !== peer.port)),
      log: console.log,
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

const Peer = ({ apiURL, host, port, children }) => (
  <a onClick={() => open(apiURL, `http://${host}:${port}`)} href="#">
    {children ? children : `${host}:${port}`}
  </a>
);

const Peers = ({ apiURL }) => {
  const peers = usePeers(apiURL);
  return (
    <div className="instance">
      {peers.length ? (
        peers.map(({ host, port, interactive }, i) => (
          <>
            <button>{i + 1}</button>
            <Peer apiURL={apiURL} {...interactive}>
              {`${host}:${port}`}
            </Peer>
            <button
              onClick={() => open(apiURL, `http://${host}:${port}`)}
              className="option"
            >
              WEBDAV
            </button>
          </>
        ))
      ) : (
        <span className="fallback">No connected peers...</span>
      )}
    </div>
  );
};

const useHosting = (apiURL) => {
  const [instances, setInstances] = useState([]);
  useEffect(() => {
    const source = new EventSource(new URL("streamHosting", apiURL));
    register(source, {
      state: (state) => setInstances(state),
      add: (dir) => setInstances((prev) => [...prev, dir]),
      delete: (dir) =>
        setInstances((prev) => prev.filter(({ root }) => root !== dir.root)),
      log: console.log,
    });
    return () => source.close();
  }, [apiURL]);

  const askHosting = () => fetch(new URL("requestHosting", apiURL));
  return { askHosting, instances };
};

const Instance = ({ apiURL, root, host, port }) => {
  const remove = () => {
    const removeURL = new URL("removeHosting", apiURL);
    removeURL.searchParams.set("dir", root);
    fetch(removeURL);
  };
  return (
    <div className="instance">
      <button onClick={remove}>✕</button>
      <Peer apiURL={apiURL} host={host} port={port}>
        {root.split("/").pop()}
      </Peer>
    </div>
  );
};

const Serve = ({ apiURL }) => {
  const { askHosting, instances } = useHosting(apiURL);
  return (
    <>
      {instances.map((instance) => (
        <Instance {...instance} apiURL={apiURL} />
      ))}
      <div className={classs({ instance: true, disabled: !!instances.length })}>
        <button disabled={!!instances.length} onClick={askHosting}>
          +
        </button>
        <span className="fallback">Share a directory</span>
      </div>
    </>
  );
};

const AddTopic = ({ apiURL, disabled }) => {
  const ref = useRef();
  const post = (e) => {
    const url = new URL("addTopic", apiURL);
    console.log(ref.current.value);
    url.searchParams.set("name", ref.current.value);
    fetch(url);
    e.preventDefault();
  };

  return (
    <form onSubmit={post} className="instance topic">
      <button type="submit" disabled={disabled}>
        +
      </button>
      <input
        minlength="10"
        disabled={disabled}
        ref={ref}
        type="text"
        placeholder="Enter a topic to join peers..."
      ></input>
    </form>
  );
};

const useTopics = (apiURL) => {
  const [peers, setPeers] = useState([]);
  useEffect(() => {
    const source = new EventSource(new URL("streamTopics", apiURL));
    register(source, {
      state: (state) => setPeers(state),
      add: (peer) => setPeers((prev) => [...prev, peer]),
      delete: (peer) => setPeers((prev) => prev.filter((p) => p !== peer)),
      log: console.log,
    });
    return () => source.close();
  }, [apiURL]);
  return peers;
};

const Topic = ({ apiURL, topic }) => {
  const remove = () => {
    const removeURL = new URL("removeTopic", apiURL);
    removeURL.searchParams.set("name", topic);
    fetch(removeURL);
  };

  return (
    <div className="instance topic">
      <button onClick={remove}>✕</button>
      <span>{topic}</span>
    </div>
  );
};

const Topics = ({ apiURL }) => {
  const topics = useTopics(apiURL);

  return (
    <>
      {topics.map((topic) => (
        <Topic topic={topic} apiURL={apiURL} />
      ))}
      <AddTopic apiURL={apiURL} disabled={!!topics.length} />
    </>
  );
};

const classs = (object) =>
  Object.entries(object).reduce(
    (str, [name, bool]) => `${str}${bool ? ` ${name}` : ""}`,
    ""
  );

const Tabs = ({ apiURL, children }) => {
  const [active, setActive] = useState(0);
  const remove = () => {
    const removeURL = new URL("closeApp", apiURL);
    removeURL.searchParams.set("type", "close");
    fetch(removeURL);
  };
  return (
    <>
      <nav>
        {children.map(({ props: { name } }, index) => (
          <a
            className={classs({ active: index === active })}
            onClick={() => setActive(index)}
          >
            {name}
          </a>
        ))}
        <button onClick={remove}>✕</button>
      </nav>
      <main>{children[active]}</main>
    </>
  );
};

export default ({
  apiURL = new URLSearchParams(window.location.search).get("api"),
} = {}) => (
  <Tabs apiURL={apiURL}>
    <Topics name="Topic" apiURL={apiURL} />
    <Peers name="Peers" apiURL={apiURL} />
    <Serve name="Shared" apiURL={apiURL} />
  </Tabs>
);
