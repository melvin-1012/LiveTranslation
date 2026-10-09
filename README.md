# Live Indic Translator - Database Architecture

> Supabase PostgreSQL Database Schema, Migrations, Seed Data, and Row Level Security for Live Indic Speech Translation  
> **Repository Branch:** `Database` | **Project Reference:** `HNX26EPS03`

---

## 1. Project Overview

The **`Database`** branch of **Live Indic Translator** provides the foundational database layer for the HackNEX 2026 external-round project (HNX26EPS03). It contains the complete, production-ready **Supabase PostgreSQL** relational database schema, database configuration, initial seed data, analytical views, and security policies designed to support real-time speech translation between English and Indic languages (Tamil, Hindi, Telugu, Kannada, and Malayalam).

In a streaming translation system, high-throughput speech and audio processing require a clean separation between **transient streaming data** (audio frames, intermediate tokens, voice activity chunks) and **persistent transactional checkpoints** (session lifecycles, structured utterances, multi-version translation hypotheses, latency metrics, and evaluation benchmarks).

This branch houses:
- The authoritative database configuration ([supabase/config.toml](supabase/config.toml)) for local and remote Supabase environments.
- Idempotent PostgreSQL migration scripts ([supabase/migrations/](supabase/migrations/)) defining 18 core tables, automated triggers, composite query indexes, and 3 analytical database views.
- Fine-grained **Row Level Security (RLS)** policies enforced across all public tables, isolating user session data based on Supabase Authentication (`auth.uid()`).
- Seed data for supported languages, development evaluation datasets, and multilingual benchmark samples covering code-mixed speech, named entities, numerical values, and domain terminology.
- Detailed architectural documentation in [DATABASE_README.md](DATABASE_README.md).

> **Branch Scope**: In accordance with the repository structure, this `Database` branch is dedicated strictly to database schemas, migrations, configuration, and documentation. Application server code and frontend web clients reside in their respective project branches.

---

## 2. Key Features

- **Comprehensive 18-Table Relational Schema**:
  - **Identity & Profiles**: `profiles` table extending Supabase `auth.users` with automated profile provisioning.
  - **Language Catalog**: Authoritative catalog of supported languages (`supported_languages`) with native script naming and Indic categorization.
  - **Live Translation Sessions**: Session state management (`translation_sessions`) supporting `one_way` and `two_way` modes with status tracking (`active`, `paused`, `completed`, `cancelled`, `error`).
  - **Multi-Participant Support**: Multi-speaker session management (`session_participants`) modeling roles (`speaker`, `listener`, `both`).
  - **Speech Utterances & Segments**: Utterance tracking (`utterances`) with deterministic sequence numbering, plus fine-grained segment breakdown (`utterance_segments`) for code-mixed speech handling.
  - **ASR & Translation Separation**: Isolated tables for speech recognition (`asr_results`) and progressive translation versions (`translation_results`), allowing explicit separation of speech recognition errors from translation errors.
  - **Objective Latency & Judging Metrics**: Quantitative performance tracking (`translation_metrics`) recording latency milestones and caption rewrite counts.
  - **Evaluation & Benchmarking Framework**: Curated test datasets (`evaluation_datasets`), test samples (`evaluation_samples`), and prediction outputs (`evaluation_results`) for BLEU, chrF, and adequacy scoring.
  - **Baseline Comparison & Ablation Experiments**: Dedicated schemas (`baseline_runs`, `baseline_results`, `experiments`, `experiment_runs`) enabling empirical verification against baseline models.
  - **Terminology Protection**: Domain term glossary (`glossary_terms`) protecting technical terms, medical terminology, places, and proper nouns.
  - **Storage Metadata**: External storage references (`audio_assets`) linking session audio recordings stored in Supabase Storage.
- **Automated PostgreSQL Triggers**:
  - `handle_new_user()` on `auth.users`: Automatically creates a corresponding row in `public.profiles` upon user registration.
  - `handle_updated_at()` on `public.profiles`: Automatically updates the `updated_at` timestamp on record modification.
- **Strict Row Level Security (RLS)**:
  - Enabled on **all 18 public tables**.
  - Enforces tenant and user isolation: users can only read, insert, update, and delete sessions, utterances, translations, and metrics belonging to their own `user_id`.
  - Master catalogs (`supported_languages`, demo `evaluation_datasets`) are readable by authenticated users while write-restricted to the service-role key.
- **Analytical Views with `security_invoker = true`**:
  - Three database views (`session_history_view`, `translation_performance_view`, `language_pair_performance_view`) configured to inherit the caller's RLS permissions automatically.
