import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import db from '../db.js';
import { ingestDocument, queryWiki, lintWiki, refreshLeads } from '../services/wikiEngine.js';
import { parseFile } from '../services/fileParser.js';
import { detectContradictionsAI } from '../services/aiEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function ensureCaseDir(caseId) {
  const caseDir = path.join(UPLOADS_DIR, caseId);
  if (!fs.existsSync(caseDir)) {
    fs.mkdirSync(caseDir, { recursive: true });
  }
  return caseDir;
}

function resolveUploadedPath(filePath) {
  const relativePath = String(filePath || '').replace(/^\/?uploads[\\/]/, '');
  const resolvedPath = path.resolve(UPLOADS_DIR, relativePath);
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (!resolvedPath.startsWith(uploadsRoot)) {
    return null;
  }
  return resolvedPath;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB file size limit

// ─── GET /api/analysis/cases ───────────────────────────────────────────────────
router.get('/cases', (req, res) => {
  const cases = db.prepare(`
    SELECT c.*, p.full_name as io_name, p.rank as io_rank
    FROM cases c LEFT JOIN profiles p ON c.io_id = p.id
    ORDER BY c.registered_at DESC
  `).all();
  res.json(cases);
});

// ─── POST /api/analysis/cases ───────────────────────────────────────────────────
router.post('/cases', (req, res) => {
  const { title, case_type, status, offense_section, station_id, io_id, description } = req.body;
  if (!title || !case_type) return res.status(400).json({ error: 'title and case_type are required' });
  
  const id = `case-${Date.now()}`;
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO cases (id, title, case_type, status, offense_section, station_id, io_id, registered_at, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, case_type, status || 'open', offense_section || null, station_id || null, io_id || null, now, description || null);
  
  const newCase = db.prepare('SELECT c.*, p.full_name as io_name, p.rank as io_rank FROM cases c LEFT JOIN profiles p ON c.io_id = p.id WHERE c.id = ?').get(id);
  res.status(201).json(newCase);
});

// ─── DELETE /api/analysis/cases/:id ─────────────────────────────────────────
router.delete('/cases/:id', (req, res) => {
  const caseId = req.params.id;
  
  try {
    // Delete from all related tables first (due to foreign key constraints)
    db.prepare('DELETE FROM case_contradictions WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM case_leads WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM ip_records WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM bank_transactions WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM cdr_records WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM case_documents WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM case_events WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM case_persons WHERE case_id = ?').run(caseId);
    db.prepare('DELETE FROM case_wiki_pages WHERE case_id = ?').run(caseId);
    
    // Delete the case itself
    const result = db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.json({ success: true, message: 'Case deleted successfully' });
  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

// ─── GET /api/analysis/cases/:id ──────────────────────────────────────────────
router.get('/cases/:id', (req, res) => {
  const c = db.prepare(`
    SELECT c.*, p.full_name as io_name, p.rank as io_rank
    FROM cases c LEFT JOIN profiles p ON c.io_id = p.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  res.json(c);
});

// ─── GET /api/analysis/cases/:id/timeline ─────────────────────────────────────
router.get('/cases/:id/timeline', (req, res) => {
  const caseId = req.params.id;
  
  // Only return actual uploaded documents - NO fake investigation events
  const docs = db.prepare(`
    SELECT id, file_name, file_path, file_size, mime_type, doc_type, uploaded_at as event_time, content_text
    FROM case_documents WHERE case_id = ? ORDER BY uploaded_at ASC
  `).all(caseId);

  if (!docs || docs.length === 0) {
    return res.json([]);
  }

  // Convert documents to timeline items - each uploaded document is one timeline entry
  const timeline = docs.map(d => {
    // Create meaningful description based on doc_type
    let description = '';
    let category = 'document';
    
    const docType = d.doc_type?.toLowerCase() || '';
    const fileName = d.file_name?.toLowerCase() || '';
    
    if (fileName.includes('fir') || docType.includes('fir')) {
      category = 'registration';
      description = `FIR (First Information Report) registered - Original complaint document`;
    } else if (fileName.includes('complaint') || docType.includes('complaint')) {
      category = 'registration';
      description = `Complaint submitted to police station`;
    } else if (fileName.includes('statement') || docType.includes('statement')) {
      category = 'statement';
      description = `Statement recorded - Deposition from involved party`;
    } else if (fileName.includes('arrest') || docType.includes('arrest')) {
      category = 'arrest';
      description = `Arrest memorandum - Accused apprehended`;
    } else if (fileName.includes('evidence') || docType.includes('evidence')) {
      category = 'evidence';
      description = `Physical/Digital evidence collected and seized`;
    } else if (fileName.includes('raid') || docType.includes('raid')) {
      category = 'raid';
      description = `Search & Seizure operation conducted`;
    } else if (fileName.includes('chargesheet') || docType.includes('chargesheet')) {
      category = 'challan';
      description = `Charge sheet filed in court`;
    } else if (fileName.includes('cdr') || docType.includes('cdr')) {
      category = 'document';
      description = `CDR (Call Detail Records) received from service provider`;
    } else if (fileName.includes('bank') || fileName.includes('account') || docType.includes('bank')) {
      category = 'document';
      description = `Bank/Financial records obtained`;
    } else if (fileName.includes('ipdr') || fileName.includes('location')) {
      category = 'document';
      description = `IPDR (Internet Protocol Detail Record) - Location data`;
    } else {
      description = `${d.doc_type || 'Document'} uploaded for investigation`;
    }

    return {
      id: `doc-${d.id}`,
      case_id: caseId,
      event_time: d.event_time,
      category,
      description,
      location: 'Police Station Records',
      record_type: 'document_upload',
      officer_name: null,
      document: {
        id: d.id,
        file_name: d.file_name,
        file_path: d.file_path,
        file_size: d.file_size,
        mime_type: d.mime_type,
        doc_type: d.doc_type
      }
    };
  }).sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  res.json(timeline);
});

// ─── GET /api/analysis/cases/:id/graph ────────────────────────────────────────
router.get('/cases/:id/graph', (req, res) => {
  const caseId = req.params.id;
  const persons = db.prepare('SELECT * FROM case_persons WHERE case_id = ?').all(caseId);
  const events = db.prepare('SELECT * FROM case_events WHERE case_id = ? ORDER BY event_time ASC').all(caseId);
  const caseInfo = db.prepare('SELECT c.*, p.full_name as io_name, p.rank as io_rank FROM cases c LEFT JOIN profiles p ON c.io_id = p.id WHERE c.id = ?').get(caseId);
  const documents = db.prepare('SELECT doc_type, uploaded_at FROM case_documents WHERE case_id = ? ORDER BY uploaded_at ASC').all(caseId);
  const cdrRecords = db.prepare('SELECT DISTINCT caller, receiver FROM cdr_records WHERE case_id = ? LIMIT 30').all(caseId);
  const bankTxns = db.prepare('SELECT DISTINCT account_no FROM bank_transactions WHERE case_id = ? AND account_no IS NOT NULL').all(caseId);

  const nodes = [];
  const links = [];
  const addedNodes = new Set();

  const addNode = (node) => {
    if (!addedNodes.has(node.id)) {
      nodes.push(node);
      addedNodes.add(node.id);
    }
  };

  const safeLink = (sourceId, targetId, label) => {
    if (addedNodes.has(sourceId) && addedNodes.has(targetId)) {
      links.push({ source: sourceId, target: targetId, label });
    }
  };

  // Central case node
  if (caseInfo) {
    addNode({
      id: `case_${caseId}`,
      label: caseInfo.title,
      type: 'case', val: 14,
      content: `Type: ${caseInfo.case_type === 'fir' ? 'FIR' : 'Complaint'}\nStatus: ${caseInfo.status}\n${caseInfo.offense_section ? `Section: ${caseInfo.offense_section}` : ''}\n${caseInfo.io_name ? `IO: ${caseInfo.io_rank ? caseInfo.io_rank + ' ' : ''}${caseInfo.io_name}` : ''}\nRegistered: ${new Date(caseInfo.registered_at).toLocaleDateString('en-IN')}\n\n${caseInfo.description || ''}`.trim(),
      details: { type: caseInfo.case_type === 'fir' ? 'FIR' : 'Complaint', status: caseInfo.status, section: caseInfo.offense_section || '—', io: caseInfo.io_name || '—' },
      sourceRefs: [
        { docType: caseInfo.case_type === 'fir' ? 'FIR Copy' : 'Complaint', date: new Date(caseInfo.registered_at).toLocaleDateString('en-IN') },
        ...documents.map(d => ({ docType: d.doc_type, date: new Date(d.uploaded_at).toLocaleDateString('en-IN') }))
      ],
    });
  }

  // Person nodes
  persons.forEach(p => {
    const mentionedIn = events.filter(e => e.description.includes(p.name));
    const stmtEvents = mentionedIn.filter(e => e.category === 'statement');
    const arrestEvent = mentionedIn.find(e => e.category === 'arrest');

    addNode({
      id: `person_${p.id}`,
      label: p.name,
      type: p.role,
      val: p.role === 'accused' ? 9 : 6,
      content: [
        `Role: ${p.role.charAt(0).toUpperCase() + p.role.slice(1)}`,
        p.phone ? `Phone: ${p.phone}` : null,
        p.address ? `Address: ${p.address}` : null,
        p.age ? `Age: ${p.age}` : null,
        '',
        mentionedIn.length > 0 ? `Referenced in ${mentionedIn.length} case event(s).` : 'Not yet referenced in recorded events.',
      ].filter(l => l !== null).join('\n'),
      details: { phone: p.phone || '—', address: p.address || '—', age: p.age ? `${p.age} yrs` : null },
      sourceRefs: [
        ...(stmtEvents.length > 0 ? [{ docType: `${p.role === 'accused' ? 'Accused' : p.role === 'victim' ? 'Victim' : 'Witness'} Statement`, date: new Date(stmtEvents[0].event_time).toLocaleDateString('en-IN') }] : []),
        ...(arrestEvent ? [{ docType: 'Arrest Memo', date: new Date(arrestEvent.event_time).toLocaleDateString('en-IN') }] : []),
      ],
    });
    safeLink(`case_${caseId}`, `person_${p.id}`, p.role);

    // Phone nodes for persons with phones
    if (p.phone) {
      const phoneNodeId = `phone_${p.phone}`;
      addNode({
        id: phoneNodeId,
        label: p.phone,
        type: 'phone',
        val: 4,
        content: `Phone: ${p.phone}\nOwner: ${p.name} (${p.role})`,
        details: { number: p.phone, owner: p.name, role: p.role },
        sourceRefs: [{ docType: 'CDR Records / FIR', date: '' }],
      });
      safeLink(`person_${p.id}`, phoneNodeId, 'uses');
    }
  });

  // Bank account nodes
  bankTxns.forEach((row) => {
    if (!row.account_no) return;
    const acctId = `bank_${row.account_no}`;
    const isVictim = row.account_no.includes('4521');
    const txns = db.prepare('SELECT SUM(debit) as d, SUM(credit) as c FROM bank_transactions WHERE case_id = ? AND account_no = ?').get(caseId, row.account_no);
    addNode({
      id: acctId,
      label: `A/C ${row.account_no}`,
      type: 'bank_account',
      val: 5,
      content: `Account: ${row.account_no}\nRole: ${isVictim ? 'Victim Account' : 'Mule/Suspect Account'}\nTotal Debit: ₹${(txns?.d || 0).toLocaleString('en-IN')}\nTotal Credit: ₹${(txns?.c || 0).toLocaleString('en-IN')}`,
      details: { account: row.account_no, type: isVictim ? 'Victim' : 'Mule', debit: `₹${(txns?.d || 0).toLocaleString('en-IN')}`, credit: `₹${(txns?.c || 0).toLocaleString('en-IN')}` },
      sourceRefs: [{ docType: 'Bank Statement', date: '' }],
    });
    safeLink(`case_${caseId}`, acctId, 'financial');

    // Link victim account to victim person
    if (isVictim) {
      const victim = persons.find(p => p.role === 'victim');
      if (victim) safeLink(`person_${victim.id}`, acctId, 'owns');
    } else {
      // Link mule to accused
      const accused = persons.find(p => p.role === 'accused');
      if (accused) safeLink(`person_${accused.id}`, acctId, 'mule');
    }
  });

  // CDR phone-to-phone link nodes (for numbers not already added as person phones)
  const personPhones = new Set(persons.map(p => p.phone).filter(Boolean));
  const cdrNumbers = new Set();
  cdrRecords.forEach(r => { cdrNumbers.add(r.caller); cdrNumbers.add(r.receiver); });

  cdrNumbers.forEach(num => {
    if (num && !personPhones.has(num) && !addedNodes.has(`phone_${num}`)) {
      addNode({
        id: `phone_${num}`,
        label: num,
        type: 'phone',
        val: 3,
        content: `Phone: ${num}\nOwner: Unknown — CDR record only\nStatus: Identity pending`,
        details: { number: num, owner: 'Unknown', status: 'Identity Pending' },
        sourceRefs: [{ docType: 'CDR Records', date: '' }],
      });
    }
  });

  // CDR links between phones
  const addedLinks = new Set();
  cdrRecords.forEach(r => {
    if (!r.caller || !r.receiver) return;
    const linkKey = `${r.caller}|${r.receiver}`;
    const revKey = `${r.receiver}|${r.caller}`;
    if (!addedLinks.has(linkKey) && !addedLinks.has(revKey)) {
      safeLink(`phone_${r.caller}`, `phone_${r.receiver}`, 'called');
      addedLinks.add(linkKey);
    }
  });

  // Event nodes (arrests, raids, statements)
  events.filter(e => ['arrest', 'raid', 'statement', 'evidence'].includes(e.category)).forEach(e => {
    const shortDesc = e.description.length > 40 ? e.description.slice(0, 40) + '…' : e.description;
    addNode({
      id: `event_${e.id}`,
      label: `${e.category}: ${shortDesc}`,
      type: 'event', val: 4,
      content: e.description,
      details: { time: new Date(e.event_time).toLocaleDateString('en-IN'), location: e.location || '—' },
      sourceRefs: [{ docType: e.category.charAt(0).toUpperCase() + e.category.slice(1) + ' Record', date: new Date(e.event_time).toLocaleDateString('en-IN') }],
    });
    safeLink(`case_${caseId}`, `event_${e.id}`, e.category);
    persons.filter(p => e.description.includes(p.name)).forEach(p => {
      safeLink(`person_${p.id}`, `event_${e.id}`, 'mentioned');
    });
  });

  res.json({ nodes, links });
});

// ─── GET /api/analysis/cases/:id/cdr ──────────────────────────────────────────
router.get('/cases/:id/cdr', (req, res) => {
  const caseId = req.params.id;
  
  // Only return REAL CDR data - NO fake data when empty
  let records = [];
  try {
    records = db.prepare('SELECT * FROM cdr_records WHERE case_id = ? ORDER BY call_time ASC').all(caseId);
  } catch (e) {
    console.warn("CDR Table error:", e.message);
  }

  // If no real CDR records, return clear empty response - NO fake data!
  if (!records || records.length === 0) {
    return res.json({
      records: [],
      frequency: [],
      suspiciousPatterns: [],
      phoneToPersonMap: {},
      message: 'No CDR records uploaded for this case. Upload CDR file from service provider to analyze call patterns.'
    });
  }

  const freq = {};
  records.forEach(r => {
    freq[r.caller] = (freq[r.caller] || 0) + 1;
    freq[r.receiver] = (freq[r.receiver] || 0) + 1;
  });
  const frequency = Object.entries(freq)
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count).slice(0, 15);

  // Build phone → person map
  let knownPersonPhones = [];
  try {
    knownPersonPhones = db.prepare('SELECT phone, name, role FROM case_persons WHERE case_id = ? AND phone IS NOT NULL').all(caseId);
  } catch (e) {
    console.warn('Known person phone lookup failed:', e.message);
  }

  const phoneToPersonMap = {};
  knownPersonPhones.forEach(p => { phoneToPersonMap[p.phone] = { name: p.name, role: p.role }; });

  // Suspicious pattern detection
  const suspiciousPatterns = [];

  // Pattern 1: Rapid back-to-back calls (same pair within 10 min)
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1]; const curr = records[i];
    const timeDiff = (new Date(curr.call_time) - new Date(prev.call_time)) / 60000;
    if (timeDiff < 10 && (
      (prev.caller === curr.caller && prev.receiver === curr.receiver) ||
      (prev.caller === curr.receiver && prev.receiver === curr.caller)
    )) {
      suspiciousPatterns.push({ type: 'rapid_calls', description: `Rapid repeated calls between ${curr.caller} and ${curr.receiver} (${timeDiff.toFixed(1)} min apart)`, numbers: [curr.caller, curr.receiver], severity: 'medium', time: curr.call_time });
    }
  }

  // Pattern 2: Unknown high-frequency numbers
  const unknownHighFreq = Object.entries(freq)
    .filter(([num]) => !phoneToPersonMap[num] && freq[num] >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (unknownHighFreq.length) {
    unknownHighFreq.forEach(([number, count]) => suspiciousPatterns.push({
      type: 'unknown_high_freq',
      description: `Unknown number ${number} appears ${count} times in CDR — identity not yet established`,
      numbers: [number], severity: 'high', time: null
    }));
  }

  res.json({ records, frequency, suspiciousPatterns, phoneToPersonMap });
});

// ─── GET /api/analysis/cases/:id/bank ─────────────────────────────────────────
router.get('/cases/:id/bank', (req, res) => {
  const transactions = db.prepare('SELECT * FROM bank_transactions WHERE case_id = ? ORDER BY date ASC').all(req.params.id);

  // Return clear empty response if no data - NO fake data!
  if (!transactions || transactions.length === 0) {
    return res.json({
      transactions: [],
      accounts: [],
      suspicious: [],
      totalDebit: 0,
      totalCredit: 0,
      message: 'No bank records uploaded for this case. Submit formal request to bank for account statements.'
    });
  }

  const accounts = {};
  transactions.forEach(t => {
    const acct = t.account_no || 'Unknown';
    if (!accounts[acct]) accounts[acct] = { total_debit: 0, total_credit: 0, suspicious_count: 0, transactions: 0 };
    accounts[acct].total_debit += t.debit || 0;
    accounts[acct].total_credit += t.credit || 0;
    accounts[acct].suspicious_count += t.is_suspicious || 0;
    accounts[acct].transactions++;
  });

  const suspicious = transactions.filter(t => t.is_suspicious);
  const totalDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);

  res.json({ transactions, accounts: Object.entries(accounts).map(([acct, data]) => ({ account: acct, ...data })), suspicious, totalDebit, totalCredit });
});

// ─── GET /api/analysis/cases/:id/network ──────────────────────────────────────
router.get('/cases/:id/network', (req, res) => {
  const records = db.prepare('SELECT * FROM ip_records WHERE case_id = ? ORDER BY timestamp ASC').all(req.params.id);
  const uniqueIPs = [...new Set(records.map(r => r.ip_address))];
  const uniqueLocations = [...new Set(records.map(r => r.location).filter(Boolean))];
  const vpnIndicators = records.filter(r => r.port === 1080 || r.port === 1194 || r.port === 8080);
  res.json({ records, uniqueIPs, uniqueLocations, vpnIndicators });
});

// ─── GET /api/analysis/cases/:id/leads ────────────────────────────────────────
router.get('/cases/:id/leads', (req, res) => {
  const leads = db.prepare('SELECT * FROM case_leads WHERE case_id = ? ORDER BY CASE priority WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, confidence DESC').all(req.params.id);
  const parsed = leads.map(l => ({
    ...l,
    sources: (() => { try { return JSON.parse(l.sources || '[]'); } catch { return []; } })(),
  }));
  res.json({ leads: parsed, total: leads.length, active: leads.filter(l => l.status === 'active').length });
});

// ─── PATCH /api/analysis/cases/:id/leads/:leadId ──────────────────────────────
router.patch('/cases/:id/leads/:leadId', (req, res) => {
  const { status } = req.body;
  if (!['active', 'actioned', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE case_leads SET status = ? WHERE id = ? AND case_id = ?').run(status, req.params.leadId, req.params.id);
  res.json({ success: true });
});

// ─── GET /api/analysis/cases/:id/contradictions ───────────────────────────────
router.get('/cases/:id/contradictions', (req, res) => {
  const contradictions = db.prepare('SELECT * FROM case_contradictions WHERE case_id = ? ORDER BY CASE severity WHEN \'critical\' THEN 1 WHEN \'moderate\' THEN 2 ELSE 3 END, created_at DESC').all(req.params.id);
  res.json({ contradictions, total: contradictions.length, critical: contradictions.filter(c => c.severity === 'critical').length });
});

// ─── POST /api/analysis/cases/:id/scan ────────────────────────────────────────
router.post('/cases/:id/scan', async (req, res) => {
  try {
    const docs = db.prepare('SELECT doc_type, content_text FROM case_documents WHERE case_id = ? ORDER BY uploaded_at DESC LIMIT 8').all(req.params.id);
    if (docs.length < 1) return res.json({ message: 'No documents to scan', contradictions: [] });

    let result = { contradictions: [], method: 'not-run' };
    try {
      result = await detectContradictionsAI(docs);
    } catch (err) {
      console.warn('Contradiction scan failed:', err.message);
      result = { contradictions: [], method: 'failed', error: err.message };
    }
    const contradictions = result.contradictions || [];

    if (contradictions.length > 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO case_contradictions (id, case_id, title, severity, category, description, document_a, document_b, significance, recommended_action) VALUES (?,?,?,?,?,?,?,?,?,?)');
      contradictions.forEach(c => {
        const exists = db.prepare('SELECT id FROM case_contradictions WHERE case_id = ? AND lower(title) = ? LIMIT 1').get(req.params.id, normalizeText(c.title));
        if (exists) return;
        const id = `cont-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        try { insert.run(id, req.params.id, c.title, c.severity, c.category, c.description, c.document_a, c.document_b, c.significance, c.recommended_action); } catch (e) {
          console.warn('Contradiction scan insert skipped:', e.message);
        }
      });
    }

    let freshLeads = { leads: [], method: 'not-run' };
    try {
      freshLeads = await refreshLeads(req.params.id);
    } catch (err) {
      console.warn('Lead refresh failed during scan:', err.message);
      freshLeads = { leads: [], method: 'failed', error: err.message };
    }
    if (freshLeads.leads?.length) {
      const insert = db.prepare('INSERT OR IGNORE INTO case_leads (id, case_id, title, description, priority, confidence, category, sources, action, legal_basis) VALUES (?,?,?,?,?,?,?,?,?,?)');
      freshLeads.leads.forEach(l => {
        const exists = db.prepare('SELECT id FROM case_leads WHERE case_id = ? AND lower(title) = ? LIMIT 1').get(req.params.id, normalizeText(l.title));
        if (exists) return;
        const id = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        try { insert.run(id, req.params.id, l.title, l.description, l.priority, l.confidence, l.category, JSON.stringify(l.sources || []), l.action, l.legal_basis || null); } catch (e) {
          console.warn('Lead scan insert skipped:', e.message);
        }
      });
    }

    res.json({
      contradictions,
      newLeads: freshLeads.leads?.length || 0,
      method: result.method,
      leadMethod: freshLeads.method,
      warnings: [result.error, freshLeads.error].filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analysis/cases/:id/wiki ─────────────────────────────────────────
router.get('/cases/:id/wiki', (req, res) => {
  const pages = db.prepare('SELECT page_slug, content_md, updated_at FROM case_wiki_pages WHERE case_id = ? AND page_slug NOT LIKE \'query_%\' ORDER BY updated_at DESC').all(req.params.id);
  const lint = lintWiki(req.params.id);
  res.json({ pages, lint });
});

// ─── GET /api/analysis/cases/:id/documents ────────────────────────────────────
router.get('/cases/:id/documents', (req, res) => {
  try {
    const docs = db.prepare(`
      SELECT id, case_id, doc_type, file_name, file_path, file_size, mime_type, uploaded_at,
             CASE WHEN content_text IS NOT NULL THEN length(content_text) ELSE 0 END as text_length
      FROM case_documents 
      WHERE case_id = ? 
      ORDER BY uploaded_at DESC
    `).all(req.params.id);
    res.json({ documents: docs, total: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/analysis/cases/:id/upload (file upload) ────────────────────────
router.post('/cases/:id/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  try {
    const caseId = req.params.id;
    const docId = `doc-${Date.now()}`;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileName = `${docId}${ext}`;
    
    const caseDir = ensureCaseDir(caseId);
    const filePath = path.join(caseDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const parsed = await parseFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!parsed.success || !parsed.text?.trim()) {
      fs.unlinkSync(filePath);
      return res.status(422).json({ error: 'Could not extract text from file', details: parsed.error });
    }

    const structuredData = parsed.records ? { records: parsed.records, headers: parsed.headers } : null;
    const docType = req.body.doc_type || 'Other';

    const contentHash = crypto.createHash('sha256').update(parsed.text).digest('hex');

    db.prepare(`
      INSERT INTO case_documents (
        id, case_id, doc_type, content_text, file_name, file_path, file_size, mime_type,
        content_hash, extraction_method, ocr_confidence, processing_status, uploaded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      caseId,
      docType,
      parsed.text.substring(0, 1000000),
      req.file.originalname,
      `/uploads/${caseId}/${fileName}`,
      req.file.size,
      req.file.mimetype,
      contentHash,
      parsed.method || parsed.fileType || null,
      parsed.confidence ?? null,
      'parsed',
      new Date().toISOString()
    );

    const result = await ingestDocument(caseId, docType, parsed.text, structuredData, {
      documentId: docId,
      persistDocument: false,
      contentHash,
    });
    res.json({ 
      success: true, 
      fileType: parsed.fileType, 
      textLength: parsed.text?.length,
      documentId: docId,
      fileName: req.file.originalname,
      filePath: `/uploads/${caseId}/${fileName}`,
      fileSize: req.file.size,
      ...result
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ─── POST /api/analysis/cases/:id/ingest (text) ───────────────────────────────
router.post('/cases/:id/ingest', async (req, res) => {
  const { doc_type, content } = req.body;
  if (!doc_type || !content) return res.status(400).json({ error: 'doc_type and content are required' });
  try {
    const result = await ingestDocument(req.params.id, doc_type, content, null, {
      persistDocument: true,
      contentHash: crypto.createHash('sha256').update(content).digest('hex'),
    });
    res.json({ success: true, extracted: result });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: 'Ingest failed', details: err.message });
  }
});

// ─── POST /api/analysis/cases/:id/query ───────────────────────────────────────
router.post('/cases/:id/query', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });
  try {
    const result = await queryWiki(req.params.id, question);
    res.json(result);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Query failed', details: err.message });
  }
});

// ─── GET /api/analysis/cases/:id/documents ───────────────────────────────────────
router.get('/cases/:id/documents', (req, res) => {
  const docs = db.prepare(`
    SELECT id, doc_type, file_name, file_path, file_size, mime_type, content_text, uploaded_at
    FROM case_documents WHERE case_id = ? ORDER BY uploaded_at DESC
  `).all(req.params.id);
  res.json(docs);
});

// ─── GET /api/analysis/cases/:id/documents/:docId/download ───────────────────────────────────────
router.get('/cases/:id/documents/:docId/download', (req, res) => {
  const doc = db.prepare('SELECT file_path, file_name, mime_type FROM case_documents WHERE id = ? AND case_id = ?').get(req.params.docId, req.params.id);
  if (!doc || !doc.file_path) return res.status(404).json({ error: 'File not found' });
  
  const filePath = resolveUploadedPath(doc.file_path);
  if (!filePath) return res.status(400).json({ error: 'Invalid file path' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
  res.sendFile(filePath);
});

// ─── GET /api/analysis/cases/:id/documents/:docId ───────────────────────────────────────
router.get('/cases/:id/documents/:docId', (req, res) => {
  const doc = db.prepare('SELECT * FROM case_documents WHERE id = ? AND case_id = ?').get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
});

export default router;
