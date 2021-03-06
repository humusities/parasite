import { h, BaseTransition, getCurrentInstance, createRenderer, useTransitionState, onUpdated, Fragment, setTransitionHooks, resolveTransitionHooks, createVNode, Comment, createHydrationRenderer, callWithAsyncErrorHandling, camelize } from '@vue/runtime-core/runtime-core.js';
export * from '@vue/runtime-core/runtime-core.js';
import { isObject, toNumber, isArray, invokeArrayFns, looseIndexOf, looseEqual, hyphenate, isFunction, isString, isOn, capitalize, isSpecialBooleanAttr, EMPTY_OBJ } from '@vue/shared/shared.js';
const svgNS = 'http://www.w3.org/2000/svg';
const doc = typeof document !== 'undefined' ? document : null;
let tempContainer;
let tempSVGContainer;
const nodeOps = {
  insert: (child, parent, anchor) => {
    if (anchor) {
      parent.insertBefore(child, anchor);
    } else {
      parent.appendChild(child);
    }
  },
  remove: child => {
    const parent = child.parentNode;

    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, isSVG, is) => isSVG ? doc.createElementNS(svgNS, tag) : doc.createElement(tag, is ? {
    is
  } : undefined),
  createText: text => doc.createTextNode(text),
  createComment: text => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: node => node.parentNode,
  nextSibling: node => node.nextSibling,
  querySelector: selector => doc.querySelector(selector),

  setScopeId(el, id) {
    el.setAttribute(id, '');
  },

  cloneNode(el) {
    return el.cloneNode(true);
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, isSVG) {
    const temp = isSVG ? tempSVGContainer || (tempSVGContainer = doc.createElementNS(svgNS, 'svg')) : tempContainer || (tempContainer = doc.createElement('div'));
    temp.innerHTML = content;
    const first = temp.firstChild;
    let node = first;
    let last = node;

    while (node) {
      last = node;
      nodeOps.insert(node, parent, anchor);
      node = temp.firstChild;
    }

    return [first, last];
  }

}; // compiler should normalize class + :class bindings on the same element
// into a single binding ['staticClass', dynamic]

function patchClass(el, value, isSVG) {
  if (value == null) {
    value = '';
  }

  if (isSVG) {
    el.setAttribute('class', value);
  } else {
    // directly setting className should be faster than setAttribute in theory
    // if this is an element during a transition, take the temporary transition
    // classes into account.
    const transitionClasses = el._vtc;

    if (transitionClasses) {
      value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(' ');
    }

    el.className = value;
  }
}

function patchStyle(el, prev, next) {
  const style = el.style;

  if (!next) {
    el.removeAttribute('style');
  } else if (isString(next)) {
    style.cssText = next;
  } else {
    for (const key in next) {
      setStyle(style, key, next[key]);
    }

    if (prev && !isString(prev)) {
      for (const key in prev) {
        if (!next[key]) {
          setStyle(style, key, '');
        }
      }
    }
  }
}

const importantRE = /\s*!important$/;

function setStyle(style, name, val) {
  if (name.startsWith('--')) {
    // custom property definition
    style.setProperty(name, val);
  } else {
    const prefixed = autoPrefix(style, name);

    if (importantRE.test(val)) {
      // !important
      style.setProperty(hyphenate(prefixed), val.replace(importantRE, ''), 'important');
    } else {
      style[prefixed] = val;
    }
  }
}

const prefixes = ['Webkit', 'Moz', 'ms'];
const prefixCache = {};

function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];

  if (cached) {
    return cached;
  }

  let name = camelize(rawName);

  if (name !== 'filter' && name in style) {
    return prefixCache[rawName] = name;
  }

  name = capitalize(name);

  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name;

    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }

  return rawName;
}

const xlinkNS = 'http://www.w3.org/1999/xlink';

function patchAttr(el, key, value, isSVG) {
  if (isSVG && key.startsWith('xlink:')) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    // note we are only checking boolean attributes that don't have a
    // corresponding dom prop of the same name here.
    const isBoolean = isSpecialBooleanAttr(key);

    if (value == null || isBoolean && value === false) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, isBoolean ? '' : value);
    }
  }
} // __UNSAFE__
// functions. The user is reponsible for using them with only trusted content.


