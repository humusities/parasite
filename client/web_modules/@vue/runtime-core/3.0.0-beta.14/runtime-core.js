import { pauseTracking, resetTracking, isRef, toRaw, isProxy, stop, isReactive, effect, computed as computed$1, ref, reactive, shallowReactive } from '@vue/reactivity/reactivity.js';
export { customRef, isProxy, isReactive, isReadonly, isRef, markRaw, reactive, readonly, ref, shallowReactive, shallowReadonly, shallowRef, toRaw, toRef, toRefs, triggerRef, unref } from '@vue/reactivity/reactivity.js';
import { isString, isFunction, isPromise, isArray, camelize, capitalize, EMPTY_ARR, extend, normalizeClass, isObject, normalizeStyle, EMPTY_OBJ, remove, toDisplayString, isReservedProp, invokeArrayFns, hasOwn, NOOP, hasChanged, NO, isOn, hyphenate, def, isGloballyWhitelisted } from '@vue/shared/shared.js';
const stack = [];

function warn(msg, ...args) {
  // avoid props formatting or warn handler tracking deps that might be mutated
  // during patch, leading to infinite recursion.
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();

  if (appWarnHandler) {
    callWithErrorHandling(appWarnHandler, instance, 11
    /* APP_WARN_HANDLER */
    , [msg + args.join(''), instance && instance.proxy, trace.map(({
      vnode
    }) => `at <${formatComponentName(vnode.type)}>`).join('\n'), trace]);
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];

    if (trace.length && // avoid spamming console during tests
    !false) {
      warnArgs.push(`\n`, ...formatTrace(trace));
    }

    console.warn(...warnArgs);
  }

  resetTracking();
}

function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];

  if (!currentVNode) {
    return [];
  } // we can't just use the stack because it will be incomplete during updates
  // that did not start from the root. Re-construct the parent chain using
  // instance parent pointers.


  const normalizedStack = [];

  while (currentVNode) {
    const last = normalizedStack[0];

    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }

    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }

  return normalizedStack;
}

function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry));
  });
  return logs;
}

function formatTraceEntry({
  vnode,
  recurseCount
}) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(vnode.type, isRoot)}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}

function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach(key => {
    res.push(...formatProp(key, props[key]));
  });

  if (keys.length > 3) {
    res.push(` ...`);
  }

  return res;
}

function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (isRef(value)) {
    value = formatProp(key, toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}

function callWithErrorHandling(fn, instance, type, args) {
  let res;

  try {
    res = args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }

  return res;
}

function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);

    if (res && isPromise(res)) {
      res.catch(err => {
        handleError(err, instance, type);
      });
    }

    return res;
  }

  const values = [];

  for (let i = 0; i < fn.length; i++) {
    values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
  }

  return values;
}

function handleError(err, instance, type) {
  const contextVNode = instance ? instance.vnode : null;

  if (instance) {
    let cur = instance.parent; // the exposed instance is the render proxy to keep it consistent with 2.x

    const exposedInstance = instance.proxy; // in production the hook receives only the error code

    const errorInfo = type;

    while (cur) {
      const errorCapturedHooks = cur.ec;

      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo)) {
            return;
          }
        }
      }

      cur = cur.parent;
    } // app-level handling


    const appErrorHandler = instance.appContext.config.errorHandler;

    if (appErrorHandler) {
      callWithErrorHandling(appErrorHandler, null, 10
      /* APP_ERROR_HANDLER */
      , [err, exposedInstance, errorInfo]);
      return;
    }
  }

  logError(err);
}

function logError(err, type, contextVNode) {
  // default behavior is crash in prod & test, recover in dev.
  {
    throw err;
  }
}

const queue = [];
const postFlushCbs = [];
const p = Promise.resolve();
let isFlushing = false;
let isFlushPending = false;

function nextTick(fn) {
  return fn ? p.then(fn) : p;
}

function queueJob(job) {
  if (!queue.includes(job)) {
    queue.push(job);
    queueFlush();
  }
}

function invalidateJob(job) {
  const i = queue.indexOf(job);

  if (i > -1) {
    queue[i] = null;
  }
}

function queuePostFlushCb(cb) {
  if (!isArray(cb)) {
    postFlushCbs.push(cb);
  } else {
    postFlushCbs.push(...cb);
  }

  queueFlush();
}

function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true;
    nextTick(flushJobs);
  }
}

function flushPostFlushCbs(seen) {
  if (postFlushCbs.length) {
    const cbs = [...new Set(postFlushCbs)];
    postFlushCbs.length = 0;

    for (let i = 0; i < cbs.length; i++) {
      cbs[i]();
    }
  }
}

const getId = job => job.id == null ? Infinity : job.id;

function flushJobs(seen) {
  isFlushPending = false;
  isFlushing = true;
  let job; // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // Jobs can never be null before flush starts, since they are only invalidated
  // during execution of another flushed job.

  queue.sort((a, b) => getId(a) - getId(b));

  while ((job = queue.shift()) !== undefined) {
    if (job === null) {
      continue;
    }

    callWithErrorHandling(job, null, 14
    /* SCHEDULER */
    );
  }

  flushPostFlushCbs();
  isFlushing = false; // some postFlushCb queued jobs!
  // keep flushing until it drains.

  if (queue.length || postFlushCbs.length) {
    flushJobs();
  }
} // mark the current rendering instance for asset resolution (e.g.
// resolveComponent, resolveDirective) during render


let currentRenderingInstance = null;

function setCurrentRenderingInstance(instance) {
  currentRenderingInstance = instance;
} // dev only flag to track whether $attrs was used during render.
// If $attrs was used during render then the warning for failed attrs
// fallthrough can be suppressed.


let accessedAttrs = false;

function markAttrsAccessed() {
  accessedAttrs = true;
}

function renderComponentRoot(instance) {
  const {
    type: Component,
    parent,
    vnode,
    proxy,
    withProxy,
    props,
    slots,
    attrs,
    emit,
    renderCache
  } = instance;
  let result;
  currentRenderingInstance = instance;

  try {
    let fallthroughAttrs;

    if (vnode.shapeFlag & 4
    /* STATEFUL_COMPONENT */
    ) {
        // withProxy is a proxy with a different `has` trap only for
        // runtime-compiled render functions using `with` block.
        const proxyToUse = withProxy || proxy;
        result = normalizeVNode(instance.render.call(proxyToUse, proxyToUse, renderCache));
        fallthroughAttrs = attrs;
      } else {
      // functional
      const render = Component; // in dev, mark attrs accessed if optional props (attrs === props)

      if ("production" !== 'production' && attrs === props) {
        markAttrsAccessed();
      }

      result = normalizeVNode(render.length > 1 ? render(props, "production" !== 'production' ? {
        get attrs() {
          markAttrsAccessed();
          return attrs;
        },

        slots,
        emit
      } : {
        attrs,
        slots,
        emit
      }) : render(props, null
      /* we know it doesn't need it */
      ));
      fallthroughAttrs = Component.props ? attrs : getFallthroughAttrs(attrs);
    } // attr merging
    // in dev mode, comments are preserved, and it's possible for a template
    // to have comments along side the root element which makes it a fragment


    let root = result;
    let setRoot = undefined;

    if ("production" !== 'production') {
      ;
      [root, setRoot] = getChildRoot(result);
    }

    if (Component.inheritAttrs !== false && fallthroughAttrs && Object.keys(fallthroughAttrs).length) {
      if (root.shapeFlag & 1
      /* ELEMENT */
      || root.shapeFlag & 6
      /* COMPONENT */
      ) {
          root = cloneVNode(root, fallthroughAttrs);
        } else if ("production" !== 'production' && !accessedAttrs && root.type !== Comment) {
        const allAttrs = Object.keys(attrs);
        const eventAttrs = [];
        const extraAttrs = [];

        for (let i = 0, l = allAttrs.length; i < l; i++) {
          const key = allAttrs[i];

          if (isOn(key)) {
            // remove `on`, lowercase first letter to reflect event casing accurately
            eventAttrs.push(key[2].toLowerCase() + key.slice(3));
          } else {
            extraAttrs.push(key);
          }
        }

        if (extraAttrs.length) {
          warn(`Extraneous non-props attributes (` + `${extraAttrs.join(', ')}) ` + `were passed to component but could not be automatically inherited ` + `because component renders fragment or text root nodes.`);
        }

        if (eventAttrs.length) {
          warn(`Extraneous non-emits event listeners (` + `${eventAttrs.join(', ')}) ` + `were passed to component but could not be automatically inherited ` + `because component renders fragment or text root nodes. ` + `If the listener is intended to be a component custom event listener only, ` + `declare it using the "emits" option.`);
        }
      }
    } // inherit scopeId


    const parentScopeId = parent && parent.type.__scopeId;

    if (parentScopeId) {
      root = cloneVNode(root, {
        [parentScopeId]: ''
      });
    } // inherit directives


    if (vnode.dirs) {
      if ("production" !== 'production' && !isElementRoot(root)) {
        warn(`Runtime directive used on component with non-element root node. ` + `The directives will not function as intended.`);
      }

      root.dirs = vnode.dirs;
    } // inherit transition data


    if (vnode.transition) {
      if ("production" !== 'production' && !isElementRoot(root)) {
        warn(`Component inside <Transition> renders non-element root node ` + `that cannot be animated.`);
      }

      root.transition = vnode.transition;
    }

    if ("production" !== 'production' && setRoot) {
      setRoot(root);
    } else {
      result = root;
    }
  } catch (err) {
    handleError(err, instance, 1
    /* RENDER_FUNCTION */
    );
    result = createVNode(Comment);
  }

  currentRenderingInstance = null;
  return result;
}

const getChildRoot = vnode => {
  if (vnode.type !== Fragment) {
    return [vnode, undefined];
  }

  const rawChildren = vnode.children;
  const dynamicChildren = vnode.dynamicChildren;
  const children = rawChildren.filter(child => {
    return !(isVNode(child) && child.type === Comment);
  });

  if (children.length !== 1) {
    return [vnode, undefined];
  }

  const childRoot = children[0];
  const index = rawChildren.indexOf(childRoot);
  const dynamicIndex = dynamicChildren ? dynamicChildren.indexOf(childRoot) : null;

  const setRoot = updatedRoot => {
    rawChildren[index] = updatedRoot;
    if (dynamicIndex !== null) dynamicChildren[dynamicIndex] = updatedRoot;
  };

  return [normalizeVNode(childRoot), setRoot];
};

const getFallthroughAttrs = attrs => {
  let res;

  for (const key in attrs) {
    if (key === 'class' || key === 'style' || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }

  return res;
};

const isElementRoot = vnode => {
  return vnode.shapeFlag & 6
  /* COMPONENT */
  || vnode.shapeFlag & 1
  /* ELEMENT */
  || vnode.type === Comment // potential v-if branch switch
  ;
};

function shouldUpdateComponent(prevVNode, nextVNode, parentComponent, optimized) {
  const {
    props: prevProps,
    children: prevChildren
  } = prevVNode;
  const {
    props: nextProps,
    children: nextChildren,
    patchFlag
  } = nextVNode; // force child update for runtime directive or transition on component vnode.

  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }

  if (patchFlag > 0) {
    if (patchFlag & 1024
    /* DYNAMIC_SLOTS */
    ) {
        // slot content that references values that might have changed,
        // e.g. in a v-for
        return true;
      }

    if (patchFlag & 16
    /* FULL_PROPS */
    ) {
        // presence of this flag indicates props are always non-null
        return hasPropsChanged(prevProps, nextProps);
      } else if (patchFlag & 8
    /* PROPS */
    ) {
        const dynamicProps = nextVNode.dynamicProps;

        for (let i = 0; i < dynamicProps.length; i++) {
          const key = dynamicProps[i];

          if (nextProps[key] !== prevProps[key]) {
            return true;
          }
        }
      }
  } else if (!optimized) {
    // this path is only taken by manually written render functions
    // so presence of any children leads to a forced update
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }

    if (prevProps === nextProps) {
      return false;
    }

    if (!prevProps) {
      return !!nextProps;
    }

    if (!nextProps) {
      return true;
    }

    return hasPropsChanged(prevProps, nextProps);
  }

  return false;
}

function hasPropsChanged(prevProps, nextProps) {
  const nextKeys = Object.keys(nextProps);

  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];

    if (nextProps[key] !== prevProps[key]) {
      return true;
    }
  }

  return false;
}

function updateHOCHostEl({
  vnode,
  parent
}, el // HostNode
) {
  while (parent && parent.subTree === vnode) {
    (vnode = parent.vnode).el = el;
    parent = parent.parent;
  }
}

const isSuspense = type => type.__isSuspense; // Suspense exposes a component-like API, and is treated like a component
// in the compiler, but internally it's a special built-in type that hooks
// directly into the renderer.


const SuspenseImpl = {
  // In order to make Suspense tree-shakable, we need to avoid importing it
  // directly in the renderer. The renderer checks for the __isSuspense flag
  // on a vnode's type and calls the `process` method, passing in renderer
  // internals.
  __isSuspense: true,

  process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, // platform-specific impl passed from renderer
  rendererInternals) {
    if (n1 == null) {
      mountSuspense(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, rendererInternals);
    } else {
      patchSuspense(n1, n2, container, anchor, parentComponent, isSVG, optimized, rendererInternals);
    }
  },

  hydrate: hydrateSuspense
}; // Force-casted public typing for h and TSX props inference

const Suspense = SuspenseImpl;

function mountSuspense(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, rendererInternals) {
  const {
    p: patch,
    o: {
      createElement
    }
  } = rendererInternals;
  const hiddenContainer = createElement('div');
  const suspense = n2.suspense = createSuspenseBoundary(n2, parentSuspense, parentComponent, container, hiddenContainer, anchor, isSVG, optimized, rendererInternals); // start mounting the content subtree in an off-dom container

  patch(null, suspense.subTree, hiddenContainer, null, parentComponent, suspense, isSVG, optimized); // now check if we have encountered any async deps

  if (suspense.deps > 0) {
    // mount the fallback tree
    patch(null, suspense.fallbackTree, container, anchor, parentComponent, null, // fallback tree will not have suspense context
    isSVG, optimized);
    n2.el = suspense.fallbackTree.el;
  } else {
    // Suspense has no async deps. Just resolve.
    suspense.resolve();
  }
}

function patchSuspense(n1, n2, container, anchor, parentComponent, isSVG, optimized, {
  p: patch
}) {
  const suspense = n2.suspense = n1.suspense;
  suspense.vnode = n2;
  const {
    content,
    fallback
  } = normalizeSuspenseChildren(n2);
  const oldSubTree = suspense.subTree;
  const oldFallbackTree = suspense.fallbackTree;

  if (!suspense.isResolved) {
    patch(oldSubTree, content, suspense.hiddenContainer, null, parentComponent, suspense, isSVG, optimized);

    if (suspense.deps > 0) {
      // still pending. patch the fallback tree.
      patch(oldFallbackTree, fallback, container, anchor, parentComponent, null, // fallback tree will not have suspense context
      isSVG, optimized);
      n2.el = fallback.el;
    } // If deps somehow becomes 0 after the patch it means the patch caused an
    // async dep component to unmount and removed its dep. It will cause the
    // suspense to resolve and we don't need to do anything here.

  } else {
    // just normal patch inner content as a fragment
    patch(oldSubTree, content, container, anchor, parentComponent, suspense, isSVG, optimized);
    n2.el = content.el;
  }

  suspense.subTree = content;
  suspense.fallbackTree = fallback;
}

