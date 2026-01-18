import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Layers, ArrowRight, Server, Router, Globe, ShieldCheck, Box, Hash, Search, Info, Lock, Key, Activity, Eye } from 'lucide-react';

type HeaderType = 'ETH' | 'IP' | 'TCP' | 'UDP' | 'MPLS' | 'VLAN' | 'ESP' | 'DATA';
type OperationType = 'NONE' | 'PUSH' | 'POP' | 'SWAP' | 'NAT' | 'ENCAP' | 'DECAP';

interface PacketHeader {
  id: string; // Unique ID for diffing
  type: HeaderType;
  label: string;
  detail: string;
  color: string;
  fields: Record<string, string | number>; // Wireshark-like details
}

interface Step {
  id: string;
  device: string;
  deviceType: 'router' | 'server' | 'firewall' | 'cloud';
  action: string;
  operation: OperationType;
  description: string;
  concept?: string; // Educational tidbit
  headers: PacketHeader[];
}

interface Scenario {
  id: string;
  title: string;
  description: string;
  steps: Step[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'mpls-l3vpn',
    title: 'MPLS L3VPN (CE to CE)',
    description: 'Visualizing label operations (Push/Swap/Pop) across a provider core.',
    steps: [
      {
        id: 'step-1',
        device: 'Customer Edge (CE-A)',
        deviceType: 'server',
        action: 'Forward IP Packet',
        operation: 'NONE',
        description: 'CE router forwards a standard IP packet towards the Provider Edge. No MPLS labels exist yet.',
        concept: 'Pure IP Forwarding: The CE router is unaware of the MPLS core. It simply uses its default gateway.',
        headers: [
          { id: 'eth1', type: 'ETH', label: 'Ethernet', detail: 'Dst: PE-Ingress', color: 'bg-slate-600 border-slate-500', fields: { 'Src MAC': 'aa:bb:cc:00:01', 'Dst MAC': 'PE-Ingress-MAC', 'EtherType': '0x0800 (IPv4)' } },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 10.1.0.5', color: 'bg-cyan-600 border-cyan-500', fields: { 'Version': 4, 'Src IP': '10.1.0.5', 'Dst IP': '10.2.0.5', 'TTL': 64, 'Protocol': '6 (TCP)' } },
          { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Port 443', color: 'bg-violet-600 border-violet-500', fields: { 'Src Port': 52341, 'Dst Port': 443, 'Flags': 'SYN', 'Seq': 0 } },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'App Data', color: 'bg-emerald-600 border-emerald-500', fields: { 'Size': '1460 bytes', 'Content': 'Encrypted' } },
        ]
      },
      {
        id: 'step-2',
        device: 'PE Ingress',
        deviceType: 'router',
        action: 'Push Labels (Imposition)',
        operation: 'PUSH',
        description: 'PE identifies the incoming VRF. It pushes a VPN Label (Inner) to identify the customer, then a Transport Label (Outer) to reach the Egress PE.',
        concept: 'Label Stack: The "Top" label is used for core switching. The "Bottom" label is used by the Egress PE to pick the correct interface/VRF.',
        headers: [
          { id: 'eth2', type: 'ETH', label: 'Ethernet', detail: 'Dst: P-Router', color: 'bg-slate-600 border-slate-500', fields: { 'Src MAC': 'PE-Ingress-MAC', 'Dst MAC': 'P-Router-MAC', 'EtherType': '0x8847 (MPLS)' } },
          { id: 'mpls_out', type: 'MPLS', label: 'Transport Label', detail: 'L: 100 (Top)', color: 'bg-amber-600 border-amber-500', fields: { 'Label': 100, 'Exp': 0, 'S (Bottom of Stack)': 0, 'TTL': 255 } },
          { id: 'mpls_in', type: 'MPLS', label: 'VPN Label', detail: 'L: 200 (Bottom)', color: 'bg-orange-600 border-orange-500', fields: { 'Label': 200, 'Exp': 0, 'S (Bottom of Stack)': 1, 'TTL': 255 } },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 10.1.0.5', color: 'bg-cyan-600 border-cyan-500', fields: { 'Version': 4, 'Src IP': '10.1.0.5', 'Dst IP': '10.2.0.5', 'TTL': 63 } },
          { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Port 443', color: 'bg-violet-600 border-violet-500', fields: { 'Src Port': 52341, 'Dst Port': 443 } },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'App Data', color: 'bg-emerald-600 border-emerald-500', fields: { 'Content': '...' } },
        ]
      },
      {
        id: 'step-3',
        device: 'P Router (Core)',
        deviceType: 'router',
        action: 'Swap Label',
        operation: 'SWAP',
        description: 'Core router only looks at the TOP label. It swaps Label 100 for Label 101 based on its LFIB. The VPN label (200) is untouched.',
        concept: 'LSR (Label Switching Router): P-Routers are extremely fast because they don\'t need to perform an IP Route Lookup, just a simple label index lookup.',
        headers: [
          { id: 'eth3', type: 'ETH', label: 'Ethernet', detail: 'Dst: PE-Egress', color: 'bg-slate-600 border-slate-500', fields: { 'Src MAC': 'P-Router-MAC', 'Dst MAC': 'PE-Egress-MAC', 'EtherType': '0x8847' } },
          { id: 'mpls_out_swap', type: 'MPLS', label: 'Transport Label', detail: 'L: 101 (Swapped)', color: 'bg-amber-600 border-amber-500', fields: { 'Label': 101, 'Exp': 0, 'S': 0, 'TTL': 254 } },
          { id: 'mpls_in', type: 'MPLS', label: 'VPN Label', detail: 'L: 200 (Preserved)', color: 'bg-orange-600 border-orange-500', fields: { 'Label': 200, 'Exp': 0, 'S': 1, 'TTL': 255 } },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 10.1.0.5', color: 'bg-cyan-600 border-cyan-500', fields: { 'Version': 4, 'Src IP': '10.1.0.5', 'Dst IP': '10.2.0.5' } },
          { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Port 443', color: 'bg-violet-600 border-violet-500', fields: { 'Src Port': 52341, 'Dst Port': 443 } },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'App Data', color: 'bg-emerald-600 border-emerald-500', fields: { 'Content': '...' } },
        ]
      },
      {
        id: 'step-4',
        device: 'PE Egress',
        deviceType: 'router',
        action: 'Pop Labels (Disposition)',
        operation: 'POP',
        description: 'PE pops the Transport label (or receives it popped via PHP). It reads the VPN label (200) to select the correct VRF, pops it, and forwards plain IP.',
        concept: 'PHP (Penultimate Hop Popping): Often the label is popped one hop *before* the egress router to save the egress router from doing two lookups.',
        headers: [
          { id: 'eth4', type: 'ETH', label: 'Ethernet', detail: 'Dst: CE-B', color: 'bg-slate-600 border-slate-500', fields: { 'Src MAC': 'PE-Egress-MAC', 'Dst MAC': 'CE-B-MAC', 'EtherType': '0x0800' } },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 10.1.0.5', color: 'bg-cyan-600 border-cyan-500', fields: { 'Version': 4, 'Src IP': '10.1.0.5', 'Dst IP': '10.2.0.5', 'TTL': 62 } },
          { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Port 443', color: 'bg-violet-600 border-violet-500', fields: { 'Src Port': 52341, 'Dst Port': 443 } },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'App Data', color: 'bg-emerald-600 border-emerald-500', fields: { 'Content': '...' } },
        ]
      }
    ]
  },
  {
    id: 'l2vpn-vpws',
    title: 'L2VPN VPWS (EoMPLS)',
    description: 'Layer 2 Point-to-Point emulation (Pseudowire) transparently transporting Ethernet frames.',
    steps: [
      {
        id: 'step-1',
        device: 'Customer Switch A',
        deviceType: 'server',
        action: 'Send Ethernet Frame',
        operation: 'NONE',
        description: 'Customer switch sends a standard tagged Ethernet frame to the Provider Edge.',
        concept: 'Transparency: The provider network acts as a single long cable. The customer L2 headers are preserved.',
        headers: [
          { id: 'eth1', type: 'ETH', label: 'Ethernet', detail: 'Dst: PE-Ingress', color: 'bg-slate-600 border-slate-500', fields: { 'Src MAC': 'Cust-A-MAC', 'Dst MAC': 'PE-Ingress-MAC', 'VLAN': '10' } },
          { id: 'vlan1', type: 'VLAN', label: 'VLAN 10', detail: 'ID: 10', color: 'bg-pink-600 border-pink-500', fields: { 'ID': 10, 'Priority': 0 } },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 192.168.1.10', color: 'bg-cyan-600 border-cyan-500', fields: { 'Src': '192.168.1.10', 'Dst': '192.168.1.20' } },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'Data', color: 'bg-emerald-600 border-emerald-500', fields: { 'Content': '...' } },
        ]
      },
      {
        id: 'step-2',
        device: 'PE Ingress',
        deviceType: 'router',
        action: 'Encap (EoMPLS)',
        operation: 'PUSH',
        description: 'PE maps the incoming Port+VLAN to a Virtual Circuit (VC). Pushes VC Label + Transport Label.',
        concept: 'Label Stack: Outer Label transports to Egress PE. Inner Label (VC) identifies the specific customer circuit.',
        headers: [
          { id: 'eth2', type: 'ETH', label: 'Ethernet', detail: 'Core Link', color: 'bg-slate-600 border-slate-500', fields: { 'EtherType': '0x8847 (MPLS)' } },
          { id: 'mpls_out', type: 'MPLS', label: 'Transport Label', detail: 'L: 500 (Top)', color: 'bg-amber-600 border-amber-500', fields: { 'Label': 500, 'Exp': 0, 'S': 0 } },
          { id: 'mpls_in', type: 'MPLS', label: 'VC Label', detail: 'L: 999 (Bottom)', color: 'bg-orange-600 border-orange-500', fields: { 'Label': 999, 'Exp': 0, 'S': 1 } },
          { id: 'eth1', type: 'ETH', label: 'Ethernet', detail: 'Original', color: 'bg-slate-700 border-slate-600 opacity-80', fields: { 'Note': 'Original Header Preserved' } },
          { id: 'vlan1', type: 'VLAN', label: 'VLAN 10', detail: 'ID: 10', color: 'bg-pink-600 border-pink-500 opacity-80', fields: { 'ID': 10 } },
        ]
      },
      {
        id: 'step-3',
        device: 'P Router',
        deviceType: 'router',
        action: 'Swap Label',
        operation: 'SWAP',
        description: 'Core router swaps the Transport label. The VC label and customer payload remain hidden.',
        headers: [
          { id: 'eth3', type: 'ETH', label: 'Ethernet', detail: 'Core Link', color: 'bg-slate-600 border-slate-500', fields: { 'EtherType': '0x8847' } },
          { id: 'mpls_out', type: 'MPLS', label: 'Transport Label', detail: 'L: 501 (Swap)', color: 'bg-amber-600 border-amber-500', fields: { 'Label': 501 } },
          { id: 'mpls_in', type: 'MPLS', label: 'VC Label', detail: 'L: 999', color: 'bg-orange-600 border-orange-500', fields: { 'Label': 999, 'S': 1 } },
          { id: 'eth1', type: 'ETH', label: 'Ethernet', detail: 'Original', color: 'bg-slate-700 border-slate-600 opacity-80', fields: { } },
          { id: 'vlan1', type: 'VLAN', label: 'VLAN 10', detail: 'ID: 10', color: 'bg-pink-600 border-pink-500 opacity-80', fields: { } },
        ]
      },
      {
        id: 'step-4',
        device: 'PE Egress',
        deviceType: 'router',
        action: 'Decap & Fwd',
        operation: 'POP',
        description: 'PE pops Transport label. Uses VC Label (999) to identify the outgoing Attachment Circuit (AC). Pops VC and sends original frame.',
        headers: [
          { id: 'eth4', type: 'ETH', label: 'Ethernet', detail: 'Dst: Cust-B', color: 'bg-slate-600 border-slate-500', fields: { 'Src MAC': 'PE-Egress-MAC', 'Dst MAC': 'Cust-B-MAC' } },
          { id: 'vlan1', type: 'VLAN', label: 'VLAN 10', detail: 'ID: 10', color: 'bg-pink-600 border-pink-500', fields: { 'ID': 10 } },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 192.168.1.10', color: 'bg-cyan-600 border-cyan-500', fields: { 'Src': '192.168.1.10', 'Dst': '192.168.1.20' } },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'Data', color: 'bg-emerald-600 border-emerald-500', fields: { 'Content': '...' } },
        ]
      }
    ]
  },
  {
    id: 'ipsec-tunnel',
    title: 'IPSec VPN (Tunnel Mode)',
    description: 'Visualizing packet encryption, ESP encapsulation, and outer header creation.',
    steps: [
      {
        id: 'ipsec-1',
        device: 'Host A',
        deviceType: 'server',
        action: 'Generate Traffic',
        operation: 'NONE',
        description: 'Original packet generated by the user application.',
        concept: 'Plaintext: At this stage, the data is readable (if not using TLS) and the IP addresses are private.',
        headers: [
          { id: 'eth1', type: 'ETH', label: 'Ethernet', detail: 'LAN', color: 'bg-slate-600 border-slate-500', fields: {'EtherType': '0x0800'} },
          { id: 'ip1', type: 'IP', label: 'Inner IP', detail: '192.168.1.50 -> 192.168.2.50', color: 'bg-cyan-600 border-cyan-500', fields: {'Src': '192.168.1.50', 'Dst': '192.168.2.50', 'Proto': 'TCP'} },
          { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Port 80', color: 'bg-violet-600 border-violet-500', fields: {'Dst Port': 80} },
          { id: 'data1', type: 'DATA', label: 'Payload', detail: 'HTTP GET', color: 'bg-emerald-600 border-emerald-500', fields: {'Data': 'HTTP GET /'} },
        ]
      },
      {
        id: 'ipsec-2',
        device: 'VPN Gateway A',
        deviceType: 'firewall',
        action: 'Encrypt & Encapsulate',
        operation: 'ENCAP',
        description: 'Gateway encrypts the ENTIRE original packet. Adds ESP Header, ESP Trailer, and a NEW Outer IP header.',
        concept: 'Tunnel Mode: The entire original IP packet becomes the payload. A new "Outer" IP header routes the packet over the public internet.',
        headers: [
          { id: 'eth2', type: 'ETH', label: 'Ethernet', detail: 'WAN', color: 'bg-slate-600 border-slate-500', fields: {'EtherType': '0x0800'} },
          { id: 'ip_outer', type: 'IP', label: 'Outer IP', detail: '203.0.113.1 -> 198.51.100.1', color: 'bg-red-600 border-red-500', fields: {'Src': '203.0.113.1 (Public)', 'Dst': '198.51.100.1 (Public)', 'Proto': '50 (ESP)'} },
          { id: 'esp_head', type: 'ESP', label: 'ESP Header', detail: 'SPI: 0xABC123', color: 'bg-indigo-600 border-indigo-500', fields: {'SPI': '0xABC123', 'Seq': 105} },
          { id: 'encrypted_payload', type: 'DATA', label: 'Encrypted Payload', detail: '(Inner IP + TCP + Data)', color: 'bg-slate-700 border-slate-600', fields: {'Content': '[ENCRYPTED BLOB]', 'Note': 'Contains Inner IP, TCP, Data'} },
          { id: 'esp_trail', type: 'ESP', label: 'ESP Trailer', detail: 'Auth Data', color: 'bg-indigo-600 border-indigo-500', fields: {'Padding': '...', 'Next Header': '4 (IP-in-IP)', 'ICV': 'HMAC-SHA256'} },
        ]
      },
      {
        id: 'ipsec-3',
        device: 'Internet',
        deviceType: 'cloud',
        action: 'Route Encrypted',
        operation: 'NONE',
        description: 'Intermediate routers only see the Outer IP and ESP. They cannot read the original data or IPs.',
        concept: 'Privacy: Even if intercepted, the payload is garbage without the decryption keys.',
        headers: [
            { id: 'eth3', type: 'ETH', label: 'Ethernet', detail: 'Next Hop', color: 'bg-slate-600 border-slate-500', fields: {'EtherType': '0x0800'} },
            { id: 'ip_outer', type: 'IP', label: 'Outer IP', detail: '203.0.113.1 -> 198.51.100.1', color: 'bg-red-600 border-red-500', fields: {'Src': '203.0.113.1', 'Dst': '198.51.100.1'} },
            { id: 'esp_head', type: 'ESP', label: 'ESP Header', detail: 'SPI: 0xABC123', color: 'bg-indigo-600 border-indigo-500', fields: {'SPI': '0xABC123'} },
            { id: 'encrypted_payload', type: 'DATA', label: 'Encrypted Payload', detail: '...', color: 'bg-slate-700 border-slate-600', fields: {'Content': '[ENCRYPTED]'} },
        ]
      },
      {
        id: 'ipsec-4',
        device: 'VPN Gateway B',
        deviceType: 'firewall',
        action: 'Decapsulate & Decrypt',
        operation: 'DECAP',
        description: 'Gateway B validates ESP Auth, decrypts payload, strips ESP headers, and reveals original IP packet.',
        headers: [
            { id: 'eth4', type: 'ETH', label: 'Ethernet', detail: 'LAN', color: 'bg-slate-600 border-slate-500', fields: {'EtherType': '0x0800'} },
            { id: 'ip1', type: 'IP', label: 'Inner IP', detail: '192.168.1.50 -> 192.168.2.50', color: 'bg-cyan-600 border-cyan-500', fields: {'Src': '192.168.1.50', 'Dst': '192.168.2.50'} },
            { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Port 80', color: 'bg-violet-600 border-violet-500', fields: {'Dst Port': 80} },
            { id: 'data1', type: 'DATA', label: 'Payload', detail: 'HTTP GET', color: 'bg-emerald-600 border-emerald-500', fields: {'Data': 'HTTP GET /'} },
        ]
      }
    ]
  },
  {
    id: 'internet-nat',
    title: 'Internet Access (NAT/PAT)',
    description: 'Tracing a packet from a LAN host through a NAT gateway to the ISP.',
    steps: [
      {
        id: 'nat-1',
        device: 'Workstation',
        deviceType: 'server',
        action: 'Generate Packet',
        operation: 'NONE',
        description: 'User requests a website. Source IP is private (RFC1918).',
        headers: [
          { id: 'eth1', type: 'ETH', label: 'Ethernet', detail: 'Dst: Gateway', color: 'bg-slate-600 border-slate-500', fields: {'Src MAC': 'Host-MAC', 'Dst MAC': 'Gateway-MAC'} },
          { id: 'ip1', type: 'IP', label: 'IPv4', detail: 'Src: 192.168.1.100', color: 'bg-cyan-600 border-cyan-500', fields: {'Src': '192.168.1.100', 'Dst': '8.8.8.8', 'TTL': 128} },
          { id: 'tcp1', type: 'TCP', label: 'TCP', detail: 'Src Port: 50123', color: 'bg-violet-600 border-violet-500', fields: {'Src Port': 50123, 'Dst Port': 80} },
          { id: 'data1', type: 'DATA', label: 'HTTP', detail: 'GET /index.html', color: 'bg-emerald-600 border-emerald-500', fields: {'Payload': 'GET /'} },
        ]
      },
      {
        id: 'nat-2',
        device: 'Edge Firewall (NAT)',
        deviceType: 'firewall',
        action: 'Source NAT (PAT)',
        operation: 'NAT',
        description: 'Firewall translates Private Source IP to Public IP and maps the Source Port to a free port in its state table.',
        concept: 'PAT (Port Address Translation): Allows thousands of private hosts to share a single public IP by using unique source ports to track sessions.',
        headers: [
          { id: 'eth2', type: 'ETH', label: 'Ethernet', detail: 'Dst: ISP Gateway', color: 'bg-slate-600 border-slate-500', fields: {'Src MAC': 'FW-WAN-MAC', 'Dst MAC': 'ISP-MAC'} },
          { id: 'ip1_mod', type: 'IP', label: 'IPv4', detail: 'Src: 203.0.113.5 (Public)', color: 'bg-red-600 border-red-500', fields: {'Src': '203.0.113.5 (Changed)', 'Dst': '8.8.8.8', 'TTL': 127} },
          { id: 'tcp1_mod', type: 'TCP', label: 'TCP', detail: 'Src Port: 1024 (Mapped)', color: 'bg-violet-600 border-violet-500', fields: {'Src Port': 1024, 'Dst Port': 80, 'Note': 'Port Translated'} },
          { id: 'data1', type: 'DATA', label: 'HTTP', detail: 'GET /index.html', color: 'bg-emerald-600 border-emerald-500', fields: {'Payload': 'GET /'} },
        ]
      },
      {
        id: 'nat-3',
        device: 'ISP Router',
        deviceType: 'cloud',
        action: 'Route & Forward',
        operation: 'NONE',
        description: 'ISP router sees a valid public IP and routes packet to destination.',
        headers: [
          { id: 'eth3', type: 'ETH', label: 'Ethernet', detail: 'Dst: Next Hop', color: 'bg-slate-600 border-slate-500', fields: {'Src MAC': 'ISP-MAC', 'Dst MAC': 'Next-Hop-MAC'} },
          { id: 'ip1_mod', type: 'IP', label: 'IPv4', detail: 'Src: 203.0.113.5', color: 'bg-red-600 border-red-500', fields: {'Src': '203.0.113.5', 'Dst': '8.8.8.8'} },
          { id: 'tcp1_mod', type: 'TCP', label: 'TCP', detail: 'Dst Port: 80', color: 'bg-violet-600 border-violet-500', fields: {'Src Port': 1024, 'Dst Port': 80} },
          { id: 'data1', type: 'DATA', label: 'HTTP', detail: 'GET /index.html', color: 'bg-emerald-600 border-emerald-500', fields: {'Payload': 'GET /'} },
        ]
      }
    ]
  }
];

const PacketWalkVisualizer: React.FC = () => {
  const [activeScenarioId, setActiveScenarioId] = useState(SCENARIOS[0].id);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedHeaderId, setSelectedHeaderId] = useState<string | null>(null);

  const scenario = SCENARIOS.find(s => s.id === activeScenarioId) || SCENARIOS[0];
  const currentStep = scenario.steps[stepIndex];
  const selectedHeader = currentStep.headers.find(h => h.id === selectedHeaderId);

  const handleNext = () => {
    if (stepIndex < scenario.steps.length - 1) {
      setStepIndex(prev => prev + 1);
      setSelectedHeaderId(null);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex(prev => prev - 1);
      setSelectedHeaderId(null);
    }
  };

  const handleScenarioChange = (id: string) => {
    setActiveScenarioId(id);
    setStepIndex(0);
    setSelectedHeaderId(null);
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'router': return <Router size={48} className="text-cyan-400" />;
      case 'server': return <Server size={48} className="text-emerald-400" />;
      case 'firewall': return <ShieldCheck size={48} className="text-red-400" />;
      case 'cloud': return <Globe size={48} className="text-blue-400" />;
      default: return <Box size={48} className="text-slate-400" />;
    }
  };

  const getOperationBadge = (op: OperationType) => {
      switch (op) {
          case 'PUSH': return <span className="bg-amber-500 text-black px-2 py-0.5 rounded text-[10px] font-bold">PUSH</span>;
          case 'POP': return <span className="bg-purple-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">POP</span>;
          case 'SWAP': return <span className="bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">SWAP</span>;
          case 'NAT': return <span className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">NAT</span>;
          case 'ENCAP': return <span className="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Lock size={8} /> ENCRYPT</span>;
          case 'DECAP': return <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Key size={8} /> DECRYPT</span>;
          default: return null;
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/20">
      {/* Header / Selector */}
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-bold text-slate-400 block uppercase tracking-wide flex items-center gap-2">
                <Layers size={14} className="text-cyan-400" />
                Packet Walk Visualizer
            </label>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {SCENARIOS.map(s => (
                <button
                    key={s.id}
                    onClick={() => handleScenarioChange(s.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all whitespace-nowrap
                        ${activeScenarioId === s.id 
                            ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                    {s.title}
                </button>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex">
          
          {/* Main Stage */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950/30 overflow-y-auto">
            
            {/* Device Stage */}
            <div className="mb-8 flex flex-col items-center animate-in zoom-in-95 duration-500">
                <div className={`relative p-6 rounded-full bg-slate-900 border-2 shadow-[0_0_30px_rgba(0,0,0,0.5)] mb-4 transition-colors duration-500 ${
                    currentStep.deviceType === 'router' ? 'border-cyan-500/50 shadow-cyan-900/20' : 
                    currentStep.deviceType === 'firewall' ? 'border-red-500/50 shadow-red-900/20' : 
                    'border-emerald-500/50 shadow-emerald-900/20'
                }`}>
                    {getDeviceIcon(currentStep.deviceType)}
                    <div className="absolute -right-12 top-0 flex flex-col gap-1">
                        {getOperationBadge(currentStep.operation)}
                    </div>
                </div>
                <h2 className="text-xl font-display font-bold text-white tracking-wider">{currentStep.device}</h2>
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase font-bold mt-1 bg-cyan-950/30 px-3 py-1 rounded-full border border-cyan-900/50">
                    <Hash size={12} /> {currentStep.action}
                </div>
            </div>

            {/* Packet Stack */}
            <div className="w-full max-w-xl flex flex-col-reverse gap-1.5 items-center relative">
                {/* Arrow indicating direction */}
                <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-slate-700 hidden lg:block">
                    <ArrowRight size={48} className="animate-pulse opacity-20" />
                </div>

                {currentStep.headers.map((header, idx) => (
                    <button 
                        key={`${stepIndex}-${idx}`} 
                        onClick={() => setSelectedHeaderId(header.id)}
                        className={`w-full flex items-center justify-between px-6 py-3 rounded-md border text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-95 group relative ${header.color} ${selectedHeaderId === header.id ? 'ring-2 ring-white scale-[1.02] brightness-110 z-10' : ''}`}
                        style={{ maxWidth: `${100 - (idx * 2)}%` }} // Tapered stack look
                    >
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold opacity-70 w-12 text-left">{header.type}</span>
                            <span className="font-bold text-sm tracking-wide">{header.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] opacity-80 bg-black/20 px-2 py-1 rounded">{header.detail}</span>
                            <Eye size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </button>
                ))}
            </div>
            
            {/* Description/Concept Panel */}
            <div className="mt-12 max-w-2xl w-full">
                {currentStep.concept && (
                    <div className="mb-4 bg-violet-950/20 border border-violet-500/30 p-3 rounded-lg flex gap-3 animate-in slide-in-from-bottom-2">
                        <Activity size={18} className="text-violet-400 shrink-0 mt-0.5" />
                        <div>
                            <span className="text-xs font-bold text-violet-400 uppercase block mb-1">Key Concept</span>
                            <p className="text-sm text-slate-300 leading-relaxed">{currentStep.concept}</p>
                        </div>
                    </div>
                )}
                
                <div className="text-center bg-slate-900/80 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">
                        {currentStep.description}
                    </p>
                </div>
            </div>
          </div>

          {/* Right Panel: Header Inspector */}
          {selectedHeader && (
              <div className="w-80 bg-slate-950 border-l border-slate-800 p-6 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl z-20">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                          <Search size={16} className="text-cyan-400" />
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Header Inspector</h3>
                      </div>
                      <button onClick={() => setSelectedHeaderId(null)} className="text-slate-500 hover:text-white">
                          <ChevronRight size={16} />
                      </button>
                  </div>

                  <div className={`p-4 rounded-lg mb-6 border ${selectedHeader.color.replace('bg-', 'bg-opacity-20 ')}`}>
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-bold uppercase opacity-70">{selectedHeader.type} HEADER</span>
                      </div>
                      <div className="text-lg font-bold">{selectedHeader.label}</div>
                  </div>

                  <div className="space-y-1">
                      {Object.entries(selectedHeader.fields).map(([key, value], idx) => (
                          <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0 hover:bg-slate-900/50 px-2 rounded transition-colors">
                              <span className="text-xs text-slate-500 font-mono uppercase">{key}</span>
                              <span className="text-xs text-cyan-300 font-mono font-bold text-right">{value}</span>
                          </div>
                      ))}
                  </div>

                  <div className="mt-auto pt-6 border-t border-slate-800">
                      <div className="bg-slate-900 p-3 rounded text-[10px] text-slate-400 leading-relaxed flex gap-2">
                          <Info size={14} className="shrink-0 text-slate-500" />
                          Click headers in the main view to inspect their specific field values at this step.
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* Footer Controls */}
      <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between shrink-0 z-30">
          <button 
             onClick={handlePrev}
             disabled={stepIndex === 0}
             className="flex items-center gap-2 px-6 py-3 rounded-lg bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
             <ChevronLeft size={16} /> PREV HOP
          </button>

          {/* Stepper Dots */}
          <div className="flex gap-2">
             {scenario.steps.map((_, idx) => (
                 <div 
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === stepIndex ? 'bg-cyan-400 w-6' : idx < stepIndex ? 'bg-cyan-800' : 'bg-slate-700'}`}
                 />
             ))}
          </div>

          <button 
             onClick={handleNext}
             disabled={stepIndex === scenario.steps.length - 1}
             className="flex items-center gap-2 px-6 py-3 rounded-lg bg-cyan-600 text-white font-bold hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-900/20"
          >
             NEXT HOP <ChevronRight size={16} />
          </button>
      </div>
    </div>
  );
};

export default PacketWalkVisualizer;