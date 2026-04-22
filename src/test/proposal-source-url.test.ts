import { describe, expect, it } from 'vitest';
import { resolveProposalSourceFallbackUrl, resolveProposalSourceUrl } from '@/lib/proposal-source-url';

describe('resolveProposalSourceUrl', () => {
  it('rewrites broken Bundestag vorgang links to DIP search links', () => {
    const url = resolveProposalSourceUrl({
      data_source: 'bundestag_dip',
      source_url: 'https://dip.bundestag.de/vorgang/310586',
    });
    expect(url).toBe('https://dip.bundestag.de/suche?term=310586');
  });

  it('keeps non-Bundestag links unchanged', () => {
    const url = resolveProposalSourceUrl({
      data_source: 'parltrack',
      source_url: 'https://oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do?reference=2024/1234',
    });
    expect(url).toBe('https://oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do?reference=2024/1234');
  });

  it('normalizes insecure http links to https', () => {
    const url = resolveProposalSourceUrl({
      data_source: 'riksdag',
      source_url: 'http://data.riksdagen.se/votering/ABC',
    });
    expect(url).toBe('https://data.riksdagen.se/votering/ABC');
  });
});

describe('resolveProposalSourceFallbackUrl', () => {
  it('builds fallback search for non-Bundestag sources', () => {
    const url = resolveProposalSourceFallbackUrl({
      data_source: 'parltrack',
      source_url: 'https://oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do?reference=2024/1234',
      title: 'AI Act',
      official_title: 'AI Act Regulation',
    });
    expect(url).toContain('duckduckgo.com');
    expect(url).toContain('oeil.secure.europarl.europa.eu');
  });

  it('builds DIP search fallback for Bundestag sources', () => {
    const url = resolveProposalSourceFallbackUrl({
      data_source: 'bundestag_dip',
      source_url: 'https://dip.bundestag.de/vorgang/310586',
      title: 'Medizinforschungsgesetz',
      official_title: 'Medizinforschungsgesetz',
    });
    expect(url).toBe('https://dip.bundestag.de/suche?term=310586');
  });
});
