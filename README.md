React 可大致分为三部分：Core、Reconciler 和 Renderer

React 采用了由 Lerna 维护 monorepo 方式进行代码管理，即用一个仓库管理多个模块（module）或包（package）。在 React 仓库的根目录中，包含三个目录：

（1）fixtures，给源码贡献者准备的测试用例。

（2）packages，React 库提供的包的源码，包括核心代码、矢量图形库等，如下所列。

├── packages ------------------------------------ 源码目录
│ ├── react-art ------------------------------- 矢量图形渲染器
│ ├── react-dom ------------------------------- DOM 渲染器
│ ├── react-native-renderer ------------------- Native 渲染器（原生 iOS 和 Android 视图）
│ ├── react-test-renderer --------------------- JSON 树渲染器
│ ├── react-reconciler ------------------------ React 调和器

（3）scripts，相关的工具配置脚本，包括语法规则、Git 钩子等。

React 使用的前端模块化打包工具是 Rollup，在源码中还引入了 Flow，用于静态类型检查，在运行代码之前发现一些潜在的问题，其语法类似于 TypeScript。
