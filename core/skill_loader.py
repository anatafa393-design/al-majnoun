"""
Skill Loader - Dynamic Python module loading for agent skills.
"""
import os
import json
import importlib
import importlib.util
import time


class SkillLoader:
    def __init__(self, skills_dir, registry_path):
        self.skills_dir = skills_dir
        self.registry_path = registry_path
        self.loaded_skills = {}
        os.makedirs(skills_dir, exist_ok=True)
        self._ensure_registry()

    def _ensure_registry(self):
        if not os.path.exists(self.registry_path):
            with open(self.registry_path, "w", encoding="utf-8") as f:
                json.dump({"skills": {}}, f)

    def load_all(self):
        """Load all registered skills."""
        self.loaded_skills = {}
        registry = self._read_registry()
        for name, meta in registry.get("skills", {}).items():
            try:
                self._load_skill(name, meta)
            except Exception as e:
                print(f"Warning: Failed to load skill '{name}': {e}")
        return self.get_skill_list()

    def _load_skill(self, name, meta):
        """Dynamically load a skill module."""
        filepath = os.path.join(self.skills_dir, meta["filename"])
        if not os.path.exists(filepath):
            return

        spec = importlib.util.spec_from_file_location(f"skills.{name}", filepath)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        self.loaded_skills[name] = {
            "module": module,
            "metadata": meta,
            "execute": getattr(module, "execute", None)
        }

    def register_skill(self, name, filename, description, capabilities):
        """Register a new skill in the registry."""
        registry = self._read_registry()
        registry["skills"][name] = {
            "filename": filename,
            "description": description,
            "capabilities": capabilities,
            "version": 1,
            "created_at": time.time()
        }
        self._write_registry(registry)
        self._load_skill(name, registry["skills"][name])

    def unregister_skill(self, name):
        """Remove a skill from the registry."""
        registry = self._read_registry()
        if name in registry.get("skills", {}):
            # Also remove the file
            filepath = os.path.join(self.skills_dir, registry["skills"][name]["filename"])
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except:
                    pass
            del registry["skills"][name]
            self._write_registry(registry)
        if name in self.loaded_skills:
            del self.loaded_skills[name]

    def get_skill_list(self):
        """Return a summary of all available skills."""
        registry = self._read_registry()
        return {
            name: {
                "description": meta.get("description", ""),
                "capabilities": meta.get("capabilities", []),
                "version": meta.get("version", 1),
                "has_execute": name in self.loaded_skills and self.loaded_skills[name]["execute"] is not None
            }
            for name, meta in registry.get("skills", {}).items()
        }

    def execute_skill(self, name, **kwargs):
        """Execute a loaded skill."""
        if name not in self.loaded_skills:
            return {"status": "error", "result": f"Skill '{name}' not loaded"}

        skill = self.loaded_skills[name]
        if skill["execute"] is None:
            return {"status": "error", "result": f"Skill '{name}' has no execute() function"}

        try:
            result = skill["execute"](**kwargs)
            return {"status": "success", "result": result}
        except Exception as e:
            return {"status": "error", "result": str(e)}

    def get_skill_source(self, name):
        """Read the source code of a skill."""
        registry = self._read_registry()
        if name not in registry.get("skills", {}):
            return None
        filepath = os.path.join(self.skills_dir, registry["skills"][name]["filename"])
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                return f.read()
        return None

    def _read_registry(self):
        try:
            with open(self.registry_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {"skills": {}}

    def _write_registry(self, data):
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