- **Transient vs. Persistent Architecture**:
  - Guarantees PostgreSQL is not overloaded with raw streaming audio tokens while reliably persisting stabilized translation checkpoints (`is_final = true`) and progressive versions (`translation_status = 'partial'`).

---

## 3. Architecture and Data Model

### Architecture: Transient vs. Persistent Segregation

```
+-----------------------------------------------------------------------------------------+
|                                    TRANSIENT LAYER                                      |
|   (Client WebSockets / Voice Activity Detection / Intermediate Streaming ASR Tokens)   |
|   - High frequency (sub-100ms chunks)                                                   |
|   - Kept in memory; NOT stored directly in database to prevent I/O bottlenecks          |
+-----------------------------------------------------------------------------------------+
                                      |
                                      | Checkpoint Emission
                                      v
+-----------------------------------------------------------------------------------------+
|                                   PERSISTENT LAYER                                      |
|                              (Supabase PostgreSQL 17)                                  |
|                                                                                         |
|  1. Session Inception:                                                                  |
|     auth.users ---> profiles ---> translation_sessions <---> session_participants       |
|                                         |                                               |
|  2. Utterance Chunks & Segments:        v                                               |
|     utterances <------------------------+                                               |
|        |           |                                                                    |
|        |           +---> utterance_segments (Code-mixed chunks)                          |
|        |                                                                                |
|  3. ASR & Progressive Translation:                                                      |
|        +---> asr_results (Isolated speech recognition transcripts)                      |
|        |                                                                                |
|        +---> translation_results (v1 partial, v2 partial, vFinal)                       |
|                 |                                                                       |
|  4. Performance Metrics:                                                                |
|                 +---> translation_metrics (Latencies, caption rewrite count, stability) |
|                                                                                         |
|  5. Domain Protection & Evaluation Benchmarks:                                          |
|     glossary_terms               evaluation_datasets ---> evaluation_samples             |
|     audio_assets (Storage refs)                               |                         |
|     experiments ---> experiment_runs                          +---> evaluation_results  |
|     baseline_runs -> baseline_results                                                   |
+-----------------------------------------------------------------------------------------+
```

### Table Inventory

| Table Name | Primary Key | Key Foreign Keys | Purpose |
| :--- | :--- | :--- | :--- |
| `profiles` | `id` (UUID) | `auth.users(id)` | User metadata and system profile, auto-populated by auth trigger. |
| `supported_languages` | `id` (UUID) | None | Master catalog of supported Indic languages and English. |
| `translation_sessions` | `id` (UUID) | `profiles(id)`, `supported_languages(id)` | Live translation sessions with status and operation mode. |
| `session_participants` | `id` (UUID) | `translation_sessions(id)`, `supported_languages(id)` | Participant entities and roles within a translation session. |
| `utterances` | `id` (UUID) | `translation_sessions(id)`, `supported_languages(id)` | Meaningful speech chunks identified within a session. |
| `utterance_segments` | `id` (UUID) | `utterances(id)`, `supported_languages(id)` | Ordered sub-chunks within code-mixed utterances. |
| `asr_results` | `id` (UUID) | `utterances(id)`, `supported_languages(id)` | Automatic speech recognition hypotheses and transcript logs. |
| `translation_results` | `id` (UUID) | `utterances(id)`, `supported_languages(id)` | Progressive partial versions and final translation outputs. |
| `translation_metrics` | `id` (UUID) | `translation_results(id)` | Latency profiling and caption stability records per translation. |
| `baseline_runs` | `id` (UUID) | None | Reference benchmark runs using standard baseline models. |
| `baseline_results` | `id` (UUID) | `baseline_runs(id)`, `utterances(id)` | Prediction outputs and scores generated by baseline models. |
| `evaluation_datasets` | `id` (UUID) | None | Evaluation dataset splits (`development`, `validation`, `held_out`, `demo`). |
| `evaluation_samples` | `id` (UUID) | `evaluation_datasets(id)`, `supported_languages(id)` | Curated test samples with source and ground-truth reference text. |
| `evaluation_results` | `id` (UUID) | `evaluation_samples(id)` | System prediction outputs evaluated against benchmark test samples. |
| `glossary_terms` | `id` (UUID) | `supported_languages(id)`, `profiles(id)` | Domain-specific dictionary terms protecting specialized vocabulary. |
| `audio_assets` | `id` (UUID) | `translation_sessions(id)`, `utterances(id)` | Metadata references for audio recordings in Supabase Storage. |
| `experiments` | `id` (UUID) | None | Ablation experiment configurations (e.g. adaptive segmentation). |
| `experiment_runs` | `id` (UUID) | `experiments(id)`, `translation_sessions(id)` | Execution instances and outcome metrics for ablation experiments. |

