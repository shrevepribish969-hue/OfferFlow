import json
import os
import faiss
import numpy as np
from typing import List, Dict, Any
from sentence_transformers import SentenceTransformer

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
KB_PATH = os.path.join(PROJECT_ROOT, "knowledge_base", "final_enriched_kb.json")
FAISS_INDEX_PATH = os.path.join(PROJECT_ROOT, "knowledge_base", "faiss_index.bin")

COMPETENCY_DICTIONARY = {
    "Prompt": ["Prompt Engineering", "Prompt Design", "System Prompt", "Few-shot", "Instruction"],
    "Agent": ["AI Agent", "Workflow", "Agentic", "Tool Use", "ReAct"],
    "Product Design": ["产品设计", "需求分析", "交互设计", "PRD"],
    "Data Analysis": ["数据分析", "AB测试", "SQL", "指标体系"],
    "Business": ["商业化", "B端", "ToB", "SaaS", "GTM"]
}

class HierarchicalRetriever:
    def __init__(self):
        self.kb_data = []
        self.model = None
        self.index = None
        self._load_kb()

    def _load_kb(self):
        if os.path.exists(KB_PATH):
            with open(KB_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.kb_data = data.get("questions", [])

    def _lazy_init_faiss(self):
        if self.model is None:
            # Lightweight model for fast local embedding
            self.model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            
        if self.index is None:
            if os.path.exists(FAISS_INDEX_PATH):
                with open(FAISS_INDEX_PATH, "rb") as f:
                    chunk = f.read()
                self.index = faiss.deserialize_index(np.frombuffer(chunk, dtype=np.uint8))
            else:
                self._build_faiss_index()

    def _build_faiss_index(self):
        if not self.kb_data: return
        texts = [q.get("question", "") + " " + q.get("intent", "") for q in self.kb_data]
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings)
        chunk = faiss.serialize_index(self.index)
        with open(FAISS_INDEX_PATH, "wb") as f:
            f.write(chunk)
        print(f"[HierarchicalRetriever] FAISS index built with {len(embeddings)} vectors.")

    def retrieve(self, jd_analysis_result: Dict[str, Any], target_company: str, target_role: str, top_k: int = 10) -> List[Dict]:
        """
        Five-Layer Hierarchical Retrieval Pipeline
        """
        candidates = []
        seen_hashes = set()

        def add_candidate(q, source_layer):
            h = q.get("question_hash")
            if h not in seen_hashes:
                q_copy = dict(q)
                q_copy["_retrieval_layer"] = source_layer
                candidates.append(q_copy)
                seen_hashes.add(h)

        # ==========================================
        # Layer 1: Strategy Analysis (Reuse JD Data)
        # ==========================================
        core_skills = jd_analysis_result.get("required_skills", []) + jd_analysis_result.get("preferred_skills", [])
        keywords = jd_analysis_result.get("keywords", [])
        strategy_tags = [str(s).lower() for s in core_skills + keywords]

        # ==========================================
        # Layer 2: Metadata Retrieval (Exact Match)
        # ==========================================
        target_c_lower = target_company.lower() if target_company else ""
        target_r_lower = target_role.lower() if target_role else ""

        for q in self.kb_data:
            q_comps = [c.lower() for c in q.get("companies", [])]
            q_role = (q.get("primary_role") or "").lower()
            
            company_match = target_c_lower and any(target_c_lower in c for c in q_comps)
            role_match = target_r_lower and (target_r_lower in q_role)
            
            if company_match or role_match:
                add_candidate(q, "L2_Metadata")

        # ==========================================
        # Layer 3: Competency Retrieval (Dict Match)
        # ==========================================
        if len(candidates) < top_k * 2:
            expanded_tags = set()
            # Expand strategy tags using Competency Dictionary
            for tag in strategy_tags:
                expanded_tags.add(tag)
                for k, v_list in COMPETENCY_DICTIONARY.items():
                    if tag in k.lower() or any(tag in v.lower() for v in v_list):
                        expanded_tags.add(k.lower())
                        expanded_tags.update([x.lower() for x in v_list])

            for q in self.kb_data:
                q_comp = (q.get("competency") or "").lower()
                if any(ext in q_comp for ext in expanded_tags):
                    add_candidate(q, "L3_Competency")

        # ==========================================
        # Layer 4: Semantic Search (FAISS)
        # ==========================================
        # if len(candidates) < top_k * 2:
        #     self._lazy_init_faiss()
        #     if self.index:
        #         query_text = " ".join(strategy_tags)
        #         if query_text.strip():
        #             query_vector = self.model.encode([query_text], convert_to_numpy=True)
        #             distances, indices = self.index.search(query_vector, k=top_k*2)
        #             for idx in indices[0]:
        #                 if 0 <= idx < len(self.kb_data):
        #                     add_candidate(self.kb_data[idx], "L4_Semantic")

        # ==========================================
        # Layer 5: Programmatic Rerank
        # ==========================================
        return self._programmatic_rerank(candidates, top_k)

    def _programmatic_rerank(self, candidates: List[Dict], top_k: int) -> List[Dict]:
        """
        1. Deduplicate (Already done via seen_hashes)
        2. Sort by frequency (duplicate_count) and quality (difficulty mapping)
        3. Enforce distribution (Technical vs Behavioral)
        """
        # Difficulty to score mapping
        diff_score = {"hard": 3, "medium": 2, "easy": 1}
        
        for q in candidates:
            freq = q.get("duplicate_count", 1)
            diff = diff_score.get(q.get("difficulty", "medium"), 2)
            # Base score formula: Frequency * Quality proxy
            q["_sort_score"] = freq * 10 + diff
            
            # Boost L2 matches to ensure company flavor is retained
            if q.get("_retrieval_layer") == "L2_Metadata":
                q["_sort_score"] += 50

        # Sort descending
        candidates.sort(key=lambda x: x["_sort_score"], reverse=True)
        
        # Simple distribution enforcement (ensure at least 2 behavioral/project if possible)
        final_selection = []
        behavioral_count = 0
        
        for q in candidates:
            if len(final_selection) >= top_k:
                break
                
            q_type = (q.get("question_type") or "").lower()
            if q_type in ["behavioral", "project"]:
                behavioral_count += 1
                final_selection.append(q)
            else:
                # If we're filling the last slots and haven't hit behavioral quota, skip technical
                if len(final_selection) >= top_k - 2 and behavioral_count < 2:
                    continue
                final_selection.append(q)
                
        # If we skipped too many and didn't fill top_k, just backfill
        if len(final_selection) < top_k:
            for q in candidates:
                if q not in final_selection:
                    final_selection.append(q)
                if len(final_selection) >= top_k:
                    break

        return final_selection
