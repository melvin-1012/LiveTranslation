# HACKNEX 2026 EPS03: Unified Production Database Architecture
## "Live Translation for Indic Languages"

This document details the final, hardened, production-ready Supabase PostgreSQL database architecture for the **HACKNEX 2026 EPS03** live translation system. It consolidates the database implementations across development branches into one unified schema, maintaining full recovery history and data integrity.

---

## 1. Team Contribution Breakdown & Ownership Matrix

The final database unifies the core competencies developed by both team members into a seamless schema:

| Area | Lead Member | Scope & Database Components |
| :--- | :--- | :--- |
| **User Identity & Preferences** | **Person 1** | `profiles`, `preferred_source_language_id`, `preferred_target_language_id`, authentication trigger `handle_new_user()`, profile update trigger `handle_updated_at()`, profile RLS policies. |
| **Supported Languages Catalog** | **Person 1** | `supported_languages` (`en`, `hi`, `ta`, `te`, `kn`, `ml`), public read RLS, native naming. |
| **History & User Analytics Access** | **Person 1** | `session_history_view`, session listing by user, user privacy isolation via `security_invoker`. |
| **Live Streaming Sessions & Audio** | **Person 2** | `translation_sessions`, `session_participants`, `audio_assets` (Supabase Storage reference). |
| **Speech Utterances & Segments** | **Person 2** | `utterances`, `utterance_segments` (partial ASR streaming chunks: Partial 1 → 2 → 3 → Final). |
| **ASR & Translation Engine Results**| **Person 2** | `asr_results` (error isolation vs translation), `translation_results` (progressive versioning: v1, v2, v3 final). |
| **Performance & Judging Metrics** | **Person 2** | `translation_metrics` (first translation latency, E2E latency, caption rewrites, caption stability score). |
| **Benchmarking & Evaluation System** | **Person 2** | `evaluation_datasets`, `evaluation_samples`, `evaluation_results` (BLEU, chrF, adequacy, stability). |
| **Baseline vs. Our System Comparison** | **Person 2** | `baseline_runs`, `baseline_results`, `system_vs_baseline_comparison_view`. |
| **Ablation Experiments** | **Person 2** | `experiments`, `experiment_runs` (segmentation, stabilization, code-mixing, terminology ablation). |
| **Terminology & Domain Protection** | **Unified** | `glossary_terms` (medical, technical, government, names, places, domain terminology). |

---

## 2. Directory Structure & Migrations

```
supabase/
├── config.toml
└── migrations/
    ├── 001_initial_translation_schema.sql         # Base tables, initial constraints & RLS
    ├── 002_seed_data.sql                         # Supported languages & initial dev evaluation samples
    ├── 003_profile_language_preferences.sql      # Person 1: Profile language preferences migration
    ├── 004_hardened_production_schema.sql        # Hardening: streaming, ASR error isolation, metrics, views, indexes
    └── 005_indic_seeds.sql                       # Multilingual Indic seeds, global glossary, ablation seeds
DATABASE_README.md
```

### Migration Execution Order
1. **`001_initial_translation_schema.sql`**: Bootstraps the 18 core tables, initial constraints, auth triggers, and baseline RLS policies.
2. **`002_seed_data.sql`**: Seeds the 6 supported languages (`en`, `ta`, `hi`, `te`, `kn`, `ml`) and dev dataset.
3. **`003_profile_language_preferences.sql`**: Applies profile preferences idempotently with `IF NOT EXISTS` guards.
4. **`004_hardened_production_schema.sql`**: Adds streaming segment progression, ASR error separation, translation confidence, stability metrics, composite production indexes, and security-invoker views.
5. **`005_indic_seeds.sql`**: Seeds extended Indic samples (Telugu, Kannada, Malayalam, Hindi, Tamil) covering all judging categories (code-mixed, noisy, long sentences, domain terms) and global glossary terms.

---

## 3. Detailed Table Architecture & Purposes

### A. User & Authentication
- **`profiles`**
  - **Purpose**: Extends Supabase `auth.users` with display metadata and persistent language preferences.
  - **Key Columns**: `id` (PK, references `auth.users(id)` ON DELETE CASCADE), `display_name`, `email`, `preferred_source_language_id`, `preferred_target_language_id`, `created_at`, `updated_at`.
  - **Constraints**: Foreign keys to `supported_languages` with `ON DELETE SET NULL`.
  - **Triggers**: `handle_new_user()` auto-inserts a profile on signup; `handle_updated_at()` auto-updates `updated_at`.

