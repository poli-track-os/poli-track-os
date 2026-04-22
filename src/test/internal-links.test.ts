import { describe, expect, it } from 'vitest';
import {
  buildActorSearchRoute,
  buildCountryRoute,
  buildInternalPersonRoute,
  buildPartyRoute,
  isSamePersonName,
} from '@/lib/internal-links';

describe('internal-links helpers', () => {
  it('builds stable internal country and party routes', () => {
    expect(buildCountryRoute('PT')).toBe('/country/pt');
    expect(buildPartyRoute('PT', 'Chega')).toBe('/country/pt/party/chega');
  });

  it('builds actor search fallbacks with encoded query params', () => {
    expect(buildActorSearchRoute('António Costa', { countryCode: 'PT' })).toBe('/actors?country=pt&q=Ant%C3%B3nio+Costa');
  });

  it('prefers exact actor routes over search fallbacks', () => {
    expect(buildInternalPersonRoute({ actorId: 'ventura', personName: 'André Ventura', countryCode: 'PT' })).toBe('/actors/ventura');
    expect(buildInternalPersonRoute({ personName: 'André Ventura', countryCode: 'PT' })).toBe('/actors?country=pt&q=Andr%C3%A9+Ventura');
  });

  it('normalizes accents and parenthetical suffixes when matching people', () => {
    expect(isSamePersonName('António Costa', 'Antonio Costa')).toBe(true);
    expect(isSamePersonName('André Ventura (MP)', 'Andre Ventura')).toBe(true);
    expect(isSamePersonName('António Costa', 'Luís Montenegro')).toBe(false);
  });
});
