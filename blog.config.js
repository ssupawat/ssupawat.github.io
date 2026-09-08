export default {
  site: {
    name: "art.",
    tagline: "Nothing to see here yet 😅.",
    url: "https://ssupawat.github.io",
    repo: "https://github.com/ssupawat/ssupawat.github.io",
  },

  social: {
    github: "https://github.com/ssupawat",
    facebook: "https://www.facebook.com/mynamesart",
  },

  // Standalone demos published as GitHub Pages project sites. They share this
  // origin, so linking them from here is what makes them reachable — both for
  // readers and for crawlers, which otherwise have no path to them.
  // `path` is the repo name; `sitemap: true` means it publishes its own.
  projects: [
    {
      name: "Aliasing in sampling",
      path: "aliasing-demo",
      description: "ทฤษฎีบท Nyquist แบบโต้ตอบ",
      sitemap: true,
    },
  ],

  og: {
    seed: 77,
    width: 1200,
    height: 630,
  },
};
