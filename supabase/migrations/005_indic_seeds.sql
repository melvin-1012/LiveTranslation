-- ==============================================================================
-- 005_indic_seeds.sql
-- HACKNEX 2026 EPS03: Live Translation for Indic Languages
-- Idempotent Seeds: Extended Indic Languages, Glossaries & Evaluation Categories
-- ==============================================================================

-- 1. Ensure all 6 target languages are present and active (Idempotent)
INSERT INTO public.supported_languages (code, name, native_name, is_indic, is_active)
VALUES
    ('en', 'English', 'English', false, true),
    ('hi', 'Hindi', 'हिन्दी', true, true),
    ('ta', 'Tamil', 'தமிழ்', true, true),
    ('te', 'Telugu', 'తెలుగు', true, true),
    ('kn', 'Kannada', 'ಕನ್ನಡ', true, true),
    ('ml', 'Malayalam', 'മലയാളം', true, true)
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name,
    native_name = EXCLUDED.native_name,
    is_indic = EXCLUDED.is_indic,
    is_active = EXCLUDED.is_active;

-- 2. Seed System Global Glossary Terms (Medical, Technical, Government, Names, Places)
DO $$
DECLARE
    en_id UUID;
    hi_id UUID;
    ta_id UUID;
    te_id UUID;
    kn_id UUID;
    ml_id UUID;
