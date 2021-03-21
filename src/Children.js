import React from 'react';

function Children(props) {
  console.log('props.children:', props.children);
  console.log(
    'c=>[c,[c,[c]]]:',
    React.Children.map(props.children, (item) => [item, [item, [item]]])
  );
  console.log(
    'c=>c:',
    React.Children.map(props.children, (item) => item)
  );
  console.log('onlyChild:', React.Children.only(props.children[0]));
  console.log('toArray:', React.Children.toArray(props.children));
  console.log('countChildren:', React.Children.count(props.children));
  return props.children;
}

export default Children;
