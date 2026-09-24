import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'
import type * as OpenApiPlugin from 'docusaurus-plugin-openapi-docs'

// no blog, no i18n, no versioning, no search. not hosted yet, the pages are read
// on github; DOCS_BASE_URL sets the origin once it is. noindex until then.
const config: Config = {
  title: 'Lobster Protocol',
  tagline: 'Institutional liquidity on Stellar',
  url: process.env.DOCS_BASE_URL ?? 'https://docs.lobster-protocol.com',
  baseUrl: '/',
  noIndex: true,
  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'warn' } },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          docItemComponent: '@theme/ApiItem',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'api',
        docsPluginId: 'classic',
        config: {
          lobster: {
            specPath: 'openapi/lobster.yaml',
            outputDir: 'docs/api',
            sidebarOptions: { groupPathsBy: 'tag' },
            showSchemas: true,
          } satisfies OpenApiPlugin.Options,
        },
      },
    ],
  ],

  themes: ['docusaurus-theme-openapi-docs'],

  themeConfig: {
    navbar: {
      title: 'Lobster Protocol',
      items: [{ to: '/', label: 'Docs', position: 'left' }],
    },
    footer: {
      style: 'dark',
      links: [],
      copyright: 'Lobster Protocol',
    },
  } satisfies Preset.ThemeConfig,
}

export default config
