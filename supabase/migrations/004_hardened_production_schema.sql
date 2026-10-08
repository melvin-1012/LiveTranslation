-- ==============================================================================
-- 004_hardened_production_schema.sql
-- HACKNEX 2026 EPS03: Live Translation for Indic Languages
-- Production Hardening, Integrity Constraints, Streaming Support, & Views
-- ==============================================================================

-- ==============================================================================
-- 1. STREAMING SEGMENTS HARDENING (utterance_segments)
-- Supports progressive streaming: Partial 1 -> Partial 2 -> Partial 3 -> Final
-- ==============================================================================
ALTER TABLE public.utterance_segments
    ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS segment_status TEXT DEFAULT 'partial';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'utterance_segments_segment_status_check' 
          AND conrelid = 'public.utterance_segments'::regclass
    ) THEN
        ALTER TABLE public.utterance_segments
            ADD CONSTRAINT utterance_segments_segment_status_check
            CHECK (segment_status IN ('partial', 'interim', 'final'));
    END IF;
END $$;

-- Default session status to 'active'
ALTER TABLE public.translation_sessions
    ALTER COLUMN status SET DEFAULT 'active';

-- ==============================================================================
-- 2. ASR RESULTS HARDENING (asr_results)
-- Distinguishes ASR Error vs Translation Error and tracks partial/final states
-- ==============================================================================
ALTER TABLE public.asr_results
    ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS asr_status TEXT DEFAULT 'final',
    ADD COLUMN IF NOT EXISTS error_message TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'asr_results_asr_status_check' 
          AND conrelid = 'public.asr_results'::regclass
    ) THEN
        ALTER TABLE public.asr_results
            ADD CONSTRAINT asr_results_asr_status_check
            CHECK (asr_status IN ('partial', 'final', 'error'));
    END IF;
END $$;

-- ==============================================================================
-- 3. TRANSLATION RESULTS HARDENING (translation_results)
-- Supports confidence scoring, error tracking, and progressive versioning
-- ==============================================================================
ALTER TABLE public.translation_results
    ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS error_message TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'translation_results_confidence_check' 
          AND conrelid = 'public.translation_results'::regclass
    ) THEN
        ALTER TABLE public.translation_results
            ADD CONSTRAINT translation_results_confidence_check
            CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
    END IF;
END $$;

-- ==============================================================================
-- 4. TRANSLATION METRICS HARDENING (translation_metrics)
-- Captures confidence along with latency, stability, and rewrite counts
-- ==============================================================================
ALTER TABLE public.translation_metrics
    ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS final_translation_latency_ms INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'translation_metrics_confidence_check' 
          AND conrelid = 'public.translation_metrics'::regclass
    ) THEN
        ALTER TABLE public.translation_metrics
            ADD CONSTRAINT translation_metrics_confidence_check
            CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
    END IF;
END $$;

-- ==============================================================================
-- 5. SESSION PARTICIPANTS HARDENING (session_participants)
-- Enables linking authenticated profiles for 2-way sessions
-- ==============================================================================
ALTER TABLE public.session_participants
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ==============================================================================
-- 6. GLOSSARY TERMS HARDENING (glossary_terms)
-- Expands domain and government terminology support
-- ==============================================================================
DO $$
BEGIN
    -- Drop old check constraint if it does not contain government / domain_term
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'glossary_terms_term_type_check' 
          AND conrelid = 'public.glossary_terms'::regclass
    ) THEN
        ALTER TABLE public.glossary_terms DROP CONSTRAINT glossary_terms_term_type_check;
    END IF;

    ALTER TABLE public.glossary_terms
        ADD CONSTRAINT glossary_terms_term_type_check
        CHECK (term_type IN ('name', 'place', 'technical', 'medical', 'government', 'domain_term', 'organization', 'number', 'general'));
END $$;

-- ==============================================================================
-- 7. EVALUATION INFRASTRUCTURE HARDENING
-- Supports long sentences, stability scoring, and baseline comparison
-- ==============================================================================
ALTER TABLE public.evaluation_samples
    ADD COLUMN IF NOT EXISTS is_long_sentence BOOLEAN DEFAULT false;

ALTER TABLE public.evaluation_results
    ADD COLUMN IF NOT EXISTS caption_stability_score NUMERIC(6,4);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'evaluation_results_stability_check' 
          AND conrelid = 'public.evaluation_results'::regclass
    ) THEN
        ALTER TABLE public.evaluation_results
            ADD CONSTRAINT evaluation_results_stability_check
            CHECK (caption_stability_score IS NULL OR (caption_stability_score >= 0 AND caption_stability_score <= 1));
    END IF;
END $$;

