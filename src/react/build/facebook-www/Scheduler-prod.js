/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noflow
 * @preventMunge
 * @preserve-invariant-messages
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: !0 });
var firstCallbackNode = null,
  currentDidTimeout = !1,
  currentPriorityLevel = 3,
  currentEventStartTime = -1,
  currentExpirationTime = -1,
  isExecutingCallback = !1,
  isHostCallbackScheduled = !1;
function ensureHostCallbackIsScheduled() {
  if (!isExecutingCallback) {
    var expirationTime = firstCallbackNode.expirationTime;
    isHostCallbackScheduled
      ? cancelHostCallback()
      : (isHostCallbackScheduled = !0);
    requestHostCallback(flushWork, expirationTime);
  }
}
function flushFirstCallback() {
  var flushedNode = firstCallbackNode,
    next = firstCallbackNode.next;
  if (firstCallbackNode === next) firstCallbackNode = null;
  else {
    var lastCallbackNode = firstCallbackNode.previous;
    firstCallbackNode = lastCallbackNode.next = next;
    next.previous = lastCallbackNode;
  }
  flushedNode.next = flushedNode.previous = null;
  lastCallbackNode = flushedNode.callback;
  next = flushedNode.expirationTime;
  flushedNode = flushedNode.priorityLevel;
  var previousPriorityLevel = currentPriorityLevel,
    previousExpirationTime = currentExpirationTime;
  currentPriorityLevel = flushedNode;
  currentExpirationTime = next;
  try {
    var continuationCallback = lastCallbackNode();
  } finally {
    (currentPriorityLevel = previousPriorityLevel),
      (currentExpirationTime = previousExpirationTime);
  }
  if ("function" === typeof continuationCallback)
    if (
      ((continuationCallback = {
        callback: continuationCallback,
        priorityLevel: flushedNode,
        expirationTime: next,
        next: null,
        previous: null
      }),
      null === firstCallbackNode)
    )
      firstCallbackNode = continuationCallback.next = continuationCallback.previous = continuationCallback;
    else {
      lastCallbackNode = null;
      flushedNode = firstCallbackNode;
      do {
        if (flushedNode.expirationTime >= next) {
          lastCallbackNode = flushedNode;
          break;
        }
        flushedNode = flushedNode.next;
      } while (flushedNode !== firstCallbackNode);
      null === lastCallbackNode
        ? (lastCallbackNode = firstCallbackNode)
        : lastCallbackNode === firstCallbackNode &&
          ((firstCallbackNode = continuationCallback),
          ensureHostCallbackIsScheduled());
      next = lastCallbackNode.previous;
      next.next = lastCallbackNode.previous = continuationCallback;
      continuationCallback.next = lastCallbackNode;
      continuationCallback.previous = next;
    }
}
function flushImmediateWork() {
  if (
    -1 === currentEventStartTime &&
    null !== firstCallbackNode &&
    1 === firstCallbackNode.priorityLevel
  ) {
    isExecutingCallback = !0;
    try {
      do flushFirstCallback();
      while (
        null !== firstCallbackNode &&
        1 === firstCallbackNode.priorityLevel
      );
    } finally {
      (isExecutingCallback = !1),
        null !== firstCallbackNode
          ? ensureHostCallbackIsScheduled()
          : (isHostCallbackScheduled = !1);
    }
  }
}
function flushWork(didTimeout) {
  isExecutingCallback = !0;
  var previousDidTimeout = currentDidTimeout;
  currentDidTimeout = didTimeout;
  try {
    if (didTimeout)
      for (; null !== firstCallbackNode; ) {
        var currentTime = exports.unstable_now();
        if (firstCallbackNode.expirationTime <= currentTime) {
          do flushFirstCallback();
          while (
            null !== firstCallbackNode &&
            firstCallbackNode.expirationTime <= currentTime
          );
        } else break;
      }
    else if (null !== firstCallbackNode) {
      do flushFirstCallback();
      while (null !== firstCallbackNode && !shouldYieldToHost());
    }
  } finally {
    (isExecutingCallback = !1),
      (currentDidTimeout = previousDidTimeout),
      null !== firstCallbackNode
        ? ensureHostCallbackIsScheduled()
        : (isHostCallbackScheduled = !1),
      flushImmediateWork();
  }
}
var localDate = Date,
  localSetTimeout = "function" === typeof setTimeout ? setTimeout : void 0,
  localClearTimeout =
    "function" === typeof clearTimeout ? clearTimeout : void 0,
  localRequestAnimationFrame =
    "function" === typeof requestAnimationFrame
      ? requestAnimationFrame
      : void 0,
  localCancelAnimationFrame =
    "function" === typeof cancelAnimationFrame ? cancelAnimationFrame : void 0,
  rAFID,
  rAFTimeoutID;
