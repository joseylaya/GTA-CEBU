import React from 'react';
import './Loader.css';

const Loader = ({ size = 'medium', text = '' }) => {
  return (
    <div className="loader-container">
      <div className={`loader loader--${size}`}>
        <div className="loader-circle"></div>
        <div className="loader-circle"></div>
        <div className="loader-circle"></div>
      </div>
      {text && <p className="loader-text">{text}</p>}
    </div>
  );
};

export default Loader;
