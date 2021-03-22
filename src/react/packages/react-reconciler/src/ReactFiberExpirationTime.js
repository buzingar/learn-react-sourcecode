/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactPriorityLevel} from './SchedulerWithReactIntegration';

import MAX_SIGNED_31_BIT_INT from './maxSigned31BitInt'; // 1073741823

import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  IdlePriority,
} from './SchedulerWithReactIntegration';

// 因为 expirationTime 指的就是一个任务的过期时间，
// React 根据任务的优先级和当前时间来计算出一个任务的执行截止时间。
// 只要这个值比当前时间大就可以一直让 React 延后这个任务的执行，以便让更高优先级的任务执行，
// 但是一旦过了任务的截止时间，就必须让这个任务马上执行。
export type ExpirationTime = number;

export const NoWork = 0;
export const Never = 1;
export const Sync = MAX_SIGNED_31_BIT_INT; // 1073741823，优先级最高，同步
export const Batched = Sync - 1;

const UNIT_SIZE = 10;
const MAGIC_NUMBER_OFFSET = Batched - 1; // Sync -2 = 1073741821

// 1 unit of expiration time represents 10ms.
export function msToExpirationTime(ms: number): ExpirationTime {
  // Always add an offset so that we don't clash with the magic number for NoWork.
  // 总是要添加一个偏移量，这样我们就不会与NoWork的魔法数字发生冲突。
  return MAGIC_NUMBER_OFFSET - ((ms / UNIT_SIZE) | 0); // | 0 作用是取整数, 11 / 10 | 0 = 1
}

export function expirationTimeToMs(expirationTime: ExpirationTime): number {
  return (MAGIC_NUMBER_OFFSET - expirationTime) * UNIT_SIZE;
}

// 在 ceiling 函数中的 1 * bucketSizeMs / UNIT_SIZE 是为了抹平一段时间内的时间差，
// 在抹平的时间差内不管有多少个任务需要执行，他们的过期时间都是同一个，这也算是一个性能优化，帮助渲染页面行为节流。
function ceiling(num: number, precision: number): number {
  return (((num / precision) | 0) + 1) * precision;
}

// TODOS computeExpirationBucket
function computeExpirationBucket(
  currentTime,
  expirationInMs,
  bucketSizeMs,
): ExpirationTime {
  return (
    MAGIC_NUMBER_OFFSET -
    ceiling(
      MAGIC_NUMBER_OFFSET - currentTime + expirationInMs / UNIT_SIZE,
      bucketSizeMs / UNIT_SIZE,
    )
  );
}

// TODO: This corresponds to Scheduler's NormalPriority, not LowPriority. Update
// the names to reflect.
export const LOW_PRIORITY_EXPIRATION = 5000;
export const LOW_PRIORITY_BATCH_SIZE = 250;

// TODOS computeAsyncExpiration
export function computeAsyncExpiration(
  currentTime: ExpirationTime,
): ExpirationTime {
  return computeExpirationBucket(
    currentTime,
    LOW_PRIORITY_EXPIRATION, // 2500
    LOW_PRIORITY_BATCH_SIZE, // 250
  );
}

export function computeSuspenseExpiration(
  currentTime: ExpirationTime,
  timeoutMs: number,
): ExpirationTime {
  // TODO: Should we warn if timeoutMs is lower than the normal pri expiration time?
  return computeExpirationBucket(
    currentTime,
    timeoutMs,
    LOW_PRIORITY_BATCH_SIZE,
  );
}

// We intentionally set a higher expiration time for interactive updates in
// dev than in production.
//
// If the main thread is being blocked so long that you hit the expiration,
// it's a problem that could be solved with better scheduling.
//
// People will be more likely to notice this and fix it with the long
// expiration time in development.
//
// In production we opt for better UX at the risk of masking scheduling
// problems, by expiring fast.
export const HIGH_PRIORITY_EXPIRATION = __DEV__ ? 500 : 150;
export const HIGH_PRIORITY_BATCH_SIZE = 100;

// TODOS computeInteractiveExpiration
export function computeInteractiveExpiration(currentTime: ExpirationTime) {
  return computeExpirationBucket(
    currentTime,
    HIGH_PRIORITY_EXPIRATION, // 150
    HIGH_PRIORITY_BATCH_SIZE, // 100
  );
}

export function inferPriorityFromExpirationTime(
  currentTime: ExpirationTime,
  expirationTime: ExpirationTime,
): ReactPriorityLevel {
  if (expirationTime === Sync) {
    return ImmediatePriority;
  }
  if (expirationTime === Never) {
    return IdlePriority;
  }
  const msUntil =
    expirationTimeToMs(expirationTime) - expirationTimeToMs(currentTime);
  if (msUntil <= 0) {
    return ImmediatePriority;
  }
  if (msUntil <= HIGH_PRIORITY_EXPIRATION + HIGH_PRIORITY_BATCH_SIZE) {
    return UserBlockingPriority;
  }
  if (msUntil <= LOW_PRIORITY_EXPIRATION + LOW_PRIORITY_BATCH_SIZE) {
    return NormalPriority;
  }

  // TODO: Handle LowPriority

  // Assume anything lower has idle priority
  return IdlePriority;
}
