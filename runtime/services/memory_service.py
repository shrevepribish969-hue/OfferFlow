
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
                        mi = MemoryService._create_candidate(
                            db,
                            user_id=user_id,
                            source_type="reflection",
                            source_id=reflection_obj.id,
                            category=category,
                            content=item.strip(),
                        )
                        if mi:
                            created.append(mi)
            elif isinstance(value, str) and value.strip():
                mi = MemoryService._create_candidate(
                    db,
                    user_id=user_id,
                    source_type="reflection",
                    source_id=reflection_obj.id,
                    category=category,
                    content=value.strip(),
                )
                if mi:
                    created.append(mi)
        return created

    @staticmethod
    def _create_candidate(db: Session, **values) -> models.MemoryItem | None:
        duplicate = db.query(models.MemoryItem).filter(
            models.MemoryItem.user_id == values["user_id"],
            models.MemoryItem.category == values["category"],
            models.MemoryItem.content == values["content"],
            models.MemoryItem.is_confirmed != -1,
        ).first()
        if duplicate:
            return None
        item = models.MemoryItem(
            **values,
            confidence=0.8,
            scope="global",
            is_confirmed=0,
            is_active=0,
        )
        db.add(item)
        return item

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
            models.MemoryItem.is_confirmed == 1,
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

    @staticmethod
    def list_items(db: Session, user_id: int = 1) -> list[models.MemoryItem]:
        return db.query(models.MemoryItem).filter(
            models.MemoryItem.user_id == user_id,
        ).order_by(models.MemoryItem.created_at.desc(), models.MemoryItem.id.desc()).all()

    @staticmethod
    def review_item(
        db: Session,
        item_id: int,
        action: str,
        content: str | None = None,
        user_id: int = 1,
    ) -> models.MemoryItem | None:
        item = db.query(models.MemoryItem).filter(
            models.MemoryItem.id == item_id,
            models.MemoryItem.user_id == user_id,
        ).first()
        if not item:
            return None
        if action not in {"confirm", "reject"}:
            raise ValueError("action must be confirm or reject")
        if content is not None:
            cleaned = content.strip()
            if not cleaned:
                raise ValueError("memory content cannot be empty")
            item.content = cleaned
        item.is_confirmed = 1 if action == "confirm" else -1
        item.is_active = 1 if action == "confirm" else 0
        db.flush()
        return item
