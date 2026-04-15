import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Open database in the root folder
const db = new Database(join(__dirname, '../data.db'));

// ─── Profiles ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    full_name TEXT NOT NULL,
    badge_number TEXT,
    rank TEXT,
    station_id TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Analysis Module Tables ───────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    case_type TEXT NOT NULL CHECK(case_type IN ('complaint','fir')),
    status TEXT DEFAULT 'open',
    offense_section TEXT,
    station_id TEXT,
    io_id TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    FOREIGN KEY (io_id) REFERENCES profiles(id)
  );

  CREATE TABLE IF NOT EXISTS case_events (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    event_time DATETIME NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    officer_id TEXT,
    location TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id),
    FOREIGN KEY (officer_id) REFERENCES profiles(id)
  );

  CREATE TABLE IF NOT EXISTS case_persons (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('accused','victim','witness')),
    phone TEXT,
    address TEXT,
    age INTEGER,
    FOREIGN KEY (case_id) REFERENCES cases(id)
  );

  CREATE TABLE IF NOT EXISTS case_documents (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    case_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    content_text TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id)
  );

  CREATE TABLE IF NOT EXISTS cdr_records (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    caller TEXT NOT NULL,
    receiver TEXT NOT NULL,
    duration_sec INTEGER,
    call_time DATETIME NOT NULL,
    tower_id TEXT,
    tower_location TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id)
  );

  CREATE TABLE IF NOT EXISTS case_wiki_pages (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    case_id TEXT NOT NULL,
    page_slug TEXT NOT NULL,
    content_md TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(case_id, page_slug),
    FOREIGN KEY (case_id) REFERENCES cases(id)
  );
