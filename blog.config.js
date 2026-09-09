export default {
  site: {
    name: "art.",
    // Shown above the post list. Leave empty to render no tagline at all.
    tagline: "small things, built to understand bigger ones",
    // Used for the home page meta description and og:description.
    description:
      "Interactive demos and small tools by Supawat Sornwai — signal processing, logic, voice agents, and things built to understand them.",
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
      description: "Interactive Nyquist sampling theorem demo",
      sitemap: true,
    },
    {
      name: "Monocle",
      path: "monocle",
      description: "Propositional logic playground with a DPLL solver",
    },
    {
      name: "252330 BJT Amplifier Lab",
      path: "lt-spice-bjt-amplifier-lab",
      description: "LTspice + Python lab notebook for BJT amplifier stages",
    },
    {
      name: "2 Digits",
      path: "thai-lottery-2digit-stats",
      description: "Thai lottery two-digit statistics, as a PWA",
    },
    {
      name: "OT Calculator",
      path: "overtime-calculator",
      description: "Overtime pay calculator, as a PWA",
    },
  ],

  og: {
    seed: 77,
    width: 1200,
    height: 630,
  },
};
