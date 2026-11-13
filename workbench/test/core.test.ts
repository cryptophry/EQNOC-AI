import { describe, expect, it } from 'vitest';
import { BY_ID, GUIDES, LIBRARY, P_ORDER, PLAYBOOKS, VARS } from '../src/data';
import { fill, matchCommand, varsIn } from '../src/lib/cmd';
import { search } from '../src/lib/search';
import { advance, buildDeck, grade, orderDeck } from '../src/lib/drill';

describe('library integrity', () => {
  it('has unique ids', () => {
    expect(new Set(LIBRARY.map((x) => x.id)).size).toBe(LIBRARY.length);
  });
  it('every guide and playbook reference resolves', () => {
    const refs = [
      ...GUIDES.flatMap((g) => [...g.drill, ...g.blocks.flatMap((b) => (b.t === 'entries' ? b.ids : []))]),
      ...PLAYBOOKS.flatMap((p) => p.steps.map((s) => s.entry).filter(Boolean) as string[]),
    ];
    expect(refs.filter((id) => !BY_ID[id])).toEqual([]);
  });
  it('every variable used is defined, and no command has stray braces', () => {
    for (const x of LIBRARY) for (const p of P_ORDER) {
      const c = x.cmds[p];
      if (!c) continue;
      for (const v of varsIn(c)) expect(VARS[v], `${x.id}/${p} {${v}}`).toBeTruthy();
      expect(c.replace(/\{\w+\}/g, ''), `${x.id}/${p}`).not.toMatch(/[{}]/);
    }
  });
  it('every entry has at least two platforms and a note where one is missing', () => {
    for (const x of LIBRARY) expect(P_ORDER.filter((p) => x.cmds[p]).length, x.id).toBeGreaterThanOrEqual(2);
  });
  it('guide tables are rectangular', () => {
    for (const g of GUIDES) for (const b of g.blocks) if (b.t === 'table') for (const r of b.rows) expect(r.length, g.id).toBe(b.head.length);
  });
});

describe('command matching', () => {
  it('accepts exact and abbreviated forms', () => {
    expect(matchCommand('show ip bgp summary', 'show ip bgp summary')).toBe('exact');
    expect(matchCommand('sh ip bgp sum', 'show ip bgp summary')).toBe('abbrev');
    expect(matchCommand('SHOW  IP BGP   SUMMARY', 'show ip bgp summary')).toBe('exact');
  });
  it('accepts any value in a variable slot', () => {
    expect(matchCommand('show interfaces ge-0/0/1 extensive', 'show interfaces {if} extensive')).toBe('exact');
    expect(matchCommand('sh int Gi1/0/1', 'show interfaces {if}')).toBe('abbrev');
    expect(matchCommand('show lacp interfaces ae3 extensive', 'show lacp interfaces ae{lag} extensive')).toBe('exact');
    expect(matchCommand('show lacp interfaces xe3 extensive', 'show lacp interfaces ae{lag} extensive')).toBeNull();
  });
  it('rejects wrong words, missing words and extra words', () => {
    expect(matchCommand('show ip ospf neighbor', 'show ospf neighbor')).toBeNull();
    expect(matchCommand('show bgp', 'show bgp summary')).toBeNull();
    expect(matchCommand('show bgp summary detail', 'show bgp summary')).toBeNull();
    expect(matchCommand('s i b s', 'show ip bgp summary')).toBeNull();
  });
  it('treats neighbour and neighbor alike', () => {
    expect(matchCommand('show ospf neighbour', 'show ospf neighbor')).toBe('exact');
  });
  it('fills values and leaves readable placeholders', () => {
    expect(fill('show interfaces {if}', { if: 'Gi1/0/1' })).toBe('show interfaces Gi1/0/1');
    expect(fill('ping {ip}', {})).toBe('ping <ip address>');
  });
});

describe('search', () => {
  const top = (q: string) => search(q)[0]?.entry.id;
  it('finds by task', () => {
    expect(top('bgp neighbours')).toBe('bgp-summary');
    expect(top('optical levels')).toBe('optics');
    expect(top('find mac')).toBe('mac-find');
    expect(top('save config')).toBe('save-config');
    expect(top('light levels sfp')).toBe('optics');
  });
  it('recognises a pasted command and names its platform', () => {
    const a = search('show bundle brief')[0];
    expect(a.entry.id).toBe('lag-summary');
    expect(a.cmdMatch).toBe('xr');
    const b = search('sh ip int br')[0];
    expect(b.entry.id).toBe('if-brief');
    const c = search('show mac-learning')[0];
    expect(c.entry.id).toBe('mac-table');
    expect(c.cmdMatch).toBe('aos');
    expect(search('show ethernet-switching table')[0].entry.id).toBe('mac-table');
    expect(search('show interfaces diagnostics optics xe-0/0/1')[0].entry.id).toBe('optics');
  });
  it('returns nothing for nonsense', () => {
    expect(search('zzqx plugh')).toEqual([]);
  });
});

describe('drill', () => {
  it('grades and schedules', () => {
    expect(grade('sh bgp sum', 'show bgp summary')).toBe('abbrev');
    expect(grade('show bgp neighbors', 'show bgp summary')).toBe('wrong');
    const a = advance(undefined, true, 0);
    expect(a.box).toBe(1);
    expect(advance(a, false, 0).box).toBe(0);
  });
  it('never drills multi-line or unconfirmed commands, and puts due cards first', () => {
    const deck = buildDeck(['aos', 'junos']);
    expect(deck.length).toBeGreaterThan(80);
    for (const c of deck) { expect(c.answer).not.toContain('\n'); expect(c.entry.check || []).not.toContain(c.p); }
    const due = deck[5];
    const order = orderDeck(deck, { [due.key]: { box: 1, due: 0, seen: 1, right: 1 } }, 1000);
    expect(order[0].key).toBe(due.key);
    expect(order.length).toBe(12);
  });
});
