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

'use strict';

if (__DEV__) {
  (function() {
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

var React = require("react");
var scheduler = require("scheduler");

var warningWithoutStack = require("warning");

function createLRU(limit) {
  var LIMIT = limit;

  // Circular, doubly-linked list
  var first = null;
  var size = 0;

  var cleanUpIsScheduled = false;

  function scheduleCleanUp() {
    if (cleanUpIsScheduled === false && size > LIMIT) {
      // The cache size exceeds the limit. Schedule a callback to delete the
      // least recently used entries.
      cleanUpIsScheduled = true;
      scheduler.unstable_scheduleCallback(cleanUp);
    }
  }

  function cleanUp() {
    cleanUpIsScheduled = false;
    deleteLeastRecentlyUsedEntries(LIMIT);
  }

  function deleteLeastRecentlyUsedEntries(targetSize) {
    // Delete entries from the cache, starting from the end of the list.
    if (first !== null) {
      var resolvedFirst = first;
      var last = resolvedFirst.previous;
      while (size > targetSize && last !== null) {
        var _onDelete = last.onDelete;
        var _previous = last.previous;
        last.onDelete = null;

        // Remove from the list
        last.previous = last.next = null;
        if (last === first) {
          // Reached the head of the list.
          first = last = null;
        } else {
          first.previous = _previous;
          _previous.next = first;
          last = _previous;
        }

        size -= 1;

        // Call the destroy method after removing the entry from the list. If it
        // throws, the rest of cache will not be deleted, but it will be in a
        // valid state.
        _onDelete();
      }
    }
  }

  function add(value, onDelete) {
    var entry = {
      value: value,
      onDelete: onDelete,
      next: null,
      previous: null
    };
    if (first === null) {
      entry.previous = entry.next = entry;
      first = entry;
    } else {
      // Append to head
      var last = first.previous;
      last.next = entry;
      entry.previous = last;

      first.previous = entry;
      entry.next = first;

      first = entry;
    }
    size += 1;
    return entry;
  }

  function update(entry, newValue) {
    entry.value = newValue;
  }

  function access(entry) {
    var next = entry.next;
    if (next !== null) {
      // Entry already cached
      var resolvedFirst = first;
      if (first !== entry) {
        // Remove from current position
        var _previous2 = entry.previous;
        _previous2.next = next;
        next.previous = _previous2;

        // Append to head
        var last = resolvedFirst.previous;
        last.next = entry;
        entry.previous = last;

        resolvedFirst.previous = entry;
        entry.next = resolvedFirst;

        first = entry;
      }
    } else {
      // Cannot access a deleted entry
      // TODO: Error? Warning?
    }
    scheduleCleanUp();
    return entry.value;
  }

  function setLimit(newLimit) {
    LIMIT = newLimit;
    scheduleCleanUp();
  }

  return {
    add: add,
    update: update,
    access: access,
    setLimit: setLimit
  };
}

var Pending = 0;
var Resolved = 1;
var Rejected = 2;

var currentOwner =
  React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;

function readContext(Context, observedBits) {
  var dispatcher = currentOwner.currentDispatcher;
  if (dispatcher === null) {
    throw new Error(
      "react-cache: read and preload may only be called from within a " +
        "component's render. They are not supported in event handlers or " +
        "lifecycle methods."
    );
  }
  return dispatcher.readContext(Context, observedBits);
}

function identityHashFn(input) {
  {
    !(
      typeof input === "string" ||
      typeof input === "number" ||
      typeof input === "boolean" ||
      input === undefined ||
      input === null
    )
      ? warningWithoutStack(
          false,
          "Invalid key type. Expected a string, number, symbol, or boolean, " +
            "but instead received: %s" +
            "\n\nTo use non-primitive values as keys, you must pass a hash " +
            "function as the second argument to createResource().",
          input
        )
      : void 0;
  }
  return input;
}

var CACHE_LIMIT = 500;
var lru = createLRU(CACHE_LIMIT);

var entries = new Map();

var CacheContext = React.createContext(null);

function accessResult(resource, fetch, input, key) {
  var entriesForResource = entries.get(resource);
  if (entriesForResource === undefined) {
    entriesForResource = new Map();
    entries.set(resource, entriesForResource);
  }
  var entry = entriesForResource.get(key);
  if (entry === undefined) {
    var thenable = fetch(input);
    thenable.then(
      function(value) {
        if (newResult.status === Pending) {
          var resolvedResult = newResult;
          resolvedResult.status = Resolved;
          resolvedResult.value = value;
        }
      },
      function(error) {
        if (newResult.status === Pending) {
          var rejectedResult = newResult;
          rejectedResult.status = Rejected;
          rejectedResult.value = error;
        }
      }
    );
    var newResult = {
      status: Pending,
      value: thenable
    };
    var newEntry = lru.add(newResult, deleteEntry.bind(null, resource, key));
    entriesForResource.set(key, newEntry);
    return newResult;
  } else {
    return lru.access(entry);
  }
}

function deleteEntry(resource, key) {
  var entriesForResource = entries.get(resource);
  if (entriesForResource !== undefined) {
    entriesForResource.delete(key);
    if (entriesForResource.size === 0) {
      entries.delete(resource);
    }
  }
}

function unstable_createResource(fetch, maybeHashInput) {
  var hashInput =
    maybeHashInput !== undefined ? maybeHashInput : identityHashFn;

  var resource = {
    read: function(input) {
      // react-cache currently doesn't rely on context, but it may in the
      // future, so we read anyway to prevent access outside of render.
      readContext(CacheContext);
      var key = hashInput(input);
      var result = accessResult(resource, fetch, input, key);
      switch (result.status) {
        case Pending: {
          var suspender = result.value;
          throw suspender;
        }
        case Resolved: {
          var _value = result.value;
          return _value;
        }
        case Rejected: {
          var error = result.value;
          throw error;
        }
        default:
          // Should be unreachable
          return undefined;
      }
    },
    preload: function(input) {
      // react-cache currently doesn't rely on context, but it may in the
      // future, so we read anyway to prevent access outside of render.
      readContext(CacheContext);
      var key = hashInput(input);
      accessResult(resource, fetch, input, key);
    }
  };
  return resource;
}

function unstable_setGlobalCacheLimit(limit) {
  lru.setLimit(limit);
}

exports.unstable_createResource = unstable_createResource;
exports.unstable_setGlobalCacheLimit = unstable_setGlobalCacheLimit;

  })();
}
