/**
 * Wiki Engine - Karpathy LLM Wiki pattern for CMS
 *
 * Architecture (3 layers):
 *   1. Raw sources  → case_documents table (immutable)
 *   2. The Wiki     → case_wiki_pages table (LLM-maintained markdown per case)
 *   3. Schema       → this file defines the ingest/query/lint operations
 *
 * LLM calls are currently stubbed with rule-based extractors.
 * To enable real LLM: set GEMINI_API_KEY or OPENAI_API_KEY in .env and
 * uncomment the LLM call block below.
 */

import db from '../db.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWikiPage(caseId, slug) {
  return db.prepare(
    'SELECT * FROM case_wiki_pages WHERE case_id = ? AND page_slug = ?'
  ).get(caseId, slug);
}

function upsertWikiPage(caseId, slug, contentMd) {
  const existing = getWikiPage(caseId, slug);
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(
      'UPDATE case_wiki_pages SET content_md = ?, updated_at = ? WHERE case_id = ? AND page_slug = ?'
    ).run(contentMd, now, caseId, slug);
  } else {
    db.prepare(
      'INSERT INTO case_wiki_pages (case_id, page_slug, content_md, updated_at) VALUES (?, ?, ?, ?)'
    ).run(caseId, slug, contentMd, now);
  }
}

function appendToLog(caseId, entry) {
  const existing = getWikiPage(caseId, 'log');
  const now = new Date().toISOString().slice(0, 10);
  const logLine = `\n## [${now}] ${entry}\n`;
  const newContent = (existing?.content_md || '# Case Log\n') + logLine;
  upsertWikiPage(caseId, 'log', newContent);
}

// ─── Rule-based extractor (stub – replace with LLM call) ────────────────────

function extractEntities(text) {
  const persons = [];
  const phoneRegex = /\b[6-9]\d{9}\b/g;
  const phones = [...new Set(text.match(phoneRegex) || [])];

  // Extract name-like patterns (two capitalised words)
  const nameRegex = /\b([A-Z][a-z]+\s[A-Z][a-z]+)\b/g;
  const names = [...new Set((text.match(nameRegex) || []))].slice(0, 8);

  names.forEach(name => persons.push({ name, type: 'Person' }));
  phones.forEach(ph => persons.push({ name: ph, type: 'Phone' }));

  return persons;
}

function extractEvents(text) {
  const dateRegex = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g;
  const dates = text.match(dateRegex) || [];
  return dates.slice(0, 5).map((d, i) => ({
    date: d,
    description: `Event detected from document (entry ${i + 1})`,
  }));
}