-- Baseline results enhancements for direct apples-to-apples evaluation comparison
ALTER TABLE public.baseline_results
    ADD COLUMN IF NOT EXISTS evaluation_sample_id UUID REFERENCES public.evaluation_samples(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS bleu_score NUMERIC(8,4),
    ADD COLUMN IF NOT EXISTS chrf_score NUMERIC(8,4),
    ADD COLUMN IF NOT EXISTS caption_rewrite_count INTEGER,
    ADD COLUMN IF NOT EXISTS caption_stability_score NUMERIC(6,4);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'baseline_results_bleu_check' 
          AND conrelid = 'public.baseline_results'::regclass
    ) THEN
        ALTER TABLE public.baseline_results
            ADD CONSTRAINT baseline_results_bleu_check
            CHECK (bleu_score IS NULL OR bleu_score >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'baseline_results_chrf_check' 
          AND conrelid = 'public.baseline_results'::regclass
    ) THEN
        ALTER TABLE public.baseline_results
            ADD CONSTRAINT baseline_results_chrf_check
            CHECK (chrf_score IS NULL OR chrf_score >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'baseline_results_rewrites_check' 
          AND conrelid = 'public.baseline_results'::regclass
    ) THEN
        ALTER TABLE public.baseline_results
            ADD CONSTRAINT baseline_results_rewrites_check
            CHECK (caption_rewrite_count IS NULL OR caption_rewrite_count >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'baseline_results_stability_check' 
          AND conrelid = 'public.baseline_results'::regclass
    ) THEN
        ALTER TABLE public.baseline_results
            ADD CONSTRAINT baseline_results_stability_check
            CHECK (caption_stability_score IS NULL OR (caption_stability_score >= 0 AND caption_stability_score <= 1));
    END IF;
END $$;

-- ==============================================================================
-- 8. TIMESTAMP & LOGICAL INTEGRITY CONSTRAINTS
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'translation_sessions_time_check' 
          AND conrelid = 'public.translation_sessions'::regclass
    ) THEN
        ALTER TABLE public.translation_sessions
            ADD CONSTRAINT translation_sessions_time_check
            CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'utterances_speech_time_check' 
          AND conrelid = 'public.utterances'::regclass
    ) THEN
        ALTER TABLE public.utterances
            ADD CONSTRAINT utterances_speech_time_check
            CHECK (speech_end_at IS NULL OR started_at IS NULL OR speech_end_at >= started_at);
    END IF;
END $$;

-- ==============================================================================
-- 9. PRODUCTION QUERY PERFORMANCE INDEXES
-- Optimized for actual real-time streaming and history query patterns
-- ==============================================================================
-- User recent sessions listing (History view)
CREATE INDEX IF NOT EXISTS idx_translation_sessions_user_started 
    ON public.translation_sessions(user_id, started_at DESC);

-- Ordered utterance sequence lookup within a session
CREATE INDEX IF NOT EXISTS idx_utterances_session_seq 
    ON public.utterances(session_id, sequence_number ASC);

-- ASR results chronological lookup per utterance
CREATE INDEX IF NOT EXISTS idx_asr_results_utterance_created 
    ON public.asr_results(utterance_id, created_at ASC);

-- Progressive translation versions lookup per utterance
CREATE INDEX IF NOT EXISTS idx_translation_results_utterance_ver 
    ON public.translation_results(utterance_id, version_number ASC);

-- Language-pair analytics for final translations
CREATE INDEX IF NOT EXISTS idx_translation_results_langs_final 
    ON public.translation_results(source_language_id, target_language_id) 
    WHERE is_final = true;

-- Fast glossary lookup by language pair and active status
CREATE INDEX IF NOT EXISTS idx_glossary_lookup 
    ON public.glossary_terms(source_language_id, target_language_id, is_active);

-- Case-insensitive source term index for real-time terminology substitution
CREATE INDEX IF NOT EXISTS idx_glossary_source_term_lower 
    ON public.glossary_terms(lower(source_term));

-- Evaluation and baseline sample indexes
CREATE INDEX IF NOT EXISTS idx_eval_results_sample_id 
    ON public.evaluation_results(evaluation_sample_id);

CREATE INDEX IF NOT EXISTS idx_baseline_results_sample_id 
    ON public.baseline_results(evaluation_sample_id);

CREATE INDEX IF NOT EXISTS idx_baseline_results_run_id 
    ON public.baseline_results(baseline_run_id);

-- ==============================================================================
-- 10. RLS SECURITY POLICIES HARDENING
-- ==============================================================================
-- Ensure profiles can be inserted by authenticated user
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'profiles' 
          AND policyname = 'Users can insert own profile'
    ) THEN
        CREATE POLICY "Users can insert own profile" 
            ON public.profiles FOR INSERT 
            WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Allow reading own glossary terms OR global terminology (where created_by IS NULL)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view own glossary terms" ON public.glossary_terms;
    DROP POLICY IF EXISTS "Users can view own or global glossary terms" ON public.glossary_terms;

    CREATE POLICY "Users can view own or global glossary terms" 
        ON public.glossary_terms FOR SELECT 
        USING (created_by = auth.uid() OR created_by IS NULL);
END $$;

-- ==============================================================================
-- 11. DATABASE VIEWS (Security Invoker Enabled)
-- ==============================================================================