function patchDOMProp(el, key, value, // the following args are passed only due to potential innerHTML/textContent
// overriding existing VNodes, in which case the old tree must be properly
// unmounted.
prevChildren, parentComponent, parentSuspense, unmountChildren) {
  if (key === 'innerHTML' || key === 'textContent') {
    if (prevChildren) {
      unmountChildren(prevChildren, parentComponent, parentSuspense);
    }

    el[key] = value == null ? '' : value;
    return;
  }

  if (key === 'value' && el.tagName !== 'PROGRESS') {
    // store value as _value as well since
    // non-string values will be stringified.
    el._value = value;
    el.value = value == null ? '' : value;
    return;
  }

  if (value === '' && typeof el[key] === 'boolean') {
    // e.g. <select multiple> compiles to { multiple: '' }
    el[key] = true;
  } else if (value == null && typeof el[key] === 'string') {
    // e.g. <div :id="null">
    el[key] = '';
  } else {
    // some properties perform value validation and throw
    try {
      el[key] = value;
    } catch (e) {}
  }
} // Async edge case fix requires storing an event listener's attach timestamp.


let _getNow = Date.now; // Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res ( relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.

if (typeof document !== 'undefined' && _getNow() > document.createEvent('Event').timeStamp) {
  // if the low-res timestamp which is bigger than the event timestamp
  // (which is evaluated AFTER) it means the event is using a hi-res timestamp,
  // and we need to use the hi-res version for event listeners as well.
  _getNow = () => performance.now();
} // To avoid the overhead of repeatedly calling performance.now(), we cache
// and use the same timestamp for all event listeners attached in the same tick.


let cachedNow = 0;
const p = Promise.resolve();

const reset = () => {
  cachedNow = 0;
};

const getNow = () => cachedNow || (p.then(reset), cachedNow = _getNow());

function addEventListener(el, event, handler, options) {
  el.addEventListener(event, handler, options);
}

function removeEventListener(el, event, handler, options) {
  el.removeEventListener(event, handler, options);
}

function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const name = rawName.slice(2).toLowerCase();
  const prevOptions = prevValue && 'options' in prevValue && prevValue.options;
  const nextOptions = nextValue && 'options' in nextValue && nextValue.options;
  const invoker = prevValue && prevValue.invoker;
  const value = nextValue && 'handler' in nextValue ? nextValue.handler : nextValue;

  if (prevOptions || nextOptions) {
    const prev = prevOptions || EMPTY_OBJ;
    const next = nextOptions || EMPTY_OBJ;

    if (prev.capture !== next.capture || prev.passive !== next.passive || prev.once !== next.once) {
      if (invoker) {
        removeEventListener(el, name, invoker, prev);
      }

      if (nextValue && value) {
        const _invoker = createInvoker(value, instance);

        nextValue.invoker = _invoker;
        addEventListener(el, name, _invoker, next);
      }

      return;
    }
  }

  if (nextValue && value) {
    if (invoker) {
      prevValue.invoker = null;
      invoker.value = value;
      nextValue.invoker = invoker;
      invoker.lastUpdated = getNow();
    } else {
      addEventListener(el, name, createInvoker(value, instance), nextOptions || void 0);
    }
  } else if (invoker) {
    removeEventListener(el, name, invoker, prevOptions || void 0);
  }
}

function createInvoker(initialValue, instance) {
  const invoker = e => {
    // async edge case #6566: inner click event triggers patch, event handler
    // attached to outer element during patch, and triggered again. This
    // happens because browsers fire microtask ticks between event propagation.
    // the solution is simple: we save the timestamp when a handler is attached,
    // and the handler would only fire if the event passed to it was fired
    // AFTER it was attached.
    if (e.timeStamp >= invoker.lastUpdated - 1) {
      callWithAsyncErrorHandling(patchStopImmediatePropagation(e, invoker.value), instance, 5
      /* NATIVE_EVENT_HANDLER */
      , [e]);
    }
  };

  invoker.value = initialValue;
  initialValue.invoker = invoker;
  invoker.lastUpdated = getNow();
  return invoker;
}