function createSuspenseBoundary(vnode, parent, parentComponent, container, hiddenContainer, anchor, isSVG, optimized, rendererInternals, isHydrating = false) {
  const {
    p: patch,
    m: move,
    um: unmount,
    n: next,
    o: {
      parentNode
    }
  } = rendererInternals;

  const getCurrentTree = () => suspense.isResolved || suspense.isHydrating ? suspense.subTree : suspense.fallbackTree;

  const {
    content,
    fallback
  } = normalizeSuspenseChildren(vnode);
  const suspense = {
    vnode,
    parent,
    parentComponent,
    isSVG,
    optimized,
    container,
    hiddenContainer,
    anchor,
    deps: 0,
    subTree: content,
    fallbackTree: fallback,
    isHydrating,
    isResolved: false,
    isUnmounted: false,
    effects: [],

    resolve() {
      const {
        vnode,
        subTree,
        fallbackTree,
        effects,
        parentComponent,
        container
      } = suspense;

      if (suspense.isHydrating) {
        suspense.isHydrating = false;
      } else {
        // this is initial anchor on mount
        let {
          anchor
        } = suspense; // unmount fallback tree

        if (fallbackTree.el) {
          // if the fallback tree was mounted, it may have been moved
          // as part of a parent suspense. get the latest anchor for insertion
          anchor = next(fallbackTree);
          unmount(fallbackTree, parentComponent, suspense, true);
        } // move content from off-dom container to actual container


        move(subTree, container, anchor, 0
        /* ENTER */
        );
      }

      const el = vnode.el = subTree.el; // suspense as the root node of a component...

      if (parentComponent && parentComponent.subTree === vnode) {
        parentComponent.vnode.el = el;
        updateHOCHostEl(parentComponent, el);
      } // check if there is a pending parent suspense


      let parent = suspense.parent;
      let hasUnresolvedAncestor = false;

      while (parent) {
        if (!parent.isResolved) {
          // found a pending parent suspense, merge buffered post jobs
          // into that parent
          parent.effects.push(...effects);
          hasUnresolvedAncestor = true;
          break;
        }

        parent = parent.parent;
      } // no pending parent suspense, flush all jobs


      if (!hasUnresolvedAncestor) {
        queuePostFlushCb(effects);
      }

      suspense.isResolved = true;
      suspense.effects = []; // invoke @resolve event

      const onResolve = vnode.props && vnode.props.onResolve;

      if (isFunction(onResolve)) {
        onResolve();
      }
    },

    recede() {
      suspense.isResolved = false;
      const {
        vnode,
        subTree,
        fallbackTree,
        parentComponent,
        container,
        hiddenContainer,
        isSVG,
        optimized
      } = suspense; // move content tree back to the off-dom container

      const anchor = next(subTree);
      move(subTree, hiddenContainer, null, 1
      /* LEAVE */
      ); // remount the fallback tree

      patch(null, fallbackTree, container, anchor, parentComponent, null, // fallback tree will not have suspense context
      isSVG, optimized);
      const el = vnode.el = fallbackTree.el; // suspense as the root node of a component...

      if (parentComponent && parentComponent.subTree === vnode) {
        parentComponent.vnode.el = el;
        updateHOCHostEl(parentComponent, el);
      } // invoke @recede event


      const onRecede = vnode.props && vnode.props.onRecede;

      if (isFunction(onRecede)) {
        onRecede();
      }
    },

    move(container, anchor, type) {
      move(getCurrentTree(), container, anchor, type);
      suspense.container = container;
    },

    next() {
      return next(getCurrentTree());
    },

    registerDep(instance, setupRenderEffect) {
      // suspense is already resolved, need to recede.
      // use queueJob so it's handled synchronously after patching the current
      // suspense tree
      if (suspense.isResolved) {
        queueJob(() => {
          suspense.recede();
        });
      }

      const hydratedEl = instance.vnode.el;
      suspense.deps++;
      instance.asyncDep.catch(err => {
        handleError(err, instance, 0
        /* SETUP_FUNCTION */
        );
      }).then(asyncSetupResult => {
        // retry when the setup() promise resolves.
        // component may have been unmounted before resolve.
        if (instance.isUnmounted || suspense.isUnmounted) {
          return;
        }

        suspense.deps--; // retry from this component

        instance.asyncResolved = true;
        const {
          vnode
        } = instance;
        handleSetupResult(instance, asyncSetupResult);

        if (hydratedEl) {
          // vnode may have been replaced if an update happened before the
          // async dep is resolved.
          vnode.el = hydratedEl;
        }

        setupRenderEffect(instance, vnode, // component may have been moved before resolve.
        // if this is not a hydration, instance.subTree will be the comment
        // placeholder.
        hydratedEl ? parentNode(hydratedEl) : parentNode(instance.subTree.el), // anchor will not be used if this is hydration, so only need to
        // consider the comment placeholder case.
        hydratedEl ? null : next(instance.subTree), suspense, isSVG, optimized);
        updateHOCHostEl(instance, vnode.el);

        if (suspense.deps === 0) {
          suspense.resolve();
        }
      });
    },

    unmount(parentSuspense, doRemove) {
      suspense.isUnmounted = true;
      unmount(suspense.subTree, parentComponent, parentSuspense, doRemove);

      if (!suspense.isResolved) {
        unmount(suspense.fallbackTree, parentComponent, parentSuspense, doRemove);
      }
    }

  };
  return suspense;
}

function hydrateSuspense(node, vnode, parentComponent, parentSuspense, isSVG, optimized, rendererInternals, hydrateNode) {
  const suspense = vnode.suspense = createSuspenseBoundary(vnode, parentSuspense, parentComponent, node.parentNode, document.createElement('div'), null, isSVG, optimized, rendererInternals, true
  /* hydrating */
  ); // there are two possible scenarios for server-rendered suspense:
  // - success: ssr content should be fully resolved
  // - failure: ssr content should be the fallback branch.
  // however, on the client we don't really know if it has failed or not
  // attempt to hydrate the DOM assuming it has succeeded, but we still
  // need to construct a suspense boundary first

  const result = hydrateNode(node, suspense.subTree, parentComponent, suspense, optimized);

  if (suspense.deps === 0) {
    suspense.resolve();
  }

  return result;
}

function normalizeSuspenseChildren(vnode) {
  const {
    shapeFlag,
    children
  } = vnode;

  if (shapeFlag & 32
  /* SLOTS_CHILDREN */
  ) {
      const {
        default: d,
        fallback
      } = children;
      return {
        content: normalizeVNode(isFunction(d) ? d() : d),
        fallback: normalizeVNode(isFunction(fallback) ? fallback() : fallback)
      };
    } else {
    return {
      content: normalizeVNode(children),
      fallback: normalizeVNode(null)
    };
  }
}

function queueEffectWithSuspense(fn, suspense) {
  if (suspense && !suspense.isResolved) {
    if (isArray(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
/**
 * Wrap a slot function to memoize current rendering instance
 * @internal
 */


function withCtx(fn, ctx = currentRenderingInstance) {
  if (!ctx) return fn;
  return function renderFnWithContext() {
    const owner = currentRenderingInstance;
    setCurrentRenderingInstance(ctx);
    const res = fn.apply(null, arguments);
    setCurrentRenderingInstance(owner);
    return res;
  };
} // SFC scoped style ID management.


let currentScopeId = null;
const scopeIdStack = [];
/**
 * @internal
 */

function pushScopeId(id) {
  scopeIdStack.push(currentScopeId = id);
}
/**
 * @internal
 */


function popScopeId() {
  scopeIdStack.pop();
  currentScopeId = scopeIdStack[scopeIdStack.length - 1] || null;
}
/**
 * @internal
 */


function withScopeId(id) {
  return fn => withCtx(function () {
    pushScopeId(id);
    const res = fn.apply(this, arguments);
    popScopeId();
    return res;
  });
}

const isTeleport = type => type.__isTeleport;

const isTeleportDisabled = props => props && (props.disabled || props.disabled === '');

const resolveTarget = (props, select) => {
  const targetSelector = props && props.to;

  if (isString(targetSelector)) {
    if (!select) {
      return null;
    } else {
      const target = select(targetSelector);
      return target;
    }
  } else {
    return targetSelector;
  }
};

const TeleportImpl = {
  __isTeleport: true,

  process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, internals) {
    const {
      mc: mountChildren,
      pc: patchChildren,
      pbc: patchBlockChildren,
      o: {
        insert,
        querySelector,
        createText,
        createComment
      }
    } = internals;
    const disabled = isTeleportDisabled(n2.props);
    const {
      shapeFlag,
      children
    } = n2;

    if (n1 == null) {
      // insert anchors in the main view
      const placeholder = n2.el = createText('');
      const mainAnchor = n2.anchor = createText('');
      insert(placeholder, container, anchor);
      insert(mainAnchor, container, anchor);
      const target = n2.target = resolveTarget(n2.props, querySelector);
      const targetAnchor = n2.targetAnchor = createText('');

      if (target) {
        insert(targetAnchor, target);
      }

      const mount = (container, anchor) => {
        // Teleport *always* has Array children. This is enforced in both the
        // compiler and vnode children normalization.
        if (shapeFlag & 16
        /* ARRAY_CHILDREN */
        ) {
            mountChildren(children, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
          }
      };

      if (disabled) {
        mount(container, mainAnchor);
      } else if (target) {
        mount(target, targetAnchor);
      }
    } else {
      // update content
      n2.el = n1.el;
      const mainAnchor = n2.anchor = n1.anchor;
      const target = n2.target = n1.target;
      const targetAnchor = n2.targetAnchor = n1.targetAnchor;
      const wasDisabled = isTeleportDisabled(n1.props);
      const currentContainer = wasDisabled ? container : target;
      const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;

      if (n2.dynamicChildren) {
        // fast path when the teleport happens to be a block root
        patchBlockChildren(n1.dynamicChildren, n2.dynamicChildren, currentContainer, parentComponent, parentSuspense, isSVG);
      } else if (!optimized) {
        patchChildren(n1, n2, currentContainer, currentAnchor, parentComponent, parentSuspense, isSVG);
      }

      if (disabled) {
        if (!wasDisabled) {
          // enabled -> disabled
          // move into main container
          moveTeleport(n2, container, mainAnchor, internals, 1
          /* TOGGLE */
          );
        }
      } else {
        // target changed
        if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
          const nextTarget = n2.target = resolveTarget(n2.props, querySelector);

          if (nextTarget) {
            moveTeleport(n2, nextTarget, null, internals, 0
            /* TARGET_CHANGE */
            );
          }
        } else if (wasDisabled) {
          // disabled -> enabled
          // move into teleport target
          moveTeleport(n2, target, targetAnchor, internals, 1
          /* TOGGLE */
          );
        }
      }
    }
  },

  remove(vnode, {
    r: remove,
    o: {
      remove: hostRemove
    }
  }) {
    const {
      shapeFlag,
      children,
      anchor
    } = vnode;
    hostRemove(anchor);

    if (shapeFlag & 16
    /* ARRAY_CHILDREN */
    ) {
        for (let i = 0; i < children.length; i++) {
          remove(children[i]);
        }
      }
  },

  move: moveTeleport,
  hydrate: hydrateTeleport
};

function moveTeleport(vnode, container, parentAnchor, {
  o: {
    insert
  },
  m: move
}, moveType = 2
/* REORDER */
) {
  // move target anchor if this is a target change.
  if (moveType === 0
  /* TARGET_CHANGE */
  ) {
      insert(vnode.targetAnchor, container, parentAnchor);
    }

  const {
    el,
    anchor,
    shapeFlag,
    children,
    props
  } = vnode;
  const isReorder = moveType === 2
  /* REORDER */
  ; // move main view anchor if this is a re-order.

  if (isReorder) {
    insert(el, container, parentAnchor);
  } // if this is a re-order and teleport is enabled (content is in target)
  // do not move children. So the opposite is: only move children if this
  // is not a reorder, or the teleport is disabled


  if (!isReorder || isTeleportDisabled(props)) {
    // Teleport has either Array children or no children.
    if (shapeFlag & 16
    /* ARRAY_CHILDREN */
    ) {
        for (let i = 0; i < children.length; i++) {
          move(children[i], container, parentAnchor, 2
          /* REORDER */
          );
        }
      }
  } // move main view anchor if this is a re-order.


  if (isReorder) {
    insert(anchor, container, parentAnchor);
  }
}

function hydrateTeleport(node, vnode, parentComponent, parentSuspense, optimized, {
  o: {
    nextSibling,
    parentNode,
    querySelector
  }
}, hydrateChildren) {
  const target = vnode.target = resolveTarget(vnode.props, querySelector);

  if (target) {
    // if multiple teleports rendered to the same target element, we need to
    // pick up from where the last teleport finished instead of the first node
    const targetNode = target._lpa || target.firstChild;

    if (vnode.shapeFlag & 16
    /* ARRAY_CHILDREN */
    ) {
        if (isTeleportDisabled(vnode.props)) {
          vnode.anchor = hydrateChildren(nextSibling(node), vnode, parentNode(node), parentComponent, parentSuspense, optimized);
          vnode.targetAnchor = targetNode;
        } else {
          vnode.anchor = nextSibling(node);
          vnode.targetAnchor = hydrateChildren(targetNode, vnode, target, parentComponent, parentSuspense, optimized);
        }

        target._lpa = nextSibling(vnode.targetAnchor);
      }
  }

  return vnode.anchor && nextSibling(vnode.anchor);
} // Force-casted public typing for h and TSX props inference


const Teleport = TeleportImpl;
const COMPONENTS = 'components';
const DIRECTIVES = 'directives';

function resolveComponent(name) {
  return resolveAsset(COMPONENTS, name) || name;
}

const NULL_DYNAMIC_COMPONENT = Symbol();

function resolveDynamicComponent(component) {
  if (isString(component)) {
    return resolveAsset(COMPONENTS, component, false) || component;
  } else {
    // invalid types will fallthrough to createVNode and raise warning
    return component || NULL_DYNAMIC_COMPONENT;
  }
}

function resolveDirective(name) {
  return resolveAsset(DIRECTIVES, name);
}

function resolveAsset(type, name, warnMissing = true) {
  const instance = currentRenderingInstance || currentInstance;

  if (instance) {
    let camelized, capitalized;
    const registry = instance[type];
    let res = registry[name] || registry[camelized = camelize(name)] || registry[capitalized = capitalize(camelized)];

    if (!res && type === COMPONENTS) {
      const self = instance.type;
      const selfName = self.displayName || self.name;

      if (selfName && (selfName === name || selfName === camelized || selfName === capitalized)) {
        res = self;
      }
    }

    return res;
  }
}

const Fragment = Symbol(undefined);
const Text = Symbol(undefined);
const Comment = Symbol(undefined);
const Static = Symbol(undefined); // Since v-if and v-for are the two possible ways node structure can dynamically
// change, once we consider v-if branches and each v-for fragment a block, we
// can divide a template into nested blocks, and within each block the node
// structure would be stable. This allows us to skip most children diffing
// and only worry about the dynamic nodes (indicated by patch flags).

const blockStack = [];
let currentBlock = null;
/**
 * Open a block.
 * This must be called before `createBlock`. It cannot be part of `createBlock`
 * because the children of the block are evaluated before `createBlock` itself
 * is called. The generated code typically looks like this:
 *
 * ```js
 * function render() {
 *   return (openBlock(),createBlock('div', null, [...]))
 * }
 * ```
 * disableTracking is true when creating a v-for fragment block, since a v-for
 * fragment always diffs its children.
 *
 * @internal
 */

function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
} // Whether we should be tracking dynamic child nodes inside a block.
// Only tracks when this value is > 0
// We are not using a simple boolean because this value may need to be
// incremented/decremented by nested usage of v-once (see below)


let shouldTrack = 1;
/**
 * Block tracking sometimes needs to be disabled, for example during the
 * creation of a tree that needs to be cached by v-once. The compiler generates
 * code like this:
 *
 * ``` js
 * _cache[1] || (
 *   setBlockTracking(-1),
 *   _cache[1] = createVNode(...),
 *   setBlockTracking(1),
 *   _cache[1]
 * )
 * ```
 *
 * @internal
 */

function setBlockTracking(value) {
  shouldTrack += value;
}
/**
 * Create a block root vnode. Takes the same exact arguments as `createVNode`.
 * A block root keeps track of dynamic nodes within the block in the
 * `dynamicChildren` array.
 *
 * @internal
 */


function createBlock(type, props, children, patchFlag, dynamicProps) {
  const vnode = createVNode(type, props, children, patchFlag, dynamicProps, true
  /* isBlock: prevent a block from tracking itself */
  ); // save current block children on the block vnode

  vnode.dynamicChildren = currentBlock || EMPTY_ARR; // close block

  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null; // a block is always going to be patched, so track it as a child of its
  // parent block

  if (currentBlock) {
    currentBlock.push(vnode);
  }

  return vnode;
}

function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}

function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
/**
 * Internal API for registering an arguments transform for createVNode
 * used for creating stubs in the test-utils
 * It is *internal* but needs to be exposed for test-utils to pick up proper
 * typings
 */


function transformVNodeArgs(transformer) {}

const InternalObjectKey = `__vInternal`;

const normalizeKey = ({
  key
}) => key != null ? key : null;

const normalizeRef = ({
  ref
}) => ref != null ? isArray(ref) ? ref : [currentRenderingInstance, ref] : null;

const createVNode = _createVNode;

function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    type = Comment;
  } // class component normalization.


  if (isFunction(type) && '__vccOpts' in type) {
    type = type.__vccOpts;
  } // class & style normalization.


  if (props) {
    // for reactive or proxy objects, we need to clone it to enable mutation.
    if (isProxy(props) || InternalObjectKey in props) {
      props = extend({}, props);
    }

    let {
      class: klass,
      style
    } = props;

    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }

    if (isObject(style)) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style);
      }

      props.style = normalizeStyle(style);
    }
  } // encode the vnode type information into a bitmap


  const shapeFlag = isString(type) ? 1
  /* ELEMENT */
  : isSuspense(type) ? 128
  /* SUSPENSE */
  : isTeleport(type) ? 64
  /* TELEPORT */
  : isObject(type) ? 4
  /* STATEFUL_COMPONENT */
  : isFunction(type) ? 2
  /* FUNCTIONAL_COMPONENT */
  : 0;
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    children: null,
    component: null,
    suspense: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null
  };
  normalizeChildren(vnode, children); // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.

  if (shouldTrack > 0 && !isBlockNode && currentBlock && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  patchFlag !== 32
  /* HYDRATE_EVENTS */
  && (patchFlag > 0 || shapeFlag & 128
  /* SUSPENSE */
  || shapeFlag & 64
  /* TELEPORT */
  || shapeFlag & 4
  /* STATEFUL_COMPONENT */
  || shapeFlag & 2
  /* FUNCTIONAL_COMPONENT */
  )) {
    currentBlock.push(vnode);
  }

  return vnode;
}

