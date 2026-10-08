from app.services.supabase_client import get_supabase
from typing import List, Dict, Any

db = get_supabase()

def run_baseline_evaluation(dataset_id: str, model_config: dict):
    # Fetch samples from evaluation_samples where dataset_id=dataset_id
    # Process through baseline model
    # Record to baseline_runs and baseline_results
    pass

def run_system_evaluation(dataset_id: str):
    # Fetch samples
    # Process through our StreamingOrchestrator architecture
    # Collect latencies
    # Calculate BLEU/chrF/Adequacy
    # Record to evaluation_results
    pass

def get_language_pair_breakdown():
    # Query language_pair_performance_view
    pass
