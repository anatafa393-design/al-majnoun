"""
FastAPI Server for المجنون (Al-Majnoun) - Self-Evolving AI Agent.
Serves the web UI and provides WebSocket for real-time communication.
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
import json
import asyncio
import os
import time

import config
from core.agent import Agent

app = FastAPI(title="المجنون - Self-Evolving AI Agent")

# Initialize agent
agent = Agent()

# Connected WebSocket clients
connected_clients: set = set()


class TaskRequest(BaseModel):
    task: str


class ConfigUpdate(BaseModel):
    api_key: str = None
    model: str = None


@app.get("/")
async def root():
    return FileResponse(os.path.join(config.STATIC_DIR, "index.html"))


@app.get("/api/status")
async def get_status():
    return agent.get_status()


@app.get("/api/skills")
async def get_skills():
    return agent.skill_loader.get_skill_list()


@app.get("/api/skill/{name}/source")
async def get_skill_source(name: str):
    source = agent.skill_loader.get_skill_source(name)
    if source:
        return {"status": "success", "source": source, "name": name}
    return {"status": "error", "message": "Skill not found"}


@app.delete("/api/skill/{name}")
async def delete_skill(name: str):
    agent.skill_loader.unregister_skill(name)
    return {"status": "success", "message": f"Skill '{name}' deleted"}


@app.post("/api/task")
async def submit_task(req: TaskRequest):
    result = await agent.process_task(req.task)
    return {"status": "success", "result": result}


@app.post("/api/config")
async def update_config(update: ConfigUpdate):
    new_cfg = {}
    if update.api_key is not None:
        new_cfg["api_key"] = update.api_key
    if update.model is not None:
        new_cfg["model"] = update.model
    return agent.update_config(new_cfg)


@app.post("/api/reset")
async def reset_agent():
    global agent
    # Clear skills registry
    with open(config.SKILLS_REGISTRY, "w", encoding="utf-8") as f:
        json.dump({"skills": {}}, f)
    # Clear skill files (but not registry)
    for fname in os.listdir(config.SKILLS_DIR):
        if fname.endswith(".py") and fname != "__init__.py":
            try:
                os.remove(os.path.join(config.SKILLS_DIR, fname))
            except:
                pass
    # Clear memory
    if os.path.exists(config.MEMORY_FILE):
        os.remove(config.MEMORY_FILE)
    # Reinitialize
    agent = Agent()
    return {"status": "success", "message": "Agent reset to factory defaults"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)

    # Queue for thread-safe communication
    update_queue = asyncio.Queue()

    def queue_update(entry):
        try:
            update_queue.put_nowait(entry)
        except:
            pass

    agent.set_update_callback(queue_update)

    # Background task to forward queue items to WebSocket
    async def forward_updates():
        while True:
            try:
                entry = await asyncio.wait_for(update_queue.get(), timeout=0.1)
                await ws.send_json(entry)
            except asyncio.TimeoutError:
                continue
            except:
                break

    forward_task = asyncio.create_task(forward_updates())

    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action", "")

            if action == "task":
                task_text = data.get("text", "")
                if task_text.strip():
                    result = await agent.process_task(task_text)
                    # Response is already emitted via callback

            elif action == "config":
                cfg = data.get("config", {})
                result = agent.update_config(cfg)
                await ws.send_json({
                    "type": "config_updated",
                    "data": result,
                    "timestamp": time.time()
                })

            elif action == "status":
                await ws.send_json({
                    "type": "status",
                    "data": agent.get_status(),
                    "timestamp": time.time()
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        forward_task.cancel()
        connected_clients.discard(ws)
        # Reset callback if this was the last client
        if not connected_clients:
            agent.set_update_callback(None)


# Mount static files
app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")

if __name__ == "__main__":
    print("\n" + "="*50)
    print("  المجنون (Al-Majnoun) — Self-Evolving AI Agent")
    print("  http://127.0.0.1:8000")
    print("="*50 + "\n")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
