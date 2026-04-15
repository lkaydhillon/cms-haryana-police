import express from 'express';
import db from '../db.js';
import { ingestDocument, queryWiki, lintWiki } from '../services/wikiEngine.js';

const router = express.Router();

// ─── GET /api/analysis/cases ────────────────────────────────────────────────
router.get('/cases', (req, res) => {
    const cases = db.prepare(`
    SELECT c.*, p.full_name as io_name, p.rank as io_rank
    FROM cases c
    LEFT JOIN profiles p ON c.io_id = p.id
    ORDER BY c.registered_at DESC
  `).all();
    res.json(cases);
});

// ─── GET /api/analysis/cases/:id ────────────────────────────────────────────
router.get('/cases/:id', (req, res) => {
    const c = db.prepare(`
    SELECT c.*, p.full_name as io_name, p.rank as io_rank
    FROM cases c
    LEFT JOIN profiles p ON c.io_id = p.id
    WHERE c.id = ?
  `).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json(c);
});

// ─── GET /api/analysis/cases/:id/timeline ───────────────────────────────────
router.get('/cases/:id/timeline', (req, res) => {
    const events = db.prepare(`
    SELECT e.*, p.full_name as officer_name
    FROM case_events e
    LEFT JOIN profiles p ON e.officer_id = p.id
    WHERE e.case_id = ?
    ORDER BY e.event_time ASC
  `).all(req.params.id);
    res.json(events);
});

// ─── GET /api/analysis/cases/:id/graph ──────────────────────────────────────
router.get('/cases/:id/graph', (req, res) => {
    const persons = db.prepare(
        'SELECT * FROM case_persons WHERE case_id = ?'
    ).all(req.params.id);

    const events = db.prepare(
        'SELECT * FROM case_events WHERE case_id = ? ORDER BY event_time ASC'
    ).all(req.params.id);

    // Build nodes
    const nodes = [];
    const links = [];

    // Case as central node
    const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
    if (caseInfo) {
        nodes.push({ id: `case_${req.params.id}`, label: caseInfo.title, type: 'case', val: 12 });
    }

    // Person nodes
    persons.forEach(p => {
        nodes.push({
            id: `person_${p.id}`,
            label: p.name,
            type: p.role, // accused, victim, witness
            val: p.role === 'accused' ? 8 : 5,
            details: { phone: p.phone, address: p.address },
        });
        links.push({
            source: `case_${req.params.id}`,
            target: `person_${p.id}`,
            label: p.role,
        });
    });

    // Event nodes (only key ones — arrests, raids)
    events.filter(e => ['arrest', 'raid', 'statement'].includes(e.category)).forEach(e => {
        nodes.push({
            id: `event_${e.id}`,
            label: `${e.category}: ${e.description.slice(0, 30)}...`,
            type: 'event',
            val: 4,
            details: { time: e.event_time, description: e.description },
        });
        links.push({
            source: `case_${req.params.id}`,
            target: `event_${e.id}`,
            label: e.category,
        });
        // Link person to events they're associated with
        persons.filter(p => e.description.includes(p.name)).forEach(p => {
            links.push({
                source: `person_${p.id}`,
                target: `event_${e.id}`,
                label: 'involved',
            });
        });
    });

    res.json({ nodes, links });
});

// ─── GET /api/analysis/cases/:id/cdr ────────────────────────────────────────
router.get('/cases/:id/cdr', (req, res) => {
    const records = db.prepare(
        'SELECT * FROM cdr_records WHERE case_id = ? ORDER BY call_time ASC'
    ).all(req.params.id);

    // Aggregate call frequency per number
    const freq = {};
    records.forEach(r => {
        freq[r.caller] = (freq[r.caller] || 0) + 1;
        freq[r.receiver] = (freq[r.receiver] || 0) + 1;
    });

    const frequency = Object.entries(freq)
        .map(([number, count]) => ({ number, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

    res.json({ records, frequency });
});

// ─── GET /api/analysis/cases/:id/wiki ───────────────────────────────────────
router.get('/cases/:id/wiki', (req, res) => {
    const pages = db.prepare(
        'SELECT page_slug, content_md, updated_at FROM case_wiki_pages WHERE case_id = ? ORDER BY updated_at DESC'
    ).all(req.params.id);

    const lint = lintWiki(req.params.id);
    res.json({ pages, lint });
});

// ─── POST /api/analysis/cases/:id/ingest ────────────────────────────────────
router.post('/cases/:id/ingest', async (req, res) => {
    const { doc_type, content } = req.body;
    if (!doc_type || !content) {
        return res.status(400).json({ error: 'doc_type and content are required' });
    }
    try {
        const result = await ingestDocument(req.params.id, doc_type, content);
        res.json({ success: true, extracted: result });
    } catch (err) {
        console.error('Ingest error:', err);
        res.status(500).json({ error: 'Ingest failed', details: err.message });
    }
});

// ─── POST /api/analysis/cases/:id/query ─────────────────────────────────────
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

export default router;
