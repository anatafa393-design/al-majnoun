/**
 * Client-Side Controller for Al-Majnoun AI Agent.
 */

class AgentDashboard {
    constructor() {
        this.ws = null;
        this.config = { api_key: "", model: "gemini-2.0-flash" };
        this.skills = {};
        this.currentTaskText = "";
        
        // DOM Elements
        this.chatMessages = document.getElementById("chat-messages");
        this.chatInput = document.getElementById("chat-input");
        this.btnSend = document.getElementById("btn-send");
        this.btnReset = document.getElementById("btn-reset");
        this.btnSettingsOpen = document.getElementById("btn-settings-open");
        this.btnSettingsClose = document.getElementById("btn-settings-close");
        this.btnSettingsSave = document.getElementById("btn-settings-save");
        this.settingsModal = document.getElementById("settings-modal");
        this.apiKeyInput = document.getElementById("api-key-input");
        this.btnToggleApiKey = document.getElementById("btn-toggle-api-key");
        this.modelSelect = document.getElementById("model-select");
        this.stateIndicator = document.getElementById("state-indicator");
        this.sysStateText = document.getElementById("sys-state");
        this.sysVersion = document.getElementById("sys-version");
        this.skillsCount = document.getElementById("skills-count");
        this.skillsBadge = document.getElementById("skills-badge");
        this.skillsList = document.getElementById("skills-list");
        this.terminalLogs = document.getElementById("terminal-logs");
        
        // Code Viewer Modal Elements
        this.codeModal = document.getElementById("code-modal");
        this.codeModalTitle = document.getElementById("code-modal-title");
        this.codeModalDesc = document.getElementById("code-modal-desc");
        this.codeModalBody = document.getElementById("code-modal-body");
        this.btnCodeClose = document.getElementById("btn-code-close");

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStatus();
        this.connectWebSocket();
    }

    setupEventListeners() {
        // Chat events
        this.btnSend.addEventListener("click", () => this.sendTask());
        this.chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.sendTask();
        });

        // Reset agent
        this.btnReset.addEventListener("click", () => this.resetAgent());

        // Settings modal events
        this.btnSettingsOpen.addEventListener("click", () => this.openSettings());
        this.btnSettingsClose.addEventListener("click", () => this.closeSettings());
        this.btnSettingsSave.addEventListener("click", () => this.saveSettings());
        this.btnToggleApiKey.addEventListener("click", () => this.toggleApiKeyVisibility());

        // Code modal close
        this.btnCodeClose.addEventListener("click", () => this.closeCodeModal());

        // Close modal on escape
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.closeSettings();
                this.closeCodeModal();
            }
        });
    }

    async loadStatus() {
        try {
            const resp = await fetch("/api/status");
            const data = await resp.json();
            this.updateSystemStatus(data);
            this.loadSkills();
        } catch (e) {
            this.logToTerminal("⚠️ فشل الاتصال بالخادم للحصول على الحالة.", "error");
        }
    }

    async loadSkills() {
        try {
            const resp = await fetch("/api/skills");
            const skills = await resp.json();
            this.skills = skills;
            this.renderSkillsList(skills);
        } catch (e) {
            console.error("Failed to load skills", e);
        }
    }

    connectWebSocket() {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        this.ws = new WebSocket(`${proto}//${host}/ws`);

        this.ws.onopen = () => {
            this.logToTerminal("⚡ متصل بقناة البث المباشر (WebSocket)", "success");
            this.ws.send(JSON.stringify({ action: "status" }));
        };

        this.ws.onclose = () => {
            this.logToTerminal("❌ انقطع اتصال قناة البث. جاري إعادة الاتصال بعد 3 ثوانٍ...", "error");
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = (e) => {
            console.error("WS Error", e);
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleWebSocketMessage(msg);
        };
    }

    handleWebSocketMessage(msg) {
        const { type, data } = msg;

        switch (type) {
            case "state_change":
                this.updateAgentState(data.state);
                break;
            case "log":
                this.logToTerminal(data.message, data.level);
                break;
            case "response":
                this.removeTypingIndicator();
                this.appendMessage("agent", data.text);
                break;
            case "skill_created":
                this.loadSkills();
                break;
            case "status":
                this.updateSystemStatus(data);
                break;
            case "config_updated":
                this.logToTerminal(`⚙️ ${data.message}`, "info");
                break;
        }
    }

    updateSystemStatus(data) {
        this.sysVersion.innerText = `v${data.version || "2.0.0"}`;
        this.updateAgentState(data.state || "idle");
        this.skillsCount.innerText = data.skills_count || 0;
        this.skillsBadge.innerText = `${data.skills_count || 0} مهارات`;
    }

    updateAgentState(state) {
        // State text translation
        const stateTranslations = {
            "idle": "مستعد",
            "thinking": "يفكر 🧠",
            "coding": "يبرمج 🔧",
            "executing": "ينفذ ⚡"
        };
        
        this.sysStateText.innerText = stateTranslations[state] || state;
        
        // Reset classes
        this.sysStateText.className = "value";
        this.stateIndicator.className = "glow-dot pulsating";

        if (state === "idle") {
            this.sysStateText.classList.add("state-idle");
            this.stateIndicator.style.backgroundColor = "var(--neon-cyan)";
            this.stateIndicator.style.boxShadow = "0 0 12px var(--neon-cyan)";
        } else if (state === "thinking") {
            this.sysStateText.classList.add("state-thinking");
            this.stateIndicator.style.backgroundColor = "var(--neon-violet)";
            this.stateIndicator.style.boxShadow = "0 0 12px var(--neon-violet)";
        } else if (state === "coding") {
            this.sysStateText.classList.add("state-coding");
            this.stateIndicator.style.backgroundColor = "var(--emerald-pulse)";
            this.stateIndicator.style.boxShadow = "0 0 12px var(--emerald-pulse)";
        } else if (state === "executing") {
            this.sysStateText.classList.add("state-executing");
            this.stateIndicator.style.backgroundColor = "var(--amber-pulse)";
            this.stateIndicator.style.boxShadow = "0 0 12px var(--amber-pulse)";
        }
    }

    sendTask() {
        const text = this.chatInput.value.trim();
        if (!text) return;

        this.appendMessage("user", text);
        this.chatInput.value = "";
        
        this.showTypingIndicator();

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                action: "task",
                text: text
            }));
        } else {
            this.removeTypingIndicator();
            this.appendMessage("agent", "⚠️ خطأ: غير متصل بالخادم حالياً. يرجى الانتظار لإعادة الاتصال.");
        }
    }

    appendMessage(role, text) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message message-${role}`;
        
        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.innerText = role === "user" ? "👤" : "🧠";

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";
        bubble.innerHTML = this.formatMarkdown(text);

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        this.chatMessages.appendChild(msgDiv);
        this.scrollToBottom(this.chatMessages);
    }

    showTypingIndicator() {
        this.removeTypingIndicator();

        const indicator = document.createElement("div");
        indicator.id = "typing-indicator";
        indicator.className = "message message-agent";
        
        const avatar = document.createElement("div");
        avatar.className = "msg-avatar";
        avatar.innerText = "🧠";

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble typing-bubble";
        bubble.innerHTML = "<span></span><span></span><span></span>";

        indicator.appendChild(avatar);
        indicator.appendChild(bubble);
        this.chatMessages.appendChild(indicator);
        this.scrollToBottom(this.chatMessages);
    }

    removeTypingIndicator() {
        const ind = document.getElementById("typing-indicator");
        if (ind) ind.remove();
    }

    logToTerminal(message, level = "info") {
        const entry = document.createElement("div");
        entry.className = `log-entry ${level}-msg`;
        
        const timeStr = new Date().toLocaleTimeString();
        entry.innerText = `[${timeStr}] ${message}`;

        this.terminalLogs.appendChild(entry);
        
        // Remove oldest if > 100 logs
        while (this.terminalLogs.children.length > 100) {
            this.terminalLogs.removeChild(this.terminalLogs.firstChild);
        }
        
        this.scrollToBottom(this.terminalLogs);
    }

    renderSkillsList(skills) {
        this.skillsList.innerHTML = "";
        const keys = Object.keys(skills);

        if (keys.length === 0) {
            this.skillsList.innerHTML = '<div class="no-skills">لا توجد مهارات برمجية بعد. اطلب مهمة جديدة ليبني أول مهارة!</div>';
            return;
        }

        keys.forEach(name => {
            const skill = skills[name];
            
            const card = document.createElement("div");
            card.className = "skill-card";
            
            const info = document.createElement("div");
            info.className = "skill-info";
            info.addEventListener("click", () => this.viewSkillSource(name, skill));

            const nameEl = document.createElement("span");
            nameEl.className = "skill-name";
            nameEl.innerText = `⚙️ ${name}`;

            const descEl = document.createElement("span");
            descEl.className = "skill-description";
            descEl.innerText = skill.description || "لا يوجد وصف لهذه المهارة.";

            info.appendChild(nameEl);
            info.appendChild(descEl);

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn-delete-skill";
            deleteBtn.innerHTML = "🗑️";
            deleteBtn.title = "حذف المهارة";
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.deleteSkill(name);
            });

            card.appendChild(info);
            card.appendChild(deleteBtn);
            this.skillsList.appendChild(card);
        });
    }

    async viewSkillSource(name, skill) {
        try {
            const resp = await fetch(`/api/skill/${name}/source`);
            const data = await resp.json();
            
            if (data.status === "success") {
                this.codeModalTitle.innerText = `⚙️ مهارة: ${name}.py`;
                this.codeModalDesc.innerText = skill.description || "";
                this.codeModalBody.innerText = data.source;
                this.codeModal.classList.add("active");
            } else {
                alert(`فشل تحميل كود المهارة: ${data.message}`);
            }
        } catch (e) {
            alert("خطأ أثناء الاتصال بالخادم.");
        }
    }

    closeCodeModal() {
        this.codeModal.classList.remove("active");
    }

    async deleteSkill(name) {
        if (!confirm(`هل أنت متأكد من حذف المهارة '${name}'؟`)) return;

        try {
            const resp = await fetch(`/api/skill/${name}`, { method: "DELETE" });
            const data = await resp.json();
            if (data.status === "success") {
                this.logToTerminal(`🗑️ تم حذف المهارة: ${name}`, "warning");
                this.loadSkills();
            } else {
                alert(`فشل حذف المهارة: ${data.message}`);
            }
        } catch (e) {
            alert("خطأ أثناء الاتصال بالخادم.");
        }
    }

    async resetAgent() {
        if (!confirm("⚠️ هل أنت متأكد من إعادة ضبط المصنع؟ سيتم حذف جميع المهارات والذاكرة البرمجية!")) return;

        try {
            const resp = await fetch("/api/reset", { method: "POST" });
            const data = await resp.json();
            if (data.status === "success") {
                this.logToTerminal("🔄 تم إعادة ضبط المصنع للوكيل بنجاح.", "warning");
                this.chatMessages.innerHTML = `
                    <div class="message message-agent">
                        <div class="msg-avatar">🧠</div>
                        <div class="msg-bubble">
                            <p>تمت إعادة التعيين بنجاح. ذاكرتي ومخزن مهاراتي فارغ الآن!</p>
                        </div>
                    </div>
                `;
                this.loadStatus();
            }
        } catch (e) {
            alert("خطأ في الاتصال أثناء إعادة ضبط الوكيل.");
        }
    }

    // Settings Modal Handlers
    async openSettings() {
        try {
            const resp = await fetch("/api/status");
            const data = await resp.json();
            this.config.model = data.model || "gemini-2.0-flash";
            this.modelSelect.value = this.config.model;
        } catch (e) {}

        this.settingsModal.classList.add("active");
    }

    closeSettings() {
        this.settingsModal.classList.remove("active");
    }

    async saveSettings() {
        const apiKey = this.apiKeyInput.value.trim();
        const model = this.modelSelect.value;

        const payload = { model };
        if (apiKey) {
            payload.api_key = apiKey;
        }

        try {
            const resp = await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (data.status === "success") {
                this.logToTerminal("⚙️ تم تحديث الإعدادات وحفظ مفتاح API بنجاح.", "success");
                this.closeSettings();
                this.apiKeyInput.value = ""; // Clear for security
                this.loadStatus();
            } else {
                alert(`فشل الحفظ: ${data.message}`);
            }
        } catch (e) {
            alert("خطأ أثناء تحديث الإعدادات.");
        }
    }

    toggleApiKeyVisibility() {
        if (this.apiKeyInput.type === "password") {
            this.apiKeyInput.type = "text";
            this.btnToggleApiKey.innerText = "🔒";
        } else {
            this.apiKeyInput.type = "password";
            this.btnToggleApiKey.innerText = "👁️";
        }
    }

    // Markdown Parser
    formatMarkdown(text) {
        if (!text) return "";
        let html = text;
        
        // Escape HTML tags to prevent XSS
        html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Fenced code blocks
        html = html.replace(/```python\s*([\s\S]*?)```/g, '<pre><code class="language-python">$1</code></pre>');
        html = html.replace(/```\s*([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Newlines
        html = html.replace(/\n/g, "<br>");
        
        return html;
    }

    scrollToBottom(el) {
        el.scrollTop = el.scrollHeight;
    }
}

// Start
document.addEventListener("DOMContentLoaded", () => {
    window.app = new AgentDashboard();
});
