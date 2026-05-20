"""
Executor module - Safe code execution in subprocess.
"""
import subprocess
import sys
import os
import json
import time


class Executor:
    def __init__(self, workspace_dir, python_path=None):
        self.workspace = workspace_dir
        self.python = python_path or sys.executable
        os.makedirs(workspace_dir, exist_ok=True)

    def run_code(self, code, timeout=30):
        """Execute Python code in a subprocess and return results."""
        script_path = os.path.join(self.workspace, f"_exec_{int(time.time() * 1000)}.py")

        # Wrap code to capture output as JSON
        wrapped = f"""import json, sys, os, traceback
try:
    # === User Code Start ===
{_indent(code, 4)}
    # === User Code End ===

    # If there's an execute function, call it
    if 'execute' in dir():
        _result = execute()
        if isinstance(_result, dict):
            print("__AGENT_RESULT__" + json.dumps(_result))
        else:
            print("__AGENT_RESULT__" + json.dumps({{"status": "success", "result": str(_result)}}))
    else:
        print("__AGENT_RESULT__" + json.dumps({{"status": "success", "result": "Code executed successfully"}}))
except Exception as e:
    print("__AGENT_RESULT__" + json.dumps({{"status": "error", "result": f"{{type(e).__name__}}: {{str(e)}}", "traceback": traceback.format_exc()}}))
"""

        try:
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(wrapped)

            result = subprocess.run(
                [self.python, script_path],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.workspace
            )

            output = result.stdout
            stderr = result.stderr

            # Extract structured result
            for line in output.split("\n"):
                if line.startswith("__AGENT_RESULT__"):
                    try:
                        return json.loads(line[16:])
                    except:
                        pass

            return {
                "status": "success" if result.returncode == 0 else "error",
                "result": output if result.returncode == 0 else stderr,
                "stdout": output,
                "stderr": stderr
            }
        except subprocess.TimeoutExpired:
            return {"status": "error", "result": f"Execution timed out after {timeout}s"}
        except Exception as e:
            return {"status": "error", "result": str(e)}
        finally:
            try:
                if os.path.exists(script_path):
                    os.remove(script_path)
            except:
                pass

    def run_command(self, command, timeout=60):
        """Execute a shell command."""
        try:
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True,
                timeout=timeout, cwd=self.workspace
            )
            return {
                "status": "success" if result.returncode == 0 else "error",
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"status": "error", "result": f"Command timed out after {timeout}s"}
        except Exception as e:
            return {"status": "error", "result": str(e)}

    def install_package(self, package_name):
        """Install a Python package via pip."""
        return self.run_command(
            f'"{self.python}" -m pip install {package_name}',
            timeout=120
        )


def _indent(code, spaces=4):
    """Indent each line of code."""
    prefix = " " * spaces
    return "\n".join(prefix + line for line in code.split("\n"))
