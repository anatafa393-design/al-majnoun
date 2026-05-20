"""
Brain module - LLM interface using Google Gemini API (free tier).
Uses only urllib (no external dependencies for core communication).
"""
import json
import urllib.request
import urllib.parse
import ssl
import time


class Brain:
    def __init__(self, api_key, model="gemini-2.0-flash",
                 api_base="https://generativelanguage.googleapis.com/v1beta"):
        self.api_key = api_key
        self.model = model
        self.api_base = api_base

    def think(self, system_prompt, user_message, context=None):
        """Send a message to the LLM and get a response."""
        if not self.api_key:
            return "Error: API key not configured. Please set your Gemini API key in Settings."

        contents = []
        if context:
            for msg in context:
                role = msg.get("role", "user")
                if role == "assistant":
                    role = "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg["content"]}]
                })

        contents.append({
            "role": "user",
            "parts": [{"text": user_message}]
        })

        payload = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 8192,
            }
        }

        url = f"{self.api_base}/models/{self.model}:generateContent?key={self.api_key}"
        data = json.dumps(payload).encode("utf-8")

        # Create SSL context that works on Windows
        ctx = ssl.create_default_context()

        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "")
                return "Error: No response from LLM"
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            return f"API Error ({e.code}): {body[:500]}"
        except Exception as e:
            return f"Error communicating with LLM: {str(e)}"

    def generate_code(self, task_description, existing_skills):
        """Ask the LLM to generate code for a new skill."""
        skill_names = list(existing_skills.keys()) if isinstance(existing_skills, dict) else existing_skills
        system = f"""You are a code generator for a self-evolving AI agent called المجنون (Al-Majnoun).
You write clean, working Python code.

The agent currently has these skills: {json.dumps(skill_names)}

IMPORTANT RULES:
1. Write ONLY the Python code, no explanations, no markdown fences
2. Include a module-level docstring describing what the skill does
3. Include a main function called `execute(**kwargs)` that is the entry point
4. Handle errors gracefully with try/except
5. Import only standard library modules OR commonly available packages
6. The code must be self-contained and runnable
7. The execute() function must return a dictionary with 'status' and 'result' keys
8. If the skill needs an external package, include a comment at the top: # requires: package_name"""

        return self.think(system, f"Write Python code for this capability:\n{task_description}")

    def plan_task(self, task, available_skills):
        """Ask the LLM to plan how to execute a task."""
        system = """You are the planning module of a self-evolving AI agent.
Given a task and available skills, create an execution plan.

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no code fences, ONLY raw JSON):
{
    "analysis": "Brief analysis of the task",
    "can_execute": true or false,
    "needs_direct_response": true or false,
    "plan": [
        {"step": 1, "action": "use_skill", "skill": "skill_name", "params": {}},
        {"step": 2, "action": "create_skill", "description": "what the new skill should do", "name_hint": "skill_name"}
    ],
    "missing_capabilities": ["list of capabilities needed but not available"]
}

Rules:
- If the task is a simple conversation/question, set needs_direct_response=true and plan=[]
- If the task requires code execution or a specific capability, plan it out
- action can be: use_skill, create_skill, execute_code, install_package
- RESPOND WITH ONLY VALID JSON"""

        msg = f"""Task: {task}

Available Skills:
{json.dumps(available_skills, indent=2, default=str)}

Plan this task execution."""

        response = self.think(system, msg)

        # Try to parse JSON from response
        try:
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
                clean = clean.rsplit("```", 1)[0]
            if clean.startswith("json"):
                clean = clean[4:]
            return json.loads(clean.strip())
        except:
            return {
                "analysis": response,
                "can_execute": False,
                "needs_direct_response": True,
                "plan": [],
                "missing_capabilities": []
            }
