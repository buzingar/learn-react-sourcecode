import React from 'react';

function Children(props) {
  console.log(props.children, 'children30');
  console.log(
    React.Children.map(props.children, (item) => [item, [item, [item]]]),
    'children31'
  );
  console.log(
    React.Children.map(props.children, (item) => item),
    'children32'
  );
  return props.children;
}

export default Children;
