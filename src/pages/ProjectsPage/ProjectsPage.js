import React from 'react';
import Projects from '../../components/sections/Projects/Projects';
import './ProjectsPage.css';

const ProjectsPage = () => {
  return (
    <div className="projects-page">
      <div className="page-hero">
        <div className="container">
          <h1>My Projects</h1>
          <p>A collection of my recent work and side projects</p>
        </div>
      </div>
      <Projects />
    </div>
  );
};

export default ProjectsPage;
