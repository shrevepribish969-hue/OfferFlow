
import json
from sqlalchemy.orm import Session
from ..api import models


class MemoryService:
    @staticmethod
    def store_from_reflection(
        reflection_obj: "models.Reflection",
        memory_dict: dict,
        db: Session,
        user_id: int = 1,
    ) -> list[models.MemoryItem]:
        """Create individual MemoryItems from a reflection's memory dict.
        
        memory_dict example: {"weaknesses": [...], "strengths": [...], ...}
        """
        created = []
        for category, value in memory_dict.items():
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        mi = models.MemoryItem(
                            user_id=user_id,
                            source_type="reflection",
                            source_id=reflection_obj.id,
                            category=category,
                            content=item.strip(),
                            confidence=0.8,
                            scope="global",
                        )
                        db.add(mi)
                        created.append(mi)
            elif isinstance(value, str) and value.strip():
                mi = models.MemoryItem(
                    user_id=user_id,
                    source_type="reflection",
                    source_id=reflection_obj.id,
                    category=category,
                    content=value.strip(),
                    confidence=0.8,
                    scope="global",
                )
                db.add(mi)
                created.append(mi)
        return created

    @staticmethod
    def get_context(
        db: Session,
        user_id: int = 1,
        scope: str = "global",
        categories: list[str] | None = None,
    ) -> dict[str, list[str]]:
        """Retrieve active memory items grouped by category."""
        query = db.query(models.MemoryItem).filter(
            models.MemoryItem.user_id == user_id,
            models.MemoryItem.is_active == 1,
        )
        if categories:
            query = query.filter(models.MemoryItem.category.in_(categories))
        if scope:
            query = query.filter(models.MemoryItem.scope == scope)

        items = query.order_by(models.MemoryItem.created_at.desc()).all()
        result = {}
        for item in items:
            result.setdefault(item.category, []).append(item.content)
        return result
