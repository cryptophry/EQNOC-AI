# Rosetta CLI workbench

Cross-vendor command workbench for Cisco IOS/IOS-XE, IOS-XR, NX-OS, Juniper Junos and
Alcatel-Lucent OmniSwitch AOS 8. Deployed as a subdomain of noc-assistant.com.

- **Commands** – search by task or paste a command from any platform; every dialect side by side.
- **Playbooks** – fault-finding sequences with the command for your platform at each step.
- **Learn** – field guides to how each CLI thinks.
- **Drill** – type commands from memory; spaced repetition, CLI abbreviations accepted.
- **Ask AI** – uses the main app's `/api/login` and `/api/ai`, reached same-origin through the
  rewrite in `vercel.json`. No secrets or env vars live in this project.

## Develop

    npm ci
    npm run dev        # http://localhost:5180 (set API_TARGET to point /api somewhere)
    npm test
    npm run build

## Deploy

Separate Vercel project on the same repo with **Root Directory = `workbench`** (framework: Vite).
Attach the subdomain to that project. Nothing else to configure.

## Editing the library

`src/data/lib1.ts` and `lib2.ts`. Each entry is one task with five commands in the order
IOS, XR, NX-OS, Junos, AOS. Use `null` plus a note where a platform has no equivalent, and
list a platform under `check` when the syntax is release-dependent. `npm test` validates ids,
variables and cross-references.