function patchStopImmediatePropagation(e, value) {
  if (isArray(value)) {
    const originalStop = e.stopImmediatePropagation;

    e.stopImmediatePropagation = () => {
      originalStop.call(e);
      e._stopped = true;
    };

    return value.map(fn => e => !e._stopped && fn(e));
  } else {
    return value;
  }
}

const nativeOnRE = /^on[a-z]/;

const patchProp = (el, key, prevValue, nextValue, isSVG = false, prevChildren, parentComponent, parentSuspense, unmountChildren) => {
  switch (key) {
    // special
    case 'class':
      patchClass(el, nextValue, isSVG);
      break;

    case 'style':
      patchStyle(el, prevValue, nextValue);
      break;

    default:
      if (isOn(key)) {
        // ignore v-model listeners
        if (!key.startsWith('onUpdate:')) {
          patchEvent(el, key, prevValue, nextValue, parentComponent);
        }
      } else if (isSVG ? // most keys must be set as attribute on svg elements to work
      // ...except innerHTML
      key === 'innerHTML' || // or native onclick with function values
      key in el && nativeOnRE.test(key) && isFunction(nextValue) : // for normal html elements, set as a property if it exists
      key in el && // except native onclick with string values
      !(nativeOnRE.test(key) && isString(nextValue))) {
        patchDOMProp(el, key, nextValue, prevChildren, parentComponent, parentSuspense, unmountChildren);
      } else {
        // special case for <input v-model type="checkbox"> with
        // :true-value & :false-value
        // store value as dom properties since non-string values will be
        // stringified.
        if (key === 'true-value') {
          el._trueValue = nextValue;
        } else if (key === 'false-value') {
          el._falseValue = nextValue;
        }

        patchAttr(el, key, nextValue, isSVG);
      }

      break;
  }
};

const TRANSITION = 'transition';
const ANIMATION = 'animation'; // DOM Transition is a higher-order-component based on the platform-agnostic
// base Transition component, with DOM-specific logic.

const Transition = (props, {
  slots
}) => h(BaseTransition, resolveTransitionProps(props), slots);

const TransitionPropsValidators = Transition.props = { ...BaseTransition.props,
  name: String,
  type: String,
  css: {
    type: Boolean,
    default: true
  },
  duration: [String, Number, Object],
  enterFromClass: String,
  enterActiveClass: String,
  enterToClass: String,
  appearFromClass: String,
  appearActiveClass: String,
  appearToClass: String,
  leaveFromClass: String,
  leaveActiveClass: String,
  leaveToClass: String
};

