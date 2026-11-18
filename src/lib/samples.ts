/**
 * ClipShield — preloaded demonstration scenarios.
 *
 * ALL DATA IS SYNTHETIC AND FICTIONAL. No real companies, people, domains,
 * credentials or infrastructure. Domains use reserved TLDs (.example,
 * .internal, .test) and credential strings are deliberately fake.
 */

export interface SampleScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  content: string;
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: 'it-support',
    title: 'IT Support Ticket',
    description:
      'Helpdesk ticket with an employee email, phone, internal IP and account details.',
    category: 'IT Support',
    content: `Ticket #48211 — VPN connection failure (Priority: P2)

Reported by: sarah.okafor@example-corp.example
Contact number: +256 776 114 093
Assigned to: IT Service Desk — Tier 2

Issue description:
User reports repeated VPN disconnects since Monday. Corporate laptop
(Asset TAG-77341) fails at the authentication step against the gateway
10.24.117.8. Colleague on the same floor reports no issues. Remote work
is currently blocked for this user.

Troubleshooting performed:
- Reinstalled VPN client v7.2.1, no change
- Confirmed credentials work on the web portal
- Gateway logs show auth timeout for this account only

Additional context:
Employee ID 4417, department Finance, floor 6. User asks for updates on
the phone number above (WhatsApp acceptable). Password was reset on
Tuesday by helpdesk agent m.tanaka@example-corp.example per policy
change INC-0091.`,
  },
  {
    id: 'security-incident',
    title: 'Security Incident Report',
    description:
      'Incident report containing fake API credentials, a bearer token and internal infrastructure details.',
    category: 'Security',
    content: `INCIDENT REPORT — SEC-2026-0147 (DRAFT — INTERNAL ONLY)
Classification: Amber | Severity: High | Status: Investigating

Summary:
Anomalous API activity detected on the staging payment service at
03:14 UTC. Automated alerting flagged 214 failed authentication
attempts followed by one successful call from an unrecognized subnet.

Exposed credential found in the repo (confirmed fake test data):
- API key: sk-test-9fJ2mQ7bXr4LpN8vZa3Wq6yT
- Bearer token: Bearer dGhpcy1pcy1hLWRhbmdlcm91cy10b2tlbg==.ZmFrZQ
- AWS-style key: AKIAIOSFODNN7FLEXAMPLE
- Service token: ghp_fakeGitHubTokenForDemoPurposesOnly1234567890

Infrastructure involved:
- Jump host: 192.168.44.7 (internal, mgmt VLAN)
- Staging API gateway: 10.0.88.21
- Logging cluster: 172.16.3.55

Initial assessment:
The exposed key sk-test-9fJ2mQ7bXr4LpN8vZa3Wq6yT was rotated at 06:02
UTC. The bearer token appears limited to staging scope. Recommend
reviewing gateway logs for the 03:00-04:00 window and confirming no
production keys follow the same deployment pattern.

Reported by: j.novak@security.example | On-call: +1 415 555 0173 x2241`,
  },
  {
    id: 'ot-maintenance',
    title: 'OT Maintenance Incident',
    description:
      'Operational-technology incident with fictional equipment IDs, operator contacts and notes.',
    category: 'Operations / OT',
    content: `OT MAINTENANCE LOG — Line 3 Filling Station
Site: Northern Plant (fictional) | Shift: B | Date: 2026-11-12

Equipment: FILLER-3A (S/N FN-88214), PLC node 10.77.2.14, HMI panel
OP-17. Line stopped 04:38 due to servo torque fault E-2207.

Operator contact: ahab.mensah@plant-ops.example, phone +256 414 302 887
Maintenance lead: rosa.delacruz@plant-ops.example, +254 711 982 004

Actions taken:
- Fault reset attempted twice; fault returned under load
- Inspected servo drive cabinet CB-12; found coolant residue
- Temporary bypass installed on sensor S-118 per procedure OT-BP-44
- Production resumed at 06:10 at 80% rated speed

Parts ordered: servo coupling kit FK-220 (PO 77120), gasket set.

Notes: The sensor bypass must be removed within 48h. Quality has been
notified; batch 2026-11-12-B quarantined pending QA sign-off by
quality.north@plant-ops.example. Operator reported hearing "grinding"
before the stop — inspection of gearbox GB-9 recommended at next
planned downtime.`,
  },
  {
    id: 'vendor-procurement',
    title: 'Vendor Procurement Report',
    description:
      'Procurement summary with fictional business contacts and confidential commercial figures.',
    category: 'Procurement',
    content: `VENDOR EVALUATION SUMMARY — Cloud Migration Partner
Prepared by: l.hartmann@procurement.example | Internal — Confidential

Shortlist (fictional vendors):
1. Northwind Systems — lead: d.almeida@northwind.test, +49 30 555 0198
2. Bright Harbor Consulting — lead: k.suzuki@brightharbor.test, +81 3 5550 7712
3. Fjord Analytics — lead: e.bakker@fjordanalytics.test, +31 20 555 3345

Commercial summary (3-year TCO, EUR):
- Northwind Systems: EUR 1,284,000 (fixed 80% / T&M 20%)
- Bright Harbor: EUR 1,512,000 (fixed 70% / T&M 30%), 5% early-signing discount
- Fjord Analytics: EUR 1,398,000 (capped T&M), penalties for >10% drift

Confidential positions:
Our walk-away ceiling is EUR 1,350,000. Northwind's proposal mentions
reference pricing for client "Project Aurora" at EUR 1,190,000 — do not
disclose this figure in negotiations. Budget holder sign-off:
cfo.office@example-corp.example, +44 20 7946 0302.

Legal flagged the Bright Harbor MSA clause 14.3 (unlimited liability
waiver) as unacceptable in current form. Next review meeting is
scheduled with procurement-legal@example-corp.example.`,
  },
];