function requestAnimationFrameWithTimeout(callback) {
  rAFID = localRequestAnimationFrame(function(timestamp) {
    localClearTimeout(rAFTimeoutID);
    callback(timestamp);
  });
  rAFTimeoutID = localSetTimeout(function() {
    localCancelAnimationFrame(rAFID);
    callback(exports.unstable_now());
  }, 100);
}
if ("object" === typeof performance && "function" === typeof performance.now) {
  var Performance = performance;
  exports.unstable_now = function() {
    return Performance.now();
  };
} else
  exports.unstable_now = function() {
    return localDate.now();
  };
var requestHostCallback, cancelHostCallback, shouldYieldToHost;
if ("undefined" !== typeof window && window._schedMock) {
  var impl = window._schedMock;
  requestHostCallback = impl[0];
  cancelHostCallback = impl[1];
  shouldYieldToHost = impl[2];
} else if (
  "undefined" === typeof window ||
  "function" !== typeof window.addEventListener
) {
  var _callback = null,
    _currentTime = -1,
    _flushCallback = function(didTimeout, ms) {
      if (null !== _callback) {
        var cb = _callback;
        _callback = null;
        try {
          (_currentTime = ms), cb(didTimeout);
        } finally {
          _currentTime = -1;
        }
      }
    };
  requestHostCallback = function(cb, ms) {
    -1 !== _currentTime
      ? setTimeout(requestHostCallback, 0, cb, ms)
      : ((_callback = cb),
        setTimeout(_flushCallback, ms, !0, ms),
        setTimeout(_flushCallback, 1073741823, !1, 1073741823));
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  shouldYieldToHost = function() {
    return !1;
  };
  exports.unstable_now = function() {
    return -1 === _currentTime ? 0 : _currentTime;
  };
} else {
  "undefined" !== typeof console &&
    ("function" !== typeof localRequestAnimationFrame &&
      console.error(
        "This browser doesn't support requestAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills"
      ),
    "function" !== typeof localCancelAnimationFrame &&
      console.error(
        "This browser doesn't support cancelAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills"
      ));
  var scheduledHostCallback = null,
    isMessageEventScheduled = !1,
    timeoutTime = -1,
    isAnimationFrameScheduled = !1,
    isFlushingHostCallback = !1,
    frameDeadline = 0,
    previousFrameTime = 33,
    activeFrameTime = 33;
  shouldYieldToHost = function() {
    return frameDeadline <= exports.unstable_now();
  };
  var messageKey =
    "__reactIdleCallback$" +
    Math.random()
      .toString(36)
      .slice(2);
  window.addEventListener(
    "message",
    function(event) {
      if (event.source === window && event.data === messageKey) {
        isMessageEventScheduled = !1;
        event = scheduledHostCallback;
        var prevTimeoutTime = timeoutTime;
        scheduledHostCallback = null;
        timeoutTime = -1;
        var currentTime = exports.unstable_now(),
          didTimeout = !1;
        if (0 >= frameDeadline - currentTime)
          if (-1 !== prevTimeoutTime && prevTimeoutTime <= currentTime)
            didTimeout = !0;
          else {
            isAnimationFrameScheduled ||
              ((isAnimationFrameScheduled = !0),
              requestAnimationFrameWithTimeout(animationTick));
            scheduledHostCallback = event;
            timeoutTime = prevTimeoutTime;
            return;
          }
        if (null !== event) {
          isFlushingHostCallback = !0;
          try {
            event(didTimeout);
          } finally {
            isFlushingHostCallback = !1;
          }
        }
      }
    },
    !1
  );
  var animationTick = function(rafTime) {
    if (null !== scheduledHostCallback) {
      requestAnimationFrameWithTimeout(animationTick);
      var nextFrameTime = rafTime - frameDeadline + activeFrameTime;
      nextFrameTime < activeFrameTime && previousFrameTime < activeFrameTime
        ? (8 > nextFrameTime && (nextFrameTime = 8),
          (activeFrameTime =
            nextFrameTime < previousFrameTime
              ? previousFrameTime
              : nextFrameTime))
        : (previousFrameTime = nextFrameTime);
      frameDeadline = rafTime + activeFrameTime;
      isMessageEventScheduled ||
        ((isMessageEventScheduled = !0), window.postMessage(messageKey, "*"));
    } else isAnimationFrameScheduled = !1;
  };
  requestHostCallback = function(callback, absoluteTimeout) {
    scheduledHostCallback = callback;
    timeoutTime = absoluteTimeout;
    isFlushingHostCallback || 0 > absoluteTimeout
      ? window.postMessage(messageKey, "*")
      : isAnimationFrameScheduled ||
        ((isAnimationFrameScheduled = !0),
        requestAnimationFrameWithTimeout(animationTick));
  };
  cancelHostCallback = function() {
    scheduledHostCallback = null;
    isMessageEventScheduled = !1;
    timeoutTime = -1;
  };
}
exports.unstable_ImmediatePriority = 1;
exports.unstable_UserBlockingPriority = 2;
exports.unstable_NormalPriority = 3;
exports.unstable_IdlePriority = 5;
exports.unstable_LowPriority = 4;
exports.unstable_runWithPriority = function(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      break;
    default:
      priorityLevel = 3;
  }
  var previousPriorityLevel = currentPriorityLevel,
    previousEventStartTime = currentEventStartTime;
  currentPriorityLevel = priorityLevel;
  currentEventStartTime = exports.unstable_now();
  try {
    return eventHandler();
  } finally {
    (currentPriorityLevel = previousPriorityLevel),
      (currentEventStartTime = previousEventStartTime),
      flushImmediateWork();
  }
};
exports.unstable_scheduleCallback = function(callback, deprecated_options) {
  var startTime =
    -1 !== currentEventStartTime
      ? currentEventStartTime
      : exports.unstable_now();
  if (
    "object" === typeof deprecated_options &&
    null !== deprecated_options &&
    "number" === typeof deprecated_options.timeout
  )
    deprecated_options = startTime + deprecated_options.timeout;
  else
    switch (currentPriorityLevel) {
      case 1:
        deprecated_options = startTime + -1;
        break;
      case 2:
        deprecated_options = startTime + 250;
        break;
      case 5:
        deprecated_options = startTime + 1073741823;
        break;
      case 4:
        deprecated_options = startTime + 1e4;
        break;
      default:
        deprecated_options = startTime + 5e3;
    }
  callback = {
    callback: callback,
    priorityLevel: currentPriorityLevel,
    expirationTime: deprecated_options,
    next: null,
    previous: null
  };
  if (null === firstCallbackNode)
    (firstCallbackNode = callback.next = callback.previous = callback),
      ensureHostCallbackIsScheduled();
  else {
    startTime = null;
    var node = firstCallbackNode;
    do {
      if (node.expirationTime > deprecated_options) {
        startTime = node;
        break;
      }
      node = node.next;
    } while (node !== firstCallbackNode);
    null === startTime
      ? (startTime = firstCallbackNode)
      : startTime === firstCallbackNode &&
        ((firstCallbackNode = callback), ensureHostCallbackIsScheduled());
    deprecated_options = startTime.previous;
    deprecated_options.next = startTime.previous = callback;
    callback.next = startTime;
    callback.previous = deprecated_options;
  }
  return callback;
};
exports.unstable_cancelCallback = function(callbackNode) {
  var next = callbackNode.next;
  if (null !== next) {
    if (next === callbackNode) firstCallbackNode = null;
    else {
      callbackNode === firstCallbackNode && (firstCallbackNode = next);
      var previous = callbackNode.previous;
      previous.next = next;
      next.previous = previous;
    }
    callbackNode.next = callbackNode.previous = null;
  }
};
exports.unstable_wrapCallback = function(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    var previousPriorityLevel = currentPriorityLevel,
      previousEventStartTime = currentEventStartTime;
    currentPriorityLevel = parentPriorityLevel;
    currentEventStartTime = exports.unstable_now();
    try {
      return callback.apply(this, arguments);
    } finally {
      (currentPriorityLevel = previousPriorityLevel),
        (currentEventStartTime = previousEventStartTime),
        flushImmediateWork();
    }
  };
};
exports.unstable_getCurrentPriorityLevel = function() {
  return currentPriorityLevel;
};
exports.unstable_shouldYield = function() {
  return (
    !currentDidTimeout &&
    ((null !== firstCallbackNode &&
      firstCallbackNode.expirationTime < currentExpirationTime) ||
      shouldYieldToHost())
  );
};
