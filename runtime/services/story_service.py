import json
import os
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv
from runtime.api import models

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

class StoryService:
    @staticmethod
    async def parse_resume_to_stories(db_session, user_id: int) -> dict:
        """
        Parses a user's resume into a global Story Bank (StoryCards).
        """
        profile = db_session.query(models.UserProfile).filter(models.UserProfile.id == user_id).first()
        if not profile or not profile.base_resume:
            return {"error": "User profile or resume not found."}

        # Prepare prompt (inline for now, or load from Prompts dir)
        system_prompt = """
        You are an expert AI Career Coach. Your task is to analyze the user's resume and extract distinct "Projects" or "Experiences" into a structured Story Bank.
        For each major project or work experience, extract:
        1. project_name: A short, memorable name for this story.
        2. summary: A 2-3 sentence overview of what the user achieved.
        3. competency_tags: A list of 3-5 core competencies demonstrated (e.g., ["Product Design", "Data Analysis", "Prompt Engineering"]).
        4. star_details: A JSON object containing exactly {"Situation": "...", "Task": "...", "Action": "...", "Result": "..."}.
        
        Output strictly in this JSON format:
        {
            "story_cards": [
                {
                    "project_name": "string",
                    "summary": "string",
                    "competency_tags": ["string"],
                    "star_details": {"Situation": "string", "Task": "string", "Action": "string", "Result": "string"}
                }
            ]
        }
        """

        client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
        try:
            resume_text = profile.base_resume
            if isinstance(resume_text, dict):
                resume_text = json.dumps(resume_text, ensure_ascii=False)
                
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Resume:\n{resume_text}"}
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content
            
            # JSON clean
            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            if json_match:
                raw = json_match.group(0)
            
            data = json.loads(raw)
            cards = data.get("story_cards", [])
            
            # Save to Database
            # First, optionally clear old stories for this user, or just append (append for now)
            # db_session.query(models.StoryCard).filter(models.StoryCard.user_id == user_id).delete()
            
            inserted = 0
            for card in cards:
                new_card = models.StoryCard(
                    user_id=user_id,
                    project_name=card.get("project_name", "Unknown"),
                    summary=card.get("summary", ""),
                    competency_tags=card.get("competency_tags", []),
                    star_details=card.get("star_details", {}),
                    performance_score=0
                )
                db_session.add(new_card)
                inserted += 1
                
            db_session.commit()
            return {"status": "success", "inserted_cards": inserted, "data": cards}
            
        except Exception as e:
            return {"error": str(e)}
