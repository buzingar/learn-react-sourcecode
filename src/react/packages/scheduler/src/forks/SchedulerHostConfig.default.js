/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  enableIsInputPending,
  requestIdleCallbackBeforeFirstFrame as requestIdleCallbackBeforeFirstFrameFlag,
  requestTimerEventBeforeFirstFrame,
  enableMessageLoopImplementation,
} from '../SchedulerFeatureFlags';

// The DOM Scheduler implementation is similar to requestIdleCallback. It
// works by scheduling a requestAnimationFrame, storing the time for the start
// of the frame, then scheduling a postMessage which gets scheduled after paint.
// Within the postMessage handler do as much work as possible until time + frame
// rate. By separating the idle call into a separate event tick we ensure that
// layout, paint and other browser work is counted against the available time.
// The frame rate is dynamically adjusted.

// TODOS requestAnimationFrame + 计算帧时间及下一帧时间 + MessageChannel 就是我们实现 requestIdleCallback 的三个关键点了。

export let requestHostCallback;
export let cancelHostCallback;
export let requestHostTimeout;
export let cancelHostTimeout;
export let shouldYieldToHost;
export let requestPaint;
export let getCurrentTime;
export let forceFrameRate;

if (
  // If Scheduler runs in a non-DOM environment, it falls back to a naive
  // implementation using setTimeout.
  typeof window === 'undefined' ||
  // Check if MessageChannel is supported, too.
  typeof MessageChannel !== 'function'
) {
  // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
  // fallback to a naive implementation.
  let _callback = null;
  let _timeoutID = null;
  const _flushCallback = function() {
    if (_callback !== null) {
      try {
        const currentTime = getCurrentTime();
        const hasRemainingTime = true;
        _callback(hasRemainingTime, currentTime);
        _callback = null;
      } catch (e) {
        setTimeout(_flushCallback, 0);
        throw e;
      }
    }
  };
  // TODOS 13-5
  const initialTime = Date.now();
  getCurrentTime = function() {
    return Date.now() - initialTime;
  };
  requestHostCallback = function(cb) {
    if (_callback !== null) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, 0);
    }
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  requestHostTimeout = function(cb, ms) {
    _timeoutID = setTimeout(cb, ms);
  };
  cancelHostTimeout = function() {
    clearTimeout(_timeoutID);
  };
  shouldYieldToHost = function() {
    return false;
  };
  requestPaint = forceFrameRate = function() {};
} else {
  // 首先每个任务都会有各自的优先级，通过当前时间加上优先级所对应的常量我们可以计算出 expriationTime，高优先级的任务会打断低优先级任务
  // 在调度之前，判断当前任务是否过期，过期的话无须调度，直接调用 port.postMessage(undefined)，这样就能在渲染后马上执行过期任务了
  // 如果任务没有过期，就通过 requestAnimationFrame 启动定时器，在重绘前调用回调方法
  // 在回调方法中我们首先需要计算每一帧的时间以及下一帧的时间，然后执行 port.postMessage(undefined)
  // channel.port1.onmessage 会在渲染后被调用，在这个过程中我们首先需要去判断当前时间是否小于下一帧时间。
  // 如果小于的话就代表我们尚有空余时间去执行任务；
  // 如果大于的话就代表当前帧已经没有空闲时间了，这时候我们需要去判断是否有任务过期，过期的话不管三七二十一还是得去执行这个任务。
  // 如果没有过期的话，那就只能把这个任务丢到下一帧看能不能执行了
  // Capture local references to native APIs, in case a polyfill overrides them.
  const performance = window.performance;
  const Date = window.Date;
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;
  const requestAnimationFrame = window.requestAnimationFrame;
  const cancelAnimationFrame = window.cancelAnimationFrame;
  const requestIdleCallback = window.requestIdleCallback;

  if (typeof console !== 'undefined') {
    // TODO: Remove fb.me link
    if (typeof requestAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
    if (typeof cancelAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
  }

  const requestIdleCallbackBeforeFirstFrame =
    requestIdleCallbackBeforeFirstFrameFlag &&
    typeof requestIdleCallback === 'function' &&
    typeof cancelIdleCallback === 'function';

  if (
    typeof performance === 'object' &&
    typeof performance.now === 'function'
  ) {
    getCurrentTime = () => performance.now();
  } else {
    const initialTime = Date.now();
    getCurrentTime = () => Date.now() - initialTime;
  }

  let isRAFLoopRunning = false;
  let isMessageLoopRunning = false;
  let scheduledHostCallback = null;
  let rAFTimeoutID = -1;
  let taskTimeoutID = -1;

  let frameLength = enableMessageLoopImplementation
    ? // We won't attempt to align with the vsync. Instead we'll yield multiple
      // times per frame, often enough to keep it responsive even at really
      // high frame rates > 120.
      5
    : // Use a heuristic to measure the frame rate and yield at the end of the
      // frame. We start out assuming that we run at 30fps but then the
      // heuristic tracking will adjust this value to a faster fps if we get
      // more frequent animation frames.
      33.33;

  let prevRAFTime = -1;
  let prevRAFInterval = -1;
  let frameDeadline = 0;

  let fpsLocked = false;

  // TODO: Make this configurable
  // TODO: Adjust this based on priority?
  let maxFrameLength = 300;
  let needsPaint = false;

  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    const scheduling = navigator.scheduling;
    shouldYieldToHost = function() {
      const currentTime = getCurrentTime();
      if (currentTime >= frameDeadline) {
        // There's no time left in the frame. We may want to yield control of
        // the main thread, so the browser can perform high priority tasks. The
        // main ones are painting and user input. If there's a pending paint or
        // a pending input, then we should yield. But if there's neither, then
        // we can yield less often while remaining responsive. We'll eventually
        // yield regardless, since there could be a pending paint that wasn't
        // accompanied by a call to `requestPaint`, or other main thread tasks
        // like network events.
        if (needsPaint || scheduling.isInputPending()) {
          // There is either a pending paint or a pending input.
          return true;
        }
        // There's no pending input. Only yield if we've reached the max
        // frame length.
        return currentTime >= frameDeadline + maxFrameLength;
      } else {
        // There's still time left in the frame.
        return false;
      }
    };

    requestPaint = function() {
      needsPaint = true;
    };
  } else {
    // `isInputPending` is not available. Since we have no way of knowing if
    // there's pending input, always yield at the end of the frame.
    shouldYieldToHost = function() {
      return getCurrentTime() >= frameDeadline;
    };

    // Since we yield every frame regardless, `requestPaint` has no effect.
    requestPaint = function() {};
  }

  forceFrameRate = function(fps) {
    if (fps < 0 || fps > 125) {
      console.error(
        'forceFrameRate takes a positive int between 0 and 125, ' +
          'forcing framerates higher than 125 fps is not unsupported',
      );
      return;
    }
    if (fps > 0) {
      frameLength = Math.floor(1000 / fps);
      fpsLocked = true;
    } else {
      // reset the framerate
      frameLength = 33.33;
      fpsLocked = false;
    }
  };

  const performWorkUntilDeadline = () => {
    if (enableMessageLoopImplementation) {
      if (scheduledHostCallback !== null) {
        const currentTime = getCurrentTime();
        // Yield after `frameLength` ms, regardless of where we are in the vsync
        // cycle. This means there's always time remaining at the beginning of
        // the message event.
        frameDeadline = currentTime + frameLength;
        const hasTimeRemaining = true;
        try {
          const hasMoreWork = scheduledHostCallback(
            hasTimeRemaining,
            currentTime,
          );
          if (!hasMoreWork) {
            isMessageLoopRunning = false;
            scheduledHostCallback = null;
          } else {
            // If there's more work, schedule the next message event at the end
            // of the preceding one.
            port.postMessage(null);
          }
        } catch (error) {
          // If a scheduler task throws, exit the current browser task so the
          // error can be observed.
          port.postMessage(null);
          throw error;
        }
      } else {
        isMessageLoopRunning = false;
      }
      // Yielding to the browser will give it a chance to paint, so we can
      // reset this.
      needsPaint = false;
    } else {
      if (scheduledHostCallback !== null) {
        const currentTime = getCurrentTime();
        const hasTimeRemaining = frameDeadline - currentTime > 0;
        try {
          const hasMoreWork = scheduledHostCallback(
            hasTimeRemaining,
            currentTime,
          );
          if (!hasMoreWork) {
            scheduledHostCallback = null;
          }
        } catch (error) {
          // If a scheduler task throws, exit the current browser task so the
          // error can be observed, and post a new task as soon as possible
          // so we can continue where we left off.
          port.postMessage(null);
          throw error;
        }
      }
      // Yielding to the browser will give it a chance to paint, so we can
      // reset this.
      needsPaint = false;
    }
  };

  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  const onAnimationFrame = rAFTime => {
    if (scheduledHostCallback === null) {
      // No scheduled work. Exit.
      prevRAFTime = -1;
      prevRAFInterval = -1;
      isRAFLoopRunning = false;
      return;
    }

    // Eagerly schedule the next animation callback at the beginning of the
    // frame. If the scheduler queue is not empty at the end of the frame, it
    // will continue flushing inside that callback. If the queue *is* empty,
    // then it will exit immediately. Posting the callback at the start of the
    // frame ensures it's fired within the earliest possible frame. If we
    // waited until the end of the frame to post the callback, we risk the
    // browser skipping a frame and not firing the callback until the frame
    // after that.
    isRAFLoopRunning = true;
    requestAnimationFrame(nextRAFTime => {
      clearTimeout(rAFTimeoutID);
      onAnimationFrame(nextRAFTime);
    });

    // requestAnimationFrame is throttled when the tab is backgrounded. We
    // don't want to stop working entirely. So we'll fallback to a timeout loop.
    // TODO: Need a better heuristic for backgrounded work.
    const onTimeout = () => {
      frameDeadline = getCurrentTime() + frameLength / 2;
      performWorkUntilDeadline();
      rAFTimeoutID = setTimeout(onTimeout, frameLength * 3);
    };
    rAFTimeoutID = setTimeout(onTimeout, frameLength * 3);

    if (
      prevRAFTime !== -1 &&
      // Make sure this rAF time is different from the previous one. This check
      // could fail if two rAFs fire in the same frame.
      rAFTime - prevRAFTime > 0.1
    ) {
      const rAFInterval = rAFTime - prevRAFTime;
      if (!fpsLocked && prevRAFInterval !== -1) {
        // We've observed two consecutive frame intervals. We'll use this to
        // dynamically adjust the frame rate.
        //
        // If one frame goes long, then the next one can be short to catch up.
        // If two frames are short in a row, then that's an indication that we
        // actually have a higher frame rate than what we're currently
        // optimizing. For example, if we're running on 120hz display or 90hz VR
        // display. Take the max of the two in case one of them was an anomaly
        // due to missed frame deadlines.
        if (rAFInterval < frameLength && prevRAFInterval < frameLength) {
          frameLength =
            rAFInterval < prevRAFInterval ? prevRAFInterval : rAFInterval;
          if (frameLength < 8.33) {
            // Defensive coding. We don't support higher frame rates than 120hz.
            // If the calculated frame length gets lower than 8, it is probably
            // a bug.
            frameLength = 8.33;
          }
        }
      }
      prevRAFInterval = rAFInterval;
    }
    prevRAFTime = rAFTime;
    frameDeadline = rAFTime + frameLength;

    // We use the postMessage trick to defer idle work until after the repaint.
    port.postMessage(null);
  };

  requestHostCallback = function(callback) {
    scheduledHostCallback = callback;
    if (enableMessageLoopImplementation) {
      if (!isMessageLoopRunning) {
        isMessageLoopRunning = true;
        port.postMessage(null);
      }
    } else {
      if (!isRAFLoopRunning) {
        // Start a rAF loop.
        isRAFLoopRunning = true;
        requestAnimationFrame(rAFTime => {
          if (requestIdleCallbackBeforeFirstFrame) {
            cancelIdleCallback(idleCallbackID);
          }
          if (requestTimerEventBeforeFirstFrame) {
            clearTimeout(idleTimeoutID);
          }
          onAnimationFrame(rAFTime);
        });

        // If we just missed the last vsync, the next rAF might not happen for
        // another frame. To claim as much idle time as possible, post a
        // callback with `requestIdleCallback`, which should fire if there's
        // idle time left in the frame.
        //
        // This should only be an issue for the first rAF in the loop;
        // subsequent rAFs are scheduled at the beginning of the
        // preceding frame.
        let idleCallbackID;
        if (requestIdleCallbackBeforeFirstFrame) {
          idleCallbackID = requestIdleCallback(
            function onIdleCallbackBeforeFirstFrame() {
              if (requestTimerEventBeforeFirstFrame) {
                clearTimeout(idleTimeoutID);
              }
              frameDeadline = getCurrentTime() + frameLength;
              performWorkUntilDeadline();
            },
          );
        }
        // Alternate strategy to address the same problem. Scheduler a timer
        // with no delay. If this fires before the rAF, that likely indicates
        // that there's idle time before the next vsync. This isn't always the
        // case, but we'll be aggressive and assume it is, as a trade off to
        // prevent idle periods.
        let idleTimeoutID;
        if (requestTimerEventBeforeFirstFrame) {
          idleTimeoutID = setTimeout(function onTimerEventBeforeFirstFrame() {
            if (requestIdleCallbackBeforeFirstFrame) {
              cancelIdleCallback(idleCallbackID);
            }
            frameDeadline = getCurrentTime() + frameLength;
            performWorkUntilDeadline();
          }, 0);
        }
      }
    }
  };

  cancelHostCallback = function() {
    scheduledHostCallback = null;
  };

  requestHostTimeout = function(callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };

  cancelHostTimeout = function() {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
}
