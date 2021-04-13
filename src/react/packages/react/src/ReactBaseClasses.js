/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import invariant from 'shared/invariant';
import lowPriorityWarning from 'shared/lowPriorityWarning';
// 报警告用的
import ReactNoopUpdateQueue from './ReactNoopUpdateQueue';

const emptyObject = {};
if (__DEV__) {
  Object.freeze(emptyObject);
}

/**
 * Base class helpers for the updating state of a component.
 * 构造函数 Component 中需要注意的两点分别是 refs 和 updater，后者是组件中相当重要的一个属性，
 * 我们可以发现 setState 和 forceUpdate 都是调用了 updater 中的方法
 */
function Component(props, context, updater) {
  // {name: "bubu"} {} undefined
  console.groupCollapsed();
  console.log('props:', props);
  console.log('context:', context);
  console.log('updater:', updater);
  console.groupEnd();

  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  this.refs = emptyObject;
  // We initialize the default updater but the real one gets injected by the
  // renderer.
  this.updater = updater || ReactNoopUpdateQueue; // classComponentUpdater
}

Component.prototype.isReactComponent = {};

/**
 * Sets a subset of the state. Always use this to mutate
 * state. You should treat `this.state` as immutable.
 *
 * There is no guarantee that `this.state` will be immediately updated, so
 * accessing `this.state` after calling this method may return the old value.
 *
 * There is no guarantee that calls to `setState` will run synchronously,
 * as they may eventually be batched together.  You can provide an optional
 * callback that will be executed when the call to setState is actually
 * completed.
 *
 * When a function is provided to setState, it will be called at some point in
 * the future (not synchronously). It will be called with the up to date
 * component arguments (state, props, context). These values can be different
 * from this.* because your function may be called after receiveProps but before
 * shouldComponentUpdate, and this new state, props, and context will not yet be
 * assigned to this.
 *
 * @param {object|function} partialState Next partial state or function to
 *        produce next partial state to be merged with current state.
 * @param {?function} callback Called after state is updated.
 * @final
 * @protected
 */
// setState()是 Component 原型上的方法，其本质是调用 updater 的enqueueSetState()方法
Component.prototype.setState = function(partialState, callback) {
  invariant(
    typeof partialState === 'object' ||
      typeof partialState === 'function' ||
      partialState == null,
    'setState(...): takes an object of state variables to update or a ' +
      'function which returns an object of state variables.',
  );
  debugger;
  // ReactFiberClassComponent.js 中的 classComponentUpdater 中的 enqueueSetState()
  // this.updater就是ReactUpdateQueue, this是组件的实例
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};

/**
 * Forces an update. This should only be invoked when it is known with
 * certainty that we are **not** in a DOM transaction.
 *
 * You may want to call this when you know that some deeper aspect of the
 * component's state has changed but `setState` was not called.
 *
 * This will not invoke `shouldComponentUpdate`, but it will invoke
 * `componentWillUpdate` and `componentDidUpdate`.
 *
 * @param {?function} callback Called after update is complete.
 * @final
 * @protected
 */
Component.prototype.forceUpdate = function(callback) {
  this.updater.enqueueForceUpdate(this, callback, 'forceUpdate');
};

/**
 * Deprecated APIs. These APIs used to exist on classic React classes but since
 * we would like to deprecate them, we're not going to move them over to this
 * modern base class. Instead, we define a getter that warns if it's accessed.
 */
if (__DEV__) {
  const deprecatedAPIs = {
    isMounted: [
      'isMounted',
      'Instead, make sure to clean up subscriptions and pending requests in ' +
        'componentWillUnmount to prevent memory leaks.',
    ],
    replaceState: [
      'replaceState',
      'Refactor your code to use setState instead (see ' +
        'https://github.com/facebook/react/issues/3236).',
    ],
  };
  const defineDeprecationWarning = function(methodName, info) {
    Object.defineProperty(Component.prototype, methodName, {
      get: function() {
        lowPriorityWarning(
          false,
          '%s(...) is deprecated in plain JavaScript React classes. %s',
          info[0],
          info[1],
        );
        return undefined;
      },
    });
  };
  for (const fnName in deprecatedAPIs) {
    if (deprecatedAPIs.hasOwnProperty(fnName)) {
      defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
    }
  }
}

// 新建了空方法ComponentDummy，并继承Component的原型
function ComponentDummy() {}
ComponentDummy.prototype = Component.prototype;

/**
 * Convenience component with default shallow equality check for sCU.
 * 内含 浅相等检查的shouldComponentUpdate() 的便捷组件
 * PureComponent 继承自 Component，继承方法使用了很典型的寄生组合式。
 */
function PureComponent(props, context, updater) {
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}

/*
如果让 PureComponent.prototype 直接等于Component的实例对象的话（继承原型），会多继承Component的constructor，
但是PureComponent已经有自己的constructor了，这样就会多消耗一些内存。
所以会新建ComponentDummy，只继承Component的原型，不包括constructor，以此来节省内存。
*/

// 将Component的方法拷贝到pureComponentPrototype上
// 用ComponentDummy的原因是为了不直接实例化一个Component实例，可以减少一些内存使用
// PureComponent.prototype等于ComponentDummy的实例
const pureComponentPrototype = (PureComponent.prototype = new ComponentDummy());
// PureComponent.prototype.constructor = PureComponent
// 原型的constructor等于自身，覆盖掉Component.prototype的constructor（Component）
pureComponentPrototype.constructor = PureComponent;

// 以上两步即是让PureComponent继承Component

// Avoid an extra prototype jump for these methods.
// PureComponent的prototype浅拷贝Component的prototype的所有属性
// pureComponentPrototype.__proto__=== ComponentDummy.prototype //true
// 也就是
// PureComponent.prototype.__proto__=== Component.prototype //true
// 这样就多了一层隐式原型的查找，为了减少一次原型链查找
// 这样的话，Component.prototype中的方法在 PureComponent.prototype 中都有，无需再从__proto__上查找了。
// 避免多一次原型链查找，因为上面两句已经让PureComponent继承了Component
// 下面多写了一句Object.assign()，是为了避免多一次原型链查找

// Object.assign是浅拷贝，
// 将Component.prototype上的方法都复制到PureComponent.prototype上
// 也就是pureComponent的原型上
// 详细请参考：https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
Object.assign(pureComponentPrototype, Component.prototype);
// 唯一的区别就是在原型上添加了isPureReactComponent属性去表示该Component是PureComponent
pureComponentPrototype.isPureReactComponent = true;

// 两个基本组件，分别为 Component 及 PureComponent
// PureComponent与Component唯一的区别：PureComponent是自带了一个简单的shouldComponentUpdate来优化更新机制的。
export {Component, PureComponent};