function detectContradictions(caseId, newText) {
  const existing = getWikiPage(caseId, 'entities');
  if (!existing) return [];
  const contradictions = [];
  // Simple: flag if a phone number appears in old entities with different context
  const phones = newText.match(/\b[6-9]\d{9}\b/g) || [];
  if (phones.length && existing.content_md.includes('No suspects')) {
    contradictions.push('New document mentions phone numbers but entities page previously noted no suspects.');
  }
  return contradictions;
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * ingestDocument – Karpathy "Ingest" operation
 * Reads a new document, updates wiki pages: entities, timeline, contradictions, index, log
 */
export async function ingestDocument(caseId, docType, content) {
  // 1. Extract entities and events
  const entities = extractEntities(content);
  const events = extractEvents(content);
  const contradictions = detectContradictions(caseId, content);

  // 2. Update entities page
  const existingEntities = getWikiPage(caseId, 'entities');
  const prevContent = existingEntities?.content_md || '# Entities\n\n';
  const newEntitiesSection = `\n## From ${docType} (${new Date().toLocaleDateString('en-IN')})\n` +
    entities.map(e => `- **${e.name}** (${e.type})`).join('\n') +
    '\n';
  upsertWikiPage(caseId, 'entities', prevContent + newEntitiesSection);

  // 3. Update timeline page
  const existingTimeline = getWikiPage(caseId, 'timeline');
  const prevTimeline = existingTimeline?.content_md || '# Timeline\n\n';
  const newTimelineSection = `\n## Events from ${docType}\n` +
    events.map(e => `- **${e.date}** – ${e.description}`).join('\n') +
    '\n';
  upsertWikiPage(caseId, 'timeline', prevTimeline + newTimelineSection);

  // 4. Update contradictions page
  if (contradictions.length > 0) {
    const existingContradictions = getWikiPage(caseId, 'contradictions');
    const prevContr = existingContradictions?.content_md || '# Contradictions\n\n';
    const newContrSection = `\n## Found in ${docType}\n` +
      contradictions.map(c => `- ⚠️ ${c}`).join('\n') + '\n';
    upsertWikiPage(caseId, 'contradictions', prevContr + newContrSection);
  }

  // 5. Update index
  const index = `# Wiki Index – Case ${caseId}

| Page | Summary |
|---|---|
| [entities](entities) | Persons, phones, places extracted from all documents |
| [timeline](timeline) | Chronological events extracted from documents |
| [leads](leads) | Active investigative leads |
| [contradictions](contradictions) | Flagged contradictions between documents |
| [log](log) | Chronological log of all wiki operations |
`;
  upsertWikiPage(caseId, 'index', index);

  // 6. Append to log
  appendToLog(caseId, `ingest | ${docType} | ${entities.length} entities, ${events.length} events extracted`);

  // Store document in raw sources table
  db.prepare(
    'INSERT OR IGNORE INTO case_documents (case_id, doc_type, content_text, uploaded_at) VALUES (?, ?, ?, ?)'
  ).run(caseId, docType, content, new Date().toISOString());

  return { entities, events, contradictions };
}

/**
 * queryWiki – Karpathy "Query" operation
 * Reads wiki index → selects relevant pages → synthesizes answer
 * Stub returns a structured response; real LLM slot-in ready.
 */
export async function queryWiki(caseId, question) {
  const pages = db.prepare(
    'SELECT page_slug, content_md FROM case_wiki_pages WHERE case_id = ?'
  ).all(caseId);

  const wikiMap = {};
  pages.forEach(p => { wikiMap[p.page_slug] = p.content_md; });

  const q = question.toLowerCase();

  // Route question to relevant pages
  let relevantPages = [];
  let answer = '';

  if (q.includes('suspect') || q.includes('accused') || q.includes('person')) {
    relevantPages = ['entities'];
    const entitiesPage = wikiMap['entities'] || 'No entities data yet.';
    const personLines = entitiesPage.split('\n').filter(l => l.includes('Person'));
    answer = personLines.length
      ? `Based on case documents, the following persons have been identified:\n\n${personLines.join('\n')}`
      : 'No persons have been identified in the case documents yet. Try ingesting an FIR or witness statement.';
  } else if (q.includes('contradict') || q.includes('inconsisten')) {
    relevantPages = ['contradictions'];
    answer = wikiMap['contradictions'] || 'No contradictions detected yet across documents.';
  } else if (q.includes('timeline') || q.includes('sequence') || q.includes('when')) {
    relevantPages = ['timeline'];
    answer = wikiMap['timeline'] || 'No timeline events extracted yet. Ingest case documents to build the timeline.';
  } else if (q.includes('lead') || q.includes('next step') || q.includes('investigate')) {
    relevantPages = ['leads', 'entities'];
    answer = wikiMap['leads'] || `Based on current entities and timeline, suggested leads:\n- Verify phone numbers found in documents via CDR request\n- Cross-reference named persons against prior complaints\n- Examine timestamps for alibi verification`;
  } else {
    relevantPages = ['index', 'entities'];
    answer = `I checked the case wiki (${pages.length} pages). Here's a summary:\n\n` +
      (wikiMap['index'] || 'Wiki is empty — ingest documents to build knowledge.') +
      '\n\n*Ask more specific questions like "Who are the suspects?" or "Any contradictions in statements?"*';
  }

  // File useful answers back into wiki (Karpathy: "answers can be filed back as new pages")
  const answerSlug = `query_${Date.now()}`;
  upsertWikiPage(caseId, answerSlug, `# Query Result\n**Q:** ${question}\n\n**A:** ${answer}\n`);
  appendToLog(caseId, `query | "${question}" | pages consulted: ${relevantPages.join(', ')}`);

  return {
    answer,
    sourcedFrom: relevantPages,
    wikiPagesConsulted: relevantPages.length,
    totalWikiPages: pages.length,
  };
}

/**
 * lintWiki – Karpathy "Lint" operation
 * Health-checks the wiki for orphan pages, gaps, stale data.
 */
export function lintWiki(caseId) {
  const pages = db.prepare(
    'SELECT page_slug FROM case_wiki_pages WHERE case_id = ?'
  ).all(caseId).map(p => p.page_slug);

  const required = ['entities', 'timeline', 'leads', 'contradictions', 'index', 'log'];
  const missing = required.filter(r => !pages.includes(r));
  const suggestions = [];

  if (missing.includes('entities')) suggestions.push('Ingest an FIR or complaint to extract entities.');
  if (missing.includes('leads')) suggestions.push('Add investigative leads manually or ingest more documents.');
  if (!missing.includes('entities') && missing.includes('contradictions')) {
    suggestions.push('Contradictions page missing — ingest multiple documents to enable contradiction detection.');
  }

  return { totalPages: pages.length, missingPages: missing, suggestions };
}