---

## 4. Technology Stack

- **Database Engine**: PostgreSQL 17 (configured via [supabase/config.toml](supabase/config.toml)).
- **Platform & Management**: Supabase Open Source Platform (PostgREST, GoTrue Auth, Realtime, Studio).
- **Procedural Language**: PL/pgSQL for database functions and triggers (`handle_new_user`, `handle_updated_at`).
- **Cryptographic Extensions**: `pgcrypto` / `gen_random_uuid()` for UUID generation.
- **Access Control**: PostgreSQL native Row Level Security (RLS) policies.
- **Local Tooling**: Supabase CLI (`supabase`) and Docker Desktop for local container orchestration.

---

## 5. Repository Structure

```
LiveIndicTranslator/
├── DATABASE_README.md                                 # Technical documentation for database schema & design
├── README.md                                          # Root project documentation (this file)
│
└── supabase/
    ├── config.toml                                    # Supabase project configuration (HACKNEX_External-2026)
    │
    ├── .temp/
    │   └── cli-latest                                 # Supabase CLI version cache
    │
    └── migrations/
        ├── 001_initial_translation_schema.sql         # Base migration: 18 tables, triggers, indexes, RLS, 3 views
        └── 002_seed_data.sql                         # Seed data: 6 supported languages & dev evaluation dataset
```

---

## 6. Prerequisites

To work with the database schema on this branch:

1. **Supabase CLI**: Install via npm or your system package manager:
   ```bash
   npm install -g supabase
   # or
   npx supabase --version
   ```
2. **Docker Desktop**: Required if running local Supabase containers (`supabase start`).
3. **Supabase Cloud Account** *(Optional)*: Required only if linking and pushing migrations to a hosted cloud database.

---

## 7. Installation and Run Instructions

### Local Development (Using Supabase CLI)

1. **Navigate to the Repository Root**:
   ```bash
   cd c:\Users\ilakk\student-portfolio\antigravity\LiveIndicTranslator
   ```

2. **Start Local Supabase Services**:
   Ensure Docker Desktop is running, then execute:
   ```bash
   supabase start
   ```
   This will boot the local PostgreSQL database, Supabase Auth (GoTrue), PostgREST API, Realtime server, and Supabase Studio dashboard.

3. **Apply Database Migrations & Seeds**:
   ```bash
   supabase db reset
   ```
   This command creates a fresh local database and executes the migrations in numerical order:
   - [001_initial_translation_schema.sql](supabase/migrations/001_initial_translation_schema.sql)
   - [002_seed_data.sql](supabase/migrations/002_seed_data.sql)

4. **Access Local Services**:
   As configured in [supabase/config.toml](supabase/config.toml):
   - **PostgREST API URL**: `http://127.0.0.1:54321`
   - **PostgreSQL Connection String**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   - **Supabase Studio Dashboard**: `http://127.0.0.1:54323`

5. **Stop Local Services**:
   ```bash
   supabase stop
   ```

### Remote Cloud Deployment

To deploy this schema to a remote Supabase project:

1. **Authenticate and Link Project**:
   ```bash
   supabase login
   supabase link --project-ref <your-supabase-project-id>
   ```

2. **Push Migrations to Remote Database**:
   ```bash
   supabase db push
   ```

3. **Alternative (Dashboard SQL Editor)**:
   You can also execute the SQL files directly in the Supabase Cloud Dashboard SQL Editor in numerical order:
   1. Copy and execute [supabase/migrations/001_initial_translation_schema.sql](supabase/migrations/001_initial_translation_schema.sql)
   2. Copy and execute [supabase/migrations/002_seed_data.sql](supabase/migrations/002_seed_data.sql)

---

## 8. Environment Configuration

When integrating an application server or backend with this database, the following environment variables are required (as documented in [DATABASE_README.md](DATABASE_README.md)):

