import React from 'react';
import Card from '../../common/Card/Card';
import './About.css';

const About = () => {
  return (
    <section className="about section">
      <div className="container">
        <h2 className="section-title">About Me</h2>
        <div className="about-content">
          <div className="about-text">
            <p>
              I'm a passionate web developer based in Cebu City, currently working at Forty Degrees Celcius.
              I graduated from Asian College of Technology with a focus on creating elegant solutions through code.
            </p>
            <p>
              I specialize in building modern web applications using technologies like React, JavaScript,
              and responsive design principles. I'm committed to continuous learning and staying up-to-date
              with the latest web development trends.
            </p>
            <p>
              I believe in writing clean, maintainable code and creating user experiences that truly matter.
              Every project is an opportunity to learn something new and push my skills further.
            </p>
          </div>
          <div className="about-stats">
            <Card hoverable={true}>
              <div className="stat">
                <h3>3+</h3>
                <p>Years Experience</p>
              </div>
            </Card>
            <Card hoverable={true}>
              <div className="stat">
                <h3>10+</h3>
                <p>Projects Completed</p>
              </div>
            </Card>
            <Card hoverable={true}>
              <div className="stat">
                <h3>100%</h3>
                <p>Committed</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
