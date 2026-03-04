import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../../common/Button/Button';
import profileImage from '../../../assets/images/profile.jpg';
import './Hero.css';

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-text">
          <p className="hero-greeting">Hi, I'm</p>
          <h1 className="hero-title">Jose Marie Ylaya</h1>
          <h2 className="hero-subtitle">Web Developer</h2>
          <p className="hero-description">
            I create elegant, user-focused digital experiences powered by 
            clean architecture and advanced AI integration. My goal is simple: build systems that are intelligent, 
            efficient, and built to evolve with your business.
          </p>
          <div className="hero-buttons">
            <Link to="/projects">
              <Button variant="primary" size="large">View My Work</Button>
            </Link>
            <Link to="/contact">
              <Button variant="secondary" size="large">Get In Touch</Button>
            </Link>
          </div>
        </div>
        <div className="hero-image">
          <div className="hero-image-placeholder">
            <img src={profileImage} alt="Jose Marie Ylaya" className="profile-image" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
