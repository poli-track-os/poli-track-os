import { describe, expect, it } from 'vitest';
import {
  parseEgeMembers,
  parsePcastNames,
  parseStrongNames,
} from '../lib/public-record-influence-parser';

describe('public-record influence collector parsers', () => {
  it('extracts PCAST appointment names from the White House paragraph shape', () => {
    const html = `
      <p>The following individuals have been appointed:</p>
      <p>Marc Andreessen<br>Sergey Brin<br>Safra Catz<br>Lisa Su<br>Mark Zuckerberg</p>
    `;

    const names = parsePcastNames(html);

    expect(names).toContain('Marc Andreessen');
    expect(names).toContain('Sergey Brin');
    expect(names).toContain('Lisa Su');
    expect(names).not.toContain('The following individuals have been appointed:');
  });

  it('extracts EU Chief Scientific Advisor names from strong-tag appointment records', () => {
    const html = `
      <p><strong>Dimitra Simeonidou</strong> joins <strong>Rémy Slama</strong>
      and <strong>Naomi Ellemers</strong> with <strong>Mangala Srinivas</strong>
      and <strong>Adam Izdebski</strong>.</p>
    `;

    expect(parseStrongNames(html, [])).toEqual([
      'Dimitra Simeonidou',
      'Rémy Slama',
      'Naomi Ellemers',
      'Mangala Srinivas',
      'Adam Izdebski',
    ]);
  });

  it('extracts EGE member names, role labels, and descriptions from list cards', () => {
    const html = `
      <div class="ecl-list-illustration__title">Barbara Prainsack</div>
      <div class="ecl-list-illustration__description"><div class="ecl">
        <p><strong>Chair</strong></p><p>Professor at the University of Vienna.</p>
      </div></div>
      <div class="ecl-list-illustration__title">Maria do Céu Patrão Neves</div>
      <div class="ecl-list-illustration__description"><div class="ecl">
        <p><strong>Vice-Chair</strong></p><p>Professor of Ethics.</p>
      </div></div>
    `;

    expect(parseEgeMembers(html)).toEqual([
      expect.objectContaining({ name: 'Barbara Prainsack', role: 'Chair' }),
      expect.objectContaining({ name: 'Maria do Céu Patrão Neves', role: 'Vice-Chair' }),
    ]);
  });
});