### B. Language Catalog
- **`supported_languages`**
  - **Purpose**: Authoritative catalog of the 6 supported languages for EPS03.
  - **Supported Codes**: `en` (English), `hi` (Hindi), `ta` (Tamil), `te` (Telugu), `kn` (Kannada), `ml` (Malayalam).
  - **Key Columns**: `id` (PK, UUID), `code` (UNIQUE, NOT NULL), `name`, `native_name`, `is_indic`, `is_active`.
  - **Constraints**: Unique code, non-null names.

### C. Live Translation Sessions
- **`translation_sessions`**
  - **Purpose**: Encapsulates a live translation session between a speaker and audience or bi-directional conversation.
  - **Key Columns**: `id` (PK), `user_id` (FK `profiles`), `source_language_id`, `target_language_id`, `mode` (`one_way`, `two_way`), `status` (`active`, `paused`, `completed`, `cancelled`, `error`), `started_at`, `ended_at`, `metadata` (JSONB).
  - **Constraints**: `CHECK (ended_at IS NULL OR ended_at >= started_at)`.

### D. Session Participants
- **`session_participants`**
  - **Purpose**: Represents participants within a session. Supports future 2-way conversation roles.
  - **Key Columns**: `id`, `session_id` (FK `translation_sessions` ON DELETE CASCADE), `user_id` (optional FK `profiles`), `participant_label`, `role` (`speaker`, `listener`, `both`), `preferred_language_id`.

### E. Speech Utterances
- **`utterances`**
  - **Purpose**: Discrete speech units identified by Voice Activity Detection (VAD) within a session.
  - **Key Columns**: `id`, `session_id`, `participant_id`, `sequence_number`, `detected_language_id`, `source_text`, `is_code_mixed`, `confidence`, `started_at`, `speech_end_at`, `metadata`.
  - **Constraints**: Deterministic ordering via `UNIQUE (session_id, sequence_number)`; `CHECK (confidence >= 0 AND confidence <= 1)`; `CHECK (speech_end_at IS NULL OR speech_end_at >= started_at)`.

### F. Streaming Segments
- **`utterance_segments`**
  - **Purpose**: Real-time streaming chunks within an utterance. Enables progressive refinement: Partial 1 → Partial 2 → Partial 3 → Final without deleting past chunks.
  - **Key Columns**: `id`, `utterance_id`, `sequence_number`, `language_id`, `text`, `start_offset_ms`, `end_offset_ms`, `confidence`, `is_final`, `segment_status` (`partial`, `interim`, `final`).
  - **Constraints**: `UNIQUE (utterance_id, sequence_number)`; `CHECK (end_offset_ms IS NULL OR end_offset_ms >= start_offset_ms)`.

### G. Automatic Speech Recognition (ASR)
- **`asr_results`**
  - **Purpose**: Isolates raw speech recognition output from translation generation. Enables explicit diagnosis of **ASR Error vs. Translation Error**.
  - **Key Columns**: `id`, `utterance_id` (FK `utterances` ON DELETE CASCADE), `model_name`, `model_version`, `transcript`, `language_id`, `confidence`, `processing_latency_ms`, `is_final`, `asr_status` (`partial`, `final`, `error`), `error_message`, `metadata`.
  - **Constraints**: `CHECK (confidence >= 0 AND confidence <= 1)`; `CHECK (processing_latency_ms >= 0)`.

### H. Translation Results
- **`translation_results`**
  - **Purpose**: Stores translation outputs per utterance. **Preserves multiple versions** (e.g., Version 1 partial, Version 2 partial, Version 3 final) for caption stability and rewrite evaluation.
  - **Key Columns**: `id`, `utterance_id`, `source_language_id`, `target_language_id`, `model_name`, `model_version`, `translated_text`, `translation_status` (`partial`, `final`, `corrected`, `error`), `is_final`, `version_number`, `confidence`, `error_message`, `first_token_at`, `completed_at`, `metadata`.
  - **Constraints**: `UNIQUE (utterance_id, version_number)`; `CHECK (confidence >= 0 AND confidence <= 1)`.

### I. Translation Metrics (Judging Criteria)
- **`translation_metrics`**
  - **Purpose**: Stores concrete, objective metrics required by the EPS03 evaluation rubric.
  - **Key Columns**: `id`, `translation_result_id` (UNIQUE FK `translation_results` ON DELETE CASCADE), `time_to_first_translation_ms`, `end_to_end_latency_ms`, `translation_processing_ms`, `asr_latency_ms`, `segmentation_latency_ms`, `caption_rewrite_count`, `caption_stability_score` (0.0 to 1.0), `confidence`.
  - **Constraints**: Non-negative latencies; `CHECK (caption_stability_score >= 0 AND caption_stability_score <= 1)`.

