
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
    id: 'ospf', 
    title: 'OSPF & Areas', 
    subtitle: 'Adjacencies, LSDB, Cost', 
    icon: 'Activity',
    details: 'Verify OSPF neighbor states, Link State Database synchronization, and area configurations.'
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

export const COMMAND_LIBRARY: CommandRef[] = [
  // --- PHYSICAL / INTERFACES ---
  {
    title: 'Show Interfaces',
    cisco: 'show interfaces <int>',
    juniper: 'show interfaces <int>',
    desc: 'Display detailed interface statistics, errors, and status.',
    category: ['phys', 'l2']
  },
  {
    title: 'Show Optical Levels',
    cisco: 'show interfaces <int> transceiver detail',
    juniper: 'show interfaces diagnostics optics <int>',
    desc: 'Check Tx/Rx light levels (dBm) on fiber interfaces.',
    category: ['phys']
  },
  {
    title: 'Show Interface Description',
    cisco: 'show interfaces description',
    juniper: 'show interfaces descriptions',
    desc: 'List interfaces with their configured descriptions.',
    category: ['phys']
  },
  {
    title: 'Show Interface Status',
    cisco: 'show interfaces status',
    juniper: 'show interfaces terse',
    desc: 'Brief overview of interface line protocol state.',
    category: ['phys']
  },
  {
    title: 'Show Controllers',
    cisco: 'show controllers <int>',
    juniper: 'show chassis hardware', // Approx equivalent for hardware details
    desc: 'Low-level hardware info, memory, and registers.',
    category: ['phys']
  },
  {
    title: 'Clear Counters',
    cisco: 'clear counters <int>',
    juniper: 'clear interfaces statistics <int>',
    desc: 'Reset interface statistics (errors/packets) to zero.',
    category: ['phys']
  },
  {
    title: 'Show Inventory',
    cisco: 'show inventory',
    juniper: 'show chassis hardware',
    desc: 'List hardware components, SFP serial numbers, and PIDs.',
    category: ['phys']
  },
  {
    title: 'Show Environment',
    cisco: 'show environment',
    juniper: 'show chassis environment',
    desc: 'Check fan speed, temperature, and power supply status.',
    category: ['phys']
  },
  {
    title: 'Show Cable Diags',
    cisco: 'show cable-diagnostics tdr interface <int>',
    juniper: 'show diagnostics tdr interface <int>',
    desc: 'Check for cable breaks or length (TDR results).',
    category: ['phys']
  },
  {
    title: 'Show Interface Rates',
    cisco: 'show interfaces <int> | include rate',
    juniper: 'show interfaces <int> extensive | match rate',
    desc: 'Check real-time bandwidth usage (bps/pps).',
    category: ['phys', 'l3']
  },

  // --- LAYER 2 ---
  {
    title: 'Show LLDP Neighbors',
    cisco: 'show lldp neighbors detail',
    juniper: 'show lldp neighbors detail',
    desc: 'Identify connected devices, port mapping, and capabilities.',
    category: ['l2', 'phys']
  },
  {
    title: 'Show CDP Neighbors',
    cisco: 'show cdp neighbors detail',
    juniper: 'show lldp neighbors detail', // Juniper uses LLDP mostly
    desc: 'Cisco Discovery Protocol neighbor details.',
    category: ['l2']
  },
  {
    title: 'Show MAC Table',
    cisco: 'show mac address-table',
    juniper: 'show ethernet-switching table',
    desc: 'View learned MAC addresses and VLAN association.',
    category: ['l2']
  },
  {
    title: 'Show MAC for Interface',
    cisco: 'show mac address-table interface <int>',
    juniper: 'show ethernet-switching table interface <int>',
    desc: 'Filter MAC table for a specific port.',
    category: ['l2']
  },
  {
    title: 'Show VLANs',
    cisco: 'show vlan brief',
    juniper: 'show vlans',
    desc: 'List configured VLANs and assigned ports.',
    category: ['l2']
  },
  {
    title: 'Show Spanning Tree',
    cisco: 'show spanning-tree',
    juniper: 'show spanning-tree bridge',
    desc: 'Check STP root bridge, priorities, and blocking ports.',
    category: ['l2']
  },
  {
    title: 'Show Port Security',
    cisco: 'show port-security interface <int>',
    juniper: 'show ethernet-switching port-error', // Approx
    desc: 'Check for sticky MAC violations or security limits.',
    category: ['l2', 'sec']
  },
  {
    title: 'Show Etherchannel',
    cisco: 'show etherchannel summary',
    juniper: 'show lacp interfaces',
    desc: 'Verify Link Aggregation (LACP) bundles and member status.',
    category: ['l2']
  },
  {
    title: 'Show CFM MEPs',
    cisco: 'show ethernet cfm maintenance-points remote',
    juniper: 'show oam ethernet connectivity-fault-management interfaces',
    desc: 'Check status of remote Maintenance End Points (802.1ag).',
    category: ['l2']
  },
  {
    title: 'Show DHCP Bindings',
    cisco: 'show ip dhcp snooping binding',
    juniper: 'show dhcp-security binding',
    desc: 'List clients authenticated via DHCP snooping.',
    category: ['l2', 'sec']
  },
  {
    title: 'Show HSRP/VRRP',
    cisco: 'show standby brief',
    juniper: 'show vrrp summary',
    desc: 'Verify First Hop Redundancy Protocol status.',
    category: ['l2', 'l3']
  },

  // --- LAYER 3 / ROUTING ---
  {
    title: 'Show ARP Table',
    cisco: 'show ip arp',
    juniper: 'show arp',
    desc: 'Map IP addresses to MAC addresses.',
    category: ['l2', 'l3']
  },
  {
    title: 'Show IP Int Brief',
    cisco: 'show ip interface brief',
    juniper: 'show interfaces terse',
    desc: 'Summary of IP addresses and interface states.',
    category: ['l3']
  },
  {
    title: 'Show Route (Specific)',
    cisco: 'show ip route <ip>',
    juniper: 'show route <ip>',
    desc: 'Verify routing table for a specific destination.',
    category: ['l3']
  },
  {
    title: 'Show Route Summary',
    cisco: 'show ip route summary',
    juniper: 'show route summary',
    desc: 'Count of routes by protocol (BGP, OSPF, Connected).',
    category: ['l3']
  },
  {
    title: 'Ping',
    cisco: 'ping <ip>',
    juniper: 'ping <ip>',
    desc: 'Send ICMP echo requests to verify reachability.',
    category: ['l3']
  },
  {
    title: 'Ping with Source',
    cisco: 'ping <dst-ip> source <src-ip>',
    juniper: 'ping <dst-ip> source <src-ip>',
    desc: 'Ping from a specific interface or IP.',
    category: ['l3']
  },
  {
    title: 'Ping VRF',
    cisco: 'ping vrf <vrf> <ip>',
    juniper: 'ping <ip> routing-instance <vrf>',
    desc: 'Test connectivity within a specific VRF.',
    category: ['l3']
  },
  {
    title: 'Traceroute',
    cisco: 'traceroute <ip>',
    juniper: 'traceroute <ip>',
    desc: 'Trace the path of packets to destination.',
    category: ['l3']
  },
  {
    title: 'Show VRF Detail',
    cisco: 'show vrf detail <name>',
    juniper: 'show route instance <name> detail',
    desc: 'Check RD, RT, and interfaces in a VRF.',
    category: ['l3']
  },
  {
    title: 'Show NAT Trans',
    cisco: 'show ip nat translations',
    juniper: 'show security nat source summary',
    desc: 'View active Network Address Translation sessions.',
    category: ['l3', 'sec']
  },
  {
    title: 'Show SLA Stats',
    cisco: 'show ip sla statistics',
    juniper: 'show services rpm probe-results',
    desc: 'Verify jitter, latency, and packet loss metrics.',
    category: ['l3', 'logs']
  },

  // --- OSPF ---
  {
    title: 'Show OSPF Neighbor',
    cisco: 'show ip ospf neighbor',
    juniper: 'show ospf neighbor',
    desc: 'Check OSPF adjacency status (Full/2-Way).',
    category: ['ospf', 'l3']
  },
  {
    title: 'Show OSPF Interface',
    cisco: 'show ip ospf interface brief',
    juniper: 'show ospf interface',
    desc: 'List interfaces participating in OSPF.',
    category: ['ospf']
  },
  {
    title: 'Show OSPF Database',
    cisco: 'show ip ospf database',
    juniper: 'show ospf database',
    desc: 'View the Link State Database (LSDB) summary.',
    category: ['ospf']
  },
  {
    title: 'Show OSPF Route',
    cisco: 'show ip route ospf',
    juniper: 'show route protocol ospf',
    desc: 'Filter routing table for OSPF learned routes.',
    category: ['ospf', 'l3']
  },

  // --- BGP ---
  {
    title: 'Show BGP Summary',
    cisco: 'show ip bgp summary',
    juniper: 'show bgp summary',
    desc: 'View BGP peer status, ASNs, and prefix counts.',
    category: ['bgp', 'l3']
  },
  {
    title: 'Show BGP Neighbor',
    cisco: 'show ip bgp neighbors <ip>',
    juniper: 'show bgp neighbor <ip>',
    desc: 'Detailed info on a specific BGP peer.',
    category: ['bgp']
  },
  {
    title: 'Show Advertised Routes',
    cisco: 'show ip bgp neighbors <ip> advertised-routes',
    juniper: 'show route advertising-protocol bgp <ip>',
    desc: 'See prefixes sent to a BGP peer.',
    category: ['bgp']
  },
  {
    title: 'Show Received Routes',
    cisco: 'show ip bgp neighbors <ip> routes',
    juniper: 'show route receive-protocol bgp <ip>',
    desc: 'See prefixes received from a BGP peer.',
    category: ['bgp']
  },
  {
    title: 'Show BGP Route Detail',
    cisco: 'show ip bgp <prefix>',
    juniper: 'show route protocol bgp <prefix> detail',
    desc: 'Analyze attributes (Local Pref, MED, AS-Path) for a route.',
    category: ['bgp']
  },
  {
    title: 'Show BGP Damping',
    cisco: 'show ip bgp dampening flap-statistics',
    juniper: 'show route damping',
    desc: 'Identify flapping BGP routes that are suppressed.',
    category: ['bgp']
  },

  // --- MPLS ---
  {
    title: 'Show MPLS Interfaces',
    cisco: 'show mpls interfaces',
    juniper: 'show mpls interface',
    desc: 'Verify interfaces where MPLS is enabled.',
    category: ['mpls']
  },
  {
    title: 'Show LDP Neighbors',
    cisco: 'show mpls ldp neighbor',
    juniper: 'show ldp neighbor',
    desc: 'Check Label Distribution Protocol peerings.',
    category: ['mpls']
  },
  {
    title: 'Show MPLS Forwarding',
    cisco: 'show mpls forwarding-table',
    juniper: 'show route table mpls.0',
    desc: 'View the LFIB (Label Forwarding Information Base).',
    category: ['mpls']
  },
  {
    title: 'Show MPLS L2Transport',
    cisco: 'show mpls l2transport vc detail',
    juniper: 'show l2circuit connections extensive',
    desc: 'Verify pseudowire/VPWS circuit status.',
    category: ['mpls', 'l2']
  },
  {
    title: 'Show MPLS LSP',
    cisco: 'show mpls traffic-eng tunnels',
    juniper: 'show mpls lsp',
    desc: 'Check status of Label Switched Paths.',
    category: ['mpls']
  },
  {
    title: 'Ping MPLS',
    cisco: 'ping mpls ipv4 <ip> <mask>',
    juniper: 'ping mpls lsp-end-point <ip>',
    desc: 'Verify MPLS data plane connectivity.',
    category: ['mpls']
  },

  // --- SYSTEM & LOGS ---
  {
    title: 'Show Logs',
    cisco: 'show logging',
    juniper: 'show log messages',
    desc: 'View system logs for events and errors.',
    category: ['logs']
  },
  {
    title: 'Show CPU Usage',
    cisco: 'show processes cpu sorted',
    juniper: 'show system processes extensive',
    desc: 'Monitor CPU utilization by process.',
    category: ['logs']
  },
  {
    title: 'Show Memory',
    cisco: 'show memory statistics',
    juniper: 'show system memory',
    desc: 'Check available and used RAM.',
    category: ['logs']
  },
  {
    title: 'Show Version',
    cisco: 'show version',
    juniper: 'show version',
    desc: 'Display uptime, OS version, and serial number.',
    category: ['phys', 'logs']
  },
  {
    title: 'Show License',
    cisco: 'show license',
    juniper: 'show system license',
    desc: 'Display license usage and status.',
    category: ['phys', 'logs']
  },
  {
    title: 'Show Running Config',
    cisco: 'show running-config',
    juniper: 'show configuration',
    desc: 'View current active configuration.',
    category: ['logs']
  },
  {
    title: 'Show System Alarms',
    cisco: 'show facility-alarm status',
    juniper: 'show system alarms',
    desc: 'List active chassis or system level alarms.',
    category: ['logs', 'phys']
  },

  // --- MULTICAST ---
  {
    title: 'Show Mroute',
    cisco: 'show ip mroute',
    juniper: 'show multicast route',
    desc: 'Verify multicast routing table.',
    category: ['l3']
  },
  {
    title: 'Show IGMP Groups',
    cisco: 'show ip igmp groups',
    juniper: 'show igmp group',
    desc: 'List multicast groups and member ports.',
    category: ['l2', 'l3']
  },
  {
    title: 'Show PIM Neighbors',
    cisco: 'show ip pim neighbor',
    juniper: 'show pim neighbors',
    desc: 'Check PIM adjacency status.',
    category: ['l3']
  },

  // --- QOS ---
  {
    title: 'Show Policy Map',
    cisco: 'show policy-map interface <int>',
    juniper: 'show interfaces <int> extensive | find "CoS"',
    desc: 'Verify QoS marking, policing, and shaping stats.',
    category: ['l2', 'phys']
  },
  {
    title: 'Show Queue Drops',
    cisco: 'show policy-map interface <int>',
    juniper: 'show interfaces queue <int>',
    desc: 'Check for tail drops or packet loss in queues.',
    category: ['phys']
  },
  {
    title: 'Show Class Map',
    cisco: 'show class-map',
    juniper: 'show class-of-service classes',
    desc: 'List defined traffic classes.',
    category: ['l2']
  }
];

