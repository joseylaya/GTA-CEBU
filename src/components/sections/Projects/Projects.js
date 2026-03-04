import React, { useEffect, useRef } from 'react';
import Card from '../../common/Card/Card';
import Button from '../../common/Button/Button';
import nativeCampImg from '../../../assets/images/logo_ogp-en.png';
import macheTvImg from '../../../assets/images/mv.png';
import './Projects.css';

const Projects = ({ limit }) => {
  const projectsRef = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    projectsRef.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      projectsRef.current.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, []);

  const projects = [
    {
      id: 1,
      title: 'NativeCamp Tutors Platform',
      description: 'An online English teaching platform with real-time video lessons, flexible scheduling, performance tracking, and mobile applications for teachers worldwide.',
      technologies: ['React', 'WebRTC', 'NodeJs', 'Socket', 'MongoDB'],
      image: nativeCampImg,
      link: 'https://nativecamp.net/tutors',
      github: '#'
    },
    {
      id: 2,
      title: 'Mache Tv Streaming Platform',
      description: 'A video streaming platform featuring live broadcasts, on-demand content, interactive features, and community engagement for content creators and viewers.',
      technologies: ['CakePHP', 'Idiorm', 'NodeJS', 'Socket', 'MySQL'],
      image: macheTvImg,
      link: 'https://mache.tv/',
      github: '#'
    },
    {
      id: 3,
      title: 'POS + Inventory System',
      description: 'A comprehensive Point of Sale system with inventory management, sales tracking, receipt printing, and real-time transaction processing for retail businesses.',
      technologies: ['React Native', 'NodeJs', 'MySQL','Express'],
      image: 'project3.jpg',
      link: '#',
      github: '#'
    },
    {
      id: 4,
      title: 'Bilem Health',
      description: 'A comprehensive healthcare platform providing medical services, patient management, appointment scheduling, and health information systems.',
      technologies: ['Wordpress', 'PHP', 'Payment Gateway'],
      image: 'project4.jpg',
      link: 'https://www.bilemhealth.com/',
      github: '#'
    }
  ];

  const displayedProjects = limit ? projects.slice(0, limit) : projects;

  return (
    <section className="projects section">
      <div className="container">
        <h2 className="section-title">Featured Projects</h2>
        <div className="projects-grid">
          {displayedProjects.map((project, index) => (
            <div
              key={project.id}
              ref={(el) => (projectsRef.current[index] = el)}
              className="project-card-wrapper scroll-reveal"
            >
              <Card hoverable={true} padding="none">
                <div className="project-card">
                  <div className="project-image">
                    <div className="project-image-placeholder" style={project.image ? {backgroundImage: `url(${project.image})`, backgroundSize: 'cover', backgroundPosition: 'center'} : {}}>
                      {!project.image && <span>{project.title}</span>}
                      <div className="project-overlay">
                        <a href={project.link} target="_blank" rel="noopener noreferrer">
                          <Button variant="primary" size="small">View Details</Button>
                        </a>                     
                      </div>
                    </div>
                  </div>
                  <div className="project-content">
                    <h3>{project.title}</h3>
                    <p>{project.description}</p>
                    <div className="project-technologies">
                      {project.technologies.map((tech, techIndex) => (
                        <span key={techIndex} className="tech-tag">{tech}</span>
                      ))}
                    </div>
                    <div className="project-links">
                      <a href={project.link} target="_blank" rel="noopener noreferrer">
                        <Button variant="primary" size="small">View Project</Button>
                      </a>
                      <a href={project.github} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="small">GitHub</Button>
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;
