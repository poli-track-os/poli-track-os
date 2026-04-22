import { describe, expect, it } from 'vitest';
import {
  buildEduskuntaDetailUrl,
  buildEduskuntaListEntry,
  buildProposalFromEduskuntaDetail,
  normalizeEduskuntaReference,
  pickPreferredEduskuntaListEntry,
} from '@/lib/eduskunta-helpers';

const SAMPLE_XML = `
<Siirto>
  <SiirtoMetatieto>
    <JulkaisuMetatieto eduskuntaTunnus="HE 70/2026 vp" laadintaPvm="2026-04-16" tilaKoodi="Käsittelyssä">
      <IdentifiointiOsa>
        <Nimeke>
          <NimekeTeksti>Hallituksen esitys eduskunnalle vuoden 2026 lisätalousarvioksi</NimekeTeksti>
        </Nimeke>
      </IdentifiointiOsa>
    </JulkaisuMetatieto>
  </SiirtoMetatieto>
  <SiirtoAsiakirja>
    <RakenneAsiakirja>
      <HallituksenEsitys>
        <IdentifiointiOsa>
          <Nimeke>
            <NimekeTeksti>Hallituksen esitys eduskunnalle vuoden 2026 lisätalousarvioksi</NimekeTeksti>
          </Nimeke>
        </IdentifiointiOsa>
        <SisaltoKuvaus>
          <KappaleKooste>Esityksessä ehdotetaan valtion vuoden 2026 talousarvion muuttamista.</KappaleKooste>
          <KappaleKooste>Lisätalousarvio vahvistaa valtion rahoitusta.</KappaleKooste>
        </SisaltoKuvaus>
        <AllekirjoitusOsa>
          <Allekirjoittaja>
            <Henkilo>
              <AsemaTeksti>Pääministeri</AsemaTeksti>
              <EtuNimi>Petteri</EtuNimi>
              <SukuNimi>Orpo</SukuNimi>
            </Henkilo>
          </Allekirjoittaja>
          <Allekirjoittaja>
            <Henkilo>
              <AsemaTeksti>Valtiovarainministeri</AsemaTeksti>
              <EtuNimi>Riikka</EtuNimi>
              <SukuNimi>Purra</SukuNimi>
            </Henkilo>
          </Allekirjoittaja>
        </AllekirjoitusOsa>
      </HallituksenEsitys>
    </RakenneAsiakirja>
  </SiirtoAsiakirja>
</Siirto>
`;

describe('normalizeEduskuntaReference', () => {
  it('keeps the first parliamentary reference when the feed duplicates it', () => {
    expect(normalizeEduskuntaReference('HE 70/2026 vp, HE 70/2026 vp')).toBe('HE 70/2026 vp');
  });
});

describe('buildEduskuntaListEntry', () => {
  it('maps one official list row', () => {
    expect(buildEduskuntaListEntry([
      '336342',
      'HE 70/2026 vp, HE 70/2026 vp',
      '2026-04-17 13:03:53',
      '',
      '',
      '',
      '',
      'fi',
    ])).toEqual({
      id: '336342',
      reference: 'HE 70/2026 vp',
      createdAt: '2026-04-17 13:03:53',
      language: 'fi',
    });
  });
});

describe('pickPreferredEduskuntaListEntry', () => {
  it('prefers the newest official row for the same parliamentary reference', () => {
    const older = buildEduskuntaListEntry(['336340', 'HE 69/2026 vp', '2026-04-16 14:38:48', '', '', '', '', 'fi']);
    const newer = buildEduskuntaListEntry(['336341', 'HE 69/2026 vp, HE 69/2026 vp', '2026-04-17 13:03:40', '', '', '', '', 'fi']);
    expect(older).toBeTruthy();
    expect(newer).toBeTruthy();
    expect(pickPreferredEduskuntaListEntry(older!, newer!)).toEqual(newer);
  });
});

describe('buildProposalFromEduskuntaDetail', () => {
  it('maps an in-process Finnish government proposal from official XML', () => {
    const entry = {
      id: '336342',
      reference: 'HE 70/2026 vp',
      createdAt: '2026-04-17 13:03:53',
      language: 'fi',
    };

    const row = [
      '336342',
      SAMPLE_XML,
      '5',
      '2026-04-17 13:03:53',
      'HE 70/2026 vp',
      '961912',
      '2026-04-17 11:11:12.309733',
    ];

    expect(buildProposalFromEduskuntaDetail(entry, row)).toMatchObject({
      title: 'Hallituksen esitys eduskunnalle vuoden 2026 lisätalousarvioksi',
      official_title: 'Hallituksen esitys eduskunnalle vuoden 2026 lisätalousarvioksi',
      status: 'parliamentary_deliberation',
      country_code: 'FI',
      submitted_date: '2026-04-16',
      sponsors: ['Petteri Orpo', 'Riikka Purra'],
      policy_area: 'finance',
      source_url: buildEduskuntaDetailUrl('336342'),
      data_source: 'eduskunta',
    });
  });
});
