export type P = 'ios' | 'xr' | 'nx' | 'junos' | 'aos';

export const PLATFORMS: { id: P; name: string; short: string; vendor: string; prompt: string; ifEx: string }[] = [
  { id: 'ios', name: 'IOS / IOS-XE', short: 'IOS', vendor: 'Cisco', prompt: 'Router#', ifEx: 'Gi1/0/1' },
  { id: 'xr', name: 'IOS-XR', short: 'XR', vendor: 'Cisco', prompt: 'RP/0/RSP0/CPU0:router#', ifEx: 'Gi0/0/0/1' },
  { id: 'nx', name: 'NX-OS', short: 'NX-OS', vendor: 'Cisco', prompt: 'switch#', ifEx: 'Eth1/1' },
  { id: 'junos', name: 'Junos', short: 'Junos', vendor: 'Juniper', prompt: 'user@router>', ifEx: 'ge-0/0/1' },
  { id: 'aos', name: 'OmniSwitch AOS 8', short: 'AOS', vendor: 'Alcatel-Lucent', prompt: '->', ifEx: '1/1/1' },
];

export const P_ORDER: P[] = ['ios', 'xr', 'nx', 'junos', 'aos'];

export type Cat =
  | 'basics' | 'system' | 'interfaces' | 'l2' | 'ip' | 'ospf' | 'isis' | 'bgp'
  | 'mpls' | 'ha' | 'services' | 'config';

export const CATS: { id: Cat; name: string }[] = [
  { id: 'basics', name: 'CLI basics' },
  { id: 'system', name: 'System' },
  { id: 'interfaces', name: 'Interfaces' },
  { id: 'l2', name: 'Switching' },
  { id: 'ip', name: 'IP & routing' },
  { id: 'ospf', name: 'OSPF' },
  { id: 'isis', name: 'IS-IS' },
  { id: 'bgp', name: 'BGP' },
  { id: 'mpls', name: 'MPLS' },
  { id: 'ha', name: 'Resilience' },
  { id: 'services', name: 'Services' },
  { id: 'config', name: 'Config tasks' },
];

export type Kind = 'show' | 'config' | 'action';
export type Risk = 'read' | 'change' | 'disruptive';

export interface Entry {
  id: string;
  cat: Cat;
  kind: Kind;
  risk: Risk;
  title: string;
  desc: string;
  cmds: Record<P, string | null>;
  /** Per-platform caveat or older-release variant. */
  notes?: Partial<Record<P, string>>;
  /** Platforms where the exact syntax should be confirmed with `?` on the box. */
  check?: P[];
  /** What to read in the output. */
  look?: string[];
  gotcha?: string;
  /** Extra search words. */
  tags?: string;
}

export interface Extra {
  notes?: Partial<Record<P, string>>;
  check?: P[];
  look?: string[];
  gotcha?: string;
  tags?: string;
  risk?: Risk;
}

export function e(
  id: string, cat: Cat, kind: Kind, title: string, desc: string,
  c: [string | null, string | null, string | null, string | null, string | null],
  x: Extra = {},
): Entry {
  return {
    id, cat, kind, title, desc,
    risk: x.risk ?? (kind === 'show' ? 'read' : 'change'),
    cmds: { ios: c[0], xr: c[1], nx: c[2], junos: c[3], aos: c[4] },
    notes: x.notes, check: x.check, look: x.look, gotcha: x.gotcha, tags: x.tags,
  };
}

export const VARS: Record<string, { label: string; hint: string }> = {
  if: { label: 'Interface', hint: 'Gi1/0/1 · ge-0/0/1 · 1/1/1' },
  ip: { label: 'IP address', hint: '10.1.1.1' },
  src: { label: 'Source IP', hint: '10.0.0.1' },
  prefix: { label: 'Prefix', hint: '10.1.0.0/24' },
  net: { label: 'Network', hint: '10.1.0.0' },
  mask: { label: 'Mask', hint: '255.255.255.0' },
  vlan: { label: 'VLAN', hint: '100' },
  vrf: { label: 'VRF', hint: 'MGMT' },
  lag: { label: 'LAG number', hint: '1' },
  mac: { label: 'MAC address', hint: 'per platform format' },
  proc: { label: 'Process tag', hint: '1' },
  text: { label: 'Text', hint: 'name or pattern' },
};
