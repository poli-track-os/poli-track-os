import { describe, expect, it } from 'vitest';
import {
  buildEstimatedPoliticalPosition,
  getIdeologyDisplayLabel,
  getIdeologyFamily,
  resolvePoliticalPosition,
} from '@/lib/political-positioning';

describe('political positioning helpers', () => {
  it('separates centrist from unclassified in the ideology taxonomy', () => {
    expect(getIdeologyDisplayLabel('Centrist / Unclassified')).toBe('Unclassified');
    expect(getIdeologyFamily('Centrist / Unclassified')).toBe('Unclassified');
    expect(getIdeologyFamily('Liberal / centrist')).toBe('Centrist');
  });

  it('derives a right-wing populist estimate for Chega / André Ventura style inputs', () => {
    expect(buildEstimatedPoliticalPosition('Chega', 'CH', 'PT')).toMatchObject({
      ideology_label: 'Right-wing populist',
      eu_integration_score: -4,
      immigration_score: -8,
      key_positions: {
        eu_integration: 'eurosceptic',
        immigration: 'restrictive',
      },
    });
  });

  it('replaces legacy combined rows with a stricter party-profile estimate when a known party exists', () => {
    expect(resolvePoliticalPosition({
      ideology_label: 'Centrist / Unclassified',
      data_source: 'party_family_mapping',
      economic_score: -0.8,
      social_score: 1.6,
      eu_integration_score: 2.7,
      immigration_score: 1.5,
      key_positions: {
        eu_federalism: 'neutral',
        climate_action: 'moderate',
      },
    }, 'Chega', 'CH', 'PT')).toMatchObject({
      ideology_label: 'Right-wing populist',
      data_source: 'party_profile_estimate',
      eu_integration_score: -4,
      immigration_score: -8,
      key_positions: {
        eu_integration: 'eurosceptic',
        immigration: 'restrictive',
      },
    });
  });

  it('sanitizes unknown legacy rows into honest unclassified records', () => {
    expect(resolvePoliticalPosition({
      ideology_label: 'Centrist / Unclassified',
      data_source: 'party_family_mapping',
      economic_score: 1.2,
      social_score: -0.4,
      eu_integration_score: 2.2,
      immigration_score: 0.8,
      key_positions: {
        eu_federalism: 'neutral',
      },
    }, null, null, 'PT')).toMatchObject({
      ideology_label: 'Unclassified',
      data_source: 'unclassified_party_profile',
      economic_score: null,
      social_score: null,
      eu_integration_score: null,
      immigration_score: null,
      key_positions: {},
    });
  });
});
