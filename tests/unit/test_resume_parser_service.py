import json
import copy
import unittest

from runtime.services.resume_parser_service import (
    ResumeParseError,
    normalize_resume_schema,
    parse_resume_to_json,
    quality_check_resume,
)


STANDARD_RESUME = {
    "schema_version": "1.2",
    "personal_info": {
        "name": "张三",
        "contact": "138-0000-0000 | name@example.com",
        "job_intention": "产品经理",
        "availability": "可协商",
        "preferred_locations": ["上海", "远程"],
        "summary": "",
    },
    "personal_strengths": ["具备扎实的业务理解能力。", "学习能力强。"],
    "education": [{"school": "学校名称", "degree": "本科", "date": "2022.09 - 2026.06", "major": "专业名称"}],
    "work_experience": [
        {
            "company": "公司名称",
            "role": "产品实习生",
            "date": "2025.06 - 2025.09",
            "descriptions": ["参与核心业务模块的需求梳理。"],
        }
    ],
    "project_experience": [
        {
            "project": "项目名称",
            "role": "负责人",
            "date": "2025.03 - 2025.06",
            "descriptions": ["完成需求分析。"],
        }
    ],
    "campus_experience": [],
    "skills": ["Python", "数据分析"],
    "awards_certificates": [],
    "custom_sections": [],
    "document_notes": [],
}


class ResumeParserServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_standard_single_column_resume(self):
        async def llm_call(_prompt, _text):
            return json.dumps(STANDARD_RESUME, ensure_ascii=False)

        result = json.loads(await parse_resume_to_json(
            "张三\n教育经历\n工作经历\n项目经历\n技能",
            api_key="test",
            base_url="http://example.com",
            model_name="test-model",
            llm_call=llm_call,
        ))

        self.assertEqual(result["schema_version"], "1.2")
        self.assertEqual(result["education"][0]["school"], "学校名称")
        self.assertEqual(result["work_experience"][0]["company"], "公司名称")
        self.assertEqual(result["project_experience"][0]["project"], "项目名称")
        self.assertEqual(result["skills"], ["Python", "数据分析"])

    async def test_resume_with_campus_experience_and_strengths(self):
        parsed = copy.deepcopy(STANDARD_RESUME)
        parsed["personal_strengths"] = ["跨团队沟通能力强。", "能够拆解复杂问题。"]
        parsed["campus_experience"] = [
            {
                "organization": "学生会",
                "role": "宣传部成员",
                "date": "2023.09 - 2024.06",
                "descriptions": ["负责活动宣传物料整理。", "协调班级同学完成现场签到。"],
            }
        ]

        async def llm_call(_prompt, _text):
            return json.dumps(parsed, ensure_ascii=False)

        result = json.loads(await parse_resume_to_json(
            "个人优势\n学生会\n负责活动宣传物料整理。\n协调班级同学完成现场签到。",
            api_key="test",
            base_url="http://example.com",
            model_name="test-model",
            llm_call=llm_call,
        ))

        self.assertEqual(result["personal_strengths"], ["跨团队沟通能力强。", "能够拆解复杂问题。"])
        self.assertEqual(result["campus_experience"][0]["organization"], "学生会")
        self.assertEqual(len(result["campus_experience"][0]["descriptions"]), 2)

    async def test_empty_section_and_template_notes(self):
        parsed = copy.deepcopy(STANDARD_RESUME)
        parsed["skills"] = ["请按实际情况替换。"]
        parsed["document_notes"] = ["技能证书为空，可删除或补充。"]

        async def llm_call(_prompt, _text):
            return json.dumps(parsed, ensure_ascii=False)

        result = json.loads(await parse_resume_to_json(
            "技能证书\n请按实际情况替换。",
            api_key="test",
            base_url="http://example.com",
            model_name="test-model",
            llm_call=llm_call,
        ))

        self.assertEqual(result["skills"], [])
        self.assertIn("技能证书为空，可删除或补充。", result["document_notes"])
        self.assertIn("请按实际情况替换。", result["document_notes"])

    async def test_invalid_model_json_fails(self):
        async def llm_call(_prompt, _text):
            return "not json"

        with self.assertRaises(ResumeParseError) as ctx:
            await parse_resume_to_json(
                "张三\n教育经历",
                api_key="test",
                base_url="http://example.com",
                model_name="test-model",
                llm_call=llm_call,
            )
        self.assertEqual(ctx.exception.error_code, "INVALID_MODEL_JSON")

    async def test_model_request_failure_fails_without_fallback(self):
        async def llm_call(_prompt, _text):
            raise RuntimeError("network down")

        with self.assertRaises(ResumeParseError) as ctx:
            await parse_resume_to_json(
                "张三\n教育经历",
                api_key="test",
                base_url="http://example.com",
                model_name="test-model",
                llm_call=llm_call,
            )
        self.assertEqual(ctx.exception.error_code, "MODEL_CALL_FAILED")

    def test_legacy_json_compatibility_read(self):
        legacy = {
            "personal_info": {"name": "李四", "contact": "lisi@example.com", "summary": "求职意向：数据分析\n到岗时间：立即\n期望地点：北京 / 上海"},
            "education": [],
            "work_experience": [],
            "project_experience": [],
            "skills": ["SQL"],
            "others": ["校级奖学金"],
        }

        result = normalize_resume_schema(json.dumps(legacy, ensure_ascii=False))

        self.assertEqual(result["schema_version"], "1.2")
        self.assertEqual(result["personal_info"]["job_intention"], "数据分析")
        self.assertEqual(result["personal_info"]["availability"], "立即")
        self.assertEqual(result["personal_info"]["preferred_locations"], ["北京", "上海"])
        self.assertEqual(result["custom_sections"][0]["section_type"], "legacy_others")

    def test_quality_check_rejects_merged_section_titles(self):
        bad = copy.deepcopy(STANDARD_RESUME)
        bad["work_experience"] = [
            {
                "company": "公司",
                "role": "实习生",
                "date": "2025",
                "descriptions": ["教育经历\n学校\n项目经历\n项目"],
            }
        ]

        with self.assertRaises(ResumeParseError) as ctx:
            quality_check_resume(bad, "教育经历\n项目经历")
        self.assertEqual(ctx.exception.error_code, "LOW_QUALITY_PARSE")


if __name__ == "__main__":
    unittest.main()
