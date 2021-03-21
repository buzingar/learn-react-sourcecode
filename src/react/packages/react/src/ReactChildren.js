/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import invariant from 'shared/invariant';
import warning from 'shared/warning';
import {
  getIteratorFn,
  REACT_ELEMENT_TYPE,
  REACT_PORTAL_TYPE,
} from 'shared/ReactSymbols';

import {isValidElement, cloneAndReplaceKey} from './ReactElement';
import ReactDebugCurrentFrame from './ReactDebugCurrentFrame';

const SEPARATOR = '.';
const SUBSEPARATOR = ':';

/**
 * Escape and wrap key so it is safe to use as a reactid
 *
 * @param {string} key to be escaped.
 * @return {string} the escaped key.
 */
function escape(key) {
  const escapeRegex = /[=:]/g;
  const escaperLookup = {
    '=': '=0',
    ':': '=2',
  };
  const escapedString = ('' + key).replace(escapeRegex, function(match) {
    return escaperLookup[match];
  });

  return '$' + escapedString;
}

/**
 * TODO: Test that a single child and an array with one item have the same key
 * pattern.
 */

let didWarnAboutMaps = false;

// 在/后再加一个/   'aa/a/' -> 'aa//a//'
// react对key定义的一个规则：如果字符串中有连续多个/的话，在匹配的字串后再加/
// 这个函数一般是第二层递归时，会用到
const userProvidedKeyEscapeRegex = /\/+/g;
function escapeUserProvidedKey(text) {
  // 如果字符串中有连续多个 / 的话，在匹配的字串后再加 /
  return ('' + text).replace(userProvidedKeyEscapeRegex, '$&/');
}

// 对象池的最大容量为10
const POOL_SIZE = 10;
// 对象池
const traverseContextPool = [];
/*
* 在每次map()的过程中，每次递归都会用到 traverseContext 对象，
* 创建traverseContextPool对象池的目的，就是复用里面的对象，
* 以减少内存消耗，并且在map()结束时，
* 将复用的对象初始化，并push进对象池中（releaseTraverseContext），以供下次map()时使用
*/
// 创建一个对象池，复用Object，从而减少很多对象创建带来的内存占用和gc（垃圾回收）的损耗
// ([],'',(item)=>{return [item,[item,] ]},undefined)
function getPooledTraverseContext(
  mapResult,
  keyPrefix,
  mapFunction,
  mapContext,
) {
  // 如果对象池内存在对象，则出队一个对象，并将arguments的值赋给对象属性，最后返回该对象
  if (traverseContextPool.length) {
    const traverseContext = traverseContextPool.pop();
    traverseContext.result = mapResult;
    traverseContext.keyPrefix = keyPrefix;
    traverseContext.func = mapFunction;
    traverseContext.context = mapContext;
    traverseContext.count = 0;
    return traverseContext;
  } else {
    // 如果不存在，则返回一个新对象
    // {
    //   result:[],
    //   keyPrefix:'',
    //   func:(item)=>{return [item,[item,] ]},
    //   context:undefined,
    //   count:0,
    // }
    return {
      result: mapResult,
      keyPrefix: keyPrefix,
      func: mapFunction,
      context: mapContext,
      count: 0,
    };
  }
}

// 将复用的对象初始化，并push进对象池中（releaseTraverseContext），以供下次map()时使用
function releaseTraverseContext(traverseContext) {
  traverseContext.result = null;
  traverseContext.keyPrefix = null;
  traverseContext.func = null;
  traverseContext.context = null;
  traverseContext.count = 0;
  if (traverseContextPool.length < POOL_SIZE) {
    traverseContextPool.push(traverseContext);
  }
}

/**
 * 核心递归函数，目的是展平嵌套数组
 分为两部分：
（1）children是Object，并且$$typeof是REACT_ELEMENT_TYPE/REACT_PORTAL_TYPE调用callback 即mapSingleChildIntoContext ，
    复制除key外的属性，替换key属性，将其放入到result中
（2）children是Array，循环children，再用traverseAllChildrenImpl 执行child
 *
 * @param {?*} children Children tree container.
 * @param {!string} nameSoFar Name of the key path so far.
 * @param {!function} callback Callback to invoke with each child found.
 * @param {?*} traverseContext Used to pass information throughout the traversal
 * process.
 * @return {!number} The number of children in this subtree.
 */