function cloneVNode(vnode, extraProps) {
  const props = extraProps ? vnode.props ? mergeProps(vnode.props, extraProps) : extend({}, extraProps) : vnode.props; // This is intentionally NOT using spread or extend to avoid the runtime
  // key enumeration cost.

  return {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: vnode.scopeId,
    children: vnode.children,
    target: vnode.target,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to bail out of optimized mode.
    // however we don't want block nodes to de-opt their children, so if the
    // vnode is a block node, we only add the FULL_PROPS flag to it.
    patchFlag: extraProps ? vnode.dynamicChildren ? vnode.patchFlag | 16
    /* FULL_PROPS */
    : -2
    /* BAIL */
    : vnode.patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition: vnode.transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    el: vnode.el,
    anchor: vnode.anchor
  };
}
/**
 * @internal
 */


function createTextVNode(text = ' ', flag = 0) {
  return createVNode(Text, null, text, flag);
}
/**
 * @internal
 */


function createStaticVNode(content, numberOfNodes) {
  // A static vnode can contain multiple stringified elements, and the number
  // of elements is necessary for hydration.
  const vnode = createVNode(Static, null, content);
  vnode.staticCount = numberOfNodes;
  return vnode;
}
/**
 * @internal
 */


function createCommentVNode(text = '', // when used as the v-else branch, the comment node must be created as a
// block to ensure correct updates.
asBlock = false) {
  return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}

function normalizeVNode(child) {
  if (child == null || typeof child === 'boolean') {
    // empty placeholder
    return createVNode(Comment);
  } else if (isArray(child)) {
    // fragment
    return createVNode(Fragment, null, child);
  } else if (typeof child === 'object') {
    // already vnode, this should be the most common since compiled templates
    // always produce all-vnode children arrays
    return child.el === null ? child : cloneVNode(child);
  } else {
    // strings and numbers
    return createVNode(Text, null, String(child));
  }
} // optimized normalization for template-compiled render fns


function cloneIfMounted(child) {
  return child.el === null ? child : cloneVNode(child);
}

function normalizeChildren(vnode, children) {
  let type = 0;
  const {
    shapeFlag
  } = vnode;

  if (children == null) {
    children = null;
  } else if (isArray(children)) {
    type = 16
    /* ARRAY_CHILDREN */
    ;
  } else if (typeof children === 'object') {
    // Normalize slot to plain children
    if ((shapeFlag & 1
    /* ELEMENT */
    || shapeFlag & 64
    /* TELEPORT */
    ) && children.default) {
      normalizeChildren(vnode, children.default());
      return;
    } else {
      type = 32
      /* SLOTS_CHILDREN */
      ;

      if (!children._ && !(InternalObjectKey in children)) {
        children._ctx = currentRenderingInstance;
      }
    }
  } else if (isFunction(children)) {
    children = {
      default: children,
      _ctx: currentRenderingInstance
    };
    type = 32
    /* SLOTS_CHILDREN */
    ;
  } else {
    children = String(children); // force teleport children to array so it can be moved around

    if (shapeFlag & 64
    /* TELEPORT */
    ) {
        type = 16
        /* ARRAY_CHILDREN */
        ;
        children = [createTextVNode(children)];
      } else {
      type = 8
      /* TEXT_CHILDREN */
      ;
    }
  }

  vnode.children = children;
  vnode.shapeFlag |= type;
}

const handlersRE = /^on|^vnode/;

function mergeProps(...args) {
  const ret = {};
  extend(ret, args[0]);

  for (let i = 1; i < args.length; i++) {
    const toMerge = args[i];

    for (const key in toMerge) {
      if (key === 'class') {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (handlersRE.test(key)) {
        // on*, vnode*
        const existing = ret[key];
        const incoming = toMerge[key];

        if (existing !== incoming) {
          ret[key] = existing ? [].concat(existing, toMerge[key]) : incoming;
        }
      } else {
        ret[key] = toMerge[key];
      }
    }
  }

  return ret;
}

function emit(instance, event, ...args) {
  const props = instance.vnode.props || EMPTY_OBJ;
  let handler = props[`on${capitalize(event)}`]; // for v-model update:xxx events, also trigger kebab-case equivalent
  // for props passed via kebab-case

  if (!handler && event.startsWith('update:')) {
    event = hyphenate(event);
    handler = props[`on${capitalize(event)}`];
  }

  if (handler) {
    callWithAsyncErrorHandling(handler, instance, 6
    /* COMPONENT_EVENT_HANDLER */
    , args);
  }
}

function normalizeEmitsOptions(options) {
  if (!options) {
    return;
  } else if (isArray(options)) {
    if (options._n) {
      return options._n;
    }

    const normalized = {};
    options.forEach(key => normalized[key] = null);
    def(options, '_n', normalized);
    return normalized;
  } else {
    return options;
  }
} // Check if an incoming prop key is a declared emit event listener.
// e.g. With `emits: { click: null }`, props named `onClick` and `onclick` are
// both considered matched listeners.


function isEmitListener(emits, key) {
  return isOn(key) && (hasOwn(emits = normalizeEmitsOptions(emits), key[2].toLowerCase() + key.slice(3)) || hasOwn(emits, key.slice(2)));
}

function initProps(instance, rawProps, isStateful, // result of bitwise flag comparison
isSSR = false) {
  const props = {};
  const attrs = {};
  def(attrs, InternalObjectKey, 1);
  setFullProps(instance, rawProps, props, attrs);
  const options = instance.type.props;

  if (isStateful) {
    // stateful
    instance.props = isSSR ? props : shallowReactive(props);
  } else {
    if (!options) {
      // functional w/ optional props, props === attrs
      instance.props = attrs;
    } else {
      // functional w/ declared props
      instance.props = props;
    }
  }

  instance.attrs = attrs;
}

function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: {
      patchFlag
    }
  } = instance;
  const rawOptions = instance.type.props;
  const rawCurrentProps = toRaw(props);
  const {
    0: options
  } = normalizePropsOptions(rawOptions);

  if ((optimized || patchFlag > 0) && !(patchFlag & 16
  /* FULL_PROPS */
  )) {
    if (patchFlag & 8
    /* PROPS */
    ) {
        // Compiler-generated props & no keys change, just set the updated
        // the props.
        const propsToUpdate = instance.vnode.dynamicProps;

        for (let i = 0; i < propsToUpdate.length; i++) {
          const key = propsToUpdate[i]; // PROPS flag guarantees rawProps to be non-null

          const value = rawProps[key];

          if (options) {
            // attr / props separation was done on init and will be consistent
            // in this code path, so just check if attrs have it.
            if (hasOwn(attrs, key)) {
              attrs[key] = value;
            } else {
              const camelizedKey = camelize(key);
              props[camelizedKey] = resolvePropValue(options, rawCurrentProps, camelizedKey, value);
            }
          } else {
            attrs[key] = value;
          }
        }
      }
  } else {
    // full props update.
    setFullProps(instance, rawProps, props, attrs); // in case of dynamic props, check if we need to delete keys from
    // the props object

    let kebabKey;

    for (const key in rawCurrentProps) {
      if (!rawProps || !hasOwn(rawProps, key) && ( // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      (kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && rawPrevProps[kebabKey] !== undefined) {
            props[key] = resolvePropValue(options, rawProps || EMPTY_OBJ, key, undefined);
          }
        } else {
          delete props[key];
        }
      }
    } // in the case of functional component w/o props declaration, props and
    // attrs point to the same object so it should already have been updated.


    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key)) {
          delete attrs[key];
        }
      }
    }
  }
}

function setFullProps(instance, rawProps, props, attrs) {
  const {
    0: options,
    1: needCastKeys
  } = normalizePropsOptions(instance.type.props);
  const emits = instance.type.emits;

  if (rawProps) {
    for (const key in rawProps) {
      const value = rawProps[key]; // key, ref are reserved and never passed down

      if (isReservedProp(key)) {
        continue;
      } // prop option names are camelized during normalization, so to support
      // kebab -> camel conversion here we need to camelize the key.


      let camelKey;

      if (options && hasOwn(options, camelKey = camelize(key))) {
        props[camelKey] = value;
      } else if (!emits || !isEmitListener(emits, key)) {
        // Any non-declared (either as a prop or an emitted event) props are put
        // into a separate `attrs` object for spreading. Make sure to preserve
        // original key casing
        attrs[key] = value;
      }
    }
  }

  if (needCastKeys) {
    const rawCurrentProps = toRaw(props);

    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(options, rawCurrentProps, key, rawCurrentProps[key]);
    }
  }
}

function resolvePropValue(options, props, key, value) {
  const opt = options[key];

  if (opt != null) {
    const hasDefault = hasOwn(opt, 'default'); // default values

    if (hasDefault && value === undefined) {
      const defaultValue = opt.default;
      value = isFunction(defaultValue) ? defaultValue() : defaultValue;
    } // boolean casting


    if (opt[0
    /* shouldCast */
    ]) {
      if (!hasOwn(props, key) && !hasDefault) {
        value = false;
      } else if (opt[1
      /* shouldCastTrue */
      ] && (value === '' || value === hyphenate(key))) {
        value = true;
      }
    }
  }

  return value;
}

function normalizePropsOptions(raw) {
  if (!raw) {
    return EMPTY_ARR;
  }

  if (raw._n) {
    return raw._n;
  }

  const normalized = {};
  const needCastKeys = [];

  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i]);

      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else {
    for (const key in raw) {
      const normalizedKey = camelize(key);

      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray(opt) || isFunction(opt) ? {
          type: opt
        } : opt;

        if (prop) {
          const booleanIndex = getTypeIndex(Boolean, prop.type);
          const stringIndex = getTypeIndex(String, prop.type);
          prop[0
          /* shouldCast */
          ] = booleanIndex > -1;
          prop[1
          /* shouldCastTrue */
          ] = stringIndex < 0 || booleanIndex < stringIndex; // if the prop needs boolean casting or default value

          if (booleanIndex > -1 || hasOwn(prop, 'default')) {
            needCastKeys.push(normalizedKey);
          }
        }
      }
    }
  }

  const normalizedEntry = [normalized, needCastKeys];
  def(raw, '_n', normalizedEntry);
  return normalizedEntry;
} // use function string name to check type constructors
// so that it works across vms / iframes.


function getType(ctor) {
  const match = ctor && ctor.toString().match(/^\s*function (\w+)/);
  return match ? match[1] : '';
}

function isSameType(a, b) {
  return getType(a) === getType(b);
}

function getTypeIndex(type, expectedTypes) {
  if (isArray(expectedTypes)) {
    for (let i = 0, len = expectedTypes.length; i < len; i++) {
      if (isSameType(expectedTypes[i], type)) {
        return i;
      }
    }
  } else if (isFunction(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1;
  }

  return -1;
}

function validatePropName(key) {
  if (key[0] !== '$') {
    return true;
  }

  return false;
}

const isInternalKey = key => key[0] === '_' || key === '$stable';

const normalizeSlotValue = value => isArray(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];

const normalizeSlot = (key, rawSlot, ctx) => withCtx(props => {
  return normalizeSlotValue(rawSlot(props));
}, ctx);

const normalizeObjectSlots = (rawSlots, slots) => {
  const ctx = rawSlots._ctx;

  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];

    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);

      slots[key] = () => normalized;
    }
  }
};

const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);

  instance.slots.default = () => normalized;
};

const initSlots = (instance, children) => {
  if (instance.vnode.shapeFlag & 32
  /* SLOTS_CHILDREN */
  ) {
      if (children._ === 1) {
        instance.slots = children;
      } else {
        normalizeObjectSlots(children, instance.slots = {});
      }
    } else {
    instance.slots = {};

    if (children) {
      normalizeVNodeSlots(instance, children);
    }
  }

  def(instance.slots, InternalObjectKey, 1);
};

const updateSlots = (instance, children) => {
  const {
    vnode,
    slots
  } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;

  if (vnode.shapeFlag & 32
  /* SLOTS_CHILDREN */
  ) {
      if (children._ === 1) {
        // compiled slots.
        if ( // bail on dynamic slots (v-if, v-for, reference of scope variables)
        !(vnode.patchFlag & 1024
        /* DYNAMIC_SLOTS */
        ) && // bail on HRM updates
        !("production" !== 'production')) {
          // compiled AND static.
          // no need to update, and skip stale slots removal.
          needDeletionCheck = false;
        } else {
          // compiled but dynamic - update slots, but skip normalization.
          extend(slots, children);
        }
      } else {
        needDeletionCheck = !children.$stable;
        normalizeObjectSlots(children, slots);
      }

      deletionComparisonTarget = children;
    } else if (children) {
    // non slot object children (direct value) passed to a component
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = {
      default: 1
    };
  } // delete stale slots


  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && !(key in deletionComparisonTarget)) {
        delete slots[key];
      }
    }
  }
};
/**
 * Adds directives to a VNode.
 */