### J. Glossary & Terminology Protection
- **`glossary_terms`**
  - **Purpose**: Domain term repository protecting proper names, places, and specialized vocab from hallucination or erroneous translation.
  - **Key Columns**: `id`, `source_language_id`, `target_language_id`, `source_term`, `target_term`, `term_type` (`name`, `place`, `technical`, `medical`, `government`, `domain_term`, `organization`, `number`, `general`), `description`, `is_active`, `created_by` (FK `profiles`, NULL for global system terms).

### K. Audio Storage References
- **`audio_assets`**
  - **Purpose**: Stores metadata references to audio recordings uploaded to Supabase Storage (prevents storing large BLOBs in PostgreSQL).
  - **Key Columns**: `id`, `session_id` (NOT NULL), `utterance_id`, `storage_path`, `duration_ms`, `format`, `sample_rate`.

### L. Evaluation & Benchmarking Infrastructure
- **`evaluation_datasets`**: Benchmark datasets (`development`, `validation`, `held_out`, `demo`).
- **`evaluation_samples`**: Curated test sentences across all EPS03 categories: normal speech, code-mixing, proper names, numerical values, domain terms, noisy audio, regional accents, long complex sentences.
- **`evaluation_results`**: System predictions scored with BLEU, chrF, adequacy, latencies, caption rewrites, and caption stability scores.

### M. Baseline Comparison
- **`baseline_runs`**: Tracks benchmark runs of vanilla direct pipeline (Whisper + NLLB-200 without intelligence layer).
- **`baseline_results`**: Stores baseline outputs evaluated on the exact same test samples (`evaluation_sample_id`) to prove empirical superiority of our architecture.

### N. Ablation Experiments
- **`experiments` & `experiment_runs`**: Tracks component ablation configurations (e.g. smart segmentation ON/OFF, caption stabilization ON/OFF, code-mixing handler ON/OFF, terminology protection ON/OFF) to quantify individual module impact.

---

## 4. Analytical Database Views

All views are secured with `WITH (security_invoker = true)` to inherit caller permissions and protect user privacy:

1. **`session_history_view`**:
   - Returns user sessions with language names and ISO codes (`source_language_code`, `target_language_code`), status, timestamps, and total utterance count.
   - Filtered automatically by caller's `auth.uid()` via RLS.
2. **`translation_performance_view`**:
   - Returns final translations with original source text, target text, and latency/stability metrics per utterance.
   - Used by the frontend Session Details screen.
3. **`language_pair_performance_view`**:
   - Aggregates average latency, rewrite counts, and stability scores across each source-target language pair.
4. **`system_vs_baseline_comparison_view`**:
   - Produces side-by-side metric comparison between Our System and Baseline runs on identical benchmark samples (BLEU, chrF, Latency, Stability).

---

## 5. Row Level Security (RLS) Strategy

RLS is enabled on **all 18 tables**. Security principles:

| Table | SELECT Policy | INSERT / UPDATE / DELETE Policy |
| :--- | :--- | :--- |
| `profiles` | `auth.uid() = id` | INSERT: `auth.uid() = id`; UPDATE: `auth.uid() = id` |
| `supported_languages` | `true` (Public readable) | Restricted (Service Role only) |
| `translation_sessions`| `auth.uid() = user_id` | `auth.uid() = user_id` |
| `session_participants`| Joined to session owner | Joined to session owner |
| `utterances` | Joined to session owner | Joined to session owner |
| `utterance_segments` | Joined to session owner via utterance | Joined to session owner via utterance |
| `asr_results` | Joined to session owner via utterance | Joined to session owner via utterance |
| `translation_results` | Joined to session owner via utterance | Joined to session owner via utterance |
| `translation_metrics` | Joined to session owner via translation | Joined to session owner via translation |
| `audio_assets` | Joined to session owner | Joined to session owner |
| `glossary_terms` | `created_by = auth.uid() OR created_by IS NULL` | `created_by = auth.uid()` |
| `evaluation_*` | `dataset_type IN ('development', 'demo')` | Restricted (Service Role only) |
| `baseline_*` | Restricted (Service Role only) | Restricted (Service Role only) |
| `experiments_*` | Restricted (Service Role only) | Restricted (Service Role only) |

---

## 6. Performance & Indexing Strategy

