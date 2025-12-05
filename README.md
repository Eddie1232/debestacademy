# DEBEST ACADEMY Website

## Description

DEBEST ACADEMY is a static educational website designed for a school offering quality education from Creche to Junior High School. The website provides comprehensive information about the institution, including details on admission, news and updates, dedicated platforms for students and parents, PTA information, a photo gallery, and a contact form. Built with HTML, CSS, and JavaScript, it features a responsive design, sticky navigation, and interactive elements like a lightbox gallery and Formspree-powered contact form.

## Features

- **Responsive Design**: Optimized for desktop, tablet, and mobile devices.
- **Sticky Navigation**: Easy access to different sections of the site.
- **Photo Gallery**: Includes a responsive gallery with lightbox functionality for viewing images.
- **Contact Form**: Integrated with Formspree for handling inquiries.
- **Platforms**: Dedicated sections for students/parents and PTA.
- **News & Updates**: Latest announcements and events.
- **FAQ Section**: Common questions and answers.
- **Accessibility**: Includes ARIA labels and semantic HTML for better accessibility.

## Prerequisites

- Node.js (includes npm & npx) - for running development scripts.
- VS Code with Live Server extension (recommended for easy local development).

## Installation

1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install the development dependencies:

   ```bash
   npm install
   ```

## Usage

### Starting the Development Server

- To start a simple HTTP server:

  ```bash
  npm run start
  ```

  This serves the site at `http://localhost:5500/`.

- To start with live reload (automatically refreshes on changes):

  ```bash
  npm run bs
  ```

  This opens the site in your browser and watches for file changes.

### Accessing the Site

- Main page: `http://localhost:5500/debest.hmtl/debest.html`
- Alternatively, right-click `debest.html` in VS Code and select "Open with Live Server".

## Project Structure

```
html-website/
├── debest.hmtl/
│   ├── debest.html          # Main homepage
│   ├── apply.html           # Application page
│   ├── debest.css           # Stylesheet
│   ├── debest.js            # JavaScript file
│   ├── photo.html           # Photo gallery page
│   ├── photolibrary.html    # Photo library page
│   ├── pta.html             # PTA platform page
│   ├── students-and-parents-platform.html  # Students/Parents platform page
├── .vscode/
│   ├── settings.json        # VS Code settings
│   ├── launch.json          # VS Code launch configuration
├── package.json             # NPM configuration and scripts
├── README.md                # This file
└── [Other assets like images]
```

## Common Tasks

- **Renaming Files**: Avoid spaces in filenames to prevent issues.
- **Image Optimization**: Use relative paths for images (e.g., `src="images/debest.png"`). Add `loading="lazy"` and `decoding="async"` to large images. Specify `width` and `height` to reduce layout shift.
- **Gallery Setup**: Use `data-full` attribute on gallery thumbnails for lightbox full-size images.
- **Contact Form**: Ensure the Formspree action URL is correctly set in the form's `action` attribute.

## Git Workflow

Set up Git (one time):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Typical workflow:

```bash
git add -A
git commit -m "Your commit message"
git push origin main
```

If commit fails due to author issues:

```bash
git commit --amend --author="Your Name <you@example.com>" --no-edit
git push --force-with-lease origin main
```

## Debugging & Tips

- Check browser DevTools (F12) for console errors and network issues.
- Refresh with Ctrl+F5 to clear cache after updates.
- If `http-server` is not found, use `npx http-server . -p 5500 -c-1` or install globally with `npm i -g http-server`.
- If port 5500 is in use, change to another port: `npx http-server . -p 8080`.

## Next Steps / Improvements

- Implement `srcset` and WebP images for better performance.
- Optimize images using tools like Squoosh.
- Run Lighthouse audits for performance and accessibility.
- Set up CI/CD or deploy to GitHub Pages / Netlify.
- Add testing or linting (e.g., ESLint, stylelint) as the project grows.

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes. Ensure that any new features or changes are tested and follow the existing code style.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or support, please use the contact form on the website or reach out via the provided social media links.

---

*Built with ❤️ for DEBEST ACADEMY - Education as Good as Gold*