function withDirectives(vnode, directives) {
  const internalInstance = currentRenderingInstance;

  if (internalInstance === null) {
    return vnode;
  }

  const instance = internalInstance.proxy;
  const bindings = vnode.dirs || (vnode.dirs = []);

  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];

    if (isFunction(dir)) {
      dir = {
        mounted: dir,
        updated: dir
      };
    }

    bindings.push({
      dir,
      instance,
      value,
      oldValue: void 0,
      arg,
      modifiers
    });
  }

  return vnode;
}

function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;

  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];

    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    }

    const hook = binding.dir[name];

    if (hook) {
      callWithAsyncErrorHandling(hook, instance, 8
      /* DIRECTIVE_HOOK */
      , [vnode.el, binding, vnode, prevVNode]);
    }
  }
}

function createAppContext() {
  return {
    config: {
      isNativeTag: NO,
      devtools: true,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      isCustomElement: NO,
      errorHandler: undefined,
      warnHandler: undefined
    },
    mixins: [],
    components: {},
    directives: {},
    provides: Object.create(null)
  };
}

function createAppAPI(render, hydrate) {
  return function createApp(rootComponent, rootProps = null) {
    if (rootProps != null && !isObject(rootProps)) {
      rootProps = null;
    }

    const context = createAppContext();
    const installedPlugins = new Set();
    let isMounted = false;
    const app = {
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,

      get config() {
        return context.config;
      },

      set config(v) {},

      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ;else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app, ...options);
        }
        return app;
      },

      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app;
      },

      component(name, component) {
        if (!component) {
          return context.components[name];
        }

        context.components[name] = component;
        return app;
      },

      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }

        context.directives[name] = directive;
        return app;
      },

      mount(rootContainer, isHydrate) {
        if (!isMounted) {
          const vnode = createVNode(rootComponent, rootProps); // store app context on the root VNode.
          // this will be set on the root instance on initial mount.

          vnode.appContext = context;

          if (isHydrate && hydrate) {
            hydrate(vnode, rootContainer);
          } else {
            render(vnode, rootContainer);
          }

          isMounted = true;
          app._container = rootContainer;
          return vnode.component.proxy;
        }
      },

      unmount() {
        if (isMounted) {
          render(null, app._container);
        }
      },

      provide(key, value) {
        // TypeScript doesn't allow symbols as index type
        // https://github.com/Microsoft/TypeScript/issues/24587
        context.provides[key] = value;
        return app;
      }

    };
    return app;
  };
}

let hasMismatch = false;

const isSVGContainer = container => /svg/.test(container.namespaceURI) && container.tagName !== 'foreignObject';

const isComment = node => node.nodeType === 8
/* COMMENT */
; // Note: hydration is DOM-specific
// But we have to place it in core due to tight coupling with core - splitting
// it out creates a ton of unnecessary complexity.
// Hydration also depends on some renderer internal logic which needs to be
// passed in via arguments.


function createHydrationFunctions(rendererInternals) {
  const {
    mt: mountComponent,
    p: patch,
    o: {
      patchProp,
      nextSibling,
      parentNode,
      remove,
      insert,
      createComment
    }
  } = rendererInternals;

  const hydrate = (vnode, container) => {
    hasMismatch = false;
    hydrateNode(container.firstChild, vnode, null, null);
    flushPostFlushCbs();

    if (hasMismatch && !false) {
      // this error should show up in production
      console.error(`Hydration completed but contains mismatches.`);
    }
  };

  const hydrateNode = (node, vnode, parentComponent, parentSuspense, optimized = false) => {
    const isFragmentStart = isComment(node) && node.data === '[';

    const onMismatch = () => handleMismtach(node, vnode, parentComponent, parentSuspense, isFragmentStart);

    const {
      type,
      shapeFlag
    } = vnode;
    const domType = node.nodeType;
    vnode.el = node;

    switch (type) {
      case Text:
        if (domType !== 3
        /* TEXT */
        ) {
            return onMismatch();
          }

        if (node.data !== vnode.children) {
          hasMismatch = true;
          node.data = vnode.children;
        }

        return nextSibling(node);

      case Comment:
        if (domType !== 8
        /* COMMENT */
        || isFragmentStart) {
          return onMismatch();
        }

        return nextSibling(node);

      case Static:
        if (domType !== 1
        /* ELEMENT */
        ) {
            return onMismatch();
          } // determine anchor, adopt content


        let cur = node; // if the static vnode has its content stripped during build,
        // adopt it from the server-rendered HTML.

        const needToAdoptContent = !vnode.children.length;

        for (let i = 0; i < vnode.staticCount; i++) {
          if (needToAdoptContent) vnode.children += cur.outerHTML;

          if (i === vnode.staticCount - 1) {
            vnode.anchor = cur;
          }

          cur = nextSibling(cur);
        }

        return cur;

      case Fragment:
        if (!isFragmentStart) {
          return onMismatch();
        }

        return hydrateFragment(node, vnode, parentComponent, parentSuspense, optimized);

      default:
        if (shapeFlag & 1
        /* ELEMENT */
        ) {
            if (domType !== 1
            /* ELEMENT */
            || vnode.type !== node.tagName.toLowerCase()) {
              return onMismatch();
            }

            return hydrateElement(node, vnode, parentComponent, parentSuspense, optimized);
          } else if (shapeFlag & 6
        /* COMPONENT */
        ) {
            // when setting up the render effect, if the initial vnode already
            // has .el set, the component will perform hydration instead of mount
            // on its sub-tree.
            const container = parentNode(node);

            const hydrateComponent = () => {
              mountComponent(vnode, container, null, parentComponent, parentSuspense, isSVGContainer(container), optimized);
            }; // async component


            const loadAsync = vnode.type.__asyncLoader;

            if (loadAsync) {
              loadAsync().then(hydrateComponent);
            } else {
              hydrateComponent();
            } // component may be async, so in the case of fragments we cannot rely
            // on component's rendered output to determine the end of the fragment
            // instead, we do a lookahead to find the end anchor node.


            return isFragmentStart ? locateClosingAsyncAnchor(node) : nextSibling(node);
          } else if (shapeFlag & 64
        /* TELEPORT */
        ) {
            if (domType !== 8
            /* COMMENT */
            ) {
                return onMismatch();
              }

            return vnode.type.hydrate(node, vnode, parentComponent, parentSuspense, optimized, rendererInternals, hydrateChildren);
          } else if (shapeFlag & 128
        /* SUSPENSE */
        ) {
            return vnode.type.hydrate(node, vnode, parentComponent, parentSuspense, isSVGContainer(parentNode(node)), optimized, rendererInternals, hydrateNode);
          }

        return null;
    }
  };

  const hydrateElement = (el, vnode, parentComponent, parentSuspense, optimized) => {
    optimized = optimized || !!vnode.dynamicChildren;
    const {
      props,
      patchFlag,
      shapeFlag,
      dirs
    } = vnode; // skip props & children if this is hoisted static nodes

    if (patchFlag !== -1
    /* HOISTED */
    ) {
        // props
        if (props) {
          if (!optimized || patchFlag & 16
          /* FULL_PROPS */
          || patchFlag & 32
          /* HYDRATE_EVENTS */
          ) {
            for (const key in props) {
              if (!isReservedProp(key) && isOn(key)) {
                patchProp(el, key, null, props[key]);
              }
            }
          } else if (props.onClick) {
            // Fast path for click listeners (which is most often) to avoid
            // iterating through props.
            patchProp(el, 'onClick', null, props.onClick);
          }
        } // vnode / directive hooks


        let vnodeHooks;

        if (vnodeHooks = props && props.onVnodeBeforeMount) {
          invokeVNodeHook(vnodeHooks, parentComponent, vnode);
        }

        if (dirs) {
          invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
        }

        if ((vnodeHooks = props && props.onVnodeMounted) || dirs) {
          queueEffectWithSuspense(() => {
            vnodeHooks && invokeVNodeHook(vnodeHooks, parentComponent, vnode);
            dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
          }, parentSuspense);
        } // children


        if (shapeFlag & 16
        /* ARRAY_CHILDREN */
        && // skip if element has innerHTML / textContent
        !(props && (props.innerHTML || props.textContent))) {
          let next = hydrateChildren(el.firstChild, vnode, el, parentComponent, parentSuspense, optimized);

          while (next) {
            hasMismatch = true; // The SSRed DOM contains more nodes than it should. Remove them.

            const cur = next;
            next = next.nextSibling;
            remove(cur);
          }
        } else if (shapeFlag & 8
        /* TEXT_CHILDREN */
        ) {
            if (el.textContent !== vnode.children) {
              hasMismatch = true;
              el.textContent = vnode.children;
            }
          }
      }

    return el.nextSibling;
  };

  const hydrateChildren = (node, vnode, container, parentComponent, parentSuspense, optimized) => {
    optimized = optimized || !!vnode.dynamicChildren;
    const children = vnode.children;
    const l = children.length;

    for (let i = 0; i < l; i++) {
      const _vnode = optimized ? children[i] : children[i] = normalizeVNode(children[i]);

      if (node) {
        node = hydrateNode(node, _vnode, parentComponent, parentSuspense, optimized);
      } else {
        hasMismatch = true; // the SSRed DOM didn't contain enough nodes. Mount the missing ones.

        patch(null, _vnode, container, null, parentComponent, parentSuspense, isSVGContainer(container));
      }
    }

    return node;
  };

  const hydrateFragment = (node, vnode, parentComponent, parentSuspense, optimized) => {
    const container = parentNode(node);
    const next = hydrateChildren(nextSibling(node), vnode, container, parentComponent, parentSuspense, optimized);

    if (next && isComment(next) && next.data === ']') {
      return nextSibling(vnode.anchor = next);
    } else {
      // fragment didn't hydrate successfully, since we didn't get a end anchor
      // back. This should have led to node/children mismatch warnings.
      hasMismatch = true; // since the anchor is missing, we need to create one and insert it

      insert(vnode.anchor = createComment(`]`), container, next);
      return next;
    }
  };

  const handleMismtach = (node, vnode, parentComponent, parentSuspense, isFragment) => {
    hasMismatch = true;
    vnode.el = null;

    if (isFragment) {
      // remove excessive fragment nodes
      const end = locateClosingAsyncAnchor(node);

      while (true) {
        const _next = nextSibling(node);

        if (_next && _next !== end) {
          remove(_next);
        } else {
          break;
        }
      }
    }

    const next = nextSibling(node);
    const container = parentNode(node);
    remove(node);
    patch(null, vnode, container, next, parentComponent, parentSuspense, isSVGContainer(container));
    return next;
  };

  const locateClosingAsyncAnchor = node => {
    let match = 0;

    while (node) {
      node = nextSibling(node);

      if (node && isComment(node)) {
        if (node.data === '[') match++;

        if (node.data === ']') {
          if (match === 0) {
            return nextSibling(node);
          } else {
            match--;
          }
        }
      }
    }

    return node;
  };

  return [hydrate, hydrateNode];
}

const prodEffectOptions = {
  scheduler: queueJob
};
const queuePostRenderEffect = queueEffectWithSuspense;
/**
 * The createRenderer function accepts two generic arguments:
 * HostNode and HostElement, corresponding to Node and Element types in the
 * host environment. For example, for runtime-dom, HostNode would be the DOM
 * `Node` interface and HostElement would be the DOM `Element` interface.
 *
 * Custom renderers can pass in the platform specific types like this:
 *
 * ``` js
 * const { render, createApp } = createRenderer<Node, Element>({
 *   patchProp,
 *   ...nodeOps
 * })
 * ```
 */

function createRenderer(options) {
  return baseCreateRenderer(options);
} // Separate API for creating hydration-enabled renderer.
// Hydration logic is only used when calling this function, making it
// tree-shakable.


function createHydrationRenderer(options) {
  return baseCreateRenderer(options, createHydrationFunctions);
} // implementation


