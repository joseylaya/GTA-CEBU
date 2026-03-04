import React from 'react';
import Card from '../../common/Card/Card';
import './Skills.css';

const Skills = () => {
  const skillCategories = [
    {
      title: 'Frontend',
      skills: ['React', 'JavaScript', 'HTML5', 'CSS3', 'jQuery', 'React Native', 'AJAX']
    },
    {
      title: 'Backend',
      skills: ['NodeJs', 'PHP', 'CakePHP', 'ExpressJs', 'REST APIs']
    },
    {
      title: 'Database',
      skills: ['MySQL', 'Database Design', 'SQL Queries']
    },
    {
      title: 'Architecture & Tools',
      skills: ['MVC', 'HMVC', 'OOP', 'Full-Stack Development', 'Git', 'Agile']
    }
  ];

  return (
    <section className="skills section">
      <div className="container">
        <h2 className="section-title">Skills & Technologies</h2>
        <div className="skills-grid">
          {skillCategories.map((category, index) => (
            <Card key={index} hoverable={false}>
              <div className="skill-category">
                <h3>{category.title}</h3>
                <div className="skill-list">
                  {category.skills.map((skill, skillIndex) => (
                    <span key={skillIndex} className="skill-item">{skill}</span>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Skills;
