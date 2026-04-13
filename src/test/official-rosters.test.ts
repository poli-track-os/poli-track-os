import { describe, expect, it } from 'vitest';
import {
  extractPortugalCurrentLegislatureUrl,
  extractPortugalRegistryJsonUrl,
  normalizeNameForMatch,
  parseBundestagMembersXml,
  parsePortugalBiographicalRegistryJson,
  parsePortugalAssemblyRoster,
} from '@/lib/official-rosters';

describe('official roster parsers', () => {
  it('parses current Portuguese deputies from official parliament html', () => {
    const html = `
      <div class="col-xs-12 col-lg-4" style="padding-top: 15px">
        <div class="TextoRegular-Titulo">Nome</div>
        <a title="Biografia de André Ventura" class="TextoRegular" href="/DeputadoGP/Paginas/Biografia.aspx?BID=6535">André Ventura</a>
      </div>
      <div class="col-xs-12 col-lg-4" style="padding-top: 15px">
        <div class="TextoRegular-Titulo">Círculo Eleitoral</div>
        <span class="TextoRegular">Lisboa</span>
      </div>
      <div class="col-xs-12 col-lg-4" style="padding-top: 15px">
        <div class="TextoRegular-Titulo">Grupo Parlamentar / Partido</div>
        <span class="TextoRegular">CH</span>
      </div>
      <div class="col-xs-12 col-lg-4" style="padding-top: 15px">
        <div class="TextoRegular-Titulo">Nome</div>
        <a title="Biografia de Rui Tavares" class="TextoRegular" href="/DeputadoGP/Paginas/Biografia.aspx?BID=8249">Rui Tavares</a>
      </div>
      <div class="col-xs-12 col-lg-4" style="padding-top: 15px">
        <div class="TextoRegular-Titulo">Círculo Eleitoral</div>
        <span class="TextoRegular">Lisboa</span>
      </div>
      <div class="col-xs-12 col-lg-4" style="padding-top: 15px">
        <div class="TextoRegular-Titulo">Grupo Parlamentar / Partido</div>
        <span class="TextoRegular">L</span>
      </div>
    `;

    const records = parsePortugalAssemblyRoster(html);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      recordId: 'pt-ar:6535',
      name: 'André Ventura',
      constituency: 'Lisboa',
      partyAbbreviation: 'CH',
      partyName: 'Chega',
    });
    expect(records[1]).toMatchObject({
      recordId: 'pt-ar:8249',
      name: 'Rui Tavares',
      partyAbbreviation: 'L',
      partyName: 'Livre',
    });
  });

  it('parses the Portugal open-data registry and keeps current-legislature party metadata', () => {
    const json = JSON.stringify([
      {
        CadId: 6535,
        CadNomeCompleto: 'André Claro Amaral Ventura',
        CadDeputadoLegis: [
          {
            LegDes: 'XVII',
            CeDes: 'Lisboa',
            DepNomeParlamentar: 'André Ventura',
            GpDes: 'Chega',
            GpSigla: 'CH',
            IndData: null,
          },
          {
            LegDes: 'XVI',
            CeDes: 'Lisboa',
            DepNomeParlamentar: 'André Ventura',
            GpDes: 'Chega',
            GpSigla: 'CH',
            IndData: null,
          },
        ],
      },
      {
        CadId: 9999,
        CadNomeCompleto: 'Deputado Antigo',
        CadDeputadoLegis: [
          {
            LegDes: 'XVI',
            CeDes: 'Porto',
            DepNomeParlamentar: 'Deputado Antigo',
            GpDes: 'Partido Socialista',
            GpSigla: 'PS',
            IndData: null,
          },
        ],
      },
    ]);

    const records = parsePortugalBiographicalRegistryJson(json, 'XVII');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      recordId: 'pt-ar:6535',
      name: 'André Ventura',
      constituency: 'Lisboa',
      partyAbbreviation: 'CH',
      partyName: 'Chega',
      sourceUrl: 'https://www.parlamento.pt/DeputadoGP/Paginas/Biografia.aspx?BID=6535',
    });
    expect(records[0].alternateNames).toEqual(['André Ventura', 'André Claro Amaral Ventura']);
  });

  it('parses only active Bundestag members from current open-data xml', () => {
    const xml = `
      <DOCUMENT>
        <MDB>
          <ID>11001234</ID>
          <NAMEN>
            <NAME>
              <NACHNAME>Mustermann</NACHNAME>
              <VORNAME>Max</VORNAME>
              <ORTSZUSATZ></ORTSZUSATZ>
              <ADEL></ADEL>
              <PRAEFIX></PRAEFIX>
              <HISTORIE_BIS></HISTORIE_BIS>
            </NAME>
          </NAMEN>
          <BIOGRAFISCHE_ANGABEN>
            <PARTEI_KURZ>AfD</PARTEI_KURZ>
          </BIOGRAFISCHE_ANGABEN>
          <WAHLPERIODEN>
            <WAHLPERIODE>
              <WP>21</WP>
              <MDBWP_VON>25.03.2025</MDBWP_VON>
              <MDBWP_BIS></MDBWP_BIS>
              <WKR_NAME>Berlin-Mitte</WKR_NAME>
              <WKR_LAND>BE</WKR_LAND>
              <INSTITUTIONEN>
                <INSTITUTION>
                  <INSART_LANG>Fraktion/Gruppe</INSART_LANG>
                  <INS_LANG>AfD-Fraktion</INS_LANG>
                </INSTITUTION>
              </INSTITUTIONEN>
            </WAHLPERIODE>
          </WAHLPERIODEN>
        </MDB>
        <MDB>
          <ID>11005678</ID>
          <NAMEN>
            <NAME>
              <NACHNAME>Altmann</NACHNAME>
              <VORNAME>Erika</VORNAME>
              <ORTSZUSATZ></ORTSZUSATZ>
              <ADEL></ADEL>
              <PRAEFIX></PRAEFIX>
              <HISTORIE_BIS></HISTORIE_BIS>
            </NAME>
          </NAMEN>
          <BIOGRAFISCHE_ANGABEN>
            <PARTEI_KURZ>SPD</PARTEI_KURZ>
          </BIOGRAFISCHE_ANGABEN>
          <WAHLPERIODEN>
            <WAHLPERIODE>
              <WP>21</WP>
              <MDBWP_VON>25.03.2025</MDBWP_VON>
              <MDBWP_BIS>01.09.2025</MDBWP_BIS>
              <WKR_NAME>Hamburg</WKR_NAME>
              <WKR_LAND>HH</WKR_LAND>
              <INSTITUTIONEN>
                <INSTITUTION>
                  <INSART_LANG>Fraktion/Gruppe</INSART_LANG>
                  <INS_LANG>SPD-Fraktion</INS_LANG>
                </INSTITUTION>
              </INSTITUTIONEN>
            </WAHLPERIODE>
          </WAHLPERIODEN>
        </MDB>
      </DOCUMENT>
    `;

    const records = parseBundestagMembersXml(xml, new Date('2026-04-13T00:00:00Z'));

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      recordId: 'de-bundestag:11001234',
      name: 'Max Mustermann',
      partyAbbreviation: 'AfD',
      partyName: 'Alternative for Germany',
      constituency: 'Berlin-Mitte / BE',
      inOfficeSince: '2025-03-25',
    });
    expect(records[0].alternateNames).toEqual(['Max Mustermann']);
  });

  it('normalizes politician names for safe country-local matching', () => {
    expect(normalizeNameForMatch('Dr. André Ventura')).toBe('andre ventura');
    expect(normalizeNameForMatch('Bruno Ventura (politician)')).toBe('bruno ventura');
    expect(normalizeNameForMatch('Bündnis 90/Die Grünen')).toBe('bundnis 90 die grunen');
  });

  it('extracts the latest Portugal legislature and JSON resource links from the open-data pages', () => {
    const rootHtml = `
      <a title="Pasta XVI Legislatura" href="/Cidadania/Paginas/DARegistoBiografico.aspx?t=old&amp;Path=old">XVI Legislatura</a>
      <a title="Pasta XVII Legislatura" href="/Cidadania/Paginas/DARegistoBiografico.aspx?t=current&amp;Path=current">XVII Legislatura</a>
    `;
    const childHtml = `
      <a href="https://app.parlamento.pt/webutils/docs/doc.txt?path=abc&amp;fich=RegistoBiograficoXVII_json.txt&amp;Inline=true">RegistoBiograficoXVII_json.txt</a>
    `;

    expect(extractPortugalCurrentLegislatureUrl(rootHtml)).toEqual({
      legislature: 'XVII',
      url: 'https://www.parlamento.pt/Cidadania/Paginas/DARegistoBiografico.aspx?t=current&Path=current',
    });
    expect(extractPortugalRegistryJsonUrl(childHtml)).toBe(
      'https://app.parlamento.pt/webutils/docs/doc.txt?path=abc&fich=RegistoBiograficoXVII_json.txt&Inline=true',
    );
  });
});
