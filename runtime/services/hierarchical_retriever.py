import json
import math
import os
import re
from typing import Any, Dict, List, Optional, Set


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
KB_PATH = os.path.join(PROJECT_ROOT, "knowledge_base", "final_enriched_kb.json")
FAISS_INDEX_PATH = os.path.join(PROJECT_ROOT, "knowledge_base", "faiss_index.bin")
EMBEDDING_MODEL = os.getenv(
    "OFFERFLOW_EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2"
)

COMPETENCY_DICTIONARY = {
    "Prompt": ["Prompt Engineering", "Prompt Design", "System Prompt", "Few-shot", "Instruction", "提示词"],
    "Agent": ["AI Agent", "Workflow", "Agentic", "Tool Use", "ReAct", "智能体", "工作流"],
    "Product Design": ["产品设计", "需求分析", "交互设计", "PRD", "用户体验", "产品经理"],
    "Data Analysis": ["数据分析", "AB测试", "A/B测试", "SQL", "指标体系", "数据运营"],
    "Business": ["商业化", "B端", "ToB", "SaaS", "GTM", "增长", "运营"],
    "Communication": ["沟通", "协作", "冲突", "推动", "团队", "跨部门"],
    "Project": ["项目", "实习", "复盘", "难点", "产出", "结果"],
}


