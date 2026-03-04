import React from 'react';
import Hero from '../../components/sections/Hero/Hero';
import About from '../../components/sections/About/About';
import Projects from '../../components/sections/Projects/Projects';
import Skills from '../../components/sections/Skills/Skills';
import Contact from '../../components/sections/Contact/Contact';
import './HomePage.css';

const HomePage = () => {
  return (
    <div className="home-page">
      <Hero />
      <About />
      <Skills />
      <Projects limit={4} />
      <Contact />
    </div>
  );
};

export default HomePage;