function resolveTransitionProps({
  name = 'v',
  type,
  css = true,
  duration,
  enterFromClass = `${name}-enter-from`,
  enterActiveClass = `${name}-enter-active`,
  enterToClass = `${name}-enter-to`,
  appearFromClass = enterFromClass,
  appearActiveClass = enterActiveClass,
  appearToClass = enterToClass,
  leaveFromClass = `${name}-leave-from`,
  leaveActiveClass = `${name}-leave-active`,
  leaveToClass = `${name}-leave-to`,
  ...baseProps
}) {
  if (!css) {
    return baseProps;
  }

  const originEnterClass = [enterFromClass, enterActiveClass, enterToClass];
  const instance = getCurrentInstance();
  const durations = normalizeDuration(duration);
  const enterDuration = durations && durations[0];
  const leaveDuration = durations && durations[1];
  const {
    appear,
    onBeforeEnter,
    onEnter,
    onLeave
  } = baseProps; // is appearing

  if (appear && !instance.isMounted) {
    enterFromClass = appearFromClass;
    enterActiveClass = appearActiveClass;
    enterToClass = appearToClass;
  }

  const finishEnter = (el, done) => {
    removeTransitionClass(el, enterToClass);
    removeTransitionClass(el, enterActiveClass);
    done && done(); // reset enter class

    if (appear) {
      [enterFromClass, enterActiveClass, enterToClass] = originEnterClass;
    }
  };

  const finishLeave = (el, done) => {
    removeTransitionClass(el, leaveToClass);
    removeTransitionClass(el, leaveActiveClass);
    done && done();
  }; // only needed for user hooks called in nextFrame
  // sync errors are already handled by BaseTransition


  function callHookWithErrorHandling(hook, args) {
    callWithAsyncErrorHandling(hook, instance, 9
    /* TRANSITION_HOOK */
    , args);
  }

  return { ...baseProps,

    onBeforeEnter(el) {
      onBeforeEnter && onBeforeEnter(el);
      addTransitionClass(el, enterActiveClass);
      addTransitionClass(el, enterFromClass);
    },

    onEnter(el, done) {
      nextFrame(() => {
        const resolve = () => finishEnter(el, done);

        onEnter && callHookWithErrorHandling(onEnter, [el, resolve]);
        removeTransitionClass(el, enterFromClass);
        addTransitionClass(el, enterToClass);

        if (!(onEnter && onEnter.length > 1)) {
          if (enterDuration) {
            setTimeout(resolve, enterDuration);
          } else {
            whenTransitionEnds(el, type, resolve);
          }
        }
      });
    },

    onLeave(el, done) {
      addTransitionClass(el, leaveActiveClass);
      addTransitionClass(el, leaveFromClass);
      nextFrame(() => {
        const resolve = () => finishLeave(el, done);

        onLeave && callHookWithErrorHandling(onLeave, [el, resolve]);
        removeTransitionClass(el, leaveFromClass);
        addTransitionClass(el, leaveToClass);

        if (!(onLeave && onLeave.length > 1)) {
          if (leaveDuration) {
            setTimeout(resolve, leaveDuration);
          } else {
            whenTransitionEnds(el, type, resolve);
          }
        }
      });
    },

    onEnterCancelled: finishEnter,
    onLeaveCancelled: finishLeave
  };
}

function normalizeDuration(duration) {
  if (duration == null) {
    return null;
  } else if (isObject(duration)) {
    return [NumberOf(duration.enter), NumberOf(duration.leave)];
  } else {
    const n = NumberOf(duration);
    return [n, n];
  }
}

function NumberOf(val) {
  const res = toNumber(val);
  return res;
}

function addTransitionClass(el, cls) {
  cls.split(/\s+/).forEach(c => c && el.classList.add(c));
  (el._vtc || (el._vtc = new Set())).add(cls);
}

function removeTransitionClass(el, cls) {
  cls.split(/\s+/).forEach(c => c && el.classList.remove(c));
  const {
    _vtc
  } = el;

  if (_vtc) {
    _vtc.delete(cls);

    if (!_vtc.size) {
      el._vtc = undefined;
    }
  }
}

function nextFrame(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}

function whenTransitionEnds(el, expectedType, cb) {
  const {
    type,
    timeout,
    propCount
  } = getTransitionInfo(el, expectedType);

  if (!type) {
    return cb();
  }

  const endEvent = type + 'end';
  let ended = 0;

  const end = () => {
    el.removeEventListener(endEvent, onEnd);
    cb();
  };

  const onEnd = e => {
    if (e.target === el) {
      if (++ended >= propCount) {
        end();
      }
    }
  };

  setTimeout(() => {
    if (ended < propCount) {
      end();
    }
  }, timeout + 1);
  el.addEventListener(endEvent, onEnd);
}

function getTransitionInfo(el, expectedType) {
  const styles = window.getComputedStyle(el); // JSDOM may return undefined for transition properties

  const getStyleProperties = key => (styles[key] || '').split(', ');

  const transitionDelays = getStyleProperties(TRANSITION + 'Delay');
  const transitionDurations = getStyleProperties(TRANSITION + 'Duration');
  const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
  const animationDelays = getStyleProperties(ANIMATION + 'Delay');
  const animationDurations = getStyleProperties(ANIMATION + 'Duration');
  const animationTimeout = getTimeout(animationDelays, animationDurations);
  let type = null;
  let timeout = 0;
  let propCount = 0;
  /* istanbul ignore if */

  if (expectedType === TRANSITION) {
    if (transitionTimeout > 0) {
      type = TRANSITION;
      timeout = transitionTimeout;
      propCount = transitionDurations.length;
    }
  } else if (expectedType === ANIMATION) {
    if (animationTimeout > 0) {
      type = ANIMATION;
      timeout = animationTimeout;
      propCount = animationDurations.length;
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout);
    type = timeout > 0 ? transitionTimeout > animationTimeout ? TRANSITION : ANIMATION : null;
    propCount = type ? type === TRANSITION ? transitionDurations.length : animationDurations.length : 0;
  }

  const hasTransform = type === TRANSITION && /\b(transform|all)(,|$)/.test(styles[TRANSITION + 'Property']);
  return {
    type,
    timeout,
    propCount,
    hasTransform
  };
}

