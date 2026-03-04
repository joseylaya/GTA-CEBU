import React from 'react';
import './Button.css';

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'medium',
  type = 'button',
  disabled = false,
  fullWidth = false 
}) => {
  const className = `button button--${variant} button--${size} ${fullWidth ? 'button--full-width' : ''}`;
  
  return (
    <button 
      className={className}
      onClick={onClick}
      type={type}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
