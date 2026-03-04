import React from 'react';
import Contact from '../../components/sections/Contact/Contact';
import './ContactPage.css';

const ContactPage = () => {
  return (
    <div className="contact-page">
      <div className="page-hero">
        <div className="container">
          <h1>Contact Me</h1>
          <p>Let's discuss your next project</p>
        </div>
      </div>
      <Contact />
    </div>
  );
};

export default ContactPage;