function getTimeout(delays, durations) {
  while (delays.length < durations.length) {
    delays = delays.concat(delays);
  }

  return Math.max(...durations.map((d, i) => toMs(d) + toMs(delays[i])));
} // Old versions of Chromium (below 61.0.3163.100) formats floating pointer
// numbers in a locale-dependent way, using a comma instead of a dot.
// If comma is not replaced with a dot, the input will be rounded down
// (i.e. acting as a floor function) causing unexpected behaviors


function toMs(s) {
  return Number(s.slice(0, -1).replace(',', '.')) * 1000;
}

function toRaw(observed) {
  return observed && toRaw(observed.__v_raw) || observed;
}

const positionMap = new WeakMap();
const newPositionMap = new WeakMap();
const TransitionGroupImpl = {
  props: { ...TransitionPropsValidators,
    tag: String,
    moveClass: String
  },

  setup(props, {
    slots
  }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    let prevChildren;
    let children;
    let hasMove = null;
    onUpdated(() => {
      // children is guaranteed to exist after initial render
      if (!prevChildren.length) {
        return;
      }

      const moveClass = props.moveClass || `${props.name || 'v'}-move`; // Check if move transition is needed. This check is cached per-instance.

      hasMove = hasMove === null ? hasMove = hasCSSTransform(prevChildren[0].el, instance.vnode.el, moveClass) : hasMove;

      if (!hasMove) {
        return;
      } // we divide the work into three loops to avoid mixing DOM reads and writes
      // in each iteration - which helps prevent layout thrashing.


      prevChildren.forEach(callPendingCbs);
      prevChildren.forEach(recordPosition);
      const movedChildren = prevChildren.filter(applyTranslation); // force reflow to put everything in position

      forceReflow();
      movedChildren.forEach(c => {
        const el = c.el;
        const style = el.style;
        addTransitionClass(el, moveClass);
        style.transform = style.webkitTransform = style.transitionDuration = '';

        const cb = el._moveCb = e => {
          if (e && e.target !== el) {
            return;
          }

          if (!e || /transform$/.test(e.propertyName)) {
            el.removeEventListener('transitionend', cb);
            el._moveCb = null;
            removeTransitionClass(el, moveClass);
          }
        };

        el.addEventListener('transitionend', cb);
      });
    });
    return () => {
      const rawProps = toRaw(props);
      const cssTransitionProps = resolveTransitionProps(rawProps);
      const tag = rawProps.tag || Fragment;
      prevChildren = children;
      const slotChildren = slots.default ? slots.default() : [];
      children = getTransitionRawChildren(slotChildren);

      for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.key != null) {
          setTransitionHooks(child, resolveTransitionHooks(child, cssTransitionProps, state, instance));
        }
      }

      if (prevChildren) {
        for (let i = 0; i < prevChildren.length; i++) {
          const child = prevChildren[i];
          setTransitionHooks(child, resolveTransitionHooks(child, cssTransitionProps, state, instance));
          positionMap.set(child, child.el.getBoundingClientRect());
        }
      }

      return createVNode(tag, null, slotChildren);
    };
  }

};

function getTransitionRawChildren(children) {
  let ret = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i]; // handle fragment children case, e.g. v-for

    if (child.type === Fragment) {
      ret = ret.concat(getTransitionRawChildren(child.children));
    } // comment placeholders should be skipped, e.g. v-if
    else if (child.type !== Comment) {
        ret.push(child);
      }
  }

  return ret;
} // remove mode props as TransitionGroup doesn't support it


delete TransitionGroupImpl.props.mode;
const TransitionGroup = TransitionGroupImpl;

