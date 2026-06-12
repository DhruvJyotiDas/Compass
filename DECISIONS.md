# Compass — Architecture Decisions

Short-form decision log. Each entry: what was cut/chosen, and what would trigger revisiting it.

## Cuts

| Decision | Rationale | Adoption trigger |
|----------|-----------|-----------------|
| **No Kafka** | Transactional outbox (SKIP LOCKED) gives at-least-once delivery and backpressure at this scale. Kafka adds broker ops, consumer groups, and schema registry for no demo benefit. | > 10M events/day, multi-region, or need replay-by-topic |
| **No Kubernetes** | Docker Compose is a single command deploy. K8s adds HPA, pod scheduling, and YAML surface area that would eat the entire timeline. | Multiple services with independent scaling requirements, CI/CD teams > 3 |
| **No multi-tenancy / RBAC** | Single brand, single admin. Adds schema complexity (tenant_id FKs everywhere) and auth middleware for zero current benefit. | Second brand onboards |
| **No fine-tuning** | No labeled campaign data. Claude claude-sonnet-4-6 with structured prompts + fallbacks already hits the quality bar. Trigger would be a measurable, repeated failure pattern on an eval set. | 1000+ labeled campaign examples, consistent schema errors in prod |
| **No real channel integrations** | The spec says stub it. A real Twilio/WhatsApp BSP integration would require sandbox numbers, message templates, carrier delays — all irrelevant to evaluating the system design. | Product launch |
| **No pgvector / lookalike expansion** | Tier 3 feature. Would require embedding service (~4GB RAM), embedding generation, and a vector index — all before the data pipeline is proven. ~5-6 hours of work, high risk of not shipping. | Tiers 0-2 stable in production, embeddings already available |
| **No self-hosted LLM** | Claude API is faster to ship. The client is behind a single env var — swapping to a vLLM endpoint is a config change, not an architecture change. | Data residency requirements (PII must not leave own infra), or cost at >100k calls/day |
| **No multi-agent frameworks** | 5 sequential Claude calls with Pydantic validation between each step. LangChain/LangGraph would add abstraction without adding capability. | Complex tool-use graphs, dynamic routing between models |
| **No trained ML models (CLV/churn)** | No historical labeled outcomes. Segment DSL + Claude step 1 (intent) covers the same use case for this scope without a training pipeline. | 6+ months of campaign attribution data available |
| **Single worker process** | `SKIP LOCKED` + async batch is sufficient for demo-scale throughput. Adding worker pool/Celery/BullMQ would add a Redis dependency and process management. | > 50k campaigns/hour, or worker SLA requirements |

## Choices

| Decision | Rationale |
|----------|-----------|
| **FastAPI + asyncpg** | Native async, great Pydantic integration, fastest Python web framework. asyncpg is the fastest PostgreSQL driver. |
| **SQLAlchemy async** | Thin ORM layer over asyncpg, keeps raw SQL for hot paths (SKIP LOCKED, rollup recalculation). |
| **Idempotency via DB constraints** | Constraints are atomic and survive process crashes. Application-level dedup (Redis, in-memory) can fail under concurrent writes or restarts. The three UNIQUE constraints are the proof, not the application. |
| **Precedence-rank status resolution** | Out-of-order callbacks (delivered before sent) are handled by construction — `MAX(rank)` wins. No buffering, no redelivery needed. |
| **HMAC-SHA256 on callbacks** | One shared secret, one header. Simpler than OAuth/JWT for a two-service system where both services are in our control. |
| **Prompt caching on system prompt** | The field registry + few-shot examples are ~2k tokens per call. Caching saves ~80% of input tokens after first call, reducing both latency and cost on the same demo session. |
| **SSE over WebSockets** | SSE is unidirectional (server → client), which matches the use case exactly. Simpler to implement, works through HTTP/1.1 proxies, no handshake. |
| **Browser Web Speech API** | Free, works client-side, supports en-IN (Hinglish). Replacing faster-whisper for this scope removes a GPU dependency and ~4GB of infra overhead. |
| **Next.js App Router** | RSC for initial page loads, colocation of server/client components, easy deployment via standalone output. |
| **Transactional outbox** | Communications + outbox jobs created in one transaction with campaign approval. If the worker crashes mid-dispatch, it resumes exactly where it left off — no double-dispatch, no lost communications. |
