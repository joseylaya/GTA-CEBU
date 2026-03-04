# Portfolio Website - Project Structure

## Folder Organization

```
portfolio-website/
│
├── public/                          # Static files
│   ├── index.html                   # HTML template
│   └── manifest.json               # PWA manifest
│
├── src/                            # Source files
│   │
│   ├── components/                 # React components
│   │   ├── common/                # Reusable UI components
│   │   │   ├── Button/           # Button component
│   │   │   │   ├── Button.js
│   │   │   │   └── Button.css
│   │   │   └── Card/             # Card component
│   │   │       ├── Card.js
│   │   │       └── Card.css
│   │   │
│   │   ├── layout/                # Layout components
│   │   │   ├── Header/           # Header/Navigation
│   │   │   │   ├── Header.js
│   │   │   │   └── Header.css
│   │   │   └── Footer/           # Footer
│   │   │       ├── Footer.js
│   │   │       └── Footer.css
│   │   │
│   │   └── sections/              # Page sections
│   │       ├── Hero/             # Hero section
│   │       ├── About/            # About section
│   │       ├── Projects/         # Projects showcase
│   │       ├── Skills/           # Skills display
│   │       └── Contact/          # Contact form
│   │
│   ├── pages/                     # Page components
│   │   ├── HomePage/             # Home page
│   │   ├── ProjectsPage/         # Projects page
│   │   ├── AboutPage/            # About page
│   │   └── ContactPage/          # Contact page
│   │
│   ├── assets/                    # Static assets
│   │   ├── images/               # Images
│   │   ├── icons/                # Icons
│   │   └── documents/            # PDFs, resume, etc.
│   │
│   ├── styles/                    # Global styles
│   │   └── [CSS files]
│   │
│   ├── utils/                     # Utility functions
│   │   └── helpers.js            # Helper functions
│   │
│   ├── constants/                 # Constants and config
│   │   └── index.js              # App constants
│   │
│   ├── App.js                    # Main App component
│   ├── App.css                   # App styles
│   ├── index.js                  # Entry point
│   └── index.css                 # Global styles
│
├── .gitignore                     # Git ignore file
├── .env.example                   # Environment variables template
├── jsconfig.json                  # JavaScript config
├── package.json                   # Dependencies
└── README.md                      # Project documentation
```

## Naming Conventions

### Files & Folders
- **Components**: PascalCase (e.g., `Button.js`, `Header.js`)
- **Utilities**: camelCase (e.g., `helpers.js`, `validators.js`)
- **Styles**: Match component name (e.g., `Button.css`)
- **Folders**: PascalCase for component folders, lowercase for others

### Code
- **Components**: PascalCase (e.g., `const Button = () => {}`)
- **Functions**: camelCase (e.g., `const handleClick = () => {}`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `const API_URL = "..."`)
- **Props**: camelCase (e.g., `onClick`, `isActive`)

## Component Structure

Each component follows this structure:
```
ComponentName/
├── ComponentName.js    # Component logic
└── ComponentName.css   # Component styles
```

## Best Practices

1. **One component per file**: Each file should export one main component
2. **Co-located styles**: Keep CSS files next to their components
3. **Index exports**: Use index.js files for cleaner imports
4. **Modular code**: Keep components small and focused
5. **Consistent naming**: Follow the naming conventions strictly
6. **DRY principle**: Reuse common components and utilities
7. **Props documentation**: Document component props clearly
8. **Accessibility**: Add proper ARIA labels and semantic HTML

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```

3. Start development server:
   ```bash
   npm start
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Customization

1. Update personal information in `src/constants/index.js`
2. Replace placeholder images in `src/assets/`
3. Modify color scheme in `src/index.css` (CSS variables)
4. Update project data in `src/components/sections/Projects/Projects.js`
5. Customize content in page components

## Key Features

- ✅ Responsive design
- ✅ Modern React patterns (Hooks, functional components)
- ✅ Client-side routing with React Router
- ✅ Reusable component library
- ✅ Clean, maintainable code structure
- ✅ Accessible markup
- ✅ SEO-friendly
- ✅ Performance optimized

## Adding New Pages

1. Create page folder in `src/pages/`
2. Create component and styles
3. Export from `src/pages/index.js`
4. Add route in `src/App.js`
5. Add navigation link in `src/components/layout/Header/Header.js`