function callPendingCbs(c) {
  const el = c.el;

  if (el._moveCb) {
    el._moveCb();
  }

  if (el._enterCb) {
    el._enterCb();
  }
}

function recordPosition(c) {
  newPositionMap.set(c, c.el.getBoundingClientRect());
}

function applyTranslation(c) {
  const oldPos = positionMap.get(c);
  const newPos = newPositionMap.get(c);
  const dx = oldPos.left - newPos.left;
  const dy = oldPos.top - newPos.top;

  if (dx || dy) {
    const s = c.el.style;
    s.transform = s.webkitTransform = `translate(${dx}px,${dy}px)`;
    s.transitionDuration = '0s';
    return c;
  }
} // this is put in a dedicated function to avoid the line from being treeshaken


function forceReflow() {
  return document.body.offsetHeight;
}

function hasCSSTransform(el, root, moveClass) {
  // Detect whether an element with the move class applied has
  // CSS transitions. Since the element may be inside an entering
  // transition at this very moment, we make a clone of it and remove
  // all other transition classes applied to ensure only the move class
  // is applied.
  const clone = el.cloneNode();

  if (el._vtc) {
    el._vtc.forEach(cls => {
      cls.split(/\s+/).forEach(c => c && clone.classList.remove(c));
    });
  }

  moveClass.split(/\s+/).forEach(c => c && clone.classList.add(c));
  clone.style.display = 'none';
  const container = root.nodeType === 1 ? root : root.parentNode;
  container.appendChild(clone);
  const {
    hasTransform
  } = getTransitionInfo(clone);
  container.removeChild(clone);
  return hasTransform;
}

const getModelAssigner = vnode => {
  const fn = vnode.props['onUpdate:modelValue'];
  return isArray(fn) ? value => invokeArrayFns(fn, value) : fn;
};

function onCompositionStart(e) {
  e.target.composing = true;
}

function onCompositionEnd(e) {
  const target = e.target;

  if (target.composing) {
    target.composing = false;
    trigger(target, 'input');
  }
}

function trigger(el, type) {
  const e = document.createEvent('HTMLEvents');
  e.initEvent(type, true, true);
  el.dispatchEvent(e);
} // We are exporting the v-model runtime directly as vnode hooks so that it can
// be tree-shaken in case v-model is never used. These are used by compilers
// only and userland code should avoid relying on them.

/**
 * @internal
 */


const vModelText = {
  beforeMount(el, {
    value,
    modifiers: {
      lazy,
      trim,
      number
    }
  }, vnode) {
    el.value = value;
    el._assign = getModelAssigner(vnode);
    const castToNumber = number || el.type === 'number';
    addEventListener(el, lazy ? 'change' : 'input', e => {
      if (e.target.composing) return;
      let domValue = el.value;

      if (trim) {
        domValue = domValue.trim();
      } else if (castToNumber) {
        domValue = toNumber(domValue);
      }

      el._assign(domValue);
    });

    if (trim) {
      addEventListener(el, 'change', () => {
        el.value = el.value.trim();
      });
    }

    if (!lazy) {
      addEventListener(el, 'compositionstart', onCompositionStart);
      addEventListener(el, 'compositionend', onCompositionEnd); // Safari < 10.2 & UIWebView doesn't fire compositionend when
      // switching focus before confirming composition choice
      // this also fixes the issue where some browsers e.g. iOS Chrome
      // fires "change" instead of "input" on autocomplete.

      addEventListener(el, 'change', onCompositionEnd);
    }
  },

  beforeUpdate(el, {
    value,
    oldValue,
    modifiers: {
      trim,
      number
    }
  }, vnode) {
    el._assign = getModelAssigner(vnode);

    if (value === oldValue) {
      return;
    }

    if (document.activeElement === el) {
      if (trim && el.value.trim() === value) {
        return;
      }

      if ((number || el.type === 'number') && toNumber(el.value) === value) {
        return;
      }
    }

    el.value = value;
  }

};
/**
 * @internal
 */

