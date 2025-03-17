# QueryLeaf Documentation

This directory contains the source files for the QueryLeaf documentation site. The documentation is built using [MkDocs](https://www.mkdocs.org/) with the [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) theme.

## Viewing the Documentation

You can view the documentation in several ways:

1. **Online**: Visit the published documentation at [queryleaf.com/docs](https://queryleaf.com/docs)

2. **Locally**: Run the documentation server locally with:
   ```bash
   npm run docs:serve
   ```
   Then open your browser to [http://localhost:8000](http://localhost:8000)

## Documentation Structure

The documentation is organized as follows:

- `index.md`: Home page
- `getting-started/`: Installation and quickstart guides
- `usage/`: Core concepts and usage examples
- `sql-syntax/`: Detailed SQL syntax reference
- `debugging/`: Troubleshooting and limitations
- `licenses/`: License information
- `assets/`: Images and other static assets
- `stylesheets/`: Custom CSS styles

## Contributing to the Documentation

We welcome contributions to improve the documentation. Follow these steps:

1. Make your changes to the Markdown files in this directory
2. Run `npm run docs:serve` to preview your changes locally
3. Once you're satisfied, submit a pull request with your changes

## Building the Documentation

To build a static version of the documentation:

```bash
npm run docs:build
```

This will generate a `site` directory containing the static HTML, CSS, and JavaScript files.

## Deploying the Documentation

To deploy the documentation to GitHub Pages:

```bash
npm run docs:deploy
```

This will build the documentation and deploy it to the `gh-pages` branch of the repository.

## Documentation Technology

- [MkDocs](https://www.mkdocs.org/): The documentation site generator
- [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/): The theme for the documentation
- [Python-Markdown](https://python-markdown.github.io/): The Markdown parser
- [PyMdown Extensions](https://facelessuser.github.io/pymdown-extensions/): Extensions for Python-Markdown

## Local Development Setup

To set up the documentation development environment:

1. Install Python 3.x
2. Install MkDocs and all required packages using the requirements.txt file:
   ```bash
   pip install -r ../requirements.txt
   ```

## Documentation Guidelines

When contributing to the documentation, please follow these guidelines:

1. Use clear, concise language
2. Include code examples where appropriate
3. Follow the existing structure and formatting
4. Test your changes locally before submitting
5. Use proper Markdown syntax and formatting
6. Include screenshots or diagrams for complex concepts when helpful

## License

The documentation is licensed under the same terms as the QueryLeaf project.