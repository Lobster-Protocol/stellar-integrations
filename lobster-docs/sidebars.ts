import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'
import apiSidebar from './docs/api/sidebar'

// hand-authored for the prose pages; the api section is the array gen-api-docs
// emits from openapi/lobster.yaml (docs/api/sidebar.ts).
const sidebars: SidebarsConfig = {
  docs: [
    'getting-started',
    'onboarding-institutional',
    {
      type: 'category',
      label: 'Integrations',
      items: [
        'integrations/allbridge',
        'integrations/wallets-kit',
        'integrations/stellar-broker',
        'integrations/dfns',
      ],
    },
    {
      type: 'category',
      label: 'API reference',
      items: apiSidebar,
    },
  ],
}

export default sidebars