const vModelCheckbox = {
  beforeMount(el, binding, vnode) {
    setChecked(el, binding, vnode);
    el._assign = getModelAssigner(vnode);
    addEventListener(el, 'change', () => {
      const modelValue = el._modelValue;
      const elementValue = getValue(el);
      const checked = el.checked;
      const assign = el._assign;

      if (isArray(modelValue)) {
        const index = looseIndexOf(modelValue, elementValue);
        const found = index !== -1;

        if (checked && !found) {
          assign(modelValue.concat(elementValue));
        } else if (!checked && found) {
          const filtered = [...modelValue];
          filtered.splice(index, 1);
          assign(filtered);
        }
      } else {
        assign(getCheckboxValue(el, checked));
      }
    });
  },

  beforeUpdate(el, binding, vnode) {
    el._assign = getModelAssigner(vnode);
    setChecked(el, binding, vnode);
  }

};

function setChecked(el, {
  value,
  oldValue
}, vnode) {
  el._modelValue = value;

  if (isArray(value)) {
    el.checked = looseIndexOf(value, vnode.props.value) > -1;
  } else if (value !== oldValue) {
    el.checked = looseEqual(value, getCheckboxValue(el, true));
  }
}
/**
 * @internal
 */


const vModelRadio = {
  beforeMount(el, {
    value
  }, vnode) {
    el.checked = looseEqual(value, vnode.props.value);
    el._assign = getModelAssigner(vnode);
    addEventListener(el, 'change', () => {
      el._assign(getValue(el));
    });
  },

  beforeUpdate(el, {
    value,
    oldValue
  }, vnode) {
    el._assign = getModelAssigner(vnode);

    if (value !== oldValue) {
      el.checked = looseEqual(value, vnode.props.value);
    }
  }

};
/**
 * @internal
 */

const vModelSelect = {
  // use mounted & updated because <select> relies on its children <option>s.
  mounted(el, {
    value
  }, vnode) {
    setSelected(el, value);
    el._assign = getModelAssigner(vnode);
    addEventListener(el, 'change', () => {
      const selectedVal = Array.prototype.filter.call(el.options, o => o.selected).map(getValue);

      el._assign(el.multiple ? selectedVal : selectedVal[0]);
    });
  },

  beforeUpdate(el, _binding, vnode) {
    el._assign = getModelAssigner(vnode);
  },

  updated(el, {
    value
  }) {
    setSelected(el, value);
  }

};

function setSelected(el, value) {
  const isMultiple = el.multiple;

  if (isMultiple && !isArray(value)) {
    return;
  }

  for (let i = 0, l = el.options.length; i < l; i++) {
    const option = el.options[i];
    const optionValue = getValue(option);

    if (isMultiple) {
      option.selected = looseIndexOf(value, optionValue) > -1;
    } else {
      if (looseEqual(getValue(option), value)) {
        el.selectedIndex = i;
        return;
      }
    }
  }

  if (!isMultiple) {
    el.selectedIndex = -1;
  }
} // retrieve raw value set via :value bindings


function getValue(el) {
  return '_value' in el ? el._value : el.value;
} // retrieve raw value for true-value and false-value set via :true-value or :false-value bindings


function getCheckboxValue(el, checked) {
  const key = checked ? '_trueValue' : '_falseValue';
  return key in el ? el[key] : checked;
}
/**
 * @internal
 */


const vModelDynamic = {
  beforeMount(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, 'beforeMount');
  },

  mounted(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, 'mounted');
  },

  beforeUpdate(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, 'beforeUpdate');
  },

  updated(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, 'updated');
  }

};

function callModelHook(el, binding, vnode, prevVNode, hook) {
  let modelToUse;

  switch (el.tagName) {
    case 'SELECT':
      modelToUse = vModelSelect;
      break;

    case 'TEXTAREA':
      modelToUse = vModelText;
      break;

    default:
      switch (el.type) {
        case 'checkbox':
          modelToUse = vModelCheckbox;
          break;

        case 'radio':
          modelToUse = vModelRadio;
          break;

        default:
          modelToUse = vModelText;
      }

  }

  const fn = modelToUse[hook];
  fn && fn(el, binding, vnode, prevVNode);
}

