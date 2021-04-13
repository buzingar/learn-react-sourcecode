> [https://segmentfault.com/a/1190000018914249](https://segmentfault.com/a/1190000018914249)
> [https://zhuanlan.zhihu.com/p/140489744](https://zhuanlan.zhihu.com/p/140489744)



作用：
计算出Virtual DOM中真正变化的部分，并只针对该部分进行原生DOM操作，而非重新渲染整个页面。
> 怎么只针对部分dom进行操作？而不导致整个页面的重绘与回流
> 重绘、回流什么情况下会发生？react中也存在重绘与回流吗？



## 传统diff算法
通过循环递归对节点进行依次对比，算法复杂度达到 O(n^3) ，n是树的节点数


### react算法
一种特殊的diff算法，做到了O(n^3)到O(n)的飞跃性的提升，diff算法是调和的具体实现。
### 什么是调和？
将Virtual DOM树转换成actual DOM树的最少操作的过程称为 调和 。


## 三条diff策略

- Web UI中DOM节点跨层级的移动操作特别少，可以忽略不计。
- 拥有相同类的两个组件将会生成相似的树形结构，
拥有不同类的两个组件将会生成不同的树形结构。
- 对于同一层级的一组子节点，它们可以通过唯一 id 进行区分。



在上面三个策略的基础上，React 分别将对应的 tree diff 、 component diff  以及 element diff 进行算法优化，极大地提升了diff效率。


### tree diff
对树进行分层比较，两棵树只会对同一层次的节点进行比较。
基于策略一，React只会对相同层级的 DOM 节点进行比较，即同一个父节点下的所有子节点。
当发现节点已经不存在时，则该节点及其子节点会被完全删除掉，不会用于进一步的比较。
这样只需要对树进行一次遍历，便能完成整个 DOM 树的比较。
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616753393403-df5715ea-084a-40dd-99fa-728e29630fc8.png#align=left&display=inline&height=135&margin=%5Bobject%20Object%5D&name=image.png&originHeight=270&originWidth=504&size=106786&status=done&style=none&width=252)
Web UI中DOM节点跨层级的移动操作
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616753527550-e54b3077-a118-443e-8725-288541c2b485.png#align=left&display=inline&height=157&margin=%5Bobject%20Object%5D&name=image.png&originHeight=313&originWidth=710&size=15717&status=done&style=none&width=355)
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616753535324-e4141957-0ddb-4860-a762-9a55920796b3.png#align=left&display=inline&height=53&margin=%5Bobject%20Object%5D&name=image.png&originHeight=106&originWidth=732&size=23548&status=done&style=none&width=366)
逐层从左到右把节点“搬”过去，删除老节点
React 只会简单地考虑同层级节点的位置变换，而对于不同层级的节点，只有创建和删除操作。
当出现节点跨层级移动时，并不会出现想象中的移动操作，而是以 A 为根节点的整个树被重新创建。
这是一种影响React性能的操作，因此官方建议不要进行 DOM 节点跨层级的操作。
在开发组件时，保持稳定的 DOM 结构会有助于性能的提升。例如，可以通过 CSS 隐藏或显示节点，而不是真正地移除或添加 DOM 节点。


### component diff

- 如果是同一类型的组件，按照原策略继续比较 Virtual DOM 树即可。
- 如果不是，则将该组件判断为 dirty component，从而替换整个组件下的所有子节点。
- 对于同一类型的组件，有可能其 Virtual DOM 没有任何变化，如果能够确切知道这点，那么就可以节省大量的 diff 运算时间。因此，React允许用户通过shouldComponentUpdate() 来判断该组件是否需要进行diff算法分析，但是如果调用了 forceUpdate 方法，shouldComponentUpdate 则失效。



![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616754065948-0db21895-5ee2-4a5a-9181-80e3a24a28ea.png#align=left&display=inline&height=80&margin=%5Bobject%20Object%5D&name=image.png&originHeight=159&originWidth=732&size=28595&status=done&style=none&width=366)
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616754075063-ef6b2afd-f593-4fae-9fd7-8352b3f724ed.png#align=left&display=inline&height=32&margin=%5Bobject%20Object%5D&name=image.png&originHeight=63&originWidth=732&size=15893&status=done&style=none&width=366)
> React: 不同类型的组件很少存在相似DOM树的情况
> 因为基本不存在两个不同类但是组件结构相同的情况，如果有，只能证明使用者的代码需要优化，怎么会出现如此没有复用性的代码呢。



### element diff
当节点处于同一层级时，diff 提供了 3 种节点操作，分别为 INSERT_MARKUP (插入)、MOVE_EXISTING (移动)、 REMOVE_NODE (删除)。


- INSERT_MARKUP
新的组件类型不在旧集合里，即全新的节点，需要对新节点执行插入操作。
- MOVE_EXISTING
旧集合中有新组件类型，且 element 是可更新的类型，generateComponentChildren 已调用receiveComponent ，这种情况下 prevChild=nextChild ，就需要做移动操作，可以复用以前的 DOM 节点。
- REMOVE_NODE
旧组件类型，在新集合里也有，但对应的 element 不同，则不能直接复用和更新，需要执行删除操作，或者旧组件不在新集合里的，也需要执行删除操作。



#### 未加key，key变化等情况
旧集合中包含节点A、B、C和D，更新后的新集合中包含节点B、A、D和C，此时新旧集合进行diff差异化对比，发现B!=A，则创建并插入B至新集合，删除旧集合A；以此类推，创建并插入A、D和C，删除B、C和D。
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616755292239-6af2bf4f-4c52-48a9-a352-47269f11e15a.png#align=left&display=inline&height=156&margin=%5Bobject%20Object%5D&name=image.png&originHeight=312&originWidth=732&size=64936&status=done&style=none&width=366)


#### 添加key
这些都是相同的节点，仅仅是位置发生了变化，但却需要进行繁杂低效的删除、创建操作，其实只要对这些节点进行位置移动即可。
React针对这一现象提出了一种优化策略：**允许开发者对同一层级的同组子节点，添加唯一 key 进行区分。**
虽然只是小小的改动，性能上却发生了翻天覆地的变化！
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616755487493-1df2dd6d-f063-4f65-bd82-a8836456b755.png#align=left&display=inline&height=201&margin=%5Bobject%20Object%5D&name=image.png&originHeight=402&originWidth=732&size=90739&status=done&style=none&width=366)
通过key可以准确地发现新旧集合中的节点都是相同的节点，因此无需进行节点删除和创建，只需要将旧集合中节点的位置进行移动，更新为新集合中节点的位置，此时React 给出的diff结果为：B、D不做任何操作，A、C进行移动操作即可。

```javascript
现在有一集合[1,2,3,4,5],渲染成如下的样子：
<div>1</div>
<div>2</div>
<div>3</div>
<div>4</div>
<div>5</div>
---------------
现在我们将这个集合的顺序打乱变成[1,3,2,5,4]。
1.加key
<div key='1'>1</div>             <div key='1'>1</div>     
<div key='2'>2</div>             <div key='3'>3</div>  
<div key='3'>3</div>  ========>  <div key='2'>2</div>  
<div key='4'>4</div>             <div key='5'>5</div>  
<div key='5'>5</div>             <div key='4'>4</div>  
操作：节点2移动至下标为2的位置，节点4移动至下标为4的位置。

2.不加key
<div>1</div>             <div>1</div>     
<div>2</div>             <div>3</div>  
<div>3</div>  ========>  <div>2</div>  
<div>4</div>             <div>5</div>  
<div>5</div>             <div>4</div>  
操作：修改第1个到第5个节点的innerText
---------------
如果我们对这个集合进行增删的操作改成[1,3,2,5,6]。
1.加key
<div key='1'>1</div>             <div key='1'>1</div>     
<div key='2'>2</div>             <div key='3'>3</div>  
<div key='3'>3</div>  ========>  <div key='2'>2</div>  
<div key='4'>4</div>             <div key='5'>5</div>  
<div key='5'>5</div>             <div key='6'>6</div>  
操作：节点2移动至下标为2的位置，新增节点6至下标为4的位置，删除节点4。

2.不加key
<div>1</div>             <div>1</div>     
<div>2</div>             <div>3</div>  
<div>3</div>  ========>  <div>2</div>  
<div>4</div>             <div>5</div>  
<div>5</div>             <div>6</div> 
操作：修改第1个到第5个节点的innerText
---------------
通过上面这两个例子我们发现：
由于dom节点的移动操作开销是比较昂贵的，没有key的情况下要比有key的性能更好。
```
虽然加了key提高了diff效率，但是未必一定提升了页面的性能。因此我们要注意这么一点：
对于简单列表页渲染来说，不加key要比加了key的性能更好
根据上面的情况，最后我们总结一下key的作用：

- 准确判断出当前节点是否在旧集合中
- 极大地减少遍历次数



# 总结

- React的高效得益于其Virtual DOM+React diff的体系。
diff算法并非react独创，react只是在传统diff算法做了优化。但因为其优化，将diff算法的时间复杂度一下子从O(n^3)降到O(n)。
- React diff的三大策略：
   - Web UI中DOM节点跨层级的移动操作特别少，可以忽略不计。
   - 拥有相同类 `$$type` 的两个组件将会生成相似的树形结构，
拥有不同类 `$$type` 的两个组件将会生成不同的树形结构。
   - 对于同一层级的一组子节点，它们可以通过唯一 id 进行区分。
- 在开发组件时，保持稳定的 DOM 结构会有助于性能的提升。
- 在开发过程中，尽量减少类似将最后一个节点移动到列表首部的操作。
- key的存在是为了提升diff效率，但未必一定就可以提升性能，记住简单列表渲染情况下，不加key要比加key的性能更好。
- 懂得借助react diff的特性去解决我们实际开发中的一系列问题。



利用key变化会导致组件重新生成这一点
![image.png](https://cdn.nlark.com/yuque/0/2021/png/300273/1616757854416-cdd6c10f-01f4-437e-ac70-aecae40d90b5.png#align=left&display=inline&height=616&margin=%5Bobject%20Object%5D&name=image.png&originHeight=1232&originWidth=1574&size=763366&status=done&style=none&width=787)