`);

// ─── Seed profiles ────────────────────────────────────────────────────────────
const profileCount = db.prepare('SELECT COUNT(*) as c FROM profiles').get().c;
if (profileCount === 0) {
  const insertProfile = db.prepare(`
    INSERT INTO profiles (id, username, password, role, full_name, badge_number, rank, station_id)
    VALUES (@id, @username, @password, @role, @full_name, @badge_number, @rank, @station_id)
  `);
  const seedProfiles = [
    { id: 'usr-1', username: 'admin', password: 'admin123', role: 'admin', full_name: 'Test Admin', badge_number: 'ADM-001', rank: 'SP', station_id: 'hq' },
    { id: 'usr-2', username: 'io_1', password: 'io123', role: 'io', full_name: 'Investigating Officer Singh', badge_number: 'IO-101', rank: 'SI', station_id: 'stn-1' },
    { id: 'usr-3', username: 'sho_1', password: 'sho123', role: 'sho', full_name: 'SHO Kumar', badge_number: 'SHO-201', rank: 'Inspector', station_id: 'stn-1' },
  ];
  db.transaction((rows) => rows.forEach(r => insertProfile.run(r)))(seedProfiles);
  console.log('✅ Seed profiles created.');
}

// ─── Seed analysis data ────────────────────────────────────────────────────────
const caseCount = db.prepare('SELECT COUNT(*) as c FROM cases').get().c;
if (caseCount === 0) {
  // Insert cases
  db.prepare(`INSERT INTO cases (id, title, case_type, status, offense_section, station_id, io_id, registered_at, description)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    'case-001', 'Mobile Theft – Sector 14 Market', 'complaint', 'open',
    'BNS 303', 'stn-1', 'usr-2', '2026-04-01 10:30:00',
    'Complainant Ramesh Kumar reports theft of iPhone 14 from busy market area. Suspects fled on motorcycle.'
  );
  db.prepare(`INSERT INTO cases (id, title, case_type, status, offense_section, station_id, io_id, registered_at, description)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    'case-002', 'FIR – Cyber Fraud ₹2.5 Lakh', 'fir', 'investigation',
    'BNS 318, IT Act 66C', 'stn-1', 'usr-2', '2026-03-20 14:00:00',
    'Victim Priya Sharma transferred ₹2.5 lakh after receiving fraudulent call from "bank official". Multiple accused involved.'
  );
  db.prepare(`INSERT INTO cases (id, title, case_type, status, offense_section, station_id, io_id, registered_at, description)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    'case-003', 'FIR – Drug Peddling (NDPS)', 'fir', 'challan',
    'NDPS Act 20(b)(ii)', 'stn-1', 'usr-3', '2026-02-10 09:15:00',
    'Accused Vikram Yadav and Suresh Nain apprehended with 500g of cannabis near bus stand.'
  );

  // Events for case-001
  const evts = [
    ['evt-001', 'case-001', '2026-04-01 10:30:00', 'registration', 'Complaint registered by Ramesh Kumar', 'usr-2', 'Police Station Sector 14'],
    ['evt-002', 'case-001', '2026-04-02 11:00:00', 'statement', 'Statement recorded from complainant', 'usr-2', 'PS Sector 14'],
    ['evt-003', 'case-001', '2026-04-03 14:30:00', 'evidence', 'CCTV footage retrieved from market', 'usr-2', 'Market CCTV Control Room'],
    ['evt-004', 'case-001', '2026-04-05 09:00:00', 'statement', 'Witness statement from shopkeeper', 'usr-2', 'PS Sector 14'],
    ['evt-005', 'case-001', '2026-04-07 16:00:00', 'raid', 'Raid conducted on suspected hideout', 'usr-2', 'Sector 18'],
  ];
  // Events for case-002
  const evts2 = [
    ['evt-101', 'case-002', '2026-03-20 14:00:00', 'registration', 'FIR registered. Victim Priya Sharma reported cyber fraud', 'usr-2', 'PS Sector 14'],
    ['evt-102', 'case-002', '2026-03-21 10:00:00', 'statement', 'Victim statement recorded. Call from 9876543210 identified as fraud number', 'usr-2', 'PS Sector 14'],
    ['evt-103', 'case-002', '2026-03-22 12:00:00', 'evidence', 'Bank transaction records obtained showing ₹2.5L transfer', 'usr-2', 'Online'],
    ['evt-104', 'case-002', '2026-03-25 15:00:00', 'arrest', 'Accused Deepak Sharma arrested from Gurugram. Deepak Sharma confessed to operating fraud network', 'usr-2', 'Gurugram'],
    ['evt-105', 'case-002', '2026-03-28 09:00:00', 'evidence', 'Seized mobile phones sent for forensic examination', 'usr-2', 'Forensic Lab'],
    ['evt-106', 'case-002', '2026-04-01 11:00:00', 'statement', 'Statement of co-accused Rahul Verma recorded', 'usr-2', 'PS Sector 14'],
    ['evt-107', 'case-002', '2026-04-10 14:00:00', 'evidence', 'Forensic report received. SIM cards traced to fraudsters', 'usr-2', 'PS Sector 14'],
  ];
  // Events for case-003
  const evts3 = [
    ['evt-201', 'case-003', '2026-02-10 09:15:00', 'arrest', 'Vikram Yadav and Suresh Nain arrested near bus stand', 'usr-3', 'Bus Stand Sector 17'],
    ['evt-202', 'case-003', '2026-02-10 10:00:00', 'evidence', 'Seizure memo prepared. 500g cannabis, 2 mobile phones seized', 'usr-3', 'Bus Stand Sector 17'],
    ['evt-203', 'case-003', '2026-02-11 09:00:00', 'statement', 'Arrest memo prepared and signed. Accused sent to judicial custody', 'usr-3', 'PS Sector 14'],
    ['evt-204', 'case-003', '2026-02-15 11:00:00', 'evidence', 'FSL report received confirming cannabis', 'usr-3', 'FSL Office'],
    ['evt-205', 'case-003', '2026-03-01 10:00:00', 'challan', 'Challan submitted to court', 'usr-3', 'District Court'],
  ];

  const insertEvt = db.prepare(
    'INSERT INTO case_events (id, case_id, event_time, category, description, officer_id, location) VALUES (?,?,?,?,?,?,?)'
  );
  db.transaction((rows) => rows.forEach(r => insertEvt.run(...r)))([...evts, ...evts2, ...evts3]);

  // Persons
  const persons = [
    ['per-001', 'case-001', 'Ramesh Kumar', 'victim', '9812345678', 'House No. 45, Sector 14', 35],
    ['per-002', 'case-001', 'Unknown Accused A', 'accused', null, 'Unknown', null],
    ['per-003', 'case-001', 'Mukesh (Shopkeeper)', 'witness', '9988776655', 'Shop No. 12, Market', 42],
    ['per-101', 'case-002', 'Priya Sharma', 'victim', '9876501234', 'House 7, Sector 22', 28],
    ['per-102', 'case-002', 'Deepak Sharma', 'accused', '9876543210', 'Gurugram', 30],
    ['per-103', 'case-002', 'Rahul Verma', 'accused', '9123456789', 'Delhi', 27],
    ['per-104', 'case-002', 'Bank Manager Mohan', 'witness', '9812000001', 'SBI Branch', 45],
    ['per-201', 'case-003', 'Vikram Yadav', 'accused', '9090909090', 'Village Raipur', 24],
    ['per-202', 'case-003', 'Suresh Nain', 'accused', '9191919191', 'Village Moginand', 22],
  ];
  const insertPer = db.prepare(
    'INSERT INTO case_persons (id, case_id, name, role, phone, address, age) VALUES (?,?,?,?,?,?,?)'
  );
  db.transaction((rows) => rows.forEach(r => insertPer.run(...r)))(persons);

  // CDR records for case-002 (cyber fraud)
  const cdrs = [
    ['cdr-001', 'case-002', '9876543210', '9876501234', 420, '2026-03-19 10:15:00', 'TWR-GGN-01', 'Gurugram Sector 5'],
    ['cdr-002', 'case-002', '9876543210', '9876501234', 185, '2026-03-19 10:22:00', 'TWR-GGN-01', 'Gurugram Sector 5'],
    ['cdr-003', 'case-002', '9123456789', '9876501234', 317, '2026-03-19 10:30:00', 'TWR-DEL-12', 'Delhi Rohini'],
    ['cdr-004', 'case-002', '9876543210', '9000000001', 95, '2026-03-19 11:00:00', 'TWR-GGN-02', 'Gurugram Sector 9'],
    ['cdr-005', 'case-002', '9123456789', '9876543210', 220, '2026-03-19 11:15:00', 'TWR-DEL-12', 'Delhi Rohini'],
    ['cdr-006', 'case-002', '9876543210', '9876501234', 540, '2026-03-20 09:05:00', 'TWR-GGN-01', 'Gurugram Sector 5'],
    ['cdr-007', 'case-002', '9876543210', '9000000002', 110, '2026-03-20 09:30:00', 'TWR-GGN-01', 'Gurugram Sector 5'],
    ['cdr-008', 'case-002', '9123456789', '9876501234', 450, '2026-03-20 13:45:00', 'TWR-DEL-12', 'Delhi Rohini'],
    ['cdr-009', 'case-002', '9876543210', '9123456789', 300, '2026-03-20 14:30:00', 'TWR-GGN-02', 'Gurugram Sector 9'],
    ['cdr-010', 'case-002', '9000000001', '9876543210', 180, '2026-03-21 10:00:00', 'TWR-GGN-03', 'Gurugram DLF'],
  ];
  const insertCdr = db.prepare(
    'INSERT INTO cdr_records (id, case_id, caller, receiver, duration_sec, call_time, tower_id, tower_location) VALUES (?,?,?,?,?,?,?,?)'
  );
  db.transaction((rows) => rows.forEach(r => insertCdr.run(...r)))(cdrs);

  // Seed wiki pages for case-002
  db.prepare('INSERT INTO case_wiki_pages (case_id, page_slug, content_md, updated_at) VALUES (?,?,?,?)').run(
    'case-002', 'index',
    `# Wiki Index – Cyber Fraud Case (FIR)

| Page | Summary |
|---|---|
| [entities](entities) | Persons, phones, accounts involved |
| [timeline](timeline) | Chronological events of the fraud |
| [leads](leads) | Active investigative leads |
| [contradictions](contradictions) | Flagged inconsistencies |
| [log](log) | Operation log |
`,
    '2026-03-28T10:00:00Z'
  );
  db.prepare('INSERT INTO case_wiki_pages (case_id, page_slug, content_md, updated_at) VALUES (?,?,?,?)').run(
    'case-002', 'entities',
    `# Entities – Cyber Fraud Case

## Persons
- **Priya Sharma** (Victim) – Phone: 9876501234, Sector 22
- **Deepak Sharma** (Accused) – Phone: 9876543210, Gurugram – *Primary fraudster, arrested*
- **Rahul Verma** (Accused) – Phone: 9123456789, Delhi – *Co-conspirator, in custody*
- **Bank Manager Mohan** (Witness) – SBI Branch – *Confirmed no legitimate call was made*

## Phone Numbers (from CDR)
- 9876543210 – Deepak Sharma (Accused) – *Called victim 3 times on day of fraud*
- 9123456789 – Rahul Verma (Accused) – *Coordinated with Deepak before and after fraud*
- 9000000001 – Unknown – *Received call from accused post-fraud, identity pending*
- 9000000002 – Unknown – *Identity pending; possible money mule*

## Bank Accounts
- Victim account ending **4521** – ₹2.5L debited on 2026-03-20
- Mule account in Gurugram bank (details in forensic report)
`,
    '2026-04-01T10:00:00Z'
  );
  db.prepare('INSERT INTO case_wiki_pages (case_id, page_slug, content_md, updated_at) VALUES (?,?,?,?)').run(
    'case-002', 'leads',
    `# Investigative Leads

## Active
- [ ] Identify phone number 9000000001 (likely money mule) – request CDR from TSP
- [ ] Identify phone number 9000000002 – request CDR
- [ ] Trace mule bank account to its registered phone & address
- [ ] Check if Deepak Sharma has prior complaints in other stations
- [ ] Digital forensics on Deepak's mobile: WhatsApp, call records

## Completed
- [x] CDR obtained from TSP for 9876543210 and 9123456789
- [x] Victim's bank statement obtained
- [x] Arrest of Deepak Sharma
- [x] Statement of Rahul Verma recorded
`,
    '2026-04-05T09:00:00Z'
  );
  db.prepare('INSERT INTO case_wiki_pages (case_id, page_slug, content_md, updated_at) VALUES (?,?,?,?)').run(
    'case-002', 'contradictions',
    `# Contradictions & Inconsistencies

## Flagged
- ⚠️ **Rahul Verma's Statement vs. CDR**: Rahul states he did not contact the victim, but CDR shows his number (9123456789) called victim's number on 2026-03-19 at 10:30 (317 sec). *Follow up required.*
- ⚠️ **Location of Deepak at time of fraud**: Deepak claims he was in Delhi on 2026-03-20, but CDR tower data shows his phone was active on TWR-GGN-01 (Gurugram) during the fraud call.
`,
    '2026-04-06T09:00:00Z'
  );
  db.prepare('INSERT INTO case_wiki_pages (case_id, page_slug, content_md, updated_at) VALUES (?,?,?,?)').run(
    'case-002', 'log',
    `# Case Log

## [2026-03-22] ingest | Victim Statement | 2 entities, 2 events extracted
## [2026-03-25] ingest | Arrest Memo – Deepak Sharma | 1 entity, 1 event extracted
## [2026-03-28] ingest | CDR Analysis | 4 phone numbers, 10 call records loaded
## [2026-04-01] query | "Who are the key suspects?" | pages consulted: entities
## [2026-04-06] lint | Health check | 0 missing pages, 2 active contradictions flagged
`,
    '2026-04-06T10:00:00Z'
  );

  console.log('✅ Analysis seed data created.');
}

export default db;