Targeted composite indexes support the critical high-frequency query paths:
- `idx_translation_sessions_user_started`: `(user_id, started_at DESC)` → Instant history retrieval.
- `idx_utterances_session_seq`: `(session_id, sequence_number ASC)` → Deterministic playback and ordered transcript streaming.
- `idx_asr_results_utterance_created`: `(utterance_id, created_at ASC)` → ASR history retrieval.
- `idx_translation_results_utterance_ver`: `(utterance_id, version_number ASC)` → Progressive version replay.
- `idx_translation_results_langs_final`: `(source_language_id, target_language_id) WHERE is_final = true` → Filtered index for language pair metrics.
- `idx_glossary_lookup`: `(source_language_id, target_language_id, is_active)` → Fast live term lookup.
- `idx_glossary_source_term_lower`: `(lower(source_term))` → Sub-millisecond case-insensitive dictionary lookups.
- `idx_eval_results_sample_id` & `idx_baseline_results_sample_id`: Fast join for evaluation benchmarks.

---

## 7. Frontend Integration Contract

The frontend ("History", "Preferences", and "Live Session") interacts with Supabase using the following contract:

```typescript
// 1. Fetch Supported Languages
const { data: languages } = await supabase
  .from('supported_languages')
  .select('id, code, name, native_name, is_indic')
  .eq('is_active', true);

// 2. Fetch User Profile & Preferences
const { data: profile } = await supabase
  .from('profiles')
  .select('id, display_name, email, preferred_source_language_id, preferred_target_language_id')
  .eq('id', user.id)
  .single();

// 3. Update User Language Preferences
await supabase
  .from('profiles')
  .update({
    preferred_source_language_id: sourceLangId,
    preferred_target_language_id: targetLangId
  })
  .eq('id', user.id);

// 4. Fetch Session History
const { data: sessions } = await supabase
  .from('session_history_view')
  .select('*')
  .order('started_at', { ascending: false });

// 5. Fetch Session Utterance & Translation Details
const { data: details } = await supabase
  .from('translation_performance_view')
  .select('*')
  .eq('session_id', currentSessionId)
  .order('sequence_number', { ascending: true });
```

---

## 8. Backend / Orchestrator Integration Contract

The FastAPI backend interacts with Supabase using the Service Role Key for asynchronous persistence:

```python
# 1. Start Session
session = db.table('translation_sessions').insert({
    "user_id": user_id,
    "source_language_id": src_id,
    "target_language_id": tgt_id,
    "mode": "one_way",
    "status": "active"
}).execute()

# 2. Persist Utterance (on speech boundary detected by VAD)
utterance = db.table('utterances').insert({
    "session_id": session_id,
    "sequence_number": seq_no,
    "source_text": text,
    "is_code_mixed": code_mixed_flag,
    "confidence": confidence_val
}).execute()

# 3. Store ASR Checkpoint
db.table('asr_results').insert({
    "utterance_id": utterance_id,
    "model_name": "Deepgram-Nova-2",
    "transcript": asr_transcript,
    "is_final": is_final,
    "asr_status": "final" if is_final else "partial",
    "confidence": 0.94
}).execute()

# 4. Store Progressive Translation Version (v1, v2, v3 final)
trans = db.table('translation_results').insert({
    "utterance_id": utterance_id,
    "model_name": "IndicTrans2-LLM",
    "translated_text": translated_text,
    "version_number": version_num,
    "is_final": is_final,
    "translation_status": "final" if is_final else "partial",
    "confidence": 0.95
}).execute()

# 5. Store Translation Metrics (on final translation)
db.table('translation_metrics').insert({
    "translation_result_id": trans.data[0]['id'],
    "time_to_first_translation_ms": 380,
    "end_to_end_latency_ms": 710,
    "caption_rewrite_count": version_num - 1,
    "caption_stability_score": 0.9650,
    "confidence": 0.95
}).execute()
```

---

## 9. Deployment & Local Validation Procedure

### Remote Supabase Deployment
```bash
# Link local repository with your Supabase Cloud project
supabase link --project-ref <your-project-id>

# Deploy all ordered migrations
supabase db push
```

### Local Development Setup (with Docker)
```bash
# Start local Supabase containers
supabase start

# Reset local database and run all migrations & seeds
supabase db reset
```

### Offline Schema Verification (without Docker)
Run the automated schema and integrity validator:
```bash
python scratch/validate_database.py
```
Validates:
- All 5 migrations in sequence.
- All 18 tables present with RLS enabled.
- All 4 analytical views defined with `security_invoker`.
- All foreign keys target valid tables or `auth.users`.
- 100% of seed INSERT statements are idempotent.
