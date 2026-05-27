const SETTING_GROUPS = {
  security: { 
    items: [
      { id: 'threatIntelligenceFeeds', label: 'Threat Intelligence Feeds' },
      { id: 'aiThreatDetection', label: 'AI Threat Detection' },
      { id: 'googleSafeBrowsing', label: 'Google Safe Browsing' },
      { id: 'cryptojackingProtection', label: 'Cryptojacking Protection' },
      { id: 'dnsRebindingProtection', label: 'DNS Rebinding Protection' },
      { id: 'idnHomographAttackProtection', label: 'IDN Homograph Protection' },
      { id: 'typosquattingProtection', label: 'Typosquatting Protection' },
      { id: 'dga', label: 'DGAs Protection' },
      { id: 'nrd', label: 'Block Newly Registered Domains (NRDs)' },
      { id: 'ddns', label: 'Block Dynamic DNS Hostnames' },
      { id: 'parking', label: 'Block Parked Domains' },
      { id: 'csam', label: 'Block Child Sexual Abuse Material' }
    ]
  },
  privacy: { 
    items: [
      { id: 'disguisedTrackers', label: 'Block Disguised Trackers' },
      { id: 'allowAffiliate', label: 'Allow Affiliate Links' }
    ],
    natives: [
      { id: 'sonos', label: 'Sonos' },
      { id: 'xiaomi', label: 'Xiaomi' },
      { id: 'apple', label: 'Apple' },
      { id: 'windows', label: 'Windows' },
      { id: 'huawei', label: 'Huawei' },
      { id: 'samsung', label: 'Samsung' },
      { id: 'alexa', label: 'Alexa' },
      { id: 'roku', label: 'Roku' }
    ]
  }
};
