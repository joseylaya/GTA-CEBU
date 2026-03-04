import React from 'react';
import Card from '../../components/common/Card/Card';
import './AboutPage.css';

const AboutPage = () => {
  return (
    <div className="about-page">
      <div className="page-hero">
        <div className="container">
          <h1>About Me</h1>
          <p>Learn more about my journey and expertise</p>
        </div>
      </div>

      <div className="about-page-content section">
        <div className="container">
          <div className="about-grid">
            <div className="about-main">
              <Card>
                <h2>My Story</h2>
                <p>
                  I'm Jose Marie Ylaya, a passionate full-stack web developer with over 2 years of professional 
                  experience building web and mobile applications. Currently working at Forty Degrees Celsius Inc. 
                  in Cebu City, I specialize in both front-end and back-end development, with expertise in modern 
                  frameworks and technologies.
                </p>
                <p>
                  My journey began at Proweaver where I honed my skills in React, NodeJs, and full-stack 
                  development. I worked on diverse projects involving responsive web design, mobile apps with 
                  React Native, and RESTful API development. Now at Forty Degrees Celsius, I focus on back-end 
                  development using PHP and CakePHP, implementing robust MVC architecture patterns.
                </p>
                <p>
                  I'm proficient in modern JavaScript frameworks, object-oriented programming, database design, 
                  and creating scalable web solutions. I believe in writing clean, maintainable code and 
                  continuously learning new technologies to deliver exceptional results.
                </p>
              </Card>

              <Card>
                <h2>Education</h2>
                <div className="education-item">
                  <h3>Bachelor of Science in Computer Science</h3>
                  <p className="education-school">Asian College of Technology</p>
                  <p className="education-year">Cebu City, Philippines</p>
                </div>
              </Card>

              <Card>
                <h2>Experience</h2>
                <div className="experience-list">
                  <div className="experience-item">
                    <h3>Web Developer</h3>
                    <p className="experience-company">Forty Degrees Celsius Inc.</p>
                    <p className="experience-period">Mar 2024 - Present · 2 yrs 1 mo</p>
                    <ul>
                      <li>Develop and maintain web applications using CakePHP framework</li>
                      <li>Implement back-end solutions with MVC architecture patterns</li>
                      <li>Write object-oriented PHP code following best practices</li>
                      <li>Collaborate with team members on full-time on-site projects</li>
                    </ul>
                  </div>
                  <div className="experience-item">
                    <h3>Software Programmer II</h3>
                    <p className="experience-company">Proweaver</p>
                    <p className="experience-period">Sep 2022 - Mar 2024 · 1 yr 7 mos</p>
                    <ul>
                      <li>Built full-stack web applications using React and NodeJs</li>
                      <li>Developed responsive interfaces with HTML5, CSS, and JavaScript</li>
                      <li>Created mobile applications using React Native</li>
                      <li>Implemented RESTful APIs with Express.js and MySQL database</li>
                      <li>Utilized MVC/HMVC patterns, AJAX, and jQuery for dynamic web solutions</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>

            <div className="about-sidebar">
              <Card>
                <h3>Quick Facts</h3>
                <ul className="facts-list">
                  <li><strong>Location:</strong> Cebu City, Philippines</li>
                  <li><strong>Languages:</strong> English, Filipino</li>
                  <li><strong>Current Role:</strong> Web Developer</li>
                  <li><strong>Company:</strong> Forty Degrees Celcius</li>
                </ul>
              </Card>

              <Card>
                <h3>Skills & Technologies</h3>
                <ul className="certifications-list">
                  <li>React & React Native</li>
                  <li>NodeJs & ExpressJs</li>
                  <li>PHP & CakePHP</li>
                  <li>HTML5, CSS3 & JavaScript</li>
                  <li>MySQL Database</li>
                  <li>MVC/HMVC Architecture</li>
                  <li>Object-Oriented Programming</li>
                  <li>Full-Stack Development</li>
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
