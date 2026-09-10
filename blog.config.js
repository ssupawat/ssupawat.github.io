export default {
  site: {
    name: "art.",
    // Shown above the post list. Leave empty to render no tagline at all.
    tagline: "small things, built to understand bigger ones",
    // Used for the home page meta description and og:description.
    description:
      "Interactive demos and small tools by Supawat Sornwai — signal processing, logic, voice agents, and things built to understand them.",
    url: "https://ssupawat.github.io",
  },

  social: {
    github: "https://github.com/ssupawat",
    facebook: "https://www.facebook.com/mynamesart",
  },

  // Things worth linking from the footer. Most are standalone demos published
  // as GitHub Pages project sites: they share this origin, so linking them from
  // here is what makes them reachable — both for readers and for crawlers,
  // which otherwise have no path to them. `path` is the repo name, and
  // `sitemap: true` means the project publishes its own.
  // A project with no page on this origin uses `url` instead, which links
  // straight out and stays out of this site's sitemap.
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
    {
      name: "DoToken",
      url: "https://github.com/ssupawat/dotoken",
      description: "macOS menu bar app tracking AI usage limits in real time",
    },
    {
      name: "Reconnectable SSE",
      url: "https://github.com/ssupawat/reconnectable-sse",
      description: "SSE streams that resume on any pod after a drop, via Redis Streams",
    },
  ],

  og: {
    seed: 77,
    width: 1200,
    height: 630,
  },
};