function traverseAllChildrenImpl(
  children,
  nameSoFar,
  callback,
  traverseContext,
) {
  const type = typeof children;

  if (type === 'undefined' || type === 'boolean') {
    // All of the above are perceived as null.
    children = null;
  }

  // 调用func的flag
  let invokeCallback = false;

  if (children === null) {
    invokeCallback = true;
  } else {
    switch (type) {
      case 'string':
      case 'number':
        invokeCallback = true;
        break;
      case 'object':
        switch (children.$$typeof) {
          // 如果props.children是单个ReactElement/PortalElement的话
          // 递归traverseAllChildrenImpl时，<span>1</span>和<span>2</span>作为child
          // 必会触发invokeCallback=true
          case REACT_ELEMENT_TYPE:
          case REACT_PORTAL_TYPE:
            invokeCallback = true;
        }
    }
  }

  if (invokeCallback) {
    callback(
      traverseContext,
      children,
      // If it's the only child, treat the name as if it was wrapped in an array
      // so that it's consistent if the number of children grows.
      // 如果只有一个子节点，也将它放在数组中来处理
      // .$=0
      // <span>1</span> key='.0'
      nameSoFar === '' ? SEPARATOR + getComponentKey(children, 0) : nameSoFar,
    );
    return 1;
  }

  let child;
  let nextName;
  let subtreeCount = 0; // Count of children found in the current subtree. // 有多少个子节点
  // .
  const nextNamePrefix =
    nameSoFar === '' ? SEPARATOR : nameSoFar + SUBSEPARATOR;

  // 这部分的代码首先会判断 children 是否为数组。
  if (Array.isArray(children)) {
    // 如果为数组的话，就遍历数组并把其中的每个元素都递归调用 traverseAllChildrenImpl，
    // 也就是说必须是单个可渲染节点才可以执行上面代码中的 callback。
    for (let i = 0; i < children.length; i++) {
      child = children[i];
      // 不手动设置key的话 第一层第一个是.0，第二个是.1
      nextName = nextNamePrefix + getComponentKey(child, i);
      subtreeCount += traverseAllChildrenImpl(
        child,
        nextName,
        callback,
        traverseContext,
      );
    }
  } else {
    // 如果不是数组的话，就看看 children 是否可以支持迭代，原理就是通过 obj[Symbol.iterator] 的方式去取迭代器，
    // 返回值如果是个函数的话就代表支持迭代，然后逻辑就和之前的一样了。
    const iteratorFn = getIteratorFn(children);
    if (typeof iteratorFn === 'function') {
      if (__DEV__) {
        // Warn about using Maps as children
        if (iteratorFn === children.entries) {
          warning(
            didWarnAboutMaps,
            'Using Maps as children is unsupported and will likely yield ' +
              'unexpected results. Convert it to a sequence/iterable of keyed ' +
              'ReactElements instead.',
          );
          didWarnAboutMaps = true;
        }
      }

      const iterator = iteratorFn.call(children);
      let step;
      let ii = 0;
      while (!(step = iterator.next()).done) {
        child = step.value;
        nextName = nextNamePrefix + getComponentKey(child, ii++);
        subtreeCount += traverseAllChildrenImpl(
          child,
          nextName,
          callback,
          traverseContext,
        );
      }
    } else if (type === 'object') {
      // 如果是一个纯对象的话，throw error
      let addendum = '';
      if (__DEV__) {
        addendum =
          ' If you meant to render a collection of children, use an array ' +
          'instead.' +
          ReactDebugCurrentFrame.getStackAddendum();
      }
      const childrenString = '' + children;
      invariant(
        false,
        'Objects are not valid as a React child (found: %s).%s',
        childrenString === '[object Object]'
          ? 'object with keys {' + Object.keys(children).join(', ') + '}'
          : childrenString,
        addendum,
      );
    }
  }

  return subtreeCount;
}

/**
 * 调用实现
 * Traverses children that are typically specified as `props.children`, but
 * might also be specified through attributes:
 *
 * - `traverseAllChildren(this.props.children, ...)`
 * - `traverseAllChildren(this.props.leftPanelChildren, ...)`
 *
 * The `traverseContext` is an optional argument that is passed through the
 * entire traversal. It can be used to store accumulations or anything else that
 * the callback might find relevant.
 *
 * @param {?*} children Children tree object.
 * @param {!function} callback To invoke upon traversing each child.
 * @param {?*} traverseContext Context for traversal.
 * @return {!number} The number of children in this subtree.
 */