function baseCreateRenderer(options, createHydrationFns) {
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    cloneNode: hostCloneNode,
    insertStaticContent: hostInsertStaticContent
  } = options; // Note: functions inside this closure should use `const xxx = () => {}`
  // style in order to prevent being inlined by minifiers.

  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, isSVG = false, optimized = false) => {
    // patching & not same type, unmount old tree
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }

    if (n2.patchFlag === -2
    /* BAIL */
    ) {
        optimized = false;
        n2.dynamicChildren = null;
      }

    const {
      type,
      ref,
      shapeFlag
    } = n2;

    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;

      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;

      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, isSVG);
        }

        break;

      case Fragment:
        processFragment(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
        break;

      default:
        if (shapeFlag & 1
        /* ELEMENT */
        ) {
            processElement(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
          } else if (shapeFlag & 6
        /* COMPONENT */
        ) {
            processComponent(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
          } else if (shapeFlag & 64
        /* TELEPORT */
        ) {
            type.process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, internals);
          } else if (shapeFlag & 128
        /* SUSPENSE */
        ) {
            type.process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, internals);
          }

    } // set ref


    if (ref != null && parentComponent) {
      const refValue = shapeFlag & 4
      /* STATEFUL_COMPONENT */
      ? n2.component.proxy : n2.el;
      setRef(ref, n1 && n1.ref, parentComponent, refValue);
    }
  };

  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(n2.el = hostCreateText(n2.children), container, anchor);
    } else {
      const el = n2.el = n1.el;

      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };

  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(n2.el = hostCreateComment(n2.children || ''), container, anchor);
    } else {
      // there's no support for dynamic comments
      n2.el = n1.el;
    }
  };

  const mountStaticNode = (n2, container, anchor, isSVG) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, isSVG);
  };

  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
    isSVG = isSVG || n2.type === 'svg';

    if (n1 == null) {
      mountElement(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
    } else {
      patchElement(n1, n2, parentComponent, parentSuspense, isSVG, optimized);
    }
  };

  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
    let el;
    let vnodeHook;
    const {
      type,
      props,
      shapeFlag,
      transition,
      scopeId,
      patchFlag,
      dirs
    } = vnode;

    if (vnode.el && hostCloneNode !== undefined && patchFlag === -1
    /* HOISTED */
    ) {
        // If a vnode has non-null el, it means it's being reused.
        // Only static vnodes can be reused, so its mounted DOM nodes should be
        // exactly the same, and we can simply do a clone here.
        el = vnode.el = hostCloneNode(vnode.el);
      } else {
      el = vnode.el = hostCreateElement(vnode.type, isSVG, props && props.is); // props

      if (props) {
        for (const key in props) {
          if (!isReservedProp(key)) {
            hostPatchProp(el, key, null, props[key], isSVG);
          }
        }

        if (vnodeHook = props.onVnodeBeforeMount) {
          invokeVNodeHook(vnodeHook, parentComponent, vnode);
        }
      }

      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
      } // scopeId


      if (scopeId) {
        hostSetScopeId(el, scopeId);
      }

      const treeOwnerId = parentComponent && parentComponent.type.__scopeId; // vnode's own scopeId and the current patched component's scopeId is
      // different - this is a slot content node.

      if (treeOwnerId && treeOwnerId !== scopeId) {
        hostSetScopeId(el, treeOwnerId + '-s');
      } // children


      if (shapeFlag & 8
      /* TEXT_CHILDREN */
      ) {
          hostSetElementText(el, vnode.children);
        } else if (shapeFlag & 16
      /* ARRAY_CHILDREN */
      ) {
          mountChildren(vnode.children, el, null, parentComponent, parentSuspense, isSVG && type !== 'foreignObject', optimized || !!vnode.dynamicChildren);
        }

      if (transition && !transition.persisted) {
        transition.beforeEnter(el);
      }
    }

    hostInsert(el, container, anchor);

    if ((vnodeHook = props && props.onVnodeMounted) || transition && !transition.persisted || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        transition && !transition.persisted && transition.enter(el);
        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
      }, parentSuspense);
    }
  };

  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, isSVG, optimized, start = 0) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(null, child, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
    }
  };

  const patchElement = (n1, n2, parentComponent, parentSuspense, isSVG, optimized) => {
    const el = n2.el = n1.el;
    let {
      patchFlag,
      dynamicChildren,
      dirs
    } = n2;
    const oldProps = n1 && n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;

    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }

    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate');
    }

    if (patchFlag > 0) {
      // the presence of a patchFlag means this element's render code was
      // generated by the compiler and can take the fast path.
      // in this path old node and new node are guaranteed to have the same shape
      // (i.e. at the exact same position in the source template)
      if (patchFlag & 16
      /* FULL_PROPS */
      ) {
          // element props contain dynamic keys, full diff needed
          patchProps(el, n2, oldProps, newProps, parentComponent, parentSuspense, isSVG);
        } else {
        // class
        // this flag is matched when the element has dynamic class bindings.
        if (patchFlag & 2
        /* CLASS */
        ) {
            if (oldProps.class !== newProps.class) {
              hostPatchProp(el, 'class', null, newProps.class, isSVG);
            }
          } // style
        // this flag is matched when the element has dynamic style bindings


        if (patchFlag & 4
        /* STYLE */
        ) {
            hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG);
          } // props
        // This flag is matched when the element has dynamic prop/attr bindings
        // other than class and style. The keys of dynamic prop/attrs are saved for
        // faster iteration.
        // Note dynamic keys like :[foo]="bar" will cause this optimization to
        // bail out and go through a full diff because we need to unset the old key


        if (patchFlag & 8
        /* PROPS */
        ) {
            // if the flag is present then dynamicProps must be non-null
            const propsToUpdate = n2.dynamicProps;

            for (let i = 0; i < propsToUpdate.length; i++) {
              const key = propsToUpdate[i];
              const prev = oldProps[key];
              const next = newProps[key];

              if (prev !== next) {
                hostPatchProp(el, key, prev, next, isSVG, n1.children, parentComponent, parentSuspense, unmountChildren);
              }
            }
          }
      } // text
      // This flag is matched when the element has only dynamic text children.


      if (patchFlag & 1
      /* TEXT */
      ) {
          if (n1.children !== n2.children) {
            hostSetElementText(el, n2.children);
          }
        }
    } else if (!optimized && dynamicChildren == null) {
      // unoptimized, full diff
      patchProps(el, n2, oldProps, newProps, parentComponent, parentSuspense, isSVG);
    }

    const areChildrenSVG = isSVG && n2.type !== 'foreignObject';

    if (dynamicChildren) {
      patchBlockChildren(n1.dynamicChildren, dynamicChildren, el, parentComponent, parentSuspense, areChildrenSVG);
    } else if (!optimized) {
      // full diff
      patchChildren(n1, n2, el, null, parentComponent, parentSuspense, areChildrenSVG);
    }

    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated');
      }, parentSuspense);
    }
  }; // The fast path for blocks.


  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, isSVG) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i]; // Determine the container (parent element) for the patch.

      const container = // - In the case of a Fragment, we need to provide the actual parent
      // of the Fragment itself so it can move its children.
      oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
      // which also requires the correct parent container
      !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
      oldVNode.shapeFlag & 6
      /* COMPONENT */
      ? hostParentNode(oldVNode.el) : // In other cases, the parent container is not actually used so we
      // just pass the block element here to avoid a DOM parentNode call.
      fallbackContainer;
      patch(oldVNode, newVNode, container, null, parentComponent, parentSuspense, isSVG, true);
    }
  };

  const patchProps = (el, vnode, oldProps, newProps, parentComponent, parentSuspense, isSVG) => {
    if (oldProps !== newProps) {
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];

        if (next !== prev) {
          hostPatchProp(el, key, prev, next, isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
        }
      }

      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(el, key, oldProps[key], null, isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
          }
        }
      }
    }
  };

  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText('');
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText('');
    let {
      patchFlag,
      dynamicChildren
    } = n2;

    if (patchFlag > 0) {
      optimized = true;
    }

    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor); // a fragment can only have array children
      // since they are either generated by the compiler, or implicitly created
      // from arrays.

      mountChildren(n2.children, container, fragmentEndAnchor, parentComponent, parentSuspense, isSVG, optimized);
    } else {
      if (patchFlag > 0 && patchFlag & 64
      /* STABLE_FRAGMENT */
      && dynamicChildren) {
        // a stable fragment (template root or <template v-for>) doesn't need to
        // patch children order, but it may contain dynamicChildren.
        patchBlockChildren(n1.dynamicChildren, dynamicChildren, container, parentComponent, parentSuspense, isSVG);
      } else {
        // keyed / unkeyed, or manual fragments.
        // for keyed & unkeyed, since they are compiler generated from v-for,
        // each child is guaranteed to be a block so the fragment will never
        // have dynamicChildren.
        patchChildren(n1, n2, container, fragmentEndAnchor, parentComponent, parentSuspense, isSVG, optimized);
      }
    }
  };

  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
    if (n1 == null) {
      if (n2.shapeFlag & 512
      /* COMPONENT_KEPT_ALIVE */
      ) {
          parentComponent.ctx.activate(n2, container, anchor, isSVG, optimized);
        } else {
        mountComponent(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
      }
    } else {
      updateComponent(n1, n2, parentComponent, optimized);
    }
  };

  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
    const instance = initialVNode.component = createComponentInstance(initialVNode, parentComponent, parentSuspense); // inject renderer internals for keepAlive

    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }

    setupComponent(instance); // setup() is async. This component relies on async logic to be resolved
    // before proceeding

    if (instance.asyncDep) {
      if (!parentSuspense) {
        return;
      }

      parentSuspense.registerDep(instance, setupRenderEffect); // Give it a placeholder if this is not hydration

      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
      }

      return;
    }

    setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, isSVG, optimized);
  };

  const updateComponent = (n1, n2, parentComponent, optimized) => {
    const instance = n2.component = n1.component;

    if (shouldUpdateComponent(n1, n2, parentComponent, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        // normal update
        instance.next = n2; // in case the child component is also queued, remove it to avoid
        // double updating the same child component in the same flush.

        invalidateJob(instance.update); // instance.update is the reactive effect runner.

        instance.update();
      }
    } else {
      // no update needed. just copy over properties
      n2.component = n1.component;
      n2.el = n1.el;
    }
  };

  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, isSVG, optimized) => {
    // create reactive effect for rendering
    instance.update = effect(function componentEffect() {
      if (!instance.isMounted) {
        let vnodeHook;
        const {
          el,
          props
        } = initialVNode;
        const {
          bm,
          m,
          a,
          parent
        } = instance;
        const subTree = instance.subTree = renderComponentRoot(instance); // beforeMount hook

        if (bm) {
          invokeArrayFns(bm);
        } // onVnodeBeforeMount


        if (vnodeHook = props && props.onVnodeBeforeMount) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }

        if (el && hydrateNode) {
          // vnode has adopted host node - perform hydration instead of mount.
          hydrateNode(initialVNode.el, subTree, instance, parentSuspense);
        } else {
          patch(null, subTree, container, anchor, instance, parentSuspense, isSVG);
          initialVNode.el = subTree.el;
        } // mounted hook


        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        } // onVnodeMounted


        if (vnodeHook = props && props.onVnodeMounted) {
          queuePostRenderEffect(() => {
            invokeVNodeHook(vnodeHook, parent, initialVNode);
          }, parentSuspense);
        } // activated hook for keep-alive roots.


        if (a && initialVNode.shapeFlag & 256
        /* COMPONENT_SHOULD_KEEP_ALIVE */
        ) {
            queuePostRenderEffect(a, parentSuspense);
          }

        instance.isMounted = true;
      } else {
        // updateComponent
        // This is triggered by mutation of component's own state (next: null)
        // OR parent calling processComponent (next: VNode)
        let {
          next,
          bu,
          u,
          parent,
          vnode
        } = instance;
        let vnodeHook;

        if (next) {
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }

        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        next.el = vnode.el; // beforeUpdate hook

        if (bu) {
          invokeArrayFns(bu);
        } // onVnodeBeforeUpdate


        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        } // reset refs
        // only needed if previous patch had refs


        if (instance.refs !== EMPTY_OBJ) {
          instance.refs = {};
        }

        patch(prevTree, nextTree, // parent may have changed if it's in a teleport
        hostParentNode(prevTree.el), // anchor may have changed if it's in a fragment
        getNextHostNode(prevTree), instance, parentSuspense, isSVG);
        next.el = nextTree.el;

        if (next === null) {
          // self-triggered update. In case of HOC, update parent component
          // vnode el. HOC is indicated by parent instance's subTree pointing
          // to child component's vnode
          updateHOCHostEl(instance, nextTree.el);
        } // updated hook


        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        } // onVnodeUpdated


        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(() => {
            invokeVNodeHook(vnodeHook, parent, next, vnode);
          }, parentSuspense);
        }
      }
    }, prodEffectOptions);
  };

  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children);
  };

  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const {
      patchFlag,
      shapeFlag
    } = n2; // fast path

    if (patchFlag > 0) {
      if (patchFlag & 128
      /* KEYED_FRAGMENT */
      ) {
          // this could be either fully-keyed or mixed (some keyed some not)
          // presence of patchFlag means children are guaranteed to be arrays
          patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
          return;
        } else if (patchFlag & 256
      /* UNKEYED_FRAGMENT */
      ) {
          // unkeyed
          patchUnkeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
          return;
        }
    } // children has 3 possibilities: text, array or no children.


    if (shapeFlag & 8
    /* TEXT_CHILDREN */
    ) {
        // text children fast path
        if (prevShapeFlag & 16
        /* ARRAY_CHILDREN */
        ) {
            unmountChildren(c1, parentComponent, parentSuspense);
          }

        if (c2 !== c1) {
          hostSetElementText(container, c2);
        }
      } else {
      if (prevShapeFlag & 16
      /* ARRAY_CHILDREN */
      ) {
          // prev children was array
          if (shapeFlag & 16
          /* ARRAY_CHILDREN */
          ) {
              // two arrays, cannot assume anything, do full diff
              patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
            } else {
            // no new children, just unmount old
            unmountChildren(c1, parentComponent, parentSuspense, true);
          }
        } else {
        // prev children was text OR null
        // new children is array OR null
        if (prevShapeFlag & 8
        /* TEXT_CHILDREN */
        ) {
            hostSetElementText(container, '');
          } // mount new if array


        if (shapeFlag & 16
        /* ARRAY_CHILDREN */
        ) {
            mountChildren(c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
          }
      }
    }
  };

  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;

    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(c1[i], nextChild, container, null, parentComponent, parentSuspense, isSVG, optimized);
    }

    if (oldLength > newLength) {
      // remove old
      unmountChildren(c1, parentComponent, parentSuspense, true, commonLength);
    } else {
      // mount new
      mountChildren(c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, commonLength);
    }
  }; // can be all-keyed or mixed


  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, isSVG, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1; // prev ending index

    let e2 = l2 - 1; // next ending index
    // 1. sync from start
    // (a b) c
    // (a b) d e

    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);

      if (isSameVNodeType(n1, n2)) {
        patch(n1, n2, container, null, parentComponent, parentSuspense, isSVG, optimized);
      } else {
        break;
      }

      i++;
    } // 2. sync from end
    // a (b c)
    // d e (b c)


    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);

      if (isSameVNodeType(n1, n2)) {
        patch(n1, n2, container, null, parentComponent, parentSuspense, isSVG, optimized);
      } else {
        break;
      }

      e1--;
      e2--;
    } // 3. common sequence + mount
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0


    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;

        while (i <= e2) {
          patch(null, c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]), container, anchor, parentComponent, parentSuspense, isSVG);
          i++;
        }
      }
    } // 4. common sequence + unmount
    // (a b) c
    // (a b)
    // i = 2, e1 = 2, e2 = 1
    // a (b c)
    // (b c)
    // i = 0, e1 = 0, e2 = -1
    else if (i > e2) {
        while (i <= e1) {
          unmount(c1[i], parentComponent, parentSuspense, true);
          i++;
        }
      } // 5. unknown sequence
      // [i ... e1 + 1]: a b [c d e] f g
      // [i ... e2 + 1]: a b [e d c h] f g
      // i = 2, e1 = 4, e2 = 5
      else {
          const s1 = i; // prev starting index

          const s2 = i; // next starting index
          // 5.1 build key:index map for newChildren

          const keyToNewIndexMap = new Map();

          for (i = s2; i <= e2; i++) {
            const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);

            if (nextChild.key != null) {
              keyToNewIndexMap.set(nextChild.key, i);
            }
          } // 5.2 loop through old children left to be patched and try to patch
          // matching nodes & remove nodes that are no longer present


          let j;
          let patched = 0;
          const toBePatched = e2 - s2 + 1;
          let moved = false; // used to track whether any node has moved

          let maxNewIndexSoFar = 0; // works as Map<newIndex, oldIndex>
          // Note that oldIndex is offset by +1
          // and oldIndex = 0 is a special value indicating the new node has
          // no corresponding old node.
          // used for determining longest stable subsequence

          const newIndexToOldIndexMap = new Array(toBePatched);

          for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;

          for (i = s1; i <= e1; i++) {
            const prevChild = c1[i];

            if (patched >= toBePatched) {
              // all new children have been patched so this can only be a removal
              unmount(prevChild, parentComponent, parentSuspense, true);
              continue;
            }

            let newIndex;

            if (prevChild.key != null) {
              newIndex = keyToNewIndexMap.get(prevChild.key);
            } else {
              // key-less node, try to locate a key-less node of the same type
              for (j = s2; j <= e2; j++) {
                if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
                  newIndex = j;
                  break;
                }
              }
            }

            if (newIndex === undefined) {
              unmount(prevChild, parentComponent, parentSuspense, true);
            } else {
              newIndexToOldIndexMap[newIndex - s2] = i + 1;

              if (newIndex >= maxNewIndexSoFar) {
                maxNewIndexSoFar = newIndex;
              } else {
                moved = true;
              }

              patch(prevChild, c2[newIndex], container, null, parentComponent, parentSuspense, isSVG, optimized);
              patched++;
            }
          } // 5.3 move and mount
          // generate longest stable subsequence only when nodes have moved


          const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
          j = increasingNewIndexSequence.length - 1; // looping backwards so that we can use last patched node as anchor

          for (i = toBePatched - 1; i >= 0; i--) {
            const nextIndex = s2 + i;
            const nextChild = c2[nextIndex];
            const anchor = nextIndex + 1 < l2 ? c2[nextIndex + 1].el : parentAnchor;

            if (newIndexToOldIndexMap[i] === 0) {
              // mount new
              patch(null, nextChild, container, anchor, parentComponent, parentSuspense, isSVG);
            } else if (moved) {
              // move if:
              // There is no stable subsequence (e.g. a reverse)
              // OR current node is not among the stable sequence
              if (j < 0 || i !== increasingNewIndexSequence[j]) {
                move(nextChild, container, anchor, 2
                /* REORDER */
                );
              } else {
                j--;
              }
            }
          }
        }
  };

  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const {
      el,
      type,
      transition,
      children,
      shapeFlag
    } = vnode;

    if (shapeFlag & 6
    /* COMPONENT */
    ) {
        move(vnode.component.subTree, container, anchor, moveType);
        return;
      }

    if (shapeFlag & 128
    /* SUSPENSE */
    ) {
        vnode.suspense.move(container, anchor, moveType);
        return;
      }

    if (shapeFlag & 64
    /* TELEPORT */
    ) {
        type.move(vnode, container, anchor, internals);
        return;
      }

    if (type === Fragment) {
      hostInsert(el, container, anchor);

      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }

      hostInsert(vnode.anchor, container, anchor);
      return;
    } // single nodes


    const needTransition = moveType !== 2
    /* REORDER */
    && shapeFlag & 1
    /* ELEMENT */
    && transition;

    if (needTransition) {
      if (moveType === 0
      /* ENTER */
      ) {
          transition.beforeEnter(el);
          hostInsert(el, container, anchor);
          queuePostRenderEffect(() => transition.enter(el), parentSuspense);
        } else {
        const {
          leave,
          delayLeave,
          afterLeave
        } = transition;

        const remove = () => hostInsert(el, container, anchor);

        const performLeave = () => {
          leave(el, () => {
            remove();
            afterLeave && afterLeave();
          });
        };

        if (delayLeave) {
          delayLeave(el, remove, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };

  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false) => {
    const {
      type,
      props,
      ref,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs
    } = vnode;
    const shouldInvokeDirs = shapeFlag & 1
    /* ELEMENT */
    && dirs;
    const shouldKeepAlive = shapeFlag & 256
    /* COMPONENT_SHOULD_KEEP_ALIVE */
    ;
    let vnodeHook; // unset ref

    if (ref != null && parentComponent) {
      setRef(ref, null, parentComponent, null);
    }

    if ((vnodeHook = props && props.onVnodeBeforeUnmount) && !shouldKeepAlive) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }

    if (shapeFlag & 6
    /* COMPONENT */
    ) {
        if (shouldKeepAlive) {
          parentComponent.ctx.deactivate(vnode);
        } else {
          unmountComponent(vnode.component, parentSuspense, doRemove);
        }
      } else {
      if (shapeFlag & 128
      /* SUSPENSE */
      ) {
          vnode.suspense.unmount(parentSuspense, doRemove);
          return;
        }

      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeUnmount');
      }

      if (dynamicChildren && ( // #1153: fast path should not be taken for non-stable (v-for) fragments
      type !== Fragment || patchFlag > 0 && patchFlag & 64
      /* STABLE_FRAGMENT */
      )) {
        // fast path for block nodes: only need to unmount dynamic children.
        unmountChildren(dynamicChildren, parentComponent, parentSuspense);
      } else if (shapeFlag & 16
      /* ARRAY_CHILDREN */
      ) {
          unmountChildren(children, parentComponent, parentSuspense);
        } // an unmounted teleport should always remove its children


      if (shapeFlag & 64
      /* TELEPORT */
      ) {
          vnode.type.remove(vnode, internals);
        }

      if (doRemove) {
        remove(vnode);
      }
    }

    if (((vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs) && !shouldKeepAlive) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, 'unmounted');
      }, parentSuspense);
    }
  };

  const remove = vnode => {
    const {
      type,
      el,
      anchor,
      transition
    } = vnode;

    if (type === Fragment) {
      removeFragment(el, anchor);
      return;
    }

    const performRemove = () => {
      hostRemove(el);

      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };

    if (vnode.shapeFlag & 1
    /* ELEMENT */
    && transition && !transition.persisted) {
      const {
        leave,
        delayLeave
      } = transition;

      const performLeave = () => leave(el, performRemove);

      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };

  const removeFragment = (cur, end) => {
    // For fragments, directly remove all contained DOM nodes.
    // (fragment child nodes cannot have transition)
    let next;

    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }

    hostRemove(end);
  };

  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const {
      bum,
      effects,
      update,
      subTree,
      um,
      da,
      isDeactivated
    } = instance; // beforeUnmount hook

    if (bum) {
      invokeArrayFns(bum);
    }

    if (effects) {
      for (let i = 0; i < effects.length; i++) {
        stop(effects[i]);
      }
    } // update may be null if a component is unmounted before its async
    // setup has resolved.


    if (update) {
      stop(update);
      unmount(subTree, instance, parentSuspense, doRemove);
    } // unmounted hook


    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    } // deactivated hook


    if (da && !isDeactivated && instance.vnode.shapeFlag & 256
    /* COMPONENT_SHOULD_KEEP_ALIVE */
    ) {
        queuePostRenderEffect(da, parentSuspense);
      }

    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense); // A component with async dep inside a pending suspense is unmounted before
    // its async dep resolves. This should remove the dep from the suspense, and
    // cause the suspense to resolve immediately if that was the last dep.

    if (parentSuspense && !parentSuspense.isResolved && !parentSuspense.isUnmounted && instance.asyncDep && !instance.asyncResolved) {
      parentSuspense.deps--;

      if (parentSuspense.deps === 0) {
        parentSuspense.resolve();
      }
    }
  };

  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove);
    }
  };

  const getNextHostNode = vnode => {
    if (vnode.shapeFlag & 6
    /* COMPONENT */
    ) {
        return getNextHostNode(vnode.component.subTree);
      }

    if (vnode.shapeFlag & 128
    /* SUSPENSE */
    ) {
        return vnode.suspense.next();
      }

    return hostNextSibling(vnode.anchor || vnode.el);
  };

  const setRef = (rawRef, oldRawRef, parent, value) => {
    const [owner, ref] = rawRef;
    const oldRef = oldRawRef && oldRawRef[1];
    const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
    const setupState = owner.setupState; // unset old ref

    if (oldRef != null && oldRef !== ref) {
      if (isString(oldRef)) {
        refs[oldRef] = null;

        if (hasOwn(setupState, oldRef)) {
          setupState[oldRef] = null;
        }
      } else if (isRef(oldRef)) {
        oldRef.value = null;
      }
    }

    if (isString(ref)) {
      refs[ref] = value;

      if (hasOwn(setupState, ref)) {
        setupState[ref] = value;
      }
    } else if (isRef(ref)) {
      ref.value = value;
    } else if (isFunction(ref)) {
      callWithErrorHandling(ref, parent, 12
      /* FUNCTION_REF */
      , [value, refs]);
    }
  };

  const render = (vnode, container) => {
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
      }
    } else {
      patch(container._vnode || null, vnode, container);
    }

    flushPostFlushCbs();
    container._vnode = vnode;
  };

  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  let hydrateNode;

  if (createHydrationFns) {
    [hydrate, hydrateNode] = createHydrationFns(internals);
  }

  return {
    render,
    hydrate,
    createApp: createAppAPI(render, hydrate)
  };
}