```env
# URL of your Supabase instance
SUPABASE_URL=http://127.0.0.1:54321

# Public anonymous key for safe client and authenticated user operations (respects RLS)
SUPABASE_ANON_KEY=your-supabase-anon-key

# Service role administrative key (bypasses RLS for backend batch operations)
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### Variable Roles and Security

| Variable | Scope | RLS Behavior | Description |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Universal | N/A | Base endpoint for Supabase PostgREST and Auth APIs. |
| `SUPABASE_ANON_KEY` | Client & User | Enforces RLS | Passed by client applications and standard API requests. All table access is restricted to policies matching `auth.uid()`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend Server | Bypasses RLS | Reserved strictly for administrative tasks such as seeding evaluation benchmarks or administrative data management. **Never expose this key to client applications.** |

---

## 9. Database Migrations and Schema Overview

The database migrations in [supabase/migrations/](supabase/migrations/) establish the complete relational system.

### 1. `001_initial_translation_schema.sql`

This migration defines:
- **18 Tables**: Creates all tables with explicit column constraints (`CHECK`, `DEFAULT`, `NOT NULL`, and `FOREIGN KEY` references with `CASCADE` or `SET NULL` behaviors).
- **Triggers**:
  - `on_auth_user_created`: Binds `auth.users` to `public.profiles` via PL/pgSQL function `handle_new_user()`.
  - `on_profile_updated`: Updates `updated_at` on `profiles` via `handle_updated_at()`.
- **Query Indexes**:
  - `idx_translation_sessions_user_id`: Fast session lookups by user ID.
  - `idx_translation_sessions_status` & `idx_translation_sessions_started_at`: Time-based and status filtering.
  - `idx_session_participants_session_id`: Participant joins.
  - `idx_utterances_session_id` & `idx_utterances_detected_lang`: Utterance retrieval.
  - `idx_utterance_segments_utterance_id`: Multi-segment code-mixing joins.
  - `idx_asr_results_utterance_id`: ASR transcript retrieval.
  - `idx_translation_results_utterance_id` & `idx_translation_results_is_final`: Multi-version progressive translation queries.
  - `idx_eval_samples_langs` & `idx_eval_results_sample_id`: Benchmark joins.
  - `idx_glossary_langs` & `idx_glossary_created_by`: Glossary lookups.
- **Row Level Security (RLS) Policies**:
  - Configures ownership checks (`auth.uid() = user_id`) across sessions, participants, utterances, segments, ASR results, translation results, metrics, and audio assets.
  - Ensures public read access to `supported_languages`.
  - Restricts benchmark results and datasets to authorized evaluation roles.
- **3 Analytical Views**:
  - `session_history_view`: Summarizes user sessions with source/target language names, session mode, status, duration timestamps, and total utterance counts.
  - `translation_performance_view`: Joins finalized translations (`is_final = true`) with utterance sequence numbers, language pairs, translated text, and operational latency metrics.
  - `language_pair_performance_view`: Aggregates performance by language pair, computing average latency to first translation, average end-to-end latency, average rewrite counts, and stability scores.

### 2. `002_seed_data.sql`

This migration populates initial master data:
- **6 Supported Languages**:
  ```sql
  ('en', 'English', 'English', false, true),
  ('ta', 'Tamil', 'தமிழ்', true, true),
  ('hi', 'Hindi', 'हिन्दी', true, true),
  ('te', 'Telugu', 'తెలుగు', true, true),
  ('kn', 'Kannada', 'ಕನ್ನಡ', true, true),
  ('ml', 'Malayalam', 'മലയാളം', true, true)
  ```
- **Development Seed Dataset**:
  - `id`: `11111111-1111-1111-1111-111111111111`
  - `name`: `Development Seed Dataset`
  - `dataset_type`: `development`
- **Initial Evaluation Benchmark Samples**:
  - **English to Tamil**: `"Hello, how are you?"` -> `"வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?"`
  - **Tamil to English**: `"நான் நாளை சென்னை போகிறேன்."` -> `"I am going to Chennai tomorrow."`
  - **Tamil-English Code-Mixed**: `"நான் tomorrow Chennai போறேன்"` -> `"I am going to Chennai tomorrow."`
  - **Hindi to English**: `"मेरा नाम राहुल है।"` -> `"My name is Rahul."`
  - **Hindi-English Code-Mixed**: `"Mujhe kal ek meeting attend karna hai."` -> `"I have to attend a meeting tomorrow."`
  - **Domain Term & Numerical Test**: `"The latency is 500 milliseconds for streaming ASR."` -> `"ஸ்ட்ரீமிங் ASR-க்கான லேட்டன்சி 500 மில்லிசெகண்டுகள்."`

---

## 10. Available Data Access Endpoints (PostgREST)

When Supabase is running, PostgREST automatically generates secure REST endpoints for every table and view based on database permissions and active Row Level Security:

### PostgREST REST API Base: `http://127.0.0.1:54321/rest/v1/`

All requests require the `apikey: <SUPABASE_ANON_KEY>` header. Authenticated requests also require `Authorization: Bearer <USER_JWT>`.