BEGIN
    SELECT id INTO en_id FROM public.supported_languages WHERE code = 'en';
    SELECT id INTO hi_id FROM public.supported_languages WHERE code = 'hi';
    SELECT id INTO ta_id FROM public.supported_languages WHERE code = 'ta';
    SELECT id INTO te_id FROM public.supported_languages WHERE code = 'te';
    SELECT id INTO kn_id FROM public.supported_languages WHERE code = 'kn';
    SELECT id INTO ml_id FROM public.supported_languages WHERE code = 'ml';

    -- Medical Terminology: Blood Pressure (Prompt example)
    IF hi_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.glossary_terms (id, source_language_id, target_language_id, source_term, target_term, term_type, description, is_active, created_by)
        VALUES ('33333333-0001-1111-1111-111111111111', hi_id, en_id, 'ब्लड प्रेशर', 'blood pressure', 'medical', 'Medical vital sign translation', true, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Government Term: Aadhaar Card
    IF ta_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.glossary_terms (id, source_language_id, target_language_id, source_term, target_term, term_type, description, is_active, created_by)
        VALUES ('33333333-0002-1111-1111-111111111111', ta_id, en_id, 'ஆதார் அட்டை', 'Aadhaar Card', 'government', 'Indian government identity document', true, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Technical Term: Machine Learning
    IF te_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.glossary_terms (id, source_language_id, target_language_id, source_term, target_term, term_type, description, is_active, created_by)
        VALUES ('33333333-0003-1111-1111-111111111111', te_id, en_id, 'యంత్ర అభ్యాసం', 'Machine Learning', 'technical', 'AI computing term', true, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Place Name: Bengaluru
    IF kn_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.glossary_terms (id, source_language_id, target_language_id, source_term, target_term, term_type, description, is_active, created_by)
        VALUES ('33333333-0004-1111-1111-111111111111', kn_id, en_id, 'ಬೆಂಗಳೂರು', 'Bengaluru', 'place', 'City in Karnataka', true, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Proper Name / Place: Thiruvananthapuram
    IF ml_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.glossary_terms (id, source_language_id, target_language_id, source_term, target_term, term_type, description, is_active, created_by)
        VALUES ('33333333-0005-1111-1111-111111111111', ml_id, en_id, 'തിരുവനന്തപുരം', 'Thiruvananthapuram', 'place', 'Capital of Kerala', true, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Domain Term: District Collector
    IF hi_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.glossary_terms (id, source_language_id, target_language_id, source_term, target_term, term_type, description, is_active, created_by)
        VALUES ('33333333-0006-1111-1111-111111111111', hi_id, en_id, 'जिला कलेक्टर', 'District Collector', 'government', 'Administrative officer title', true, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- 3. Seed Comprehensive Evaluation Samples covering all required judging categories
DO $$
DECLARE
    dev_dataset_id UUID := '11111111-1111-1111-1111-111111111111';
    en_id UUID;
    hi_id UUID;
    ta_id UUID;
    te_id UUID;
    kn_id UUID;
    ml_id UUID;
BEGIN
    SELECT id INTO en_id FROM public.supported_languages WHERE code = 'en';
    SELECT id INTO hi_id FROM public.supported_languages WHERE code = 'hi';
    SELECT id INTO ta_id FROM public.supported_languages WHERE code = 'ta';
    SELECT id INTO te_id FROM public.supported_languages WHERE code = 'te';
    SELECT id INTO kn_id FROM public.supported_languages WHERE code = 'kn';
    SELECT id INTO ml_id FROM public.supported_languages WHERE code = 'ml';

    -- Telugu: Normal Speech
    IF te_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0001-1111-1111-111111111111', dev_dataset_id, te_id, en_id,
            'మీరు ఎలా ఉన్నారు?', 'How are you?',
            false, false, false, false, 'low', 'Standard Coastal Andhra', false
        ) ON CONFLICT (id) DO NOTHING;

        -- Telugu: Code-Mixing & Number
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0002-1111-1111-111111111111', dev_dataset_id, te_id, en_id,
            'నాకు 10 గంటలకి ఆఫీస్‌లో ఒక important call ఉంది.', 'I have an important call at the office at 10 o''clock.',
            true, false, true, false, 'medium', 'Telangana Colloquial', false
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Kannada: Normal Speech & Place Name
    IF kn_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0003-1111-1111-111111111111', dev_dataset_id, kn_id, en_id,
            'ನಾನು ನಾಳೆ ಮೈಸೂರಿಗೆ ಹೋಗುತ್ತಿದ್ದೇನೆ.', 'I am going to Mysuru tomorrow.',
            false, true, false, false, 'low', 'Standard Old Mysore', false
        ) ON CONFLICT (id) DO NOTHING;

        -- Kannada: Long Sentence & Domain Terminology
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0004-1111-1111-111111111111', dev_dataset_id, kn_id, en_id,
            'ಕರ್ನಾಟಕ ಸರ್ಕಾರದ ಕೃಷಿ ಇಲಾಖೆಯು ರೈತರಿಗೆ ಹೊಸ ಸಬ್ಸಿಡಿ ಯೋಜನೆಯನ್ನು ಅಧಿಕೃತವಾಗಿ ಘೋಷಿಸಿದೆ.',
            'The Department of Agriculture of the Government of Karnataka has officially announced a new subsidy scheme for farmers.',
            false, false, false, true, 'low', 'Formal Administrative', true
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Malayalam: Normal Speech & Noisy Speech
    IF ml_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0005-1111-1111-111111111111', dev_dataset_id, ml_id, en_id,
            'സുഖമാണോ? എന്തൊക്കെയുണ്ട് വിശേഷങ്ങൾ?', 'Are you fine? What are the news?',
            false, false, false, false, 'high', 'Central Kerala (Kochi)', false
        ) ON CONFLICT (id) DO NOTHING;

        -- Malayalam: Difficult Long Sentence with Code-Mixing & Number
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0006-1111-1111-111111111111', dev_dataset_id, ml_id, en_id,
            'കഴിഞ്ഞ മാസം 15-ാം തീയതി നടന്ന seminar ൽ 500 ലധികം delegates പങ്കെടുത്തിരുന്നു എന്ന് report ൽ പറയുന്നു.',
            'The report states that over 500 delegates attended the seminar held on the 15th of last month.',
            true, false, true, true, 'medium', 'South Kerala', true
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Hindi: Difficult Long Sentence & Domain Terminology
    IF hi_id IS NOT NULL AND en_id IS NOT NULL THEN
        INSERT INTO public.evaluation_samples (
            id, dataset_id, source_language_id, target_language_id, source_text, reference_translation,
            is_code_mixed, contains_name, contains_number, contains_domain_term, noise_level, accent_notes, is_long_sentence
        ) VALUES (
            '44444444-0007-1111-1111-111111111111', dev_dataset_id, hi_id, en_id,
            'यदि मरीज का ब्लड प्रेशर 140/90 से अधिक रहता है, तो उसे तत्काल आपातकालीन कक्ष में विशेषज्ञ डॉक्टर से परामर्श लेना चाहिए।',
            'If the patient''s blood pressure remains above 140/90, they should immediately consult a specialist doctor in the emergency room.',
            false, false, true, true, 'low', 'Standard Hindi Medical', true
        ) ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- 4. Seed Baseline Comparison Run & Benchmark Data
INSERT INTO public.baseline_runs (id, name, description, model_name, model_version)
VALUES (
    '55555555-1111-1111-1111-111111111111',
    'Standard Direct ASR+MT Baseline',
    'Vanilla pipeline without intelligent segmentation or caption stabilization',
    'Whisper-Medium + NLLB-200',
    '1.0'
) ON CONFLICT (id) DO NOTHING;

-- Seed Sample Baseline vs System Comparison for Evaluation Sample 22222222-1111-1111-1111-111111111111 (Hello, how are you?)
INSERT INTO public.baseline_results (
    id, baseline_run_id, evaluation_sample_id, source_text, translated_text,
    time_to_first_translation_ms, end_to_end_latency_ms, quality_score,
    bleu_score, chrf_score, caption_rewrite_count, caption_stability_score
) VALUES (
    '66666666-0001-1111-1111-111111111111',
    '55555555-1111-1111-1111-111111111111',
    '22222222-1111-1111-1111-111111111111',
    'Hello, how are you?',
    'வணக்கம் நீங்கள் எப்படி இருக்கிறீர்கள்',
    850, 1420, 0.7800,
    34.50, 58.20, 4, 0.6200
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.evaluation_results (
    id, evaluation_sample_id, model_name, model_version, predicted_translation,
    bleu_score, chrf_score, adequacy_score,
    time_to_first_translation_ms, end_to_end_latency_ms,
    caption_rewrite_count, caption_stability_score
) VALUES (
    '77777777-0001-1111-1111-111111111111',
    '22222222-1111-1111-1111-111111111111',
    'HACKNEX-EPS03 Intelligent Streaming Pipeline',
    '2.0-prod',
    'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?',
    48.20, 72.80, 0.9500,
    380, 720,
    1, 0.9450
) ON CONFLICT (id) DO NOTHING;
