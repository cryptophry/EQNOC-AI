import { P } from './types';

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'tip'; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'entries'; ids: string[] };

export interface Guide {
  id: string;
  title: string;
  summary: string;
  platform?: P;
  minutes: number;
  blocks: Block[];
  /** Entries the "Drill this guide" button practises. */
  drill: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'mental-model',
    title: 'Five CLIs, one mental model',
    summary: 'Every platform answers the same six questions differently. Learn the questions and each new CLI becomes a lookup, not a language.',
    minutes: 6,
    drill: ['enter-config', 'save-config', 'show-run', 'pending-changes', 'rollback', 'filter-include', 'if-brief', 'if-detail'],
    blocks: [
      { t: 'p', text: 'When you sit down at an unfamiliar device, you are not missing hundreds of commands. You are missing the answers to six questions. Once you know them, most show commands can be guessed and confirmed with `?`.' },
      {
        t: 'table',
        head: ['Question', 'IOS / IOS-XE', 'IOS-XR', 'NX-OS', 'Junos', 'AOS 8'],
        rows: [
          ['When does a config line take effect?', 'When you press Enter', 'On `commit`', 'When you press Enter', 'On `commit`', 'When you press Enter'],
          ['How is it saved?', '`copy run start`', 'By the commit', '`copy run start`', 'By the commit', '`write memory`, then certify'],
          ['How do I undo?', '`no` each line, or `configure replace`', '`rollback configuration last 1`', '`no` each line, or checkpoint rollback', '`rollback 1` then `commit`', '`no` each line, or reboot to certified'],
          ['How is config shaped?', 'Flat lines with indented sub-modes', 'Like IOS, but strictly hierarchical', 'Like IOS, features must be enabled', 'A tree: `set` a path to a leaf', 'Flat, one full line per setting'],
          ['How do I filter output?', '`| include` `| section`', '`| include` `| utility egrep`', '`| grep` `| include` `| json`', '`| match` `| except` `| display set`', '`| grep`'],
          ['How are ports named?', '`Gi1/0/1` `Te1/1/1`', '`Gi0/0/0/1` (rack/slot/module/port)', '`Eth1/1`', '`ge-0/0/1` (type-fpc/pic/port)', '`1/1/1` (chassis/slot/port)'],
        ],
      },
      { t: 'h', text: 'The split that matters most' },
      { t: 'p', text: 'IOS, NX-OS and AOS are immediate: a typo takes effect the moment you press Enter, and saving is a separate step you can forget. XR and Junos are transactional: nothing happens until you commit, you can review the diff first, and every commit is kept as a numbered rollback point.' },
      { t: 'tip', text: 'On an immediate platform, the dangerous moment is each Enter. On a transactional platform, the dangerous moment is the commit. Put your care in the right place.' },
      { t: 'entries', ids: ['enter-config', 'pending-changes', 'save-config', 'rollback', 'commit-confirmed'] },
      { t: 'h', text: 'Guessing show commands' },
      { t: 'p', text: 'Cisco IOS and NX-OS put the address family in the command: `show ip ospf neighbor`, `show ip bgp summary`. XR and Junos drop the `ip`: `show ospf neighbor`, `show bgp summary`. AOS keeps `ip` and uses its own nouns: `spantree`, `linkagg`, `mac-learning`.' },
      { t: 'entries', ids: ['ospf-neighbors', 'bgp-summary', 'routes', 'lag-summary', 'mac-table'] },
    ],
  },
  {
    id: 'ios',
    platform: 'ios',
    title: 'IOS and IOS-XE field guide',
    summary: 'Modes, the running/startup split and the filters that make long output usable.',
    minutes: 5,
    drill: ['enter-config', 'save-config', 'show-run-section', 'if-brief', 'if-status', 'if-detail', 'optics', 'mac-find', 'lag-summary', 'stp-vlan', 'route-lookup', 'ospf-neighbors', 'bgp-summary', 'logs-filter'],
    blocks: [
      { t: 'p', text: 'IOS has three levels you move through in order: user EXEC (`Router>`), privileged EXEC (`Router#`, reached with `enable`) and global configuration (`Router(config)#`, reached with `configure terminal`). Sub-modes such as `(config-if)#` hang off global config. `end` or Ctrl-Z drops straight back to privileged EXEC.' },
      { t: 'h', text: 'Two configurations' },
      { t: 'p', text: 'The running config is live and lost at reboot. The startup config is what loads at boot. Every change you type edits running immediately; nothing touches startup until you copy it.' },
      { t: 'entries', ids: ['save-config', 'pending-changes'] },
      { t: 'tip', text: 'Remove a line by repeating it with `no` in front. For a remote change that could cut you off, schedule `reload in 10` first and `reload cancel` once you are sure. The unsaved change dies with the reload.' },
      { t: 'h', text: 'Shortcuts worth the keystrokes' },
      {
        t: 'table',
        head: ['You want', 'Type'],
        rows: [
          ['A show command from config mode', '`do show ip interface brief`'],
          ['One stanza of the config', '`show running-config | section router bgp`'],
          ['Lines matching either word', '`show interfaces | include line protocol|CRC`'],
          ['Everything from a point onward', '`show running-config | begin interface Vlan`'],
          ['To stop a runaway ping or traceroute', 'Ctrl-Shift-6'],
          ['Abbreviations', 'Any unambiguous prefix: `sh ip int br`'],
        ],
      },
      { t: 'h', text: 'The daily set' },
      { t: 'entries', ids: ['if-brief', 'if-status', 'if-detail', 'optics', 'mac-find', 'lag-summary', 'stp-vlan', 'route-lookup', 'ospf-neighbors', 'bgp-summary'] },
    ],
  },
  {
    id: 'xr',
    platform: 'xr',
    title: 'IOS-XR field guide',
    summary: 'It looks like IOS and behaves like Junos. The commit model, locations and admin mode.',
    minutes: 5,
    drill: ['enter-config', 'save-config', 'pending-changes', 'rollback', 'commit-confirmed', 'config-history', 'if-brief', 'optics', 'lag-summary', 'route-lookup', 'ospf-neighbors', 'bgp-summary', 'lfib', 'pseudowires'],
    blocks: [
      { t: 'p', text: 'XR borrows IOS syntax but is a different operating system. The prompt tells you where you are: `RP/0/RSP0/CPU0:router#` names the route processor you are logged in to. Interfaces carry four numbers, rack/slot/module/port.' },
      { t: 'h', text: 'Nothing happens until you commit' },
      { t: 'p', text: 'Typing in config mode builds a candidate. `show configuration` shows what you have staged, `commit` activates and saves it in one step, and `abort` throws it away. If a commit is rejected, `show configuration failed` tells you which line and why.' },
      { t: 'entries', ids: ['pending-changes', 'save-config', 'commit-confirmed', 'discard-candidate', 'rollback', 'config-history'] },
      { t: 'tip', text: 'Add a label and comment to commits you may need to find again: `commit label BGP-PEER-ADD comment "ticket 1234"`. They appear in `show configuration commit list`.' },
      { t: 'h', text: 'Differences that catch IOS users' },
      {
        t: 'table',
        head: ['On IOS you type', 'On XR you type'],
        rows: [
          ['`show ip interface brief`', '`show ipv4 interface brief`'],
          ['`show ip route`', '`show route`'],
          ['`show ip bgp summary`', '`show bgp summary`'],
          ['`show ip ospf neighbor`', '`show ospf neighbor`'],
          ['`show etherchannel summary`', '`show bundle brief`'],
          ['`show run | section bgp`', '`show running-config router bgp`'],
          ['`write memory`', '`commit`'],
        ],
      },
      { t: 'p', text: 'Many hardware commands need a `location`, for example `show controllers ... location 0/0/CPU0`. Chassis-level work such as environment and card reloads lives in `admin` mode.' },
      { t: 'h', text: 'The daily set' },
      { t: 'entries', ids: ['if-brief', 'if-detail', 'optics', 'lag-summary', 'route-lookup', 'ospf-neighbors', 'bgp-summary', 'ldp-neighbors', 'lfib', 'pseudowires'] },
    ],
  },
  {
    id: 'nx',
    platform: 'nx',
    title: 'NX-OS field guide',
    summary: 'IOS habits mostly transfer. Features, checkpoints and the singular `interface` are what change.',
    minutes: 4,
    drill: ['save-config', 'pending-changes', 'rollback', 'if-status', 'if-detail', 'optics', 'trunks', 'mac-find', 'lag-summary', 'stack', 'route-lookup', 'ospf-neighbors', 'bgp-summary'],
    blocks: [
      { t: 'p', text: 'NX-OS reads like IOS and applies config line by line in the same way. Three things differ from the first minute.' },
      {
        t: 'table',
        head: ['Difference', 'What it means'],
        rows: [
          ['Features are off by default', 'A protocol\'s commands do not exist until you run `feature ospf`, `feature bgp`, `feature lacp`, `feature interface-vlan`. Check with `show feature`.'],
          ['`show interface`, singular', '`show interfaces` is rejected. Ports are `Ethernet1/1`, bundles are `port-channel`.'],
          ['Show commands work in any mode', 'No `do` needed inside config mode.'],
          ['Real grep', '`| grep`, `| egrep`, `| last 20`, `| json` and `| no-more` all work.'],
          ['Addresses use prefix length', '`ip address 10.1.1.1/24`, not a dotted mask.'],
          ['OSPF and IS-IS need a tag', '`router ospf 1`, then `ip router ospf 1 area 0` under the interface. Routes show as `ospf-1`.'],
        ],
      },
      { t: 'h', text: 'Checkpoints give you a rollback' },
      { t: 'p', text: 'Before a change, run `checkpoint pre-change`. If it goes wrong, `rollback running-config checkpoint pre-change` puts the running config back without a reload. `show diff rollback-patch checkpoint pre-change running-config` shows what would be undone.' },
      { t: 'entries', ids: ['rollback', 'pending-changes', 'save-config'] },
      { t: 'h', text: 'The daily set' },
      { t: 'entries', ids: ['if-status', 'if-detail', 'optics', 'trunks', 'mac-find', 'lag-summary', 'stack', 'route-lookup', 'ospf-neighbors', 'bgp-summary'] },
    ],
  },
  {
    id: 'junos',
    platform: 'junos',
    title: 'Junos field guide',
    summary: 'Two modes, one tree, and a commit history fifty deep. The pipe is the most powerful tool on the box.',
    minutes: 6,
    drill: ['enter-config', 'save-config', 'show-run', 'pending-changes', 'rollback', 'commit-confirmed', 'filter-include', 'if-brief', 'if-detail', 'optics', 'mac-find', 'lag-detail', 'route-lookup', 'ospf-neighbors', 'bgp-summary', 'bgp-advertised', 'bgp-received'],
    blocks: [
      { t: 'p', text: 'Junos has two modes. Operational mode (`user@router>`) is for show, ping, clear and request. Configuration mode (`user@router#`, reached with `configure`) edits a candidate copy of one configuration tree.' },
      { t: 'h', text: 'Configuration is a tree' },
      { t: 'p', text: 'Every setting is a path from the root to a leaf. `set interfaces ge-0/0/1 description "uplink"` writes a leaf; `delete` removes one. `edit protocols bgp` moves you down so later commands are relative; `top` returns to the root. `show | display set` prints the tree as the set commands that would build it, which is the form to copy between devices.' },
      { t: 'h', text: 'The commit workflow' },
      {
        t: 'table',
        head: ['Step', 'Command'],
        rows: [
          ['See what you changed', '`show | compare`'],
          ['Validate without activating', '`commit check`'],
          ['Activate with auto-rollback', '`commit confirmed 10`, then `commit` to keep it'],
          ['Activate with a note', '`commit comment "ticket 1234"`'],
          ['Undo the last commit', '`rollback 1` then `commit`'],
          ['Abandon uncommitted edits', '`rollback 0`'],
          ['Compare two past commits', '`show system rollback compare 2 1`'],
        ],
      },
      { t: 'tip', text: 'Use `commit confirmed` for every remote change that touches routing, filters or the interface you came in on. If you lose the session, the router repairs itself.' },
      { t: 'h', text: 'Interfaces have units' },
      { t: 'p', text: 'A physical port such as `ge-0/0/1` carries nothing by itself. Addresses and VLANs sit on logical units: `ge-0/0/1.0`. That is why `show interfaces terse` lists both lines, and why a unit can be down while the port is up. The prefix gives the speed: `ge-` 1G, `xe-` 10G, `et-` 25G and above, `ae` aggregated.' },
      { t: 'h', text: 'Pipes' },
      { t: 'p', text: 'Pipes chain: `show route | match 10.1 | except Direct | count`. `| display set` and `| display inheritance` re-render config, `| find` starts output at a match, `| last 30` tails it, `| no-more` disables paging and `| refresh 5` re-runs the command every five seconds.' },
      { t: 'entries', ids: ['filter-include', 'show-run', 'do-run'] },
      { t: 'h', text: 'The daily set' },
      { t: 'entries', ids: ['if-brief', 'if-detail', 'optics', 'mac-find', 'lag-detail', 'route-lookup', 'ospf-neighbors', 'bgp-summary', 'bgp-received', 'bgp-advertised'] },
    ],
  },
  {
    id: 'aos',
    platform: 'aos',
    title: 'OmniSwitch AOS field guide',
    summary: 'One prompt, no modes, and a two-directory save model that punishes anyone who skips the second step.',
    minutes: 6,
    drill: ['save-config', 'show-run', 'pending-changes', 'boot-image', 'version', 'if-status', 'if-detail', 'optics', 'vlans', 'vlan-ports', 'mac-table', 'stp-vlan', 'lag-summary', 'lldp', 'routes', 'ospf-neighbors', 'logs'],
    blocks: [
      { t: 'p', text: 'An OmniSwitch has a single prompt, `->`. There is no enable and no config mode: a show command and a configuration command are typed at the same place, and the configuration command takes effect immediately.' },
      { t: 'h', text: 'Working and certified' },
      { t: 'p', text: 'The flash holds two directories. Working is where you save. Certified is the known-good copy the switch falls back to. On a normal reboot, if the two differ, the switch boots certified and your uncertified save is ignored. While running from certified you cannot save at all.' },
      {
        t: 'table',
        head: ['Step', 'AOS 8', 'AOS 6'],
        rows: [
          ['Where am I running from?', '`show running-directory`', '`show running-directory`'],
          ['Save running to working', '`write memory`', '`write memory`'],
          ['Certify and sync the stack', '`copy running certified flash-synchro`', '`copy working certified flash-synchro`'],
          ['Both in one command', '`write memory flash-synchro`', '`write memory flash-synchro`'],
          ['Reboot onto working', '`reload from working no rollback-timeout`', '`reload working no rollback-timeout`'],
        ],
      },
      { t: 'tip', text: 'After any change you intend to keep, run `show running-directory` and read two lines: "Running configuration" should say WORKING and "Certify/Restore Status" should say CERTIFIED.' },
      { t: 'entries', ids: ['save-config', 'boot-image', 'pending-changes', 'show-run'] },
      { t: 'h', text: 'AOS 8 and AOS 6 are different dialects' },
      { t: 'p', text: 'The 6860, 6900, 6560, 6465 and 6360 families run AOS 8. Older 6250, 6450 and 6850 switches run AOS 6. Ports are `chassis/slot/port` on AOS 8 and `slot/port` on AOS 6, and several everyday commands were renamed.' },
      {
        t: 'table',
        head: ['Task', 'AOS 8', 'AOS 6'],
        rows: [
          ['MAC table', '`show mac-learning`', '`show mac-address-table`'],
          ['Ports in a VLAN', '`show vlan 10 members`', '`show vlan 10 port`'],
          ['Untagged port', '`vlan 10 members port 1/1/1 untagged`', '`vlan 10 port default 1/1`'],
          ['Tagged port', '`vlan 10 members port 1/1/1 tagged`', '`vlan 10 802.1q 1/1`'],
          ['Disable a port', '`interfaces 1/1/1 admin-state disable`', '`interfaces 1/1 admin down`'],
          ['Stack state', '`show virtual-chassis topology`', '`show stack topology`'],
        ],
      },
      { t: 'h', text: 'Its own vocabulary' },
      { t: 'p', text: 'AOS names things differently from Cisco: `spantree` for spanning tree, `linkagg` for a LAG, `alias` for a port description, `ip interface` for a named layer 3 interface bound to a VLAN, and `swlog` for the system log. On AOS 8 the shell is Linux underneath, so `| grep`, `ls` and `more` behave as you expect.' },
      { t: 'h', text: 'The daily set' },
      { t: 'entries', ids: ['version', 'if-status', 'if-detail', 'optics', 'vlans', 'vlan-ports', 'mac-table', 'stp-vlan', 'lag-summary', 'lldp', 'routes', 'logs'] },
    ],
  },
  {
    id: 'safe-change',
    title: 'Changing a remote device without losing it',
    summary: 'The same four-step habit on every platform: snapshot, arm a safety net, change, verify.',
    minutes: 4,
    drill: ['commit-confirmed', 'rollback', 'pending-changes', 'save-config', 'config-history', 'route-summary', 'if-brief'],
    blocks: [
      { t: 'p', text: 'Most self-inflicted outages come from a change made over the same path it breaks. The cure is the same everywhere: record the state, make the change in a way that undoes itself, and only then make it permanent.' },
      { t: 'h', text: '1. Snapshot the state you care about' },
      { t: 'p', text: 'Capture the outputs you will compare afterwards. Counts are easier to compare than tables.' },
      { t: 'entries', ids: ['route-summary', 'if-brief', 'bgp-summary', 'ospf-neighbors'] },
      { t: 'h', text: '2. Arm the safety net' },
      { t: 'entries', ids: ['commit-confirmed'] },
      { t: 'h', text: '3. Change, then look before you keep it' },
      { t: 'entries', ids: ['pending-changes'] },
      { t: 'h', text: '4. Verify, then make it permanent' },
      { t: 'p', text: 'Re-run the snapshot commands. If they match what you expected, confirm or save. If not, let the timer expire or roll back.' },
      { t: 'entries', ids: ['save-config', 'rollback'] },
    ],
  },
];