function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7
  /* VNODE_HOOK */
  , [vnode, prevVNode]);
} // https://en.wikipedia.org/wiki/Longest_increasing_subsequence


function getSequence(arr) {
  const p = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;

  for (i = 0; i < len; i++) {
    const arrI = arr[i];

    if (arrI !== 0) {
      j = result[result.length - 1];

      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }

      u = 0;
      v = result.length - 1;

      while (u < v) {
        c = (u + v) / 2 | 0;

        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }

      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }

        result[u] = i;
      }
    }
  }

  u = result.length;
  v = result[u - 1];

  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  return result;
}

function useTransitionState() {
  const state = {
    isMounted: false,
    isLeaving: false,
    isUnmounting: false,
    leavingVNodes: new Map()
  };
  onMounted(() => {
    state.isMounted = true;
  });
  onBeforeUnmount(() => {
    state.isUnmounting = true;
  });
  return state;
}

const BaseTransitionImpl = {
  name: `BaseTransition`,
  props: {
    mode: String,
    appear: Boolean,
    persisted: Boolean,
    // enter
    onBeforeEnter: Function,
    onEnter: Function,
    onAfterEnter: Function,
    onEnterCancelled: Function,
    // leave
    onBeforeLeave: Function,
    onLeave: Function,
    onAfterLeave: Function,
    onLeaveCancelled: Function
  },

  setup(props, {
    slots
  }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    return () => {
      const children = slots.default && slots.default();

      if (!children || !children.length) {
        return;
      } // there's no need to track reactivity for these props so use the raw
      // props for a bit better perf


      const rawProps = toRaw(props);
      const {
        mode
      } = rawProps; // at this point children has a guaranteed length of 1.

      const child = children[0];

      if (state.isLeaving) {
        return emptyPlaceholder(child);
      } // in the case of <transition><keep-alive/></transition>, we need to
      // compare the type of the kept-alive children.


      const innerChild = getKeepAliveChild(child);

      if (!innerChild) {
        return emptyPlaceholder(child);
      }

      const enterHooks = innerChild.transition = resolveTransitionHooks(innerChild, rawProps, state, instance);
      const oldChild = instance.subTree;
      const oldInnerChild = oldChild && getKeepAliveChild(oldChild); // handle mode

      if (oldInnerChild && oldInnerChild.type !== Comment && !isSameVNodeType(innerChild, oldInnerChild)) {
        const prevHooks = oldInnerChild.transition;
        const leavingHooks = resolveTransitionHooks(oldInnerChild, rawProps, state, instance); // update old tree's hooks in case of dynamic transition

        setTransitionHooks(oldInnerChild, leavingHooks); // switching between different views

        if (mode === 'out-in') {
          state.isLeaving = true; // return placeholder node and queue update when leave finishes

          leavingHooks.afterLeave = () => {
            state.isLeaving = false;
            instance.update();
          };

          return emptyPlaceholder(child);
        } else if (mode === 'in-out') {
          delete prevHooks.delayedLeave;

          leavingHooks.delayLeave = (el, earlyRemove, delayedLeave) => {
            const leavingVNodesCache = getLeavingNodesForType(state, oldInnerChild);
            leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild; // early removal callback

            el._leaveCb = () => {
              earlyRemove();
              el._leaveCb = undefined;
              delete enterHooks.delayedLeave;
            };

            enterHooks.delayedLeave = delayedLeave;
          };
        }
      }

      return child;
    };
  }

}; // export the public type for h/tsx inference
// also to avoid inline import() in generated d.ts files

const BaseTransition = BaseTransitionImpl;

function getLeavingNodesForType(state, vnode) {
  const {
    leavingVNodes
  } = state;
  let leavingVNodesCache = leavingVNodes.get(vnode.type);

  if (!leavingVNodesCache) {
    leavingVNodesCache = Object.create(null);
    leavingVNodes.set(vnode.type, leavingVNodesCache);
  }

  return leavingVNodesCache;
} // The transition hooks are attached to the vnode as vnode.transition
// and will be called at appropriate timing in the renderer.


function resolveTransitionHooks(vnode, {
  appear,
  persisted = false,
  onBeforeEnter,
  onEnter,
  onAfterEnter,
  onEnterCancelled,
  onBeforeLeave,
  onLeave,
  onAfterLeave,
  onLeaveCancelled
}, state, instance) {
  const key = String(vnode.key);
  const leavingVNodesCache = getLeavingNodesForType(state, vnode);

  const callHook = (hook, args) => {
    hook && callWithAsyncErrorHandling(hook, instance, 9
    /* TRANSITION_HOOK */
    , args);
  };

  const hooks = {
    persisted,

    beforeEnter(el) {
      if (!appear && !state.isMounted) {
        return;
      } // for same element (v-show)


      if (el._leaveCb) {
        el._leaveCb(true
        /* cancelled */
        );
      } // for toggled element with same key (v-if)


      const leavingVNode = leavingVNodesCache[key];

      if (leavingVNode && isSameVNodeType(vnode, leavingVNode) && leavingVNode.el._leaveCb) {
        // force early removal (not cancelled)
        leavingVNode.el._leaveCb();
      }

      callHook(onBeforeEnter, [el]);
    },

    enter(el) {
      if (!appear && !state.isMounted) {
        return;
      }

      let called = false;

      const afterEnter = el._enterCb = cancelled => {
        if (called) return;
        called = true;

        if (cancelled) {
          callHook(onEnterCancelled, [el]);
        } else {
          callHook(onAfterEnter, [el]);
        }

        if (hooks.delayedLeave) {
          hooks.delayedLeave();
        }

        el._enterCb = undefined;
      };

      if (onEnter) {
        onEnter(el, afterEnter);
      } else {
        afterEnter();
      }
    },

    leave(el, remove) {
      const key = String(vnode.key);

      if (el._enterCb) {
        el._enterCb(true
        /* cancelled */
        );
      }

      if (state.isUnmounting) {
        return remove();
      }

      callHook(onBeforeLeave, [el]);
      let called = false;

      const afterLeave = el._leaveCb = cancelled => {
        if (called) return;
        called = true;
        remove();

        if (cancelled) {
          callHook(onLeaveCancelled, [el]);
        } else {
          callHook(onAfterLeave, [el]);
        }

        el._leaveCb = undefined;

        if (leavingVNodesCache[key] === vnode) {
          delete leavingVNodesCache[key];
        }
      };

      leavingVNodesCache[key] = vnode;

      if (onLeave) {
        onLeave(el, afterLeave);
      } else {
        afterLeave();
      }
    }

  };
  return hooks;
} // the placeholder really only handles one special case: KeepAlive
// in the case of a KeepAlive in a leave phase we need to return a KeepAlive
// placeholder with empty content to avoid the KeepAlive instance from being
// unmounted.


function emptyPlaceholder(vnode) {
  if (isKeepAlive(vnode)) {
    vnode = cloneVNode(vnode);
    vnode.children = null;
    return vnode;
  }
}

function getKeepAliveChild(vnode) {
  return isKeepAlive(vnode) ? vnode.children ? vnode.children[0] : undefined : vnode;
}

function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6
  /* COMPONENT */
  && vnode.component) {
    setTransitionHooks(vnode.component.subTree, hooks);
  } else {
    vnode.transition = hooks;
  }
}

const isKeepAlive = vnode => vnode.type.__isKeepAlive;

const KeepAliveImpl = {
  name: `KeepAlive`,
  // Marker for special handling inside the renderer. We are not using a ===
  // check directly on KeepAlive in the renderer, because importing it directly
  // would prevent it from being tree-shaken.
  __isKeepAlive: true,
  props: {
    include: [String, RegExp, Array],
    exclude: [String, RegExp, Array],
    max: [String, Number]
  },

  setup(props, {
    slots
  }) {
    const cache = new Map();
    const keys = new Set();
    let current = null;
    const instance = getCurrentInstance();
    const parentSuspense = instance.suspense; // KeepAlive communicates with the instantiated renderer via the
    // ctx where the renderer passes in its internals,
    // and the KeepAlive instance exposes activate/deactivate implementations.
    // The whole point of this is to avoid importing KeepAlive directly in the
    // renderer to facilitate tree-shaking.

    const sharedContext = instance.ctx;
    const {
      renderer: {
        p: patch,
        m: move,
        um: _unmount,
        o: {
          createElement
        }
      }
    } = sharedContext;
    const storageContainer = createElement('div');

    sharedContext.activate = (vnode, container, anchor, isSVG, optimized) => {
      const child = vnode.component;
      move(vnode, container, anchor, 0
      /* ENTER */
      , parentSuspense); // in case props have changed

      patch(child.vnode, vnode, container, anchor, instance, parentSuspense, isSVG, optimized);
      queuePostRenderEffect(() => {
        child.isDeactivated = false;

        if (child.a) {
          invokeArrayFns(child.a);
        }
      }, parentSuspense);
    };

    sharedContext.deactivate = vnode => {
      move(vnode, storageContainer, null, 1
      /* LEAVE */
      , parentSuspense);
      queuePostRenderEffect(() => {
        const component = vnode.component;

        if (component.da) {
          invokeArrayFns(component.da);
        }

        component.isDeactivated = true;
      }, parentSuspense);
    };

    function unmount(vnode) {
      // reset the shapeFlag so it can be properly unmounted
      vnode.shapeFlag = 4
      /* STATEFUL_COMPONENT */
      ;

      _unmount(vnode, instance, parentSuspense);
    }

    function pruneCache(filter) {
      cache.forEach((vnode, key) => {
        const name = getName(vnode.type);

        if (name && (!filter || !filter(name))) {
          pruneCacheEntry(key);
        }
      });
    }

    function pruneCacheEntry(key) {
      const cached = cache.get(key);

      if (!current || cached.type !== current.type) {
        unmount(cached);
      } else if (current) {
        // current active instance should no longer be kept-alive.
        // we can't unmount it now but it might be later, so reset its flag now.
        current.shapeFlag = 4
        /* STATEFUL_COMPONENT */
        ;
      }

      cache.delete(key);
      keys.delete(key);
    }

    watch(() => [props.include, props.exclude], ([include, exclude]) => {
      include && pruneCache(name => matches(include, name));
      exclude && pruneCache(name => matches(exclude, name));
    });
    onBeforeUnmount(() => {
      cache.forEach(unmount);
    });
    return () => {
      if (!slots.default) {
        return null;
      }

      const children = slots.default();
      let vnode = children[0];

      if (children.length > 1) {
        current = null;
        return children;
      } else if (!isVNode(vnode) || !(vnode.shapeFlag & 4
      /* STATEFUL_COMPONENT */
      )) {
        current = null;
        return vnode;
      }

      const comp = vnode.type;
      const name = getName(comp);
      const {
        include,
        exclude,
        max
      } = props;

      if (include && (!name || !matches(include, name)) || exclude && name && matches(exclude, name)) {
        return vnode;
      }

      const key = vnode.key == null ? comp : vnode.key;
      const cachedVNode = cache.get(key); // clone vnode if it's reused because we are going to mutate it

      if (vnode.el) {
        vnode = cloneVNode(vnode);
      }

      cache.set(key, vnode);

      if (cachedVNode) {
        // copy over mounted state
        vnode.el = cachedVNode.el;
        vnode.component = cachedVNode.component;

        if (vnode.transition) {
          // recursively update transition hooks on subTree
          setTransitionHooks(vnode, vnode.transition);
        } // avoid vnode being mounted as fresh


        vnode.shapeFlag |= 512
        /* COMPONENT_KEPT_ALIVE */
        ; // make this key the freshest

        keys.delete(key);
        keys.add(key);
      } else {
        keys.add(key); // prune oldest entry

        if (max && keys.size > parseInt(max, 10)) {
          pruneCacheEntry(Array.from(keys)[0]);
        }
      } // avoid vnode being unmounted


      vnode.shapeFlag |= 256
      /* COMPONENT_SHOULD_KEEP_ALIVE */
      ;
      current = vnode;
      return vnode;
    };
  }

}; // export the public type for h/tsx inference
// also to avoid inline import() in generated d.ts files

const KeepAlive = KeepAliveImpl;

function getName(comp) {
  return comp.displayName || comp.name;
}

function matches(pattern, name) {
  if (isArray(pattern)) {
    return pattern.some(p => matches(p, name));
  } else if (isString(pattern)) {
    return pattern.split(',').indexOf(name) > -1;
  } else if (pattern.test) {
    return pattern.test(name);
  }
  /* istanbul ignore next */


  return false;
}

function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a"
  /* ACTIVATED */
  , target);
}

function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da"
  /* DEACTIVATED */
  , target);
}

function registerKeepAliveHook(hook, type, target = currentInstance) {
  // cache the deactivate branch check wrapper for injected hooks so the same
  // hook can be properly deduped by the scheduler. "__wdc" stands for "with
  // deactivation check".
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    // only fire the hook if the target instance is NOT in a deactivated branch.
    let current = target;

    while (current) {
      if (current.isDeactivated) {
        return;
      }

      current = current.parent;
    }

    hook();
  });

  injectHook(type, wrappedHook, target); // In addition to registering it on the target instance, we walk up the parent
  // chain and register it on all ancestor instances that are keep-alive roots.
  // This avoids the need to walk the entire component tree when invoking these
  // hooks, and more importantly, avoids the need to track child components in
  // arrays.

  if (target) {
    let current = target.parent;

    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }

      current = current.parent;
    }
  }
}

function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  injectHook(type, hook, keepAliveRoot, true
  /* prepend */
  );
  onUnmounted(() => {
    remove(keepAliveRoot[type], hook);
  }, target);
}

function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []); // cache the error handling wrapper for injected hooks so the same hook
    // can be properly deduped by the scheduler. "__weh" stands for "with error
    // handling".

    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      if (target.isUnmounted) {
        return;
      } // disable tracking inside all lifecycle hooks
      // since they can potentially be called inside effects.


      pauseTracking(); // Set currentInstance during hook invocation.
      // This assumes the hook does not synchronously trigger other hooks, which
      // can only be false when the user does something really funky.

      setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      setCurrentInstance(null);
      resetTracking();
      return res;
    });

    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
  }
}

const createHook = lifecycle => (hook, target = currentInstance) => // post-create lifecycle registrations are noops during SSR
!isInSSRComponentSetup && injectHook(lifecycle, hook, target);

const onBeforeMount = createHook("bm"
/* BEFORE_MOUNT */
);
const onMounted = createHook("m"
/* MOUNTED */
);
const onBeforeUpdate = createHook("bu"
/* BEFORE_UPDATE */
);
const onUpdated = createHook("u"
/* UPDATED */
);
const onBeforeUnmount = createHook("bum"
/* BEFORE_UNMOUNT */
);
const onUnmounted = createHook("um"
/* UNMOUNTED */
);
const onRenderTriggered = createHook("rtg"
/* RENDER_TRIGGERED */
);
const onRenderTracked = createHook("rtc"
/* RENDER_TRACKED */
);

const onErrorCaptured = (hook, target = currentInstance) => {
  injectHook("ec"
  /* ERROR_CAPTURED */
  , hook, target);
};

const invoke = fn => fn(); // Simple effect.


function watchEffect(effect, options) {
  return doWatch(effect, null, options);
} // initial value for watchers to trigger on undefined initial values


const INITIAL_WATCHER_VALUE = {}; // implementation

function watch(source, cb, options) {
  return doWatch(source, cb, options);
}

function doWatch(source, cb, {
  immediate,
  deep,
  flush,
  onTrack,
  onTrigger
} = EMPTY_OBJ) {
  const instance = currentInstance;
  let getter;

  if (isArray(source)) {
    getter = () => source.map(s => {
      if (isRef(s)) {
        return s.value;
      } else if (isReactive(s)) {
        return traverse(s);
      } else if (isFunction(s)) {
        return callWithErrorHandling(s, instance, 2
        /* WATCH_GETTER */
        );
      }
    });
  } else if (isRef(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => source;

    deep = true;
  } else if (isFunction(source)) {
    if (cb) {
      // getter with cb
      getter = () => callWithErrorHandling(source, instance, 2
      /* WATCH_GETTER */
      );
    } else {
      // no cb -> simple effect
      getter = () => {
        if (instance && instance.isUnmounted) {
          return;
        }

        if (cleanup) {
          cleanup();
        }

        return callWithErrorHandling(source, instance, 3
        /* WATCH_CALLBACK */
        , [onInvalidate]);
      };
    }
  } else {
    getter = NOOP;
  }

  if (cb && deep) {
    const baseGetter = getter;

    getter = () => traverse(baseGetter());
  }

  let cleanup;

  const onInvalidate = fn => {
    cleanup = runner.options.onStop = () => {
      callWithErrorHandling(fn, instance, 4
      /* WATCH_CLEANUP */
      );
    };
  };

  let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE;
  const applyCb = cb ? () => {
    if (instance && instance.isUnmounted) {
      return;
    }

    const newValue = runner();

    if (deep || hasChanged(newValue, oldValue)) {
      // cleanup before running cb again
      if (cleanup) {
        cleanup();
      }

      callWithAsyncErrorHandling(cb, instance, 3
      /* WATCH_CALLBACK */
      , [newValue, // pass undefined as the old value when it's changed for the first time
      oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue, onInvalidate]);
      oldValue = newValue;
    }
  } : void 0;
  let scheduler;

  if (flush === 'sync') {
    scheduler = invoke;
  } else if (flush === 'pre') {
    scheduler = job => {
      if (!instance || instance.isMounted) {
        queueJob(job);
      } else {
        // with 'pre' option, the first call must happen before
        // the component is mounted so it is called synchronously.
        job();
      }
    };
  } else {
    scheduler = job => queuePostRenderEffect(job, instance && instance.suspense);
  }

  const runner = effect(getter, {
    lazy: true,
    // so it runs before component update effects in pre flush mode
    computed: true,
    onTrack,
    onTrigger,
    scheduler: applyCb ? () => scheduler(applyCb) : scheduler
  });
  recordInstanceBoundEffect(runner); // initial run

  if (applyCb) {
    if (immediate) {
      applyCb();
    } else {
      oldValue = runner();
    }
  } else {
    runner();
  }

  return () => {
    stop(runner);

    if (instance) {
      remove(instance.effects, runner);
    }
  };
} // this.$watch


function instanceWatch(source, cb, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? () => publicThis[source] : source.bind(publicThis);
  const stop = watch(getter, cb.bind(publicThis), options);
  onBeforeUnmount(stop, this);
  return stop;
}

function traverse(value, seen = new Set()) {
  if (!isObject(value) || seen.has(value)) {
    return value;
  }

  seen.add(value);

  if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], seen);
    }
  } else if (value instanceof Map) {
    value.forEach((v, key) => {
      // to register mutation dep for existing keys
      traverse(value.get(key), seen);
    });
  } else if (value instanceof Set) {
    value.forEach(v => {
      traverse(v, seen);
    });
  } else {
    for (const key in value) {
      traverse(value[key], seen);
    }
  }

  return value;
}

function provide(key, value) {
  if (!currentInstance) ;else {
    let provides = currentInstance.provides; // by default an instance inherits its parent's provides object
    // but when it needs to provide values of its own, it creates its
    // own provides object using parent provides object as prototype.
    // this way in `inject` we can simply look up injections from direct
    // parent and let the prototype chain do the work.

    const parentProvides = currentInstance.parent && currentInstance.parent.provides;

    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    } // TS doesn't allow symbol as index type


    provides[key] = value;
  }
}

function inject(key, defaultValue) {
  // fallback to `currentRenderingInstance` so that this can be called in
  // a functional component
  const instance = currentInstance || currentRenderingInstance;

  if (instance) {
    const provides = instance.provides;

    if (key in provides) {
      // TS doesn't allow symbol as index type
      return provides[key];
    } else if (arguments.length > 1) {
      return defaultValue;
    }
  }
}

function applyOptions(instance, options, deferredData = [], deferredWatch = [], asMixin = false) {
  const {
    // composition
    mixins,
    extends: extendsOptions,
    // state
    props: propsOptions,
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // assets
    components,
    directives,
    // lifecycle
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeUnmount,
    unmounted,
    renderTracked,
    renderTriggered,
    errorCaptured
  } = options;
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  const globalMixins = instance.appContext.mixins; // call it only during dev
  // applyOptions is called non-as-mixin once per instance

  if (!asMixin) {
    callSyncHook('beforeCreate', options, publicThis, globalMixins); // global mixins are applied first

    applyMixins(instance, globalMixins, deferredData, deferredWatch);
  } // extending a base component...


  if (extendsOptions) {
    applyOptions(instance, extendsOptions, deferredData, deferredWatch, true);
  } // local mixins


  if (mixins) {
    applyMixins(instance, mixins, deferredData, deferredWatch);
  } // options initialization order (to be consistent with Vue 2):
  // - props (already done outside of this function)
  // - inject
  // - methods
  // - data (deferred since it relies on `this` access)
  // - computed
  // - watch (deferred since it relies on `this` access)


  if (injectOptions) {
    if (isArray(injectOptions)) {
      for (let i = 0; i < injectOptions.length; i++) {
        const key = injectOptions[i];
        ctx[key] = inject(key);
      }
    } else {
      for (const key in injectOptions) {
        const opt = injectOptions[key];

        if (isObject(opt)) {
          ctx[key] = inject(opt.from, opt.default);
        } else {
          ctx[key] = inject(opt);
        }
      }
    }
  }

  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];

      if (isFunction(methodHandler)) {
        ctx[key] = methodHandler.bind(publicThis);
      }
    }
  }

  if (dataOptions) {
    if (asMixin) {
      deferredData.push(dataOptions);
    } else {
      resolveData(instance, dataOptions, publicThis);
    }
  }

  if (!asMixin) {
    if (deferredData.length) {
      deferredData.forEach(dataFn => resolveData(instance, dataFn, publicThis));
    }
  }

  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c = computed({
        get,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: v => c.value = v
      });
    }
  }

  if (watchOptions) {
    deferredWatch.push(watchOptions);
  }

  if (!asMixin && deferredWatch.length) {
    deferredWatch.forEach(watchOptions => {
      for (const key in watchOptions) {
        createWatcher(watchOptions[key], ctx, publicThis, key);
      }
    });
  }

  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;

    for (const key in provides) {
      provide(key, provides[key]);
    }
  } // asset options


  if (components) {
    extend(instance.components, components);
  }

  if (directives) {
    extend(instance.directives, directives);
  } // lifecycle options


  if (!asMixin) {
    callSyncHook('created', options, publicThis, globalMixins);
  }

  if (beforeMount) {
    onBeforeMount(beforeMount.bind(publicThis));
  }

  if (mounted) {
    onMounted(mounted.bind(publicThis));
  }

  if (beforeUpdate) {
    onBeforeUpdate(beforeUpdate.bind(publicThis));
  }

  if (updated) {
    onUpdated(updated.bind(publicThis));
  }

  if (activated) {
    onActivated(activated.bind(publicThis));
  }

  if (deactivated) {
    onDeactivated(deactivated.bind(publicThis));
  }

  if (errorCaptured) {
    onErrorCaptured(errorCaptured.bind(publicThis));
  }

  if (renderTracked) {
    onRenderTracked(renderTracked.bind(publicThis));
  }

  if (renderTriggered) {
    onRenderTriggered(renderTriggered.bind(publicThis));
  }

  if (beforeUnmount) {
    onBeforeUnmount(beforeUnmount.bind(publicThis));
  }

  if (unmounted) {
    onUnmounted(unmounted.bind(publicThis));
  }
}

function callSyncHook(name, options, ctx, globalMixins) {
  callHookFromMixins(name, globalMixins, ctx);
  const baseHook = options.extends && options.extends[name];

  if (baseHook) {
    baseHook.call(ctx);
  }

  const mixins = options.mixins;

  if (mixins) {
    callHookFromMixins(name, mixins, ctx);
  }

  const selfHook = options[name];

  if (selfHook) {
    selfHook.call(ctx);
  }
}

function callHookFromMixins(name, mixins, ctx) {
  for (let i = 0; i < mixins.length; i++) {
    const fn = mixins[i][name];

    if (fn) {
      fn.call(ctx);
    }
  }
}

function applyMixins(instance, mixins, deferredData, deferredWatch) {
  for (let i = 0; i < mixins.length; i++) {
    applyOptions(instance, mixins[i], deferredData, deferredWatch, true);
  }
}

function resolveData(instance, dataFn, publicThis) {
  const data = dataFn.call(publicThis, publicThis);
  if (!isObject(data)) ;else if (instance.data === EMPTY_OBJ) {
    instance.data = reactive(data);
  } else {
    // existing data: this is a mixin or extends.
    extend(instance.data, data);
  }
}

function createWatcher(raw, ctx, publicThis, key) {
  const getter = () => publicThis[key];

  if (isString(raw)) {
    const handler = ctx[raw];

    if (isFunction(handler)) {
      watch(getter, handler);
    }
  } else if (isFunction(raw)) {
    watch(getter, raw.bind(publicThis));
  } else if (isObject(raw)) {
    if (isArray(raw)) {
      raw.forEach(r => createWatcher(r, ctx, publicThis, key));
    } else {
      watch(getter, raw.handler.bind(publicThis), raw);
    }
  }
}

function resolveMergedOptions(instance) {
  const raw = instance.type;
  const {
    __merged,
    mixins,
    extends: extendsOptions
  } = raw;
  if (__merged) return __merged;
  const globalMixins = instance.appContext.mixins;
  if (!globalMixins.length && !mixins && !extendsOptions) return raw;
  const options = {};
  globalMixins.forEach(m => mergeOptions(options, m, instance));
  extendsOptions && mergeOptions(options, extendsOptions, instance);
  mixins && mixins.forEach(m => mergeOptions(options, m, instance));
  mergeOptions(options, raw, instance);
  return raw.__merged = options;
}