| Route | Supported Methods | Description & Access Control |
| :--- | :--- | :--- |
| `/profiles` | `GET`, `PATCH` | Read or update the caller's profile. Enforces `auth.uid() = id`. |
| `/supported_languages` | `GET` | Read all active supported languages. Publicly readable. |
| `/translation_sessions` | `GET`, `POST`, `PATCH`, `DELETE` | CRUD translation sessions. Filtered automatically to `auth.uid() = user_id`. |
| `/session_participants` | `GET`, `POST`, `PATCH`, `DELETE` | Manage participants within the caller's translation sessions. |
| `/utterances` | `GET`, `POST`, `PATCH`, `DELETE` | Access speech utterances belonging to the caller's sessions. |
| `/utterance_segments` | `GET`, `POST`, `PATCH`, `DELETE` | Manage streaming code-mixed chunks linked to caller's utterances. |
| `/asr_results` | `GET`, `POST`, `PATCH`, `DELETE` | Read or write ASR transcript records linked to caller's utterances. |
| `/translation_results` | `GET`, `POST`, `PATCH`, `DELETE` | Store and retrieve multi-version translation hypotheses and final translations. |
| `/translation_metrics` | `GET`, `POST`, `PATCH`, `DELETE` | Store latency profiling data linked to translation results. |
| `/glossary_terms` | `GET`, `POST`, `PATCH`, `DELETE` | Manage caller's custom terminology terms. |
| `/session_history_view` | `GET` | Query high-level session history. Inherits caller's RLS constraints (`security_invoker = true`). |
| `/translation_performance_view` | `GET` | Query completed translations with latency metrics for caller's sessions. |
| `/language_pair_performance_view` | `GET` | Query aggregated latency and stability metrics across language pairs. |

---

## 11. Testing and Verification

To verify that the database schema has been correctly applied and meets all integrity requirements:

### Verification via SQL Queries

Run these queries in Supabase Studio SQL Editor or via `psql`:

1. **Verify Table Existence (18 Public Tables)**:
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ORDER BY table_name;
   ```

2. **Verify Row Level Security Status (Must be True for All 18 Tables)**:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```

3. **Verify Analytical Views (3 Views with Security Invoker)**:
   ```sql
   SELECT table_name 
   FROM information_schema.views 
   WHERE table_schema = 'public';
   ```

4. **Verify Seeded Supported Languages**:
   ```sql
   SELECT code, name, native_name, is_indic, is_active 
   FROM public.supported_languages 
   ORDER BY code;
   ```
   *Expected: 6 rows (`en`, `hi`, `kn`, `ml`, `ta`, `te`).*

5. **Verify Seeded Evaluation Samples**:
   ```sql
   SELECT s.source_text, s.reference_translation, s.is_code_mixed, l_src.code AS src, l_tgt.code AS tgt
   FROM public.evaluation_samples s
   JOIN public.supported_languages l_src ON s.source_language_id = l_src.id
   JOIN public.supported_languages l_tgt ON s.target_language_id = l_tgt.id;
   ```
   *Expected: 6 sample records covering EN-TA, TA-EN, HI-EN, and code-mixed variants.*

---

## 12. Troubleshooting

### 1. `supabase start` Fails to Boot Containers
- **Cause**: Docker Desktop is not running or another service is already using port `54321`, `54322`, or `54323`.
- **Solution**:
  - Ensure Docker Desktop is active.
  - Verify that no other PostgreSQL instance is listening on port `54322`. Ports can be adjusted in [supabase/config.toml](supabase/config.toml).

### 2. Migration Failure: `relation already exists`
- **Cause**: A previous migration attempt left the database in a partially applied state.
- **Solution**:
  ```bash
  supabase db reset
  ```
  This cleanly rebuilds the database from scratch and runs all migrations in sequence.

### 3. Permission Denied / RLS Violation on Inserts
- **Cause**: Inserting rows without an authenticated user context or with a mismatched `user_id`.
- **Solution**:
  - When querying via PostgREST, ensure the `Authorization: Bearer <USER_JWT>` header is included.
  - For server-side administrative tasks (such as importing benchmark datasets), use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS.

### 4. Language Foreign Key Constraints Fail
- **Cause**: Inserting sessions or utterances before languages are seeded.
- **Solution**: Ensure [002_seed_data.sql](supabase/migrations/002_seed_data.sql) has been applied so that UUIDs for `en`, `hi`, `ta`, `te`, `kn`, and `ml` are populated in `supported_languages`.
