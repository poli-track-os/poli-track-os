import { describe, expect, it } from 'vitest';
import { parseHatvpAssetDeclaration, parseHatvpInterestDeclaration, parseHatvpNumber } from '../lib/hatvp-asset-parser';

describe('HATVP asset parser', () => {
  it('normalizes French-formatted amounts', () => {
    expect(parseHatvpNumber('1 234 567,89')).toBe(1234567.89);
    expect(parseHatvpNumber('53 265')).toBe(53265);
    expect(parseHatvpNumber('[Données non publiées]')).toBeNull();
  });

  it('extracts declared assets, property, debt, and net worth', () => {
    const parsed = parseHatvpAssetDeclaration({
      dateDepot: '13/11/2025 08:07:30',
      general: { typeDeclaration: { id: 'DSP' } },
      immeubleDto: {
        items: {
          items: [
            { nature: 'Appartement', codePostal: '[Données non publiées] (Département : 75)', valeurVenale: 300000 },
            { nature: 'Maison', valeurVenale: '450 000' },
          ],
        },
      },
      comptesBancaireDto: {
        items: { items: { typeCompte: 'Compte courant', etablissement: 'Banque', valeur: '12 500' } },
      },
      passifDto: {
        items: { items: { nature: 'Emprunt immobilier', nomCreancier: 'Banque', montant: 200000, restantDu: 125000 } },
      },
    });

    expect(parsed.declarationDate).toBe('2025-11-13');
    expect(parsed.declaredAssets).toBe(762500);
    expect(parsed.propertyValue).toBe(750000);
    expect(parsed.declaredDebt).toBe(125000);
    expect(parsed.netWorth).toBe(637500);
    expect(parsed.items).toHaveLength(4);
  });

  it('separates side income from public office pay and extracts participations', () => {
    const parsed = parseHatvpInterestDeclaration({
      dateDepot: '25/07/2025 10:17:04',
      general: { typeDeclaration: { id: 'DIM' } },
      activProfCinqDerniereDto: {
        items: {
          items: {
            description: 'Auteur',
            employeur: 'Publisher',
            remuneration: { montant: { montant: [{ annee: 2024, montant: '88 068' }, { annee: 2025, montant: '640 147' }] } },
          },
        },
      },
      mandatElectifDto: {
        items: {
          items: {
            descriptionMandat: 'Député au Parlement européen',
            remuneration: { montant: { montant: { annee: 2024, montant: '72 792' } } },
          },
        },
      },
      participationFinanciereDto: {
        items: { items: { nomSociete: 'Crédit Agricole SA', evaluation: 3190, capitalDetenu: 0.1, nombreParts: 270 } },
      },
    });

    expect(parsed.sideIncomeByYear).toEqual({ 2024: 88068, 2025: 640147 });
    expect(parsed.incomeEntries.some((entry) => entry.isPublicOfficePay && entry.amount === 72792)).toBe(true);
    expect(parsed.financialInterests).toEqual([
      expect.objectContaining({ companyName: 'Crédit Agricole SA', value: 3190, shareCount: 270 }),
    ]);
  });
});
