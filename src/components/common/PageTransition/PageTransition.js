import React, { useEffect, useState } from 'react';
import './PageTransition.css';

const PageTransition = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation on mount
    setIsVisible(true);

    // Scroll to top on page change
    window.scrollTo(0, 0);

    return () => {
      setIsVisible(false);
    };
  }, []);

  return (
    <div className={`page-transition ${isVisible ? 'visible' : ''}`}>
      {children}
    </div>
  );
};

export default PageTransition;