-- Drop existing views first to allow updated column layouts in Postgres
DROP VIEW IF EXISTS public.system_vs_baseline_comparison_view CASCADE;
DROP VIEW IF EXISTS public.language_pair_performance_view CASCADE;
DROP VIEW IF EXISTS public.translation_performance_view CASCADE;
DROP VIEW IF EXISTS public.session_history_view CASCADE;

-- View 1: Session History View
-- Enforces RLS via security_invoker = true; provides language codes and utterance counts
CREATE VIEW public.session_history_view WITH (security_invoker = true) AS
SELECT 
    s.id AS session_id,
    s.user_id,
    sl_src.name AS source_language,
    sl_src.code AS source_language_code,
    sl_tgt.name AS target_language,
    sl_tgt.code AS target_language_code,
    s.mode,
    s.status,
    s.started_at,
    s.ended_at,
    COUNT(u.id) AS total_utterances
FROM public.translation_sessions s
LEFT JOIN public.supported_languages sl_src ON s.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON s.target_language_id = sl_tgt.id
LEFT JOIN public.utterances u ON u.session_id = s.id
GROUP BY s.id, s.user_id, sl_src.name, sl_src.code, sl_tgt.name, sl_tgt.code, s.mode, s.status, s.started_at, s.ended_at;

-- View 2: Translation Performance View
-- Includes source utterance text, final translation, and latency/stability metrics
CREATE OR REPLACE VIEW public.translation_performance_view WITH (security_invoker = true) AS
SELECT 
    tr.id AS translation_id,
    u.session_id,
    u.id AS utterance_id,
    u.sequence_number,
    u.source_text,
    sl_src.name AS source_language,
    sl_src.code AS source_language_code,
    sl_tgt.name AS target_language,
    sl_tgt.code AS target_language_code,
    tr.translated_text,
    tr.version_number,
    tr.is_final,
    tr.confidence AS translation_confidence,
    tm.time_to_first_translation_ms,
    tm.end_to_end_latency_ms,
    tm.caption_rewrite_count,
    tm.caption_stability_score
FROM public.translation_results tr
JOIN public.utterances u ON tr.utterance_id = u.id
LEFT JOIN public.supported_languages sl_src ON tr.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON tr.target_language_id = sl_tgt.id
LEFT JOIN public.translation_metrics tm ON tm.translation_result_id = tr.id
WHERE tr.is_final = true;

-- View 3: Language Pair Performance View
-- Aggregated quality and latency metrics per language pair
CREATE OR REPLACE VIEW public.language_pair_performance_view WITH (security_invoker = true) AS
SELECT 
    sl_src.name AS source_language,
    sl_src.code AS source_language_code,
    sl_tgt.name AS target_language,
    sl_tgt.code AS target_language_code,
    COUNT(tr.id) AS number_of_samples,
    ROUND(AVG(tm.time_to_first_translation_ms), 2) AS avg_time_to_first_translation,
    ROUND(AVG(tm.end_to_end_latency_ms), 2) AS avg_end_to_end_latency,
    ROUND(AVG(tm.caption_rewrite_count), 2) AS avg_caption_rewrites,
    ROUND(AVG(tm.caption_stability_score), 4) AS avg_stability_score
FROM public.translation_results tr
JOIN public.translation_metrics tm ON tr.id = tm.translation_result_id
LEFT JOIN public.supported_languages sl_src ON tr.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON tr.target_language_id = sl_tgt.id
WHERE tr.is_final = true
GROUP BY sl_src.name, sl_src.code, sl_tgt.name, sl_tgt.code;

-- View 4: System vs Baseline Comparison View
-- Directly compares Baseline (ASR -> Translation) vs Our System (ASR -> Intelligence Layer -> Translation)
CREATE OR REPLACE VIEW public.system_vs_baseline_comparison_view WITH (security_invoker = true) AS
SELECT 
    es.id AS sample_id,
    ed.name AS dataset_name,
    sl_src.code AS source_lang,
    sl_tgt.code AS target_lang,
    es.source_text,
    es.reference_translation,
    -- Our System metrics
    er.model_name AS our_model,
    er.predicted_translation AS our_translation,
    er.bleu_score AS our_bleu,
    er.chrf_score AS our_chrf,
    er.time_to_first_translation_ms AS our_latency_ms,
    er.caption_stability_score AS our_stability,
    -- Baseline metrics
    br.name AS baseline_run_name,
    bl.translated_text AS baseline_translation,
    bl.bleu_score AS baseline_bleu,
    bl.chrf_score AS baseline_chrf,
    bl.time_to_first_translation_ms AS baseline_latency_ms,
    bl.caption_stability_score AS baseline_stability
FROM public.evaluation_samples es
JOIN public.evaluation_datasets ed ON es.dataset_id = ed.id
LEFT JOIN public.supported_languages sl_src ON es.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON es.target_language_id = sl_tgt.id
LEFT JOIN public.evaluation_results er ON es.id = er.evaluation_sample_id
LEFT JOIN public.baseline_results bl ON es.id = bl.evaluation_sample_id
LEFT JOIN public.baseline_runs br ON bl.baseline_run_id = br.id;
