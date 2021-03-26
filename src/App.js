// 为什么一旦使用 JSX 就必须引入 React 呢？
import React, { Component, useState } from 'react';
// import ClassComp from './ClassComp';
// import Children from './Children';
// import logo from './logo.svg';
import './App.css';

console.log('React Version', React.version);

class App extends Component {
  state = { count: 0 };

  render() {
    const { count } = this.state;
    return (
      <div className="root" onClick={() => this.setState({ count: count + 1 })}>
        点击次数：{count}
      </div>
    );
  }
}
/**
function App(props) {
  // const [count, setCount] = useState(0);
  // JSX 代码会被 Babel 编译为 React.createElement，不引入 React 的话就不能使用 React.createElement 了
  return (
    <div className="App">
      <header title="header">
        hello
        <p>
          {count}
          <span style={{ margin: '0 8px' }} onClick={() => setCount(count - 1)}>
            -
          </span>
          <span onClick={() => setCount(count + 1)}>+</span>
        </p>
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
          <span>second line in p tag</span>
        </p>
        <ClassComp name="bubu" />
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn {props.what}
        </a>
        <Children>
          <span key={'.0/'}>1</span>
          <span>2</span>
        </Children>
      </header>
    </div>
  );
}
*/

// function AppDesuger(props) {
//   return React.createElement(
//     'div',
//     // config
//     {
//       className: 'App',
//       __source: {
//         fileName: '_jsxFileName',
//         lineNumber: 9,
//       },
//       __self: this,
//     },
//     // children
//     React.createElement(
//       'header',
//       {
//         className: 'App-header',
//         __source: {
//           fileName: '_jsxFileName',
//           lineNumber: 10,
//         },
//         __self: this,
//       },
//       React.createElement('img', {
//         src: 'imgsrc',
//         className: 'App-logo',
//         alt: 'logo',
//         __source: {
//           fileName: '_jsxFileName',
//           lineNumber: 11,
//         },
//         __self: this,
//       }),
//       React.createElement(
//         'p',
//         {
//           __source: {
//             fileName: '_jsxFileName',
//             lineNumber: 12,
//           },
//           __self: this,
//         },
//         'Edit ',
//         React.createElement(
//           'code',
//           {
//             __source: {
//               fileName: '_jsxFileName',
//               lineNumber: 13,
//             },
//             __self: this,
//           },
//           'src/App.js'
//         ),
//         ' and save to reload.'
//       ),
//       React.createElement(
//         'a',
//         {
//           className: 'App-link',
//           href: 'https://reactjs.org',
//           target: '_blank',
//           rel: 'noopener noreferrer',
//           __source: {
//             fileName: '_jsxFileName',
//             lineNumber: 15,
//           },
//           __self: this,
//         },
//         'Learn ',
//         props.what
//       )
//     )
//   );
// }

App.defaultProps = {
  what: 'React',
};

export default App;