const systemModifiers = ['ctrl', 'shift', 'alt', 'meta'];
const modifierGuards = {
  stop: e => e.stopPropagation(),
  prevent: e => e.preventDefault(),
  self: e => e.target !== e.currentTarget,
  ctrl: e => !e.ctrlKey,
  shift: e => !e.shiftKey,
  alt: e => !e.altKey,
  meta: e => !e.metaKey,
  left: e => 'button' in e && e.button !== 0,
  middle: e => 'button' in e && e.button !== 1,
  right: e => 'button' in e && e.button !== 2,
  exact: (e, modifiers) => systemModifiers.some(m => e[`${m}Key`] && !modifiers.includes(m))
};
/**
 * @internal
 */

const withModifiers = (fn, modifiers) => {
  return (event, ...args) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]];
      if (guard && guard(event, modifiers)) return;
    }

    return fn(event, ...args);
  };
}; // Kept for 2.x compat.
// Note: IE11 compat for `spacebar` and `del` is removed for now.


const keyNames = {
  esc: 'escape',
  space: ' ',
  up: 'arrow-up',
  left: 'arrow-left',
  right: 'arrow-right',
  down: 'arrow-down',
  delete: 'backspace'
};
/**
 * @internal
 */

const withKeys = (fn, modifiers) => {
  return event => {
    if (!('key' in event)) return;
    const eventKey = hyphenate(event.key);

    if ( // None of the provided key modifiers match the current event key
    !modifiers.some(k => k === eventKey || keyNames[k] === eventKey)) {
      return;
    }

    return fn(event);
  };
};
/**
 * @internal
 */


const vShow = {
  beforeMount(el, {
    value
  }, {
    transition
  }) {
    el._vod = el.style.display === 'none' ? '' : el.style.display;

    if (transition && value) {
      transition.beforeEnter(el);
    } else {
      setDisplay(el, value);
    }
  },

  mounted(el, {
    value
  }, {
    transition
  }) {
    if (transition && value) {
      transition.enter(el);
    }
  },

  updated(el, {
    value,
    oldValue
  }, {
    transition
  }) {
    if (!value === !oldValue) return;

    if (transition) {
      if (value) {
        transition.beforeEnter(el);
        setDisplay(el, true);
        transition.enter(el);
      } else {
        transition.leave(el, () => {
          setDisplay(el, false);
        });
      }
    } else {
      setDisplay(el, value);
    }
  },

  beforeUnmount(el) {
    setDisplay(el, true);
  }

};

function setDisplay(el, value) {
  el.style.display = value ? el._vod : 'none';
}

const rendererOptions = {
  patchProp,
  ...nodeOps
}; // lazy create the renderer - this makes core renderer logic tree-shakable
// in case the user only imports reactivity utilities from Vue.

let renderer;
let enabledHydration = false;

function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}

function ensureHydrationRenderer() {
  renderer = enabledHydration ? renderer : createHydrationRenderer(rendererOptions);
  enabledHydration = true;
  return renderer;
} // use explicit type casts here to avoid import() calls in rolled-up d.ts


const render = (...args) => {
  ensureRenderer().render(...args);
};

const hydrate = (...args) => {
  ensureHydrationRenderer().hydrate(...args);
};

const createApp = (...args) => {
  const app = ensureRenderer().createApp(...args);
  const {
    mount
  } = app;

  app.mount = containerOrSelector => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app._component;

    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    } // clear content before mounting


    container.innerHTML = '';
    const proxy = mount(container);
    container.removeAttribute('v-cloak');
    return proxy;
  };

  return app;
};

const createSSRApp = (...args) => {
  const app = ensureHydrationRenderer().createApp(...args);
  const {
    mount
  } = app;

  app.mount = containerOrSelector => {
    const container = normalizeContainer(containerOrSelector);

    if (container) {
      return mount(container, true);
    }
  };

  return app;
};

function normalizeContainer(container) {
  if (isString(container)) {
    const res = document.querySelector(container);
    return res;
  }

  return container;
}

export { Transition, TransitionGroup, createApp, createSSRApp, hydrate, render, vModelCheckbox, vModelDynamic, vModelRadio, vModelSelect, vModelText, vShow, withKeys, withModifiers };
export default null;