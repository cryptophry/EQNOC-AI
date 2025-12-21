import { CommandRef, DiagnosticModule } from "./types";

export const DIAGNOSTIC_MODULES: DiagnosticModule[] = [
  { 
    id: 'phys', 
    title: 'Physical & Transport', 
    subtitle: 'Fiber, Microwave, Copper', 
    icon: 'Cable',
    details: 'Verify link status, CRC/errors, Optical power on DWDM/CWDM or Microwave links.'
  },
  { 
    id: 'l2', 
    title: 'Layer 2 & Switching', 
    subtitle: 'VLANs, STP, Mac-Address', 
    icon: 'Layers',
    details: 'Verify VLAN assignments, Spanning Tree status, Port-Security, and MAC address tables.'
  },
  { 
    id: 'scada', 
    title: 'SCADA & OT', 
    subtitle: 'RTUs, Protection, HMI', 
    icon: 'Cpu',
    details: 'Telemetry data, Substation RTU connectivity, Protection signaling, and HMI feeds.'
  },
  { 
    id: 'l3', 
    title: 'L3 VPN / VRF', 
    subtitle: 'Corporate & OT Routing', 
    icon: 'Network',
    details: 'Check Routing Instance, VRF (Corp vs SCADA), and Route targets.'
  },
  { 
    id: 'mpls', 
    title: 'MPLS Core', 
    subtitle: 'LSP, Label Switched Paths', 
    icon: 'Waypoints',
    details: 'Check LSP up/forwarding, MPLS forwarding entries, LSP ping.'
  },
  { 
    id: 'bgp', 
    title: 'BGP & Routing', 
    subtitle: 'Peering, Route Ads', 
    icon: 'Router',
    details: 'Check BGP session, neighbor status, route advertisements.'
  },
  { 
    id: 'logs', 
    title: 'System Logs', 
    subtitle: 'Alarms, Traps, Syslog', 
    icon: 'FileText',
    details: 'Check system logs for recent events or alarms.'
  },
  { 
    id: 'sec', 
    title: 'Security & Firewall', 
    subtitle: 'ACLs, NAT, VPN Tunnels', 
    icon: 'ShieldCheck',
    details: 'Verify Firewall filters, NAT translations, and IPSec VPN tunnel status.'
  }
];

export const EQNOC_KNOWLEDGE_BASE = `
# EQNOC Utility Telecommunications Triage Strategy

## Mission
EQNOC provides critical telecommunications support for a Government-Owned Electrical Distribution Utility. 
We support:
1. **Critical Infrastructure:** SCADA, Teleprotection, and High Voltage Substation Comms.
2. **Corporate/Commercial:** E-Line Services, MPLS L2/L3 VPNs for internal and external customers.
3. **Core Networking:** Backbone Transport (Fiber/Microwave), MPLS, and BGP Routing.

## Domain 1: Layer 2 & Switching
**Common Issues:**
- "Port Security Violation": Sticky MAC limit reached.
- "VLAN Mismatch": Customer traffic not passing, check trunk encapsulation.
- "Spanning Tree Loop": High CPU, network instability, check TCNs.

**Triage Questions (L2):**
1. Is the MAC address learned on the correct port?
2. Is the VLAN allowed on the trunk?
3. Is the port in 'err-disable' state?

## Domain 2: SCADA & Operational Technology (OT)
**Context:** Connectivity to Reclosers, RTUs, Regulators, and Substation HMIs.
**Criticality:** HIGH. Loss of visibility affects Grid Control.
**Triage:**
- Is the issue Serial-over-IP or native IP?
- Check cellular backup (4G/LTE) vs Primary Fiber/Radio.
- Verify VRF (VRF-SCADA vs VRF-CORP).

## Domain 3: Network & E-Line Services (Commercial/Core)
**Process:** YSOC validation -> Level 1 validation -> EQNOC targeted tests.
**Standard Triage:**
- Physical (Optics/Cables) -> L2 (Macs/VLANs) -> L3 (BGP/Routing) -> MPLS.

## Domain 4: Security & Firewalls
**Common Issues:**
- "Traffic Blocked": Check ACL hits or Zone-Pair drops.
- "VPN Flapping": Check IPSec SA lifetimes or Phase 1 IKE.
- "NAT Exhaustion": Check translation table size.

## Universal Pre-Requisite Questions (The "EQNOC 11")
Q1: **Impact:** Who is down? (Entire Substation, SCADA Feeder, Commercial Customer).
Q2: **Service History:** Has this worked before? (Prov vs Regression).
Q3: **Physical:** Cables/Power checked? (LEDs green?).
Q4: **Device Health:** Restarted device (CPE/RTU)?
Q5: **Location/Scope:** Specific to one site or widespread?
Q6: **Errors:** Specific error messages or log entries?
Q7: **Changes:** Recent network changes or electrical switching works?
Q8: **Config:** Verified VLAN/VRF/BGP config?
Q9: **Testing:** Ping/Traceroute/MAC Table results?
Q10: **Pattern:** Persistent or Intermittent?
Q11: **Environment:** Storms, Power Outages, or visible damage?

## System Persona
You are "EQNOC AI", a specialized Utility Telecommunications Assistant.
- You speak the language of **Power Utilities** (Substations, Feeders, Control Room) AND **Networking** (BGP, OSPF, VRF, STP, VLANs).
- **Tone:** Professional, Efficient, Futuristic.
- **Context Awareness:** If the user mentions "Recloser" or "RTU", switch to SCADA/OT context. If they mention "Trunk" or "VLAN", switch to Layer 2 context.
`;

export const COMMAND_LIBRARY: CommandRef[] = [
  // --- SCADA / OT ---
  {
    title: "Show Serial/Raw Socket",
    cisco: "show raw-socket tcp sessions",
    juniper: "show system services raw-socket",
    desc: "Check Serial-over-IP sessions for SCADA RTUs.",
    category: ['scada']
  },
  {
    title: "VRF SCADA Route",
    cisco: "show ip route vrf SCADA <ip>",
    juniper: "show route table SCADA.inet.0 <ip>",
    desc: "Check routing within the critical OT VRF.",
    category: ['scada', 'l3']
  },
  {
    title: "Cellular Interface Stat",
    cisco: "show cellular <int> radio",
    juniper: "show modem wireless",
    desc: "Check 4G/LTE signal strength (RSSI/SNR) for remote sites.",
    category: ['scada']
  },

  // --- LAYER 2 ---
  {
    title: "Show Spanning Tree",
    cisco: "show spanning-tree",
    juniper: "show spanning-tree bridge",
    desc: "Check STP root bridge status and blocked ports.",
    category: ['l2']
  },
  {
    title: "Show Port Security",
    cisco: "show port-security interface <int>",
    juniper: "show ethernet-switching port-security",
    desc: "Check for MAC address violations on access ports.",
    category: ['l2']
  },
  {
    title: "Show VLANs",
    cisco: "show vlan brief",
    juniper: "show vlans",
    desc: "List active VLANs and assigned ports.",
    category: ['l2']
  },

  // --- PHYSICAL / INTERFACE ---
  {
    title: "Check Interface Status",
    cisco: "show interfaces <interface>",
    juniper: "show interfaces <interface>",
    desc: "Verify physical link status, input rates, and error counters.",
    category: ['phys', 'l2', 'l3']
  },
  {
    title: "Check Optical Levels",
    cisco: "show interfaces <interface> transceiver",
    juniper: "show interfaces diagnostics optics <interface>",
    desc: "Check light levels (Tx/Rx power) on fiber links.",
    category: ['phys']
  },
  {
    title: "Detailed Interface Errors",
    cisco: "show interfaces counters errors",
    juniper: "show interfaces extensive | match error",
    desc: "Detailed breakdown of CRC, frame, and input/output errors.",
    category: ['phys']
  },
  {
    title: "LLDP Neighbors",
    cisco: "show lldp neighbors detail",
    juniper: "show lldp neighbors detail",
    desc: "Identify connected devices via Link Layer Discovery Protocol.",
    category: ['phys', 'l2']
  },

  // --- L3 VPN & BGP ---
  {
    title: "Check BGP Summary",
    cisco: "show ip bgp vpnv4 vrf <vrf_name> summary",
    juniper: "show bgp summary instance <vrf_name>",
    desc: "Verify BGP peer states, uptime, and prefix counts.",
    category: ['bgp', 'l3']
  },
  {
    title: "Ping VRF",
    cisco: "ping vrf <vrf_name> <ip>",
    juniper: "ping routing-instance <vrf_name> <ip>",
    desc: "Test ICMP connectivity within a specific VRF context.",
    category: ['l3', 'e2e']
  },
  {
    title: "Traceroute VRF",
    cisco: "traceroute vrf <vrf> <ip>",
    juniper: "traceroute routing-instance <vrf> <ip>",
    desc: "Trace the forwarding path to destination.",
    category: ['e2e', 'l3']
  },
  {
    title: "Show ARP Table",
    cisco: "show arp vrf <vrf>",
    juniper: "show arp instance <instance>",
    desc: "View IPv4-to-MAC address mappings.",
    category: ['l3', 'phys']
  },
  
  // --- MPLS & L2 VPN ---
  {
    title: "Pseudowire Detail",
    cisco: "show mpls l2transport vc detail",
    juniper: "show l2circuit connections interface <int> extensive",
    desc: "Check L2VPN circuit status and VC labels.",
    category: ['l2', 'mpls']
  },
  {
    title: "MPLS Forwarding",
    cisco: "show mpls forwarding-table",
    juniper: "show route forwarding-table family mpls",
    desc: "Verify MPLS label switching table (LFIB).",
    category: ['mpls']
  },
  {
    title: "MAC Address Table",
    cisco: "show l2vpn forwarding bridge-domain mac-address",
    juniper: "show vpls mac-table instance <instance>",
    desc: "View learned MAC addresses in L2VPN/VPLS instances.",
    category: ['l2']
  },

  // --- SYSTEM / LOGS ---
  {
    title: "Show Logs",
    cisco: "show logging",
    juniper: "show log messages",
    desc: "View system syslog buffer for errors and events.",
    category: ['logs']
  },
  {
    title: "Environment Status",
    cisco: "show environment",
    juniper: "show chassis environment",
    desc: "Check temperature, fans, and power supplies.",
    category: ['phys']
  },
  {
    title: "NTP Status",
    cisco: "show ntp status",
    juniper: "show ntp associations",
    desc: "Ensure device clock is synchronized (vital for logs).",
    category: ['logs', 'phys']
  },

  // --- SECURITY / FIREWALL ---
  {
    title: "Show Access Lists",
    cisco: "show access-lists",
    juniper: "show firewall filter",
    desc: "List configured ACLs and hit counters.",
    category: ['sec']
  },
  {
    title: "NAT Translations",
    cisco: "show ip nat translations",
    juniper: "show security flow session nat",
    desc: "View active Network Address Translation entries.",
    category: ['sec', 'l3']
  },
  {
    title: "IPSec SA Status",
    cisco: "show crypto ipsec sa",
    juniper: "show security ipsec security-associations",
    desc: "Check Phase 2 IPSec VPN tunnel status and encryption/decryption pkts.",
    category: ['sec', 'l3']
  },
  {
    title: "Zone Firewall Drop",
    cisco: "show policy-map type inspect zone-pair sessions",
    juniper: "show security flow session deny",
    desc: "Check for firewall policy drops or denied sessions.",
    category: ['sec']
  }
];

export const TRIAGE_CHECKLIST_DATA = [
  { id: 'q2', label: 'Impact Scope', question: 'Substation, SCADA Feeder, or Wholesale Customer?' },
  { id: 'q3', label: 'Service History', question: 'Has service worked before? (Prov vs Regression)' },
  { id: 'q4', label: 'Physical Check', question: 'Cables/Antennas checked? LEDs Green?' },
  { id: 'q5', label: 'Device Health', question: 'Restarted device (CPE/RTU)?' },
  { id: 'q6', label: 'Location', question: 'Specific to one site or widespread?' },
  { id: 'q7', label: 'Error msgs', question: 'Specific errors (e.g., CRC, BGP Down)?' },
  { id: 'q8', label: 'Network Changes', question: 'Recent electrical switching or IT changes?' },
  { id: 'q9', label: 'Config/Identity', question: 'Verified VLAN, VRF, or Port Config?' },
  { id: 'q10', label: 'Active Testing', question: 'Ping/Traceroute/MAC Check results?' },
  { id: 'q11', label: 'Pattern', question: 'Persistent or Intermittent?' },
  { id: 'q12', label: 'Environment', question: 'Storms, Power Outages, or visible damage?' },
];