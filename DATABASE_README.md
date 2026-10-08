# HNX26EPS03: Live Translation Database Schema

This directory contains the Supabase PostgreSQL database schema for the real-time speech translation system between English and Indic languages (HackNEX 2026 external-round project).

## 1. Table Definitions & Purposes

```
supabase/
├── config.toml
└── migrations/
    ├── 001_initial_translation_schema.sql
    ├── 002_seed_data.sql
    └── 003_profile_language_preferences.sql
DATABASE_README.md
```

## Entity Relationship Model

The core architecture supports real-time translation pipelines involving live microphone input and progressively translated output. 
The schema is divided into 18 tables, categorized by functionality:

### Core Runtime Tables
- **`profiles`**: System users, linked to Supabase Auth (`auth.users`). Stores user preferences like `preferred_source_language_id`.
- **Profile language preferences**: Optional preferred source and target languages reference `supported_languages`; deleting a language clears the preference.
- **`supported_languages`**: Master catalog of available languages (English, Tamil, Hindi, Telugu, Kannada, Malayalam).
- **`translation_sessions`**: Represents one live streaming translation session (mode, status, start/end times).
- **`session_participants`**: Users/Roles within a session (Speaker/Listener).
- **`utterances`**: Identified chunks of meaningful speech within a session.
- **`utterance_segments`**: Handles multiple language chunks inside a single code-mixed utterance.
- **`asr_results`**: Intermediate/final Output records for Automatic Speech Recognition pipelines.
- **`translation_results`**: Progressive translation checkpoints and final translations linked to utterances.
- **`audio_assets`**: References to binary audio records saved in Supabase storage (enforces session_id presence).

### Evaluation, Benchmarking & Metrics
- **`translation_metrics`**: Detailed performance tracking per translation (latency, stability, rewrite count) for grading.
- **`baseline_runs` & `baseline_results`**: Stores competitor/baseline model predictions to compare against our system.
- **`evaluation_datasets`, `evaluation_samples`, & `evaluation_results`**: Benchmarking schemas for deterministic test data and held-out evaluation scoring (BLEU, chrF, Adequacy).

### Optional / Stretch Functionality
- **`glossary_terms`**: Custom terminology mapping for domain names, technical terms, and proper nouns.
- **`experiments` & `experiment_runs`**: Ablation testing environments to track different architectures (e.g., normal vs. adaptive segmentation).

## 2. Table Relationships Overview

- A profile's optional preferred source and target language IDs reference `supported_languages`.
- A **Translation Session** belongs to a **Profile**.
- A **Translation Session** has many **Participants** and many **Utterances**.
- An **Utterance** has an **ASR Result** and many **Translation Results** (multiple progressive versions, and one final).
- A **Translation Result** has one **Translation Metrics** tracking its specific latencies and caption rewrites.
- **Evaluation Samples** map source text to reference text, and have many **Evaluation Results** predicted by models.

## 3. Translation Session Data Flow

How a typical live session flows through the backend into the database:

1. **Start session**: Client requests session start. Backend creates `translation_sessions` row.
2. **Speech detected**: VAD identifies speech. Backend creates an `utterances` row.
3. **ASR result**: Streaming STT stabilizes. Backend stores text in `asr_results`.
4. **Partial/final translation**: Streaming LLM output yields checkpoints. Backend creates `translation_results` rows (version 1, version 2... then `is_final = true`).
5. **Performance data**: Backend calculates latency/stability and writes to `translation_metrics`.
6. **End session**: Backend updates `translation_sessions.ended_at` and `status = 'completed'`.

## 4. History Page Data Retrieval

The frontend "History" workflow is fully supported via the provided Views:
- **List Sessions**: Queries `session_history_view` to get a list of past sessions, their languages, and total utterance counts.
- **Session Detail**: Queries `translation_performance_view` (filtering by `session_id`) to instantly fetch all final translated text, original source language, and performance metrics per utterance. Timestamps from `translation_sessions` and `utterances` provide chronological ordering.

## 5. RLS (Row Level Security) Protection

RLS strictly isolates user data via a verifiable ownership chain:
- **Ownership Chain**: `auth.users` → `profiles` → `translation_sessions` → `utterances` → `translation_results` → `translation_metrics`.
- **Enforcement**: Child tables (like `utterances` or `audio_assets`) do not explicitly store a `user_id`. Instead, their RLS `USING` and `WITH CHECK` policies execute a sub-query joining back to `translation_sessions` to verify that `session.user_id = auth.uid()`.
- **Glossary Privacy**: `glossary_terms` are explicitly scoped to `created_by = auth.uid()`.
- **Evaluation Secrecy**: `held_out` evaluation datasets cannot be queried by normal authenticated users. Only the `development` and `demo` datasets are exposed.

## 6. Real-Time Architecture (Transient vs Persistent)

**IMPORTANT: Supabase is NOT part of the real-time high-frequency audio loop.**

The intended streaming architecture is:
`Microphone` → `WebSocket` → `FastAPI` → `VAD/Segmentation` → `ASR` → `Translation` → `Live Frontend`

The database acts as an **asynchronous persistence layer**. 
- Do NOT save every single intermediate token to PostgreSQL.
- Only save meaningful checkpoints (e.g., when a sentence boundary is reached or a significant partial chunk is stable) to `translation_results`.
- Save the final result when the utterance is entirely resolved.

## 7. Backend Integration Documentation

The FastAPI application will act as the orchestrator. Expected API contracts map cleanly to the database operations:

- `POST /sessions` → creates `translation_sessions` row.
- `POST /sessions/{session_id}/utterances` → creates `utterances` row.
- `POST /utterances/{utterance_id}/asr` → stores `asr_results`.
- `POST /utterances/{utterance_id}/translations` → stores `translation_results`.
- `POST /translations/{translation_id}/metrics` → stores `translation_metrics`.
- `GET /sessions` → retrieves user history via `session_history_view`.
- `GET /sessions/{session_id}` → fetches session details and `translation_performance_view`.

*(Note: These are planned contracts. Do not create these endpoints until the FastAPI backend is initialized).*

## 8. Backend Integration Checklist

Use this checklist once Docker is installed and the FastAPI backend is ready to connect:

- [ ] Supabase URL configured
- [ ] Supabase key configured
- [ ] FastAPI connection tested
- [ ] Authenticated user identified
- [ ] Create session tested
- [ ] Create utterance tested
- [ ] Store ASR result tested
- [ ] Store translation result tested
- [ ] Store metrics tested
- [ ] Retrieve history tested
- [ ] RLS tested with two users
- [ ] Session completion tested
