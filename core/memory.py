"""
Memory module - Persistent conversation and task history.
"""
import json
import os
import time


class Memory:
    def __init__(self, filepath):
        self.filepath = filepath
        self.conversations = []
        self.task_history = []
        self.skill_usage = {}
        self.load()

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.conversations = data.get("conversations", [])
                    self.task_history = data.get("task_history", [])
                    self.skill_usage = data.get("skill_usage", {})
            except:
                pass

    def save(self):
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump({
                "conversations": self.conversations[-100:],
                "task_history": self.task_history[-50:],
                "skill_usage": self.skill_usage,
            }, f, indent=2, ensure_ascii=False)

    def add_message(self, role, content):
        self.conversations.append({
            "role": role,
            "content": content,
            "timestamp": time.time()
        })
        self.save()

    def add_task_result(self, task, result):
        self.task_history.append({
            "task": task,
            "result": result,
            "timestamp": time.time()
        })
        self.save()

    def record_skill_use(self, skill_name):
        self.skill_usage[skill_name] = self.skill_usage.get(skill_name, 0) + 1
        self.save()

    def get_recent_context(self, n=10):
        return self.conversations[-n:]