def _normalise(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


class HierarchicalRetriever:
    """Hybrid interview-question retriever with explainable ranking.

    Metadata and lexical retrieval always work locally. Semantic retrieval is
    lazy and fails open, so interview preparation remains usable when the
    embedding dependency/model is unavailable.
    """

    _shared_model = None
    _shared_index = None

    def __init__(self, enable_semantic: Optional[bool] = None):
        self.kb_data: List[Dict[str, Any]] = []
        self.model = self.__class__._shared_model
        self.index = self.__class__._shared_index
        if enable_semantic is None:
            enable_semantic = os.getenv("OFFERFLOW_ENABLE_SEMANTIC_RAG", "1") != "0"
        self.enable_semantic = enable_semantic
        self.semantic_error: Optional[str] = None
        self._load_kb()

    def _load_kb(self) -> None:
        if not os.path.exists(KB_PATH):
            return
        with open(KB_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
        self.kb_data = data.get("questions", [])

    def _lazy_init_faiss(self) -> bool:
        if not self.enable_semantic:
            return False
        try:
            import faiss
            import numpy as np
            from sentence_transformers import SentenceTransformer

            if self.model is None:
                # The model is bundled in the local Hugging Face cache for the
                # desktop app. Avoid a network probe on every interview run.
                self.model = SentenceTransformer(EMBEDDING_MODEL, local_files_only=True)
            if self.index is None and os.path.exists(FAISS_INDEX_PATH):
                with open(FAISS_INDEX_PATH, "rb") as file:
                    chunk = file.read()
                self.index = faiss.deserialize_index(np.frombuffer(chunk, dtype=np.uint8))
            if self.index is None or self.index.ntotal != len(self.kb_data):
                self._build_faiss_index(faiss)
            self.__class__._shared_model = self.model
            self.__class__._shared_index = self.index
            return self.index is not None and self.index.ntotal == len(self.kb_data)
        except Exception as exc:  # Retrieval must retain its lexical fallback.
            self.semantic_error = f"{type(exc).__name__}: {exc}"
            self.index = None
            return False

    def _build_faiss_index(self, faiss_module) -> None:
        if not self.kb_data or self.model is None:
            return
        texts = [self._question_search_text(question) for question in self.kb_data]
        embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        index = faiss_module.IndexFlatL2(embeddings.shape[1])
        index.add(embeddings)
        chunk = faiss_module.serialize_index(index)
        with open(FAISS_INDEX_PATH, "wb") as file:
            file.write(chunk)
        self.index = index

    @staticmethod
    def _question_search_text(question: Dict[str, Any]) -> str:
        return " ".join(
            str(value or "")
            for value in (
                question.get("question"),
                question.get("category"),
                question.get("primary_role"),
                " ".join(question.get("companies", [])),
            )
        )

    @staticmethod
    def _extract_strategy_terms(jd_analysis_result: Dict[str, Any]) -> List[str]:
        terms: List[str] = []
        for skill in jd_analysis_result.get("skills", []):
            if isinstance(skill, dict):
                terms.append(str(skill.get("name", "")))
            else:
                terms.append(str(skill))
        for field in ("required_skills", "preferred_skills", "keywords"):
            for value in jd_analysis_result.get(field, []):
                terms.append(str(value.get("name", "")) if isinstance(value, dict) else str(value))
        for field in ("role", "job_summary"):
            value = jd_analysis_result.get(field)
            if value:
                terms.append(str(value))
        return list(dict.fromkeys(term for term in (_normalise(t) for t in terms) if term))

    @staticmethod
    def _expand_terms(strategy_terms: List[str]) -> Set[str]:
        expanded: Set[str] = set(strategy_terms)
        for term in strategy_terms:
            for label, aliases in COMPETENCY_DICTIONARY.items():
                family = {_normalise(label), *(_normalise(alias) for alias in aliases)}
                if any(term in item or item in term for item in family):
                    expanded.update(family)
        return {term for term in expanded if len(term) >= 2}

    def _semantic_scores(self, query_text: str, top_n: int) -> Dict[int, float]:
        if not query_text or not self._lazy_init_faiss():
            return {}
        try:
            vector = self.model.encode([query_text], convert_to_numpy=True, show_progress_bar=False)
            distances, indices = self.index.search(vector, k=min(top_n, len(self.kb_data)))
            scores: Dict[int, float] = {}
            for distance, index in zip(distances[0], indices[0]):
                if 0 <= int(index) < len(self.kb_data):
                    scores[int(index)] = 1.0 / (1.0 + max(float(distance), 0.0))
            if scores:
                peak = max(scores.values()) or 1.0
                scores = {index: score / peak for index, score in scores.items()}
            return scores
        except Exception as exc:
            self.semantic_error = f"{type(exc).__name__}: {exc}"
            return {}

    def retrieve(
        self,
        jd_analysis_result: Dict[str, Any],
        target_company: str,
        target_role: str,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        if not self.kb_data or top_k <= 0:
            return []

        strategy_terms = self._extract_strategy_terms(jd_analysis_result)
        expanded_terms = self._expand_terms(strategy_terms)
        company = _normalise(target_company)
        role = _normalise(target_role)
        query_text = " ".join(filter(None, [company, role, *strategy_terms]))
        semantic_scores = self._semantic_scores(query_text, max(top_k * 5, 25))
        ranked: List[Dict[str, Any]] = []

        max_frequency = max(int(q.get("duplicate_count", 1) or 1) for q in self.kb_data)
        for index, original in enumerate(self.kb_data):
            question_text = _normalise(original.get("question"))
            if len(question_text) < 6 or question_text in {"个人信息", "基本信息", "无"}:
                continue
            searchable = _normalise(self._question_search_text(original))
            companies = [_normalise(value) for value in original.get("companies", [])]
            question_role = _normalise(original.get("primary_role"))

            company_score = 1.0 if company and any(company in item or item in company for item in companies) else 0.0
            role_score = 1.0 if role and question_role and (role in question_role or question_role in role) else 0.0
            matched_terms = sorted(term for term in expanded_terms if term in searchable)
            skill_score = min(1.0, len(matched_terms) / max(1, min(len(strategy_terms), 3)))
            semantic_score = semantic_scores.get(index, 0.0)
            frequency = int(original.get("duplicate_count", 1) or 1)
            frequency_score = math.log1p(frequency) / math.log1p(max_frequency)

            if not any((company_score, role_score, skill_score, semantic_score)):
                continue

            total = (
                company_score * 0.35
                + role_score * 0.20
                + skill_score * 0.25
                + semantic_score * 0.15
                + frequency_score * 0.05
            )
            reasons: List[str] = []
            layers: List[str] = []
            if company_score:
                reasons.append(f"命中目标公司：{target_company}")
                layers.append("metadata_company")
            if role_score:
                reasons.append(f"匹配目标岗位：{target_role}")
                layers.append("metadata_role")
            if matched_terms:
                reasons.append("匹配 JD 能力：" + "、".join(matched_terms[:4]))
                layers.append("jd_lexical")
            if semantic_score:
                reasons.append("与 JD 要求语义相关")
                layers.append("semantic")
            if frequency > 1:
                reasons.append(f"知识库中出现 {frequency} 次")

            question = dict(original)
            question["competency"] = original.get("competency") or original.get("category") or "综合能力"
            question["question_type"] = original.get("question_type") or original.get("category") or "general"
            question["_retrieval_score"] = round(total * 100, 1)
            question["_score_breakdown"] = {
                "company": round(company_score * 100, 1),
                "role": round(role_score * 100, 1),
                "jd_relevance": round(skill_score * 100, 1),
                "semantic": round(semantic_score * 100, 1),
                "frequency": round(frequency_score * 100, 1),
            }
            question["_retrieval_reasons"] = reasons
            question["_retrieval_layers"] = layers
            ranked.append(question)

        if not ranked:
            # A sparse or unfamiliar JD should still yield useful preparation.
            for original in sorted(
                self.kb_data,
                key=lambda item: int(item.get("duplicate_count", 1) or 1),
                reverse=True,
            )[: max(top_k * 3, 15)]:
                question = dict(original)
                question["competency"] = original.get("category") or "综合能力"
                question["question_type"] = original.get("category") or "general"
                question["_retrieval_score"] = 5.0
                question["_score_breakdown"] = {"fallback": 100.0}
                question["_retrieval_reasons"] = ["知识库高频题兜底"]
                question["_retrieval_layers"] = ["frequency_fallback"]
                ranked.append(question)

        ranked.sort(key=lambda item: item["_retrieval_score"], reverse=True)
        return self._select_diverse_questions(ranked, top_k)

    @staticmethod
    def _select_diverse_questions(ranked: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        selected: List[Dict[str, Any]] = []
        category_counts: Dict[str, int] = {}
        category_cap = max(2, math.ceil(top_k * 0.6))

        # Keep relevance order while preventing one broad category from taking
        # the entire preparation pack.
        for question in ranked:
            category = _normalise(question.get("category") or question.get("question_type"))
            if category and category_counts.get(category, 0) >= category_cap:
                continue
            selected.append(question)
            category_counts[category] = category_counts.get(category, 0) + 1
            if len(selected) >= top_k:
                return selected

        for question in ranked:
            if question not in selected:
                selected.append(question)
            if len(selected) >= top_k:
                break
        return selected
