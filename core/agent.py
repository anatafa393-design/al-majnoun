"""
Agent Orchestrator - The main brain of the self-evolving AI agent.
Receives tasks, plans execution, creates skills when needed, executes plans.
"""
import json
import time
import os
import sys

# Add parent directory to path so we can import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.brain import Brain
from core.memory import Memory
from core.executor import Executor
from core.skill_loader import SkillLoader
from core.self_coder import SelfCoder
import config


class Agent:
    def __init__(self, cfg=None):
        self.cfg = cfg or config.load_config()
        self.version = "2.0.0"
        self.state = "idle"  # idle, thinking, coding, executing
        self.activity_log = []

        # Initialize components
        self.brain = Brain(
            api_key=self.cfg.get("api_key", ""),
            model=self.cfg.get("model", "gemini-2.0-flash"),
            api_base=self.cfg.get("api_base", "https://generativelanguage.googleapis.com/v1beta")
        )
        self.memory = Memory(config.MEMORY_FILE)
        self.executor = Executor(config.WORKSPACE_DIR, python_path=sys.executable)
        self.skill_loader = SkillLoader(config.SKILLS_DIR, config.SKILLS_REGISTRY)
        self.self_coder = SelfCoder(
            self.brain, self.skill_loader, self.executor, config.SKILLS_DIR
        )

        # Load existing skills
        self.skill_loader.load_all()

        # Event callback for real-time updates
        self._on_update = None

    def set_update_callback(self, callback):
        self._on_update = callback

    def _emit(self, event_type, data):
        """Emit a real-time update."""
        entry = {
            "type": event_type,
            "data": data,
            "timestamp": time.time()
        }
        self.activity_log.append(entry)
        if len(self.activity_log) > 200:
            self.activity_log = self.activity_log[-200:]
        if self._on_update:
            try:
                self._on_update(entry)
            except:
                pass

    async def process_task(self, task_text):
        """Main entry point: process a user's task."""
        self.state = "thinking"
        self._emit("state_change", {"state": "thinking"})
        self._emit("log", {"message": f"📥 تم استلام المهمة: {task_text}", "level": "info"})

        # Save to memory
        self.memory.add_message("user", task_text)

        # Check API key
        if not self.cfg.get("api_key"):
            self.state = "idle"
            self._emit("state_change", {"state": "idle"})
            msg = "⚠️ مفتاح API غير مُعَدّ. الرجاء إدخال مفتاح Gemini API من الإعدادات."
            self._emit("response", {"text": msg})
            return msg

        # Get available skills
        skills = self.skill_loader.get_skill_list()
        self._emit("log", {"message": f"🧰 المهارات المتاحة: {len(skills)}", "level": "info"})

        # Plan the task
        self._emit("log", {"message": "🧠 جاري التخطيط لتنفيذ المهمة...", "level": "info"})
        plan = self.brain.plan_task(task_text, skills)
        self._emit("plan", {"plan": plan})
        self._emit("log", {"message": f"📋 التحليل: {plan.get('analysis', 'N/A')}", "level": "info"})

        # If it's a simple conversation, respond directly
        if plan.get("needs_direct_response", False) and not plan.get("plan"):
            self._emit("log", {"message": "💬 رد مباشر...", "level": "info"})
            context = self.memory.get_recent_context()
            response = self.brain.think(self._get_system_prompt(), task_text, context)
            self.state = "idle"
            self._emit("state_change", {"state": "idle"})
            self.memory.add_message("assistant", response)
            self._emit("response", {"text": response})
            self._emit("log", {"message": "✅ اكتملت المهمة", "level": "success"})
            return response

        # Check if we need new skills
        missing = plan.get("missing_capabilities", [])
        steps_needing_skills = [s for s in plan.get("plan", []) if s.get("action") == "create_skill"]

        if missing or steps_needing_skills:
            self.state = "coding"
            self._emit("state_change", {"state": "coding"})

            # Create skills for missing capabilities
            all_to_create = []
            for step in steps_needing_skills:
                all_to_create.append({
                    "description": step.get("description", ""),
                    "name_hint": step.get("name_hint")
                })
            for cap in missing:
                if not any(cap in s.get("description", "") for s in all_to_create):
                    all_to_create.append({"description": cap, "name_hint": None})

            for skill_req in all_to_create:
                self._emit("log", {
                    "message": f"🔧 إنشاء مهارة جديدة: {skill_req['description']}",
                    "level": "info"
                })
                result = self.self_coder.create_skill(
                    skill_req["description"],
                    name_hint=skill_req.get("name_hint"),
                    emit=self._emit
                )
                self._emit("skill_created", result)

                if result["status"] == "success":
                    self._emit("log", {
                        "message": f"✅ تم إنشاء المهارة: {result['skill_name']}",
                        "level": "success"
                    })
                else:
                    self._emit("log", {
                        "message": f"❌ فشل إنشاء المهارة: {result.get('message', 'خطأ')}",
                        "level": "error"
                    })

            # Re-plan with new skills
            skills = self.skill_loader.get_skill_list()
            plan = self.brain.plan_task(task_text, skills)

        # Execute the plan
        self.state = "executing"
        self._emit("state_change", {"state": "executing"})

        results = []
        for step in plan.get("plan", []):
            action = step.get("action", "")

            if action == "use_skill":
                skill_name = step.get("skill", "")
                params = step.get("params", {})
                self._emit("log", {
                    "message": f"⚡ تنفيذ المهارة: {skill_name}",
                    "level": "info"
                })
                result = self.skill_loader.execute_skill(skill_name, **params)
                results.append(result)
                self.memory.record_skill_use(skill_name)

            elif action == "create_skill":
                desc = step.get("description", "")
                hint = step.get("name_hint")
                self._emit("log", {
                    "message": f"🔧 إنشاء مهارة: {desc}",
                    "level": "info"
                })
                result = self.self_coder.create_skill(desc, name_hint=hint, emit=self._emit)
                if result["status"] == "success":
                    exec_result = self.skill_loader.execute_skill(result["skill_name"])
                    results.append(exec_result)
                else:
                    results.append(result)

            elif action == "execute_code":
                code = step.get("code", "")
                self._emit("log", {"message": "⚡ تنفيذ كود...", "level": "info"})
                result = self.executor.run_code(code)
                results.append(result)

            elif action == "install_package":
                pkg = step.get("package", "")
                self._emit("log", {"message": f"📦 تثبيت: {pkg}", "level": "info"})
                result = self.executor.install_package(pkg)
                results.append(result)

        # If no plan steps were executed, get a direct LLM response
        if not results:
            self._emit("log", {"message": "💬 إنشاء رد مباشر...", "level": "info"})
            context = self.memory.get_recent_context()
            response = self.brain.think(self._get_system_prompt(), task_text, context)
            results.append({"status": "success", "result": response})

        # Compile final response
        self.state = "idle"
        self._emit("state_change", {"state": "idle"})

        final = self._compile_response(task_text, results)
        self.memory.add_message("assistant", final)
        self.memory.add_task_result(task_text, final[:500])

        self._emit("log", {"message": "✅ اكتملت المهمة", "level": "success"})
        self._emit("response", {"text": final})

        return final

    def _compile_response(self, task, results):
        """Compile results into a final response."""
        if len(results) == 1:
            r = results[0]
            result = r.get("result", "Done")
            if isinstance(result, dict):
                return json.dumps(result, ensure_ascii=False, indent=2)
            return str(result)

        parts = []
        for i, r in enumerate(results):
            status = r.get("status", "unknown")
            result = r.get("result", "No result")
            if isinstance(result, dict):
                result = json.dumps(result, ensure_ascii=False)
            parts.append(f"**الخطوة {i+1}** [{status}]: {result}")

        return "\n\n".join(parts)

    def _get_system_prompt(self):
        skills = self.skill_loader.get_skill_list()
        skill_list = "\n".join([
            f"  - {name}: {info.get('description', 'N/A')}"
            for name, info in skills.items()
        ]) or "  (لا توجد مهارات بعد)"

        return f"""أنت المجنون (Al-Majnoun)، وكيل ذكاء اصطناعي ذاتي التطور.
أنت قوي جداً وقادر على:
1. فهم وتنفيذ المهام المعقدة
2. كتابة كود Python وإنشاء مهارات جديدة لنفسك
3. تثبيت المكتبات واستخدام APIs
4. تعديل الكود المصدري الخاص بك لاكتساب قدرات جديدة
5. التعلم من التجارب السابقة

المهارات المتاحة حالياً ({len(skills)}):
{skill_list}

قواعد الرد:
- كن مفيداً وشاملاً
- إذا احتجت قدرة غير متاحة، اذكر ذلك وسيتم إنشاؤها
- رد بنفس لغة المستخدم
- كن مبدعاً وحيلتك واسعة
- أنت لا تعرف المستحيل"""

    def get_status(self):
        return {
            "version": self.version,
            "state": self.state,
            "skills_count": len(self.skill_loader.get_skill_list()),
            "skills": self.skill_loader.get_skill_list(),
            "memory_size": len(self.memory.conversations),
            "activity_log": self.activity_log[-20:],
            "api_configured": bool(self.cfg.get("api_key"))
        }

    def update_config(self, new_cfg):
        """Update agent configuration."""
        self.cfg.update(new_cfg)
        config.save_config(self.cfg)
        # Reinitialize brain with new config
        self.brain = Brain(
            api_key=self.cfg.get("api_key", ""),
            model=self.cfg.get("model", "gemini-2.0-flash"),
            api_base=self.cfg.get("api_base", "https://generativelanguage.googleapis.com/v1beta")
        )
        return {"status": "success", "message": "Configuration updated"}
