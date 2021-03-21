import React, { Component } from 'react';

class ClassComp extends Component {
  render() {
    return (
      <div style={{ border: '2px solid red' }}>
        This is class component.
        <p>{this.props.name}</p>
      </div>
    );
  }
}

export default ClassComp;
