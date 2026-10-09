import time
from typing import Optional

class TranslationMetricsTracker:
    def __init__(self):
        self.audio_received_at: Optional[float] = None
        self.asr_first_at: Optional[float] = None
        self.translation_first_at: Optional[float] = None
        self.translation_final_at: Optional[float] = None
        self.output_at: Optional[float] = None
        self.caption_rewrite_count: int = 0
        
        self.candidate_partial_updates: int = 0
        self.emitted_partial_updates: int = 0
        self.suppressed_updates: int = 0
        self.final_translations: int = 0
    
    def mark_audio_received(self):
        if not self.audio_received_at:
            self.audio_received_at = time.time()
            
    def mark_asr_first(self):
        if not self.asr_first_at:
            self.asr_first_at = time.time()

    def mark_translation_first(self):
        if not self.translation_first_at:
            self.translation_first_at = time.time()
            
    def mark_translation_final(self):
        self.translation_final_at = time.time()
        self.final_translations += 1
        
    def increment_candidate(self):
        self.candidate_partial_updates += 1
        
    def increment_emitted(self):
        self.emitted_partial_updates += 1
        
    def increment_suppressed(self):
        self.suppressed_updates += 1
        
    def increment_rewrite(self):
        self.caption_rewrite_count += 1
        
    def mark_output(self):
        self.output_at = time.time()

    def calculate_metrics(self):
        asr_latency_ms = int((self.asr_first_at - self.audio_received_at) * 1000) if self.asr_first_at and self.audio_received_at else None
        time_to_first_translation_ms = int((self.translation_first_at - self.audio_received_at) * 1000) if self.translation_first_at and self.audio_received_at else None
        final_translation_latency_ms = int((self.translation_final_at - self.audio_received_at) * 1000) if self.translation_final_at and self.audio_received_at else None
        end_to_end_latency_ms = int((self.output_at - self.audio_received_at) * 1000) if self.output_at and self.audio_received_at else None
        
        update_reduction = 0.0
        if self.candidate_partial_updates > 0:
            update_reduction = 1.0 - (self.emitted_partial_updates / self.candidate_partial_updates)
        
        return {
            "asr_latency_ms": asr_latency_ms,
            "time_to_first_translation_ms": time_to_first_translation_ms,
            "final_translation_latency_ms": final_translation_latency_ms,
            "end_to_end_latency_ms": end_to_end_latency_ms,
            "caption_rewrite_count": self.caption_rewrite_count,
            "candidate_partial_updates": self.candidate_partial_updates,
            "emitted_partial_updates": self.emitted_partial_updates,
            "suppressed_updates": self.suppressed_updates,
            "final_translations": self.final_translations,
            "caption_update_reduction": update_reduction
        }
