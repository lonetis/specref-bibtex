# specref-bibtex

Every reference in [Specref](https://www.specref.org/) (W3C, WHATWG, IETF, ISO, ETSI, WG21 and more) as a single BibTeX file, refreshed daily. Browse, search, copy or download it at **https://lonetis.github.io/specref-bibtex/**.

## Features

- One `specref.bib` with all ~70,000 Specref entries, including dated versions such as `css-grid-1-20170209`
- Citation keys match Specref ids, so `[[rfc7230]]` in ReSpec becomes `\cite{rfc7230}` in LaTeX
- Specref aliases (e.g. `HTTP11`) resolve to their entry in biblatex through the `ids` field
- Works with biblatex/biber and classic BibTeX: titles keep their capitalization, LaTeX special characters are escaped, URLs go in the `url` field
- GitHub Pages site with the latest file for download, copy all, and search to copy single entries
- Rebuilt every day from the latest Specref data by GitHub Actions

## Getting Started

### Configuration

Copy `.env.example` to `.env` and adjust it if needed. The defaults work as-is.

### Development Setup

Requires Node.js 24 or newer.

```sh
npm install
npm test            # unit tests
npm run typecheck   # TypeScript checks
npm run build       # fetch Specref and write the site to dist/
npx serve dist      # preview the site locally
```

### Production Setup

The site is deployed by the [`Build and deploy`](.github/workflows/pages.yml) workflow on every push to `main`, once a day, and on manual dispatch.

To enable it on a fork, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

## Using the file

Download [`specref.bib`](https://lonetis.github.io/specref-bibtex/specref.bib) or reference it straight from your build:

```sh
curl -sSfLO https://lonetis.github.io/specref-bibtex/specref.bib
```

The file is UTF-8. biblatex with biber is recommended; with pdfLaTeX and classic BibTeX, entries with characters outside your font encoding (e.g. CJK titles) may need extra packages.

Found a wrong or missing reference? Fix it upstream in [Specref](https://github.com/specinfra/specref/blob/main/CONTRIBUTING.md); the change shows up here within a day.

## Acknowledgements and license

This project is a wrapper around [Specref](https://www.specref.org/) ([specinfra/specref](https://github.com/specinfra/specref)) and is not affiliated with it. Thanks to the Specref maintainers and contributors for curating the data.

- **Reference data**: from the Specref database, dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Code**: [Apache License 2.0](LICENSE), the same license as Specref's code. See [NOTICE](NOTICE) for attributions.
