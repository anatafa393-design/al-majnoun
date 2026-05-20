"""
Self-Coder - The heart of the self-evolving agent.
Generates, validates, and integrates new Python skills at runtime.
"""
import os
import time
import ast
import re
import json


class SelfCoder:
    def __init__(self, brain, skill_loader, executor, skills_dir):
        self.brain = brain
        self.skill_loader = skill_loader
        self.executor = executor
        self.skills_dir = skills_dir

    def create_skill(self, description, name_hint=None, emit=None):
        """Generate a new skill based on description."""
        log = emit or (lambda *a: None)

        # Generate a name
        if not name_hint:
            name_hint = self._generate_name(description)
        name = self._sanitize_name(name_hint)
        filename = f"{name}.py"
        filepath = os.path.join(self.skills_dir, filename)

        # Check if skill already exists
        if os.path.exists(filepath):
            name = name + f"_{int(time.time()) % 10000}"
            filename = f"{name}.py"
            filepath = os.path.join(self.skills_dir, filename)

        # Get existing skills for context
        existing = self.skill_loader.get_skill_list()

        # Check if we need any packages
        log("log", {"message": f"💭 Asking LLM to generate code for: {description}", "level": "info"})

        # Ask the LLM to generate code
        code = self.brain.generate_code(description, existing)
        code = self._clean_code(code)

        if code.startswith("Error"):
            return {"status": "error", "message": f"LLM error: {code}", "code": ""}

        # Validate syntax
        valid, error = self._validate_syntax(code)
        if not valid:
            log("log", {"message": f"⚠️ Syntax error, attempting fix...", "level": "warning"})
            fix_prompt = f"The following Python code has a syntax error:\n{error}\n\nCode:\n{code}\n\nFix the syntax error and return ONLY the corrected Python code, no markdown."
            code = self.brain.think(
                "You are a Python code fixer. Return ONLY valid Python code, no explanations, no markdown fences.",
                fix_prompt
            )
            code = self._clean_code(code)
            valid, error = self._validate_syntax(code)
            if not valid:
                return {
                    "status": "error",
                    "message": f"Generated code has syntax errors even after fix: {error}",
                    "code": code
                }

        # Check for required packages
        required_packages = self._extract_required_packages(code)
        if required_packages:
            log("log", {"message": f"📦 Installing required packages: {required_packages}", "level": "info"})
            for pkg in required_packages:
                install_result = self.executor.install_package(pkg)
                if install_result.get("status") == "error":
                    log("log", {"message": f"⚠️ Failed to install {pkg}: {install_result}", "level": "warning"})

        # Write the skill file
        log("log", {"message": f"💾 Writing skill file: {filename}", "level": "info"})
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(code)

        # Extract capabilities from the code
        capabilities = self._extract_capabilities(code)

        # Register in the skill loader
        self.skill_loader.register_skill(name, filename, description, capabilities)

        log("log", {"message": f"✅ Skill '{name}' created and registered!", "level": "success"})

        return {
            "status": "success",
            "skill_name": name,
            "filename": filename,
            "description": description,
            "capabilities": capabilities,
            "code": code
        }

    def modify_skill(self, name, modification_description):
        """Modify an existing skill."""
        source = self.skill_loader.get_skill_source(name)
        if not source:
            return {"status": "error", "message": f"Skill '{name}' not found"}

        prompt = f"""Modify the following Python skill code based on this instruction:
{modification_description}

Current code:
{source}

Return ONLY the complete modified Python code, no markdown fences."""

        new_code = self.brain.think(
            "You are a Python code modifier. Return ONLY valid Python code, no explanations, no markdown.",
            prompt
        )
        new_code = self._clean_code(new_code)

        valid, error = self._validate_syntax(new_code)
        if not valid:
            return {"status": "error", "message": f"Modified code has syntax errors: {error}"}

        # Get the filepath
        registry = self.skill_loader._read_registry()
        if name not in registry.get("skills", {}):
            return {"status": "error", "message": f"Skill '{name}' not in registry"}

        filepath = os.path.join(self.skills_dir, registry["skills"][name]["filename"])

        # Backup old code
        backup_path = filepath + ".bak"
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(source)

        # Write new code
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_code)

        # Reload skills
        self.skill_loader.load_all()

        return {
            "status": "success",
            "skill_name": name,
            "code": new_code,
            "backup": backup_path
        }

    def modify_core(self, target_file, modification_description):
        """Modify the agent's own core files (advanced self-modification)."""
        core_dir = os.path.dirname(os.path.abspath(__file__))
        filepath = os.path.join(core_dir, target_file)

        if not os.path.exists(filepath):
            return {"status": "error", "message": f"Core file '{target_file}' not found"}

        with open(filepath, "r", encoding="utf-8") as f:
            source = f.read()

        prompt = f"""Modify the following core agent file based on this instruction:
{modification_description}

Current code of {target_file}:
{source}

IMPORTANT: This is a core system file. Be careful.
Return ONLY the complete modified Python code, no markdown."""

        new_code = self.brain.think(
            "You are modifying core system code. Be extremely careful. Return ONLY valid Python code.",
            prompt
        )
        new_code = self._clean_code(new_code)

        valid, error = self._validate_syntax(new_code)
        if not valid:
            return {"status": "error", "message": f"Modified core code has syntax errors: {error}"}

        # Backup
        backup_path = filepath + f".bak.{int(time.time())}"
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(source)

        # Write
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_code)

        return {
            "status": "success",
            "file": target_file,
            "backup": backup_path,
            "message": "Core file modified. Server will auto-reload if running with --reload."
        }

    def _generate_name(self, description):
        """Generate a skill name from its description."""
        response = self.brain.think(
            "Generate a short, snake_case Python function name (2-4 words max) for a skill. Reply with ONLY the name, nothing else. No quotes, no explanation.",
            f"Skill description: {description}"
        )
        return self._sanitize_name(response.strip())

    def _sanitize_name(self, name):
        """Ensure name is valid Python identifier."""
        name = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower().strip())
        name = re.sub(r'_+', '_', name).strip('_')
        if not name or name[0].isdigit():
            name = 'skill_' + name
        return name[:50]

    def _clean_code(self, code):
        """Remove markdown code fences and clean up."""
        code = code.strip()
        # Remove ```python or ``` fences
        if code.startswith("```python"):
            code = code[9:]
        elif code.startswith("```"):
            code = code[3:]
        if code.endswith("```"):
            code = code[:-3]
        return code.strip()

    def _validate_syntax(self, code):
        """Check Python syntax validity."""
        try:
            ast.parse(code)
            return True, None
        except SyntaxError as e:
            return False, str(e)

    def _extract_capabilities(self, code):
        """Extract function names and docstrings as capabilities."""
        try:
            tree = ast.parse(code)
            caps = []
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    doc = ast.get_docstring(node) or ""
                    caps.append(f"{node.name}: {doc[:100]}")
            return caps if caps else ["General capability"]
        except:
            return ["Unknown capability"]

    def _extract_required_packages(self, code):
        """Extract required packages from # requires: comments."""
        packages = []
        for line in code.split("\n"):
            line = line.strip()
            if line.startswith("# requires:"):
                pkgs = line.split(":", 1)[1].strip()
                packages.extend([p.strip() for p in pkgs.split(",")])
        return packages