export interface Step {
  title: string;
  why: string;
  entry?: string;
  read?: string[];
}
export interface Playbook {
  id: string;
  title: string;
  symptom: string;
  steps: Step[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'link-down',
    title: 'Interface down or taking errors',
    symptom: 'A port is down, flapping, or its error counters are climbing.',
    steps: [
      { title: 'Establish the state', why: 'Admin down, physically down and protocol down are three different faults.', entry: 'if-detail', read: ['Administratively down: someone shut it. Stop here and find out why', 'Down/down: no signal. Continue to the optics', 'Up/down: signal present but layer 2 failing. Suspect a mismatch with the far end'] },
      { title: 'Find out when it started', why: 'A timestamp lets you tie the fault to a change, a power event or site work.', entry: 'if-flaps' },
      { title: 'Read the light levels', why: 'On fibre, the receive power separates a dead far end from a degraded path.', entry: 'optics', read: ['No Rx light: far-end laser off, fibre broken, or the pair is crossed', 'Rx low but present: dirty connector, tight bend or a failing far-end optic', 'Tx low at this end: this optic is failing'] },
      { title: 'Check what the far end says it is', why: 'Confirms you are patched to the device and port you think you are.', entry: 'lldp-detail' },
      { title: 'Zero the counters and watch', why: 'Old errors prove nothing. You need to know whether they are still increasing.', entry: 'clear-counters' },
      { title: 'Read the errors again after a few minutes', why: 'CRC and input errors mean a receive-path physical fault. Output drops mean congestion.', entry: 'if-errors' },
      { title: 'Rule out a protection shutdown', why: 'A port disabled by BPDU guard or port security looks dead but is healthy.', entry: 'errdisable' },
    ],
  },
  {
    id: 'bgp-down',
    title: 'BGP session down',
    symptom: 'A peer is Idle, Active or Connect, or keeps resetting.',
    steps: [
      { title: 'Read the session state', why: 'The state tells you which stage is failing.', entry: 'bgp-summary', read: ['Idle: not trying. Shut down, no route to the peer, or backing off after an error', 'Active or Connect: TCP is not completing', 'Established with zero prefixes: the session is fine, policy is the problem'] },
      { title: 'Get the last reset reason', why: 'The notification code usually names the cause outright: hold timer expired, bad peer AS, cease.', entry: 'bgp-neighbor' },
      { title: 'Check you can reach the peer address', why: 'BGP needs IP reachability first. For loopback peering the route must come from the IGP, not BGP itself.', entry: 'route-lookup' },
      { title: 'Ping from the source address the session uses', why: 'A ping from the wrong source can succeed while the session fails.', entry: 'ping-extended' },
      { title: 'Confirm the link underneath', why: 'For a directly connected peer, the interface is the first suspect.', entry: 'if-detail' },
      { title: 'Look for filters dropping TCP 179', why: 'An ACL or control-plane filter is a common cause after a hardening change.', entry: 'acl' },
      { title: 'Read the log around the reset time', why: 'The log shows the order of events: link, IGP, then BGP, or BGP alone.', entry: 'logs-filter' },
    ],
  },
  {
    id: 'ospf-stuck',
    title: 'OSPF adjacency not forming',
    symptom: 'A neighbour is missing, or stuck short of FULL.',
    steps: [
      { title: 'See which state it stops in', why: 'Each state maps to a short list of causes.', entry: 'ospf-neighbors', read: ['No neighbour at all: hellos not arriving. Check the link, the area and passive-interface', 'INIT: one-way hellos, or a mismatch rejected them', 'EXSTART or EXCHANGE: MTU mismatch', '2WAY only: normal between two non-DR routers on a LAN'] },
      { title: 'Compare the interface settings on both ends', why: 'Area, network type, hello and dead timers, authentication and mask must all agree.', entry: 'ospf-interface-detail' },
      { title: 'Prove the MTU', why: 'A full-size don\'t-fragment ping across the link confirms or rules out the commonest cause of EXSTART.', entry: 'ping-extended' },
      { title: 'Check for a duplicate router ID', why: 'Two routers with the same ID cannot hold an adjacency.', entry: 'ospf-process' },
      { title: 'Check the underlying interface', why: 'Errors or flaps on the link will drop hellos.', entry: 'if-errors' },
      { title: 'Read the log', why: 'Most platforms log the exact mismatch.', entry: 'logs-filter' },
    ],
  },
  {
    id: 'l2-loop',
    title: 'Suspected layer 2 loop or MAC flapping',
    symptom: 'Broadcast storm, high CPU on switches, MAC move messages, or a whole VLAN gone slow.',
    steps: [
      { title: 'Look for MAC moves in the log', why: 'The log names the two ports a MAC is bouncing between: those ports are the loop.', entry: 'logs-filter', read: ['Search for MACFLAP, MAC_MOVE or "moved"'] },
      { title: 'Count topology changes', why: 'A counter that climbs as you watch means spanning tree is reconverging over and over.', entry: 'stp-changes' },
      { title: 'Check the root is where it should be', why: 'An unexpected root means a rogue or misconfigured switch joined the network.', entry: 'stp-vlan' },
      { title: 'Find the ports carrying the storm', why: 'The looped ports show very high, matching input and output rates.', entry: 'if-rate' },
      { title: 'See what is on the suspect port', why: 'Identifies the device or unmanaged switch that closed the loop.', entry: 'lldp-detail' },
      { title: 'Break the loop', why: 'Shutting one side of the loop stops the storm at once. Find the root cause afterwards.', entry: 'if-shut' },
    ],
  },
  {
    id: 'unreachable',
    title: 'Host or subnet unreachable',
    symptom: 'A device cannot be pinged from the network.',
    steps: [
      { title: 'Ping from the gateway', why: 'Removes the rest of the network from the question.', entry: 'ping' },
      { title: 'Check ARP on the gateway', why: 'Separates a layer 2 problem from a layer 3 one.', entry: 'arp-entry', read: ['Entry resolved: layer 2 works, look at the host firewall or its default gateway', 'Incomplete: the host is not answering on this VLAN'] },
      { title: 'Find the host\'s MAC', why: 'Tells you whether the switch has seen the device at all, and on which port.', entry: 'mac-find' },
      { title: 'Check the port and its VLAN', why: 'A port in the wrong VLAN, or a VLAN missing from a trunk, is the usual cause.', entry: 'switchport' },
      { title: 'Check the path back', why: 'Remote sources need a route in both directions.', entry: 'route-lookup' },
      { title: 'Trace from the far end', why: 'Shows the hop where the path stops.', entry: 'traceroute' },
    ],
  },
  {
    id: 'lag-member',
    title: 'LAG member not bundling',
    symptom: 'A port-channel is up on fewer links than it should be.',
    steps: [
      { title: 'See which member is out', why: 'The flags say whether it is down, suspended or stand-alone.', entry: 'lag-summary' },
      { title: 'Check the LACP partner', why: 'No partner means no LACPDUs; a different partner ID means it is cabled to another device.', entry: 'lag-detail' },
      { title: 'Check the physical link', why: 'A member with errors or low light may be held out of the bundle.', entry: 'if-detail' },
      { title: 'Confirm the far-end port', why: 'A cross-patched member lands on the wrong bundle.', entry: 'lldp-detail' },
      { title: 'Compare the member\'s config with a working one', why: 'Speed, duplex, VLANs and LACP mode must match across members.', entry: 'show-run-if' },
    ],
  },
  {
    id: 'high-cpu',
    title: 'High CPU',
    symptom: 'Slow CLI, dropped routing adjacencies, management timeouts.',
    steps: [
      { title: 'Find the process', why: 'A named process narrows the cause to one feature.', entry: 'cpu' },
      { title: 'Check the log for a storm of one message', why: 'Repeated logging is both a symptom and a load.', entry: 'logs' },
      { title: 'Look for a layer 2 loop', why: 'Broadcast storms punt traffic to the CPU.', entry: 'stp-changes' },
      { title: 'Check routing stability', why: 'Constant SPF runs or BGP churn burn CPU.', entry: 'ospf-process' },
      { title: 'Check memory', why: 'A device short of memory spends its time reclaiming it.', entry: 'memory' },
    ],
  },
  {
    id: 'pre-post',
    title: 'Before and after a change',
    symptom: 'Capture the same outputs either side of planned work so differences stand out.',
    steps: [
      { title: 'Software and uptime', why: 'Confirms the device and proves afterwards whether it reloaded.', entry: 'version' },
      { title: 'Interface states', why: 'Any port that changes state is the first thing to explain.', entry: 'if-brief' },
      { title: 'Route counts', why: 'A count per protocol is quicker to compare than a routing table.', entry: 'route-summary' },
      { title: 'IGP neighbours', why: 'Every adjacency present before must be present after.', entry: 'ospf-neighbors' },
      { title: 'BGP peers and prefix counts', why: 'Sessions and received-prefix numbers should match.', entry: 'bgp-summary' },
      { title: 'LAG members', why: 'A bundle can stay up while silently losing members.', entry: 'lag-summary' },
      { title: 'Alarms and environment', why: 'Catches hardware disturbed during the work.', entry: 'environment' },
      { title: 'Save', why: 'A change that is not saved is undone by the next power event.', entry: 'save-config' },
    ],
  },
];
