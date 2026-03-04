# Assets Folder

This folder contains all static assets for the portfolio website.

## Structure

```
assets/
├── images/       # Images (photos, project screenshots, etc.)
├── icons/        # Icon files
└── documents/    # PDFs, resume, etc.
```

## Usage

Import assets in your components:

```javascript
import myImage from '../../assets/images/myImage.png';

function MyComponent() {
  return <img src={myImage} alt="Description" />;
}
```

## Recommendations

- Optimize images before adding them (use tools like TinyPNG or ImageOptim)
- Use WebP format for better performance
- Keep file names descriptive and lowercase with hyphens (e.g., `project-screenshot-1.png`)
- Add alt text for all images for accessibility
