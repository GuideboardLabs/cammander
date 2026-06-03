# Proposed Skills: Binary Quantization & Efficient RAG

Based on the BQ/RAG article, here are 5 proposed skills ranked by impact-to-effort ratio.

---

## Skill 1: `binary-quantization` (High Impact, Medium Effort)

**Problem:** Full float32 embeddings waste 32x memory vs binary vectors. For Hermes agents indexing session history, codebases, and docs locally, this directly constrains how much context fits in RAM.

**Skill covers:**
- Float32 → binary conversion: `np.where(vec > 0, 1, 0).astype(np.uint8)` then `np.packbits()`
- Hamming distance search (not cosine — binary vectors use XOR popcount)
- When BQ helps (large corpora, recall-tolerant) vs hurts (small sets, need exact recall)
- Oversampling + reranking pattern: retrieve 10x candidates with BQ, rerank top-k with full vectors
- Benchmark methodology: measure recall@k against full-precision baseline before committing

**Why it matters for Hermes:** Session search embeddings, skill retrieval, and codebase indexing can all benefit. A 1M vector index drops from ~4GB (float32, 1024d) to ~128MB (binary).

---

## Skill 2: `milvus-vector-db` (High Impact, High Effort)

**Problem:** No vector DB skill exists. Agents that need persistent similarity search (session recall, doc retrieval, deduplication) currently rely on SQLite FTS5 only.

**Skill covers:**
- Local Milvus Lite (SQLite-backed, zero infra) vs Milvus standalone (Docker) vs Zilliz Cloud
- Schema design: `BINARY_VECTOR` fields, `VARCAR` for payload, dynamic fields
- Index types: `BIN_FLAT` for binary vectors, `IVF_FLAT` for float32, `HNSW` for high recall
- CRUD: insert, search, delete, flush, compact
- Filtering: hybrid search combining vector similarity + metadata filters
- Connection reuse patterns for long-running agents

**Why it matters for Hermes:** The session_search tool is FTS5-only. Vector embeddings would enable semantic recall across sessions — "find the conversation where we discussed the auth refactor" even if no keyword match.

---

## Skill 3: `embedding-pipeline` (Medium Impact, Low Effort)

**Problem:** No standardized embedding workflow. Each project reinests chunking, embedding model selection, and batch processing.

**Skill covers:**
- Embedding model selection guide: `bge-large-en-v1.5` (general), `bge-small` (fast), `E5-mistral-7b` (high quality), `nomic-embed` (long context)
- Chunking strategies: fixed-size, sentence-level, semantic (LLM-aware), recursive character splitting
- Batch embedding: `batch_iterate(documents, batch_size=512)` pattern, rate limiting, retry
- Normalization requirement: most models need L2 normalization before indexing
- Multi-format ingestion: PDF, Markdown, code files, images (via multimodal embedders)

**Why it matters for Hermes:** Standardizes how skills and agents generate embeddings. Avoids the common mistake of embedding without normalization or chunking without overlap.

---

## Skill 4: `rag-retrieval-architecture` (High Impact, Low Effort)

**Problem:** The article's final paragraph is the real insight — BQ is one piece, production retrieval needs auth, sync, routing, permissions, reranking. No skill covers this holistically.

**Skill covers:**
- Retrieval architecture patterns: single-index vs federated, query routing (keyword vs semantic vs hybrid)
- Reranking pipeline: BQ oversample → cross-encoder rerank → LLM synthesis
- Production concerns the article mentions:
  - Auth & permissions: filter vectors by user/team scope before returning
  - Sync: incremental indexing on document change, not full rebuild
  - Query routing: classify intent → pick retrieval strategy
  - Deduplication: semantic dedup across sources (Slack + docs + Jira saying the same thing)
- Evaluation: recall@k, MRR, latency P50/P99, relevance@1 benchmarks
- Fallback chain: vector miss → keyword fallback → LLM "I don't know"

**Why it matters for Hermes:** The session_search + web_search + file search pipeline is already a multi-source retrieval system. This skill would codify the routing logic and fallback patterns.

---

## Skill 5: `groq-fast-inference` (Low Impact, Low Effort)

**Problem:** The article shows Groq for sub-second LLM generation but doesn't cover the operational details.

**Skill covers:**
- Groq API setup: API key, rate limits, supported models (Llama 3.1, Mixtral, Kimi-K2)
- When Groq makes sense: generation-heavy RAG, real-time chat, fast prototyping
- When it doesn't: long-context (>8K output), rare model needs, cost-sensitive batch jobs
- Streaming patterns: `stream_complete` for responsive UX, `chat_complete` for batch
- Cost comparison: Groq vs local inference vs other serverless

**Why it matters:** Marginal. Hermes already configures providers. This would just document Groq as an option for latency-sensitive RAG generation.

---

## Recommended Priority

| Skill | Impact | Effort | Priority |
|---|---|---|---|
| `rag-retrieval-architecture` | High | Low | **1st** — Applies to everything, no infra dependency |
| `binary-quantization` | High | Medium | **2nd** — Concrete technique, big wins at scale |
| `embedding-pipeline` | Medium | Low | **3rd** — Quick to write, prevents common mistakes |
| `milvus-vector-db` | High | High | **4th** — Most impactful long-term but highest effort |
| `groq-fast-inference` | Low | Low | **5th** — Nice-to-have documentation |

## Key Insight from the Article

Binary quantization is the headline but the closing is the actual lesson:

> "In production, retrieval is rarely just a vector lookup. Real-world agents pull context from Slack, GitHub, Jira, databases, and docs simultaneously. That means auth, sync, query routing, permissions, and reranking all become first-class concerns alongside the embedding search itself."

The `rag-retrieval-architecture` skill captures this — BQ is one tool in the box, not the whole architecture.