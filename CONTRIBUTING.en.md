# Contributing to Tellux

[中文](./CONTRIBUTING.md) | English

Thank you for your interest in Tellux. Contributions are welcome through issues, pull requests, documentation, and examples.

Tellux is an ESM TypeScript GIS viewer built on Three.js. This guide explains how to set up the project, validate changes, and submit a contribution.

## 🚀 Development setup

Tellux uses Node.js, pnpm, TypeScript, Vite, and Vitest.

```bash
git clone https://github.com/cyanfish-x/tellux.git
cd tellux
pnpm install
```

Common commands:

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the examples and documentation sites |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm test:run` | Run tests |
| `pnpm build` | Build library output and declarations |
| `pnpm build:examples` | Build the documentation and examples site |
| `pnpm docs:build` | Build the VitePress documentation only |

## 🗂️ Project structure

- `src/`: Tellux source code and public API implementation.
- `examples/`: Standalone examples, the homepage, and Sandcastle.
- `docs/`: User-facing guides, API documentation, and capability references.
- `notes/`: Maintainer architecture notes, research, and implementation records.
- `dist/`: Build output; update it only when release artifacts need to be refreshed.

Put user-facing tutorials, API documentation, and capability references in `docs/`. Put project architecture, research, and maintenance records in `notes/`. The `examples/public/docs/` directory contains generated documentation output and must not be edited manually.

## 📝 Submitting code

1. Create a short-lived branch from the latest default branch. Use a name that describes the purpose of the change.
2. Keep each commit focused on one clear logical change.
3. Run `pnpm type-check` after changing TypeScript behavior and `pnpm test:run` after changing tests.
4. Run `pnpm build` when changing build output, export paths, or release content.
5. Before opening a pull request, inspect `git diff` and make sure it contains no `.env` files, secrets, temporary files, or unrelated formatting changes.

### Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Commit messages are validated by commitlint and Husky:

```text
<type>(<scope>): <subject>
```

Common types include:

- `feat`: a new feature
- `fix`: a bug fix
- `docs`: documentation changes
- `refactor`: a refactor
- `test`: test changes
- `chore`: build, tooling, or dependency changes

Examples:

```text
feat(viewer): add runtime terrain switching
fix(camera): preserve pitch when flying to target
docs: clarify WebGPU limitations
```

## 🔀 Pull requests

A pull request description should explain:

- What problem is being solved or what capability is being added.
- Which implementation approach was chosen and any compatibility or performance considerations.
- How the change was verified, including the commands that were actually run.
- Whether the change affects the public API, documentation, examples, or build output.

When changing a public API, update the relevant TypeScript JSDoc and `docs/api/` or `docs/guide/` content, and keep the API shape clear in examples. For changes involving the examples site or Sandcastle, read the [examples, docs, and Sandcastle architecture notes](./notes/架构/examples文档与Sandcastle架构.md) first.

## 📚 Documentation and examples

Tellux examples serve both as feature demonstrations and API tutorials. When adding a regular example, check the following:

- `examples/<id>.html` and `examples/<id>.ts` can run independently.
- `examples/vite.config.ts` is updated if a new HTML entry must be registered.
- The Sandcastle registry is updated when categories, titles, descriptions, or tag rules need changes.
- Key Viewer configuration remains visible in the example instead of being hidden inside a shared helper.

## 🎨 Code style

- Follow existing module boundaries, type naming, and configuration grouping patterns.
- Add bilingual JSDoc to public TypeScript APIs, with Chinese first and English second.
- Follow the project coordinate convention: tuple inputs use `[longitude, latitude, height]`, with angles in degrees and heights in meters.
- Add comments only when they explain a non-obvious design reason; do not restate what the code already says.

## 🐛 Reporting issues

When opening an issue, include the Tellux version, Three.js and relevant peer dependency versions, runtime environment, minimal reproduction steps, and any useful console errors or screenshots. For Cesium Ion, WMS, WMTS, or other external services, also include the data source configuration and relevant authorization conditions.

## ⚖️ License

Code and documentation contributed to Tellux are released under the project [MIT License](./LICENSE).