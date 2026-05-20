"""
Configuration for the Self-Evolving AI Agent.
"""
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.join(BASE_DIR, "core")
SKILLS_DIR = os.path.join(BASE_DIR, "skills")
WORKSPACE_DIR = os.path.join(BASE_DIR, "workspace")
LOGS_DIR = os.path.join(BASE_DIR, "logs")
STATIC_DIR = os.path.join(BASE_DIR, "static")
MEMORY_FILE = os.path.join(BASE_DIR, "memory.json")
SKILLS_REGISTRY = os.path.join(SKILLS_DIR, "_registry.json")
CONFIG_FILE = os.path.join(BASE_DIR, "agent_config.json")

# Create directories
for d in [CORE_DIR, SKILLS_DIR, WORKSPACE_DIR, LOGS_DIR, STATIC_DIR]:
    os.makedirs(d, exist_ok=True)

def load_config():
    defaults = {
        "api_key": "",
        "model": "gemini-2.0-flash",
        "api_base": "https://generativelanguage.googleapis.com/v1beta",
        "max_retries": 3,
        "timeout": 60,
        "max_skill_size_kb": 50,
        "allow_self_modify": True,
        "allow_pip_install": True,
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                defaults.update(saved)
        except:
            pass
    return defaults

def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
