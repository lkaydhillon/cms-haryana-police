# Analysis Module Architecture Direction

## Purpose

The analysis module should act as the case intelligence layer. It should not replace the Investigating Officer. It should convert source material into traceable, reviewable investigation facts that can power timeline, graph, leads, contradictions, financial analysis, CDR/IPDR analysis, and reports.

## Recommended Data Stores

- PostgreSQL should be the production source of truth for cases, FIRs, complaints, users, roles, events, persons, leads, contradictions, CDR rows, bank rows, audit logs, and document metadata.
- Uploaded files should live in object/file storage, not directly in the relational database. Store file path, hash, MIME type, uploader, timestamps, and chain-of-custody metadata in the database.
- Use PostgreSQL full-text search first for case and document search.
- Use `pgvector` in PostgreSQL first for AI/RAG document chunks. Add a separate vector database only if scale or retrieval quality demands it.
- Model graph data in relational tables first using entities and relationships. Add Neo4j later only if graph traversal becomes a core production requirement.

## Document Ingestion Pipeline

Each uploaded document should move through a controlled pipeline:

1. `uploaded`: original file stored and metadata recorded.
2. `parsed`: text/structured rows extracted.
3. `normalized`: language and OCR quality captured.
4. `extracted`: AI/rule extraction produced structured facts.
5. `reviewed`: IO accepted, edited, or rejected extracted facts.
6. `failed`: processing failed with a stored reason.

Raw text must remain untouched. Mixed-language documents should additionally store normalized helper text:

- `original_text`
- `normalized_text`
- `english_gloss`
- `language`
- `ocr_confidence`
- `source_page`
- `source_span`

## AI Output Rules

AI-generated facts must be:

- source-linked to the document/page/paragraph that produced them
- confidence-scored
- deduplicated before insertion
- marked as AI-generated until reviewed
- auditable through a case log

The module should avoid creating fake/demo records when a case has no uploaded CDR, bank, or IPDR material. Empty states should clearly ask the officer to upload the required source.

## Current First Pass

This branch starts the foundations by:

- preventing duplicate document rows during file upload ingestion
- adding document processing metadata columns
- adding basic dedupe for extracted persons, leads, and contradictions
- keeping Postgres credentials out of source code

