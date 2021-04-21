/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @flow
 */

import type {RefObject} from 'shared/ReactTypes';

// an immutable object with a single mutable value 具有单个可变值的不可变对象
// 使用 ref，只需要取出其中的 current 对象即可
// this.myRef = React.createRef();
// ref的值根据节点类型的不同而不同：
// 当ref属性用于HTML元素，在构造器中通过React.createRef()函数创建的ref接收底层DOM元素作为它的current属性；
// 当ref属性用于传统的类组件，ref对象接收挂载好的组件实例作为它的current；
// 你不能将ref属性用于函数式组件上，因为他们并没有实例（instance）！使用forwardRef
export function createRef(): RefObject {
  const refObject = {
    current: null,
  };
  if (__DEV__) {
    Object.seal(refObject);
  }
  return refObject;
}