function traverseAllChildren(children, callback, traverseContext) {
  if (children == null) {
    return 0;
  }

  return traverseAllChildrenImpl(children, '', callback, traverseContext);
}

/**
 * Generate a key string that identifies a component within a set.
 *
 * @param {*} component A component that could contain a manual key.
 * @param {number} index Index that is used if a manual key is not provided.
 * @return {string}
 */
function getComponentKey(component, index) {
  // Do some typechecking here since we call this blindly. We want to ensure
  // that we don't block potential future ES APIs.
  if (
    typeof component === 'object' &&
    component !== null &&
    component.key != null
  ) {
    // Explicit key
    return escape(component.key);
  }
  // Implicit key determined by the index in the set
  return index.toString(36);
}

function forEachSingleChild(bookKeeping, child, name) {
  const {func, context} = bookKeeping;
  func.call(context, child, bookKeeping.count++);
}

/**
 * Iterates through children that are typically specified as `props.children`.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenforeach
 *
 * The provided forEachFunc(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} forEachFunc
 * @param {*} forEachContext Context for forEachContext.
 */
function forEachChildren(children, forEachFunc, forEachContext) {
  if (children == null) {
    return children;
  }
  const traverseContext = getPooledTraverseContext(
    null,
    null,
    forEachFunc,
    forEachContext,
  );
  traverseAllChildren(children, forEachSingleChild, traverseContext);
  releaseTraverseContext(traverseContext);
}

/**
 * 递归仍是数组的child；将单个ReactElement的child加入result中。
 * 让child调用 func 方法，所得的结果如果是数组的话继续递归；如果是单个ReactElement的话，将其放入result数组中
 *
 * traverseAllChildren的第二个参数
 */
// bookKeeping:traverseContext=
// {
//  result:[],
//  keyPrefix:'',
//  func:(item)=>{return [item,[item,] ]},
//  context:undefined,
//  count:0,
// }
// child: <span>1</span>
// childKey: .0
function mapSingleChildIntoContext(bookKeeping, child, childKey) {
  // bookKeeping 就是我们从对象池子里取出来的东西，即 traverseContext
  const {result, keyPrefix, func, context} = bookKeeping;
  // 调用 func 并且传入节点（此时这个节点肯定是单个节点）
  // func: (item)=>{return [item,[item,] ]}, func 代表着 React.mapChildren 中的第二个参数
  // item即 <span>1</span>
  // 第二个参数 bookKeeping.count++ 很有意思，压根儿没用到，但仍起到计数的作用
  let mappedChild = func.call(context, child, bookKeeping.count++);

  // 接下来就是判断返回值类型的过程：
  // 如果是数组的话，还是回归之前的代码逻辑，注意这里传入的 func 是 c => c，因为要保证最终结果是被摊平的；
  // 也就是说，如果根据React.Children.map()第二个参数callback，执行仍是一个数组的话，
  // 递归调用mapIntoWithKeyPrefixInternal，继续之前的步骤，直到是单个ReactElement
  if (Array.isArray(mappedChild)) {
    // mappedChild: [item,[item,]]
    // result: []
    // childKey: .0
    // func: c => c
    mapIntoWithKeyPrefixInternal(mappedChild, result, childKey, c => c);
  } else if (mappedChild != null) {
    /*
     如果不是数组的话，判断返回值是否是一个有效的 Element，
     验证通过的话就 clone 一份并且替换掉 key，
     最后把返回值放入 result 中，result 其实也就是 mapChildren 的返回值。
    */
    // 当mappedChild是单个ReactElement并且不为null时
    if (isValidElement(mappedChild)) {
      // 赋给新对象除key外同样的属性，替换key属性
      mappedChild = cloneAndReplaceKey(
        mappedChild,
        // Keep both the (mapped) and old keys if they differ, just as
        // traverseAllChildren used to do for objects as children
        // 如果新老keys是不一样的话，两者都保留，像traverseAllChildren对待objects做的那样
        keyPrefix +
          (mappedChild.key && (!child || child.key !== mappedChild.key)
            ? escapeUserProvidedKey(mappedChild.key) + '/'
            : '') +
          childKey,
      );
    }
    result.push(mappedChild);
  }
}

/**
 * getPooledTraverseContext()/traverseAllChildren()/releaseTraverseContext()的包裹器
 */
function mapIntoWithKeyPrefixInternal(children, array, prefix, func, context) {
  console.log('children:', children);
  console.log('result:[]-', array);
  console.log('prefix:null-', prefix);
  console.log('func:', func);
  console.log('context:', context);

  let escapedPrefix = '';

  // 如果字符串中有连续多个 / 的话，在匹配的字串后再加 /
  if (prefix != null) {
    escapedPrefix = escapeUserProvidedKey(prefix) + '/';
  }

  // 从pool中找一个对象
  // [],'',(item)=>{return [item,[item,] ]},undefined

  // traverseContext=
  //  {
  //    result:[],
  //    keyPrefix:'',
  //    func:(item)=>{return [item,[item,] ]},
  //    context:undefined,
  //    count:0,
  //  }
  const traverseContext = getPooledTraverseContext(
    array,
    escapedPrefix,
    func,
    context,
  );
  // 将嵌套的数组展平
  traverseAllChildren(children, mapSingleChildIntoContext, traverseContext);
  releaseTraverseContext(traverseContext);
}

/**
 * Maps children that are typically specified as `props.children`.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenmap
 *
 * The provided mapFunction(child, key, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} func The map function.
 * @param {*} context Context for mapFunction.
 * @return {object} Object containing the ordered map of results.
 */
// React.Children.map(props.children,item=>[item,[item,] ])
function mapChildren(children, func, context) {
  console.log('%c++++++++++++++++', 'color:#f00');
  console.log('children:', children);
  console.log('func:', func);
  console.log('context:', context);
  console.log('%c++++++++++++++++', 'color:#f00');
  if (children == null) {
    return children;
  }
  const result = [];
  // 进行基本的判断和初始化后，调用该方法
  // (props.children,[],null,(item)=>{return [item,[item,] ]},undefined)
  mapIntoWithKeyPrefixInternal(children, result, null, func, context);
  return result;
}

/**
 * Count the number of children that are typically specified as
 * `props.children`.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrencount
 *
 * @param {?*} children Children tree container.
 * @return {number} The number of children.
 */
function countChildren(children) {
  return traverseAllChildren(children, () => null, null);
}

/**
 * Flatten a children object (typically specified as `props.children`) and
 * return an array with appropriately re-keyed children.
 * 平铺一个child对象(通常指定为' props.children ')，并返回一个具有适当重设键的子对象的数组。
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrentoarray
 */
function toArray(children) {
  const result = [];
  mapIntoWithKeyPrefixInternal(children, result, null, child => child);
  return result;
}

/**
 * Returns the first child in a collection of children and verifies that there
 * is only one child in the collection.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenonly
 *
 * The current implementation of this function assumes that a single child gets
 * passed without a wrapper, but the purpose of this helper function is to
 * abstract away the particular structure of children.
 *
 * @param {?object} children Child collection structure.
 * @return {ReactElement} The first and only `ReactElement` contained in the
 * structure.
 */
function onlyChild(children) {
  invariant(
    isValidElement(children),
    'React.Children.only expected to receive a single React element child.',
  );
  return children;
}

// as就是重命名了，map即mapChildren
// children是一个不透明的数据结构，从本质上来讲， props.children 可以是任何的类型，比如数组、函数、对象等等。
// React提供了一系列的函数助手来使得操作children更加方便。
// 两个最显眼的函数助手就是 React.Children.map 以及 React.Children.forEach 。
// 它们在对应数组的情况下能起作用，除此之外，当函数、对象或者任何东西作为children传递时，它们也会起作用。

// 因为this.props.children 可以是任何类型的，检查一个组件有多少个children是非常困难的。
// 天真的使用 this.props.children.length ，当传递了字符串或者函数时程序便会中断。
// 假设我们有个child："Hello World!" ，但是使用 .length 的方法将会显示为12。
// 这就是为什么我们有 React.Children.count 方法的原因，无论是什么类型它都会返回children的数量

// toArray: 你能将children转换为数组通过 React.Children.toArray 方法。如果你需要对它们进行排序，这个方法是非常有用的。
export {
  forEachChildren as forEach,
  mapChildren as map, // 将children根据传入function由嵌套多维关系平铺展开成一维
  countChildren as count,
  onlyChild as only,
  toArray,
};

// ! [对React children 的深入理解](https://segmentfault.com/a/1190000011527160?utm_source=sf-related)
