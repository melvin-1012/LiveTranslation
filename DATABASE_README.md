# HNX26EPS03: Live Translation Database Schema

This directory contains the Supabase PostgreSQL database schema for the real-time speech translation system between English and Indic languages (HackNEX 2026 external-round project).

## Folder Structure

```
supabase/
├── config.toml
└── migrations/
    ├── 001_initial_translation_schema.sql
    └── 002_seed_data.sql
DATABASE_README.md
```

## Entity Relationship Model

The core architecture supports real-time translation pipelines involving live microphone input and progressively translated output. 
- **`profiles`**: System users, linked to Supabase Auth (`auth.users`).
- **`supported_languages`**: Master table for languages (English, Tamil, Hindi, Telugu, Kannada, Malayalam).
- **`translation_sessions`**: Represents one live streaming translation session. Has status and mode.
- **`session_participants`**: Users/Roles within a session (Speaker/Listener).
- **`utterances`**: Identified chunks of meaningful speech within a session.
- **`utterance_segments`**: Handles language chunks inside a single code-mixed utterance.
- **`asr_results`**: Output records for Automatic Speech Recognition pipelines.
- **`translation_results`**: Progressive and final translation attempts linked to utterances.
- **`translation_metrics`**: Detailed performance tracking (Latency, stability) for judging.
- **`baseline_runs` & `baseline_results`**: For storing and comparing against external models to demonstrate research contribution.
- **`evaluation_datasets`, `evaluation_samples`, & `evaluation_results`**: Benchmarking schemas for test data and held-out evaluation.
- **`glossary_terms`**: Custom terminology (Domain names, technical terms) correction mapping.
- **`audio_assets`**: References to binary audio records saved in Supabase storage.
- **`experiments` & `experiment_runs`**: Ablation testing environments to track different architectures (e.g., normal vs. adaptive segmentation).

## Relationships Overview

- A **Translation Session** has many **Participants** and many **Utterances**.
- An **Utterance** has an **ASR Result** and many **Translation Results** (multiple versions/partials, and one final).
- A **Translation Result** has one **Translation Metrics** tracking its latencies and caption rewrites.
- An **Experiment Run** optionally relates to a Session.
- **Evaluation Samples** map source text to reference text, and have many **Evaluation Results** predicted by models.

## RLS Strategy (Row Level Security)

RLS is strictly enforced on all public tables:
- **Authentication Dependency**: Relies on Supabase `auth.uid()`.
- **Profiles & Glossary**: Users can manage their own profile and glossary terms. Glossary and Supported Languages are globally readable.
- **Session Isolation**: Users can only `SELECT`, `INSERT`, `UPDATE`, `DELETE` rows (sessions, participants, utterances, results, metrics, audio) related to their own `user_id`.
- **Evaluation & Baseline**: Authenticated users can view evaluation sets, but updates/writes bypass RLS on the backend using the Supabase Service Role Key to avoid unauthorized manipulation.

## Migration Instructions

1. Install the Supabase CLI (`npm install -g supabase` or `npx supabase`).
2. Run local database: `supabase start`
3. The migrations inside `supabase/migrations/` will automatically apply upon local startup.
4. To apply to the remote project: 
   `supabase link --project-ref <your-project-id>`
   `supabase db push`

## Environment Variables Required (For Backend/FastAPI)

- `SUPABASE_URL`: Project URL
- `SUPABASE_ANON_KEY`: Public anonymous key (Only used for safe read/client ops)
- `SUPABASE_SERVICE_ROLE_KEY`: Admin key (Required on backend to insert Evaluation data bypassing RLS)

## Real-Time Architecture (Transient vs Persistent)

- **Transient**: High-frequency real-time events (WebSocket, VAD chunks, intermediate streaming tokens). Do NOT store these raw tokens directly into PostgreSQL. 
- **Persistent**: Supabase DB is used for checkpointing. 
    - Meaningful checkpoints of partial translations are saved to `translation_results` (using `translation_status = 'partial'`).
    - The final, stable translation is saved (using `is_final = true`).
- **Metrics**: Stored via `translation_metrics` for evaluating 25% of the score (Latency, rewrite counts, stability score).

## Baseline Comparison

Evaluation and baseline data are inserted directly into `baseline_results` (for the standard baseline) and `evaluation_results` (for our system predictions). Data can be visually compared using the created DB views:
- `session_history_view`
- `translation_performance_view`
- `language_pair_performance_view`