export const TRIAGE_CHECKLIST_DATA = [
    { id: 'q1', label: 'Service History', question: 'Q1: Has service ever worked to specification? (Prov vs Regression)' },
    { id: 'q2', label: 'Current State', question: 'Q2: Is service Down or Degraded?' },
    { id: 'q3', label: 'Physical Check', question: 'Q3: Are cables securely plugged in/undamaged?' },
    { id: 'q4', label: 'CPE Health', question: 'Q4: Checked Yurika CPE Health (LEDs, Power)?' },
    { id: 'q5', label: 'Client Errors', question: 'Q5: Checked customer-side interface for errors?' },
    { id: 'q6', label: 'Configuration', question: 'Q6: Verified service config (802.1q, MTU, QoS, IP, BGP)?' },
    { id: 'q7', label: 'Reboot', question: 'Q7: Rebooted Yurika CPE or Customer Edge?' },
    { id: 'q8', label: 'Changes', question: 'Q8: Any network changes/firmware updates when issue started?' },
    { id: 'q9', label: 'Isolation', question: 'Q9: Tested from >1 host to rule out PC issues?' },
    { id: 'q10', label: 'Testing', question: 'Q10: Run speed tests/ping/traceroute?' },
    { id: 'q11', label: 'Pattern', question: 'Q11: Persistent or Intermittent?' },
    { id: 'q12', label: 'Impact', question: 'Q12: What traffic impacted (VoIP, Web)?' },
    { id: 'q13', label: 'Timeline', question: 'Q13: Date/Time issue started?' },
    { id: 'q14', label: 'Environment', question: 'Q14: Any power/cooling/env issues at site?' }
];