function mergeOptions(to, from, instance) {
  const strats = instance.appContext.config.optionMergeStrategies;

  for (const key in from) {
    const strat = strats && strats[key];

    if (strat) {
      to[key] = strat(to[key], from[key], instance.proxy, key);
    } else if (!hasOwn(to, key)) {
      to[key] = from[key];
    }
  }
}

const publicPropertiesMap = {
  $: i => i,
  $el: i => i.vnode.el,
  $data: i => i.data,
  $props: i => i.props,
  $attrs: i => i.attrs,
  $slots: i => i.slots,
  $refs: i => i.refs,
  $parent: i => i.parent && i.parent.proxy,
  $root: i => i.root && i.root.proxy,
  $emit: i => i.emit,
  $options: i => resolveMergedOptions(i),
  $forceUpdate: i => () => queueJob(i.update),
  $nextTick: () => nextTick,
  $watch: i => instanceWatch.bind(i)
};
const PublicInstanceProxyHandlers = {
  get({
    _: instance
  }, key) {
    const {
      ctx,
      setupState,
      data,
      props,
      accessCache,
      type,
      appContext
    } = instance; // let @vue/reatvitiy know it should never observe Vue public instances.

    if (key === "__v_skip"
    /* skip */
    ) {
        return true;
      } // data / props / ctx
    // This getter gets called for every property access on the render context
    // during render and is a major hotspot. The most expensive part of this
    // is the multiple hasOwn() calls. It's much faster to do a simple property
    // access on a plain object, so we use an accessCache object (with null
    // prototype) to memoize what access type a key corresponds to.


    if (key[0] !== '$') {
      const n = accessCache[key];

      if (n !== undefined) {
        switch (n) {
          case 0
          /* SETUP */
          :
            return setupState[key];

          case 1
          /* DATA */
          :
            return data[key];

          case 3
          /* CONTEXT */
          :
            return ctx[key];

          case 2
          /* PROPS */
          :
            return props[key];
          // default: just fallthrough
        }
      } else if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
        accessCache[key] = 0
        /* SETUP */
        ;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 1
        /* DATA */
        ;
        return data[key];
      } else if ( // only cache other properties when instance has declared (thus stable)
      // props
      type.props && hasOwn(normalizePropsOptions(type.props)[0], key)) {
        accessCache[key] = 2
        /* PROPS */
        ;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 3
        /* CONTEXT */
        ;
        return ctx[key];
      } else {
        accessCache[key] = 4
        /* OTHER */
        ;
      }
    }

    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties; // public $xxx properties

    if (publicGetter) {
      return publicGetter(instance);
    } else if ( // css module (injected by vue-loader)
    (cssModule = type.__cssModules) && (cssModule = cssModule[key])) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      // user may set custom properties to `this` that start with `$`
      accessCache[key] = 3
      /* CONTEXT */
      ;
      return ctx[key];
    } else if ( // global properties
    globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)) {
      return globalProperties[key];
    }
  },

  set({
    _: instance
  }, key, value) {
    const {
      data,
      setupState,
      ctx
    } = instance;

    if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
      setupState[key] = value;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
    } else if (key in instance.props) {
      return false;
    }

    if (key[0] === '$' && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }

    return true;
  },

  has({
    _: {
      data,
      setupState,
      accessCache,
      ctx,
      type,
      appContext
    }
  }, key) {
    return accessCache[key] !== undefined || data !== EMPTY_OBJ && hasOwn(data, key) || setupState !== EMPTY_OBJ && hasOwn(setupState, key) || type.props && hasOwn(normalizePropsOptions(type.props)[0], key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key);
  }

};
const RuntimeCompiledPublicInstanceProxyHandlers = { ...PublicInstanceProxyHandlers,

  get(target, key) {
    // fast path for unscopables when using `with` block
    if (key === Symbol.unscopables) {
      return;
    }

    return PublicInstanceProxyHandlers.get(target, key, target);
  },

  has(_, key) {
    const has = key[0] !== '_' && !isGloballyWhitelisted(key);
    return has;
  }

};
const emptyAppContext = createAppContext();
let uid = 0;

function createComponentInstance(vnode, parent, suspense) {
  // inherit parent app context - or - if root, adopt from root vnode
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    parent,
    appContext,
    type: vnode.type,
    root: null,
    next: null,
    subTree: null,
    update: null,
    render: null,
    proxy: null,
    withProxy: null,
    effects: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    accessCache: null,
    renderCache: [],
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // per-instance asset storage (mutable during options resolution)
    components: Object.create(appContext.components),
    directives: Object.create(appContext.directives),
    // suspense related
    suspense,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    emit: null // to be set immediately

  };
  {
    instance.ctx = {
      _: instance
    };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  return instance;
}

let currentInstance = null;

const getCurrentInstance = () => currentInstance || currentRenderingInstance;

const setCurrentInstance = instance => {
  currentInstance = instance;
};

let isInSSRComponentSetup = false;

function setupComponent(instance, isSSR = false) {
  isInSSRComponentSetup = isSSR;
  const {
    props,
    children,
    shapeFlag
  } = instance.vnode;
  const isStateful = shapeFlag & 4
  /* STATEFUL_COMPONENT */
  ;
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : undefined;
  isInSSRComponentSetup = false;
  return setupResult;
}

function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type; // 0. create render proxy property access cache

  instance.accessCache = {}; // 1. create public instance / render proxy
  // also mark it raw so it's never observed

  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers); // 2. call setup()

  const {
    setup
  } = Component;

  if (setup) {
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    currentInstance = instance;
    pauseTracking();
    const setupResult = callWithErrorHandling(setup, instance, 0
    /* SETUP_FUNCTION */
    , [instance.props, setupContext]);
    resetTracking();
    currentInstance = null;

    if (isPromise(setupResult)) {
      if (isSSR) {
        // return the promise so server-renderer can wait on it
        return setupResult.then(resolvedResult => {
          handleSetupResult(instance, resolvedResult);
        });
      } else {
        // async setup returned Promise.
        // bail here and wait for re-entry.
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult);
    }
  } else {
    finishComponentSetup(instance);
  }
}

function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    // setup returned an inline render function
    instance.render = setupResult;
  } else if (isObject(setupResult)) {
    // setup returned bindings.
    // assuming a render function compiled from template is present.
    instance.setupState = reactive(setupResult);
  }

  finishComponentSetup(instance);
}

let compile;
/**
 * For runtime-dom to register the compiler.
 * Note the exported method uses any to avoid d.ts relying on the compiler types.
 */

function registerRuntimeCompiler(_compile) {
  compile = _compile;
}

function finishComponentSetup(instance, isSSR) {
  const Component = instance.type; // template / render function normalization

  if (!instance.render) {
    if (compile && Component.template && !Component.render) {
      Component.render = compile(Component.template, {
        isCustomElement: instance.appContext.config.isCustomElement || NO
      });
      Component.render._rc = true;
    }

    instance.render = Component.render || NOOP; // for runtime-compiled render functions using `with` blocks, the render
    // proxy used needs a different `has` handler which is more performant and
    // also only allows a whitelist of globals to fallthrough.

    if (instance.render._rc) {
      instance.withProxy = new Proxy(instance.ctx, RuntimeCompiledPublicInstanceProxyHandlers);
    }
  } // support for 2.x options


  {
    currentInstance = instance;
    applyOptions(instance, Component);
    currentInstance = null;
  }
}

function createSetupContext(instance) {
  {
    return {
      attrs: instance.attrs,
      slots: instance.slots,
      emit: instance.emit
    };
  }
} // record effects created during a component's setup() so that they can be
// stopped when the component unmounts


function recordInstanceBoundEffect(effect) {
  if (currentInstance) {
    (currentInstance.effects || (currentInstance.effects = [])).push(effect);
  }
}

const classifyRE = /(?:^|[-_])(\w)/g;

const classify = str => str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '');

function formatComponentName(Component, isRoot = false) {
  let name = isFunction(Component) ? Component.displayName || Component.name : Component.name;

  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.vue$/);

    if (match) {
      name = match[1];
    }
  }

  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}

function computed(getterOrOptions) {
  const c = computed$1(getterOrOptions);
  recordInstanceBoundEffect(c.effect);
  return c;
} // implementation, close to no-op


function defineComponent(options) {
  return isFunction(options) ? {
    setup: options
  } : options;
}

function defineAsyncComponent(source) {
  if (isFunction(source)) {
    source = {
      loader: source
    };
  }

  const {
    loader,
    loadingComponent: loadingComponent,
    errorComponent: errorComponent,
    delay = 200,
    timeout,
    // undefined = never times out
    suspensible = true,
    onError: userOnError
  } = source;
  let pendingRequest = null;
  let resolvedComp;
  let retries = 0;

  const retry = () => {
    retries++;
    pendingRequest = null;
    return load();
  };

  const load = () => {
    let thisRequest;
    return pendingRequest || (thisRequest = pendingRequest = loader().catch(err => {
      err = err instanceof Error ? err : new Error(String(err));

      if (userOnError) {
        return new Promise((resolve, reject) => {
          const userRetry = () => resolve(retry());

          const userFail = () => reject(err);

          userOnError(err, userRetry, userFail, retries + 1);
        });
      } else {
        throw err;
      }
    }).then(comp => {
      if (thisRequest !== pendingRequest && pendingRequest) {
        return pendingRequest;
      } // interop module default


      if (comp && (comp.__esModule || comp[Symbol.toStringTag] === 'Module')) {
        comp = comp.default;
      }

      resolvedComp = comp;
      return comp;
    }));
  };

  return defineComponent({
    __asyncLoader: load,
    name: 'AsyncComponentWrapper',

    setup() {
      const instance = currentInstance; // already resolved

      if (resolvedComp) {
        return () => createInnerComp(resolvedComp, instance);
      }

      const onError = err => {
        pendingRequest = null;
        handleError(err, instance, 13
        /* ASYNC_COMPONENT_LOADER */
        );
      }; // suspense-controlled or SSR.


      if (suspensible && instance.suspense || false) {
        return load().then(comp => {
          return () => createInnerComp(comp, instance);
        }).catch(err => {
          onError(err);
          return () => errorComponent ? createVNode(errorComponent, {
            error: err
          }) : null;
        });
      }

      const loaded = ref(false);
      const error = ref();
      const delayed = ref(!!delay);

      if (delay) {
        setTimeout(() => {
          delayed.value = false;
        }, delay);
      }

      if (timeout != null) {
        setTimeout(() => {
          if (!loaded.value) {
            const err = new Error(`Async component timed out after ${timeout}ms.`);
            onError(err);
            error.value = err;
          }
        }, timeout);
      }

      load().then(() => {
        loaded.value = true;
      }).catch(err => {
        onError(err);
        error.value = err;
      });
      return () => {
        if (loaded.value && resolvedComp) {
          return createInnerComp(resolvedComp, instance);
        } else if (error.value && errorComponent) {
          return createVNode(errorComponent, {
            error: error.value
          });
        } else if (loadingComponent && !delayed.value) {
          return createVNode(loadingComponent);
        }
      };
    }

  });
}

function createInnerComp(comp, {
  vnode: {
    props,
    children
  }
}) {
  return createVNode(comp, props, children);
} // Actual implementation


function h(type, propsOrChildren, children) {
  if (arguments.length === 2) {
    if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
      // single vnode without props
      if (isVNode(propsOrChildren)) {
        return createVNode(type, null, [propsOrChildren]);
      } // props without children


      return createVNode(type, propsOrChildren);
    } else {
      // omit props
      return createVNode(type, null, propsOrChildren);
    }
  } else {
    if (isVNode(children)) {
      children = [children];
    }

    return createVNode(type, propsOrChildren, children);
  }
}

const useCSSModule = (name = '$style') => {
  {
    const instance = getCurrentInstance();

    if (!instance) {
      return EMPTY_OBJ;
    }

    const modules = instance.type.__cssModules;

    if (!modules) {
      return EMPTY_OBJ;
    }

    const mod = modules[name];

    if (!mod) {
      return EMPTY_OBJ;
    }

    return mod;
  }
};

const ssrContextKey = Symbol(``);

const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);

    if (!ctx) {
      warn(`Server rendering context not provided. Make sure to only call ` + `useSsrContext() conditionally in the server build.`);
    }

    return ctx;
  }
}; // actual implementation


function renderList(source, renderItem) {
  let ret;

  if (isArray(source) || isString(source)) {
    ret = new Array(source.length);

    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(source[i], i);
    }
  } else if (typeof source === 'number') {
    ret = new Array(source);

    for (let i = 0; i < source; i++) {
      ret[i] = renderItem(i + 1, i);
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator]) {
      ret = Array.from(source, renderItem);
    } else {
      const keys = Object.keys(source);
      ret = new Array(keys.length);

      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        ret[i] = renderItem(source[key], key, i);
      }
    }
  } else {
    ret = [];
  }

  return ret;
}
/**
 * For prefixing keys in v-on="obj" with "on"
 * @internal
 */


function toHandlers(obj) {
  const ret = {};

  for (const key in obj) {
    ret[`on${key}`] = obj[key];
  }

  return ret;
}
/**
 * Compiler runtime helper for rendering <slot/>
 * @internal
 */


function renderSlot(slots, name, props = {}, // this is not a user-facing function, so the fallback is always generated by
// the compiler and guaranteed to be a function returning an array
fallback) {
  let slot = slots[name];
  return openBlock(), createBlock(Fragment, {
    key: props.key
  }, slot ? slot(props) : fallback ? fallback() : [], slots._ ? 64
  /* STABLE_FRAGMENT */
  : -2
  /* BAIL */
  );
}
/**
 * Compiler runtime helper for creating dynamic slots object
 * @internal
 */


function createSlots(slots, dynamicSlots) {
  for (let i = 0; i < dynamicSlots.length; i++) {
    const slot = dynamicSlots[i]; // array of dynamic slot generated by <template v-for="..." #[...]>

    if (isArray(slot)) {
      for (let j = 0; j < slot.length; j++) {
        slots[slot[j].name] = slot[j].fn;
      }
    } else if (slot) {
      // conditional single slot generated by <template v-if="..." #foo>
      slots[slot.name] = slot.fn;
    }
  }

  return slots;
} // Core API ------------------------------------------------------------------


const version = "3.0.0-beta.14";
/**
 * @internal
 */

const _toDisplayString = toDisplayString;
/**
 * @internal
 */

const _camelize = camelize;
/**
 * SSR utils for \@vue/server-renderer. Only exposed in cjs builds.
 * @internal
 */

const ssrUtils = null;
export { BaseTransition, Comment, Fragment, KeepAlive, Static, Suspense, Teleport, Text, callWithAsyncErrorHandling, callWithErrorHandling, _camelize as camelize, cloneVNode, computed, createBlock, createCommentVNode, createHydrationRenderer, createRenderer, createSlots, createStaticVNode, createTextVNode, createVNode, defineAsyncComponent, defineComponent, getCurrentInstance, h, handleError, inject, isVNode, mergeProps, nextTick, onActivated, onBeforeMount, onBeforeUnmount, onBeforeUpdate, onDeactivated, onErrorCaptured, onMounted, onRenderTracked, onRenderTriggered, onUnmounted, onUpdated, openBlock, popScopeId, provide, pushScopeId, queuePostFlushCb, registerRuntimeCompiler, renderList, renderSlot, resolveComponent, resolveDirective, resolveDynamicComponent, resolveTransitionHooks, setBlockTracking, setTransitionHooks, ssrContextKey, ssrUtils, _toDisplayString as toDisplayString, toHandlers, transformVNodeArgs, useCSSModule, useSSRContext, useTransitionState, version, warn, watch, watchEffect, withCtx, withDirectives, withScopeId };
export default null;