import React from 'react';
import './Card.css';

const Card = ({ 
  children, 
  className = '',
  hoverable = false,
  padding = 'medium'
}) => {
  const cardClassName = `card card--${padding} ${hoverable ? 'card--hoverable' : ''} ${className}`;
  
  return (
    <div className={cardClassName} style={{ overflow: 'hidden' }}>
      {children}
    </div>
  );
};

export default Card;
