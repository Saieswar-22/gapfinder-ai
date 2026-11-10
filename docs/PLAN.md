# GapFinder AI — Architecture & Implementation Plan

## Architecture

```
Next.js App Router (TypeScript)
├── app/                    # Pages & API routes
│   ├── (auth)/             # Login, Register (public)
│   ├── (app)/              # Protected routes (middleware)
│   │   ├── dashboard/
│   │   ├── subjects/
│   │   │   └── [id]/       # Subject detail with tabs
│   │   │       ├── documents/
│   │   │       ├── topic-map/
│   │   │       ├── quiz/
│   │   │       ├── gap-report/
│   │   │       ├── revision-plan/
│   │   │       ├── assistant/
│   │   │       └── progress/
│   └── api/                # Route handlers
├── lib/
│   ├── db/                 # Drizzle schema, migrations, seed
│   ├── auth/               # JWT, middleware, rate limiting
│   ├── ai/                 # LLM providers, retry/fallback
│   ├── rag/                # retrieval.ts, generation.ts
│   ├── processing/         # Upload, extraction, chunking, embedding
│   ├── quiz/               # MCQ generation, validation, dedup
│   ├── gap/                # Gap classifier, thresholds config
│   ├── plan/               # Revision plan allocator
│   └── config.ts           # Thresholds, constants
├── components/             # Shared UI components
└── docs/                   # This plan, README
```

## Data Model (Drizzle + pgvector)

users → subjects → documents → chunks (with embeddings)
subjects → topics (hierarchical: chapter > topic > subtopic)
topics ↔ chunks via topic_chunks mapping
subjects → quizzes → questions (with citations, embeddings)
quizzes → attempts → responses
attempts → gap_reports → gap_report_items
subjects → revision_plans → plan_tasks
documents (past_paper) → past_paper_questions → topics

## Key Workflows

1. **Upload** → validate → extract (unpdf/txt) → clean → chunk → embed (Gemini, batched, resumable) → store
2. **Topic Map** → LLM extracts hierarchy from syllabus chunks → validate quotes → embed topic names → map to content chunks
3. **Quiz** → select topics → retrieve chunks per topic → generate MCQs (Groq, batched) → validate → store → UI
4. **Gap Analysis** → deterministic code: count correct/incorrect per topic → classify by thresholds → recency weighting → report
5. **Revision Plan** → priority scoring → allocate minutes across days → LLM writes task descriptions → store
6. **Assistant** → topic-scoped RAG → stream grounded answer with citations
7. **Dashboard** → aggregate stored data → charts (Recharts)

## Implementation Checklist

- [x] 1. Project setup (Next.js, deps, Tailwind, folder structure)
- [x] 2. Auth + DB schema + migrations + demo seed
- [x] 3. Subjects CRUD + document upload UI
- [x] 4. Document processing pipeline (extraction, chunking, embedding)
- [x] 5. RAG retrieval module
- [x] 6. Topic map (generation, mapping, UI)
- [x] 7. MCQ generation + validation
- [x] 8. Quiz UI + evaluation + results
- [x] 9. Gap analysis (classifier, report, UI)
- [x] 10. Revision plan (allocator, adaptation, UI)
- [x] 11. Explain-this-topic assistant
- [x] 12. Dashboard + progress page
- [x] 13. Full end-to-end testing
- [ ] 14. GitHub + Vercel deployment

## Threshold Config (lib/config.ts)

- STRONG_THRESHOLD: 0.75
- MEDIUM_THRESHOLD: 0.50
- MIN_ATTEMPTS_FOR_CLASSIFICATION: 2
- LOW_CONFIDENCE_MAX_ATTEMPTS: 4
- RECENCY_WEIGHT: 0.6 (latest attempt weight)
- SIMILARITY_THRESHOLD: 0.7 (retrieval floor)
- CHUNK_SIZE_TOKENS: 500-800
- CHUNK_OVERLAP_TOKENS: 80
- EMBEDDING_DIMENSION: 768

