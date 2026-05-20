import React, { useState, useEffect, useRef } from "react"
import { 
  PromptInput, 
  PromptInputTextarea, 
  PromptInputActions, 
  PromptInputAction 
} from "@/components/ui/prompt-input"
import { Button } from "@/components/ui/button"
import { ArrowUp, Paperclip, Square, X, Settings, RefreshCw } from "lucide-react"

interface Skill {
  description: string
  capabilities: string[]
  version: number
  has_execute: boolean
}

interface LogEntry {
  type: string
  data: {
    message?: string
    level?: string
    state?: string
    text?: string
    skill_name?: string
    code?: string
    status?: string
  }
  timestamp: number
}

interface Message {
  role: "user" | "assistant"
  content: string
}

export default function App() {
  // Agent State
  const [state, setState] = useState<"idle" | "thinking" | "coding" | "executing">("idle")
  const [skills, setSkills] = useState<Record<string, Skill>>({})
  const [skillsCount, setSkillsCount] = useState(0)
  const [version, setVersion] = useState("2.0.0")
  
  // Chat & Inputs
  const [inputText, setInputText] = useState("")
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "**أهلاً بك!** أنا **المجنون**، وكيل ذكاء اصطناعي ذاتي التطور.\n\nأستطيع تنفيذ أي مهمة تطلبها. إذا لم أكن أملك المهارة المطلوبة، سأقوم بكتابة كود بايثون لنفسي وتثبيت المكونات اللازمة لتنفيذها مباشرة!\n\n⚠️ الرجاء التأكد من إعداد مفتاح **Gemini API** من زر الإعدادات بالأعلى للبدء."
    }
  ])
  
  // Terminal log
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      type: "log",
      data: { message: "نظام التطور السحابي جاهز. في انتظار التوجيهات...", level: "info" },
      timestamp: Date.now()
    }
  ])

  // Modals & Settings Config
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash")
  
  // Code Viewer Modal
  const [isCodeOpen, setIsCodeOpen] = useState(false)
  const [activeSkillName, setActiveSkillName] = useState("")
  const [activeSkillCode, setActiveSkillCode] = useState("")
  const [activeSkillDesc, setActiveSkillDesc] = useState("")

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const logBottomRef = useRef<HTMLDivElement>(null)

  // Load configuration & skills
  useEffect(() => {
    fetchStatus()
    connectWS()
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  // Auto-scroll chat & logs
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  useEffect(() => {
    if (logBottomRef.current) {
      logBottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs])

  const fetchStatus = async () => {
    try {
      const resp = await fetch("/api/status")
      const data = await resp.json()
      setState(data.state || "idle")
      setVersion(data.version || "2.0.0")
      setSkillsCount(data.skills_count || 0)
      setSkills(data.skills || {})
    } catch (e) {
      logToTerminal("⚠️ فشل الاتصال بالخادم لجلب الحالة البرمجية.", "error")
    }
  }

  const fetchSkills = async () => {
    try {
      const resp = await fetch("/api/skills")
      const data = await resp.json()
      setSkills(data)
      setSkillsCount(Object.keys(data).length)
    } catch (e) {
      console.error(e)
    }
  }

  const connectWS = () => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const host = window.location.host
    // Fallback to localhost during development proxying
    const wsUrl = host.includes("localhost") || host.includes("127.0.0.1") 
      ? `ws://127.0.0.1:8000/ws` 
      : `${proto}//${host}/ws`

    const socket = new WebSocket(wsUrl)
    wsRef.current = socket

    socket.onopen = () => {
      logToTerminal("⚡ متصل بقناة البث المباشر سحابياً (WebSocket)", "success")
      socket.send(JSON.stringify({ action: "status" }))
    }

    socket.onclose = () => {
      logToTerminal("❌ انقطع اتصال خادم البث. جاري إعادة المحاولة خلال 3 ثوانٍ...", "error")
      setTimeout(connectWS, 3000)
    }

    socket.onerror = (e) => {
      console.error("WS Error", e)
    }

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      handleWSMessage(msg)
    }
  }

  const handleWSMessage = (msg: any) => {
    const { type, data } = msg

    switch (type) {
      case "state_change":
        setState(data.state)
        break
      case "log":
        logToTerminal(data.message, data.level)
        break
      case "response":
        setMessages(prev => [...prev, { role: "assistant", content: data.text }])
        break
      case "skill_created":
        fetchSkills()
        break
      case "status":
        setState(data.state || "idle")
        setVersion(data.version || "2.0.0")
        setSkillsCount(data.skills_count || 0)
        setSkills(data.skills || {})
        break
      case "config_updated":
        logToTerminal(`⚙️ ${data.message}`, "success")
        break
    }
  }

  const logToTerminal = (message: string, level: string = "info") => {
    setLogs(prev => [
      ...prev.slice(-99),
      {
        type: "log",
        data: { message, level },
        timestamp: Date.now()
      }
    ])
  }

  // Action handlers
  const handleSubmitTask = () => {
    if (!inputText.trim()) return

    setMessages(prev => [...prev, { role: "user", content: inputText }])
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: "task",
        text: inputText
      }))
    } else {
      logToTerminal("❌ فشل الإرسال: قناة الاتصال غير مفتوحة حالياً.", "error")
    }

    setInputText("")
  }

  const handleResetAgent = async () => {
    if (!confirm("⚠️ هل أنت متأكد من إعادة ضبط المصنع؟ سيتم حذف جميع المهارات والذاكرة البرمجية!")) return

    try {
      const resp = await fetch("/api/reset", { method: "POST" })
      const data = await resp.json()
      if (data.status === "success") {
        logToTerminal("🔄 تم إعادة ضبط المصنع للوكيل بنجاح.", "warning")
        setMessages([
          { role: "assistant", content: "تمت إعادة تعيين الوكيل بنجاح. مخزن الذاكرة والمهارات فارغ الآن!" }
        ])
        fetchStatus()
      }
    } catch (e) {
      alert("خطأ أثناء ضبط الوكيل.")
    }
  }

  const handleSaveSettings = async () => {
    const payload: Record<string, string> = { model: selectedModel }
    if (apiKey.trim()) {
      payload.api_key = apiKey
    }

    try {
      const resp = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await resp.json()
      if (data.status === "success") {
        logToTerminal("⚙️ تم تحديث الإعدادات وتأمين مفتاح API.", "success")
        setIsSettingsOpen(false)
        setApiKey("") // Clear for security
        fetchStatus()
      }
    } catch (e) {
      alert("خطأ أثناء حفظ الإعدادات.")
    }
  }

  const viewSkillSource = async (name: string, skill: Skill) => {
    try {
      const resp = await fetch(`/api/skill/${name}/source`)
      const data = await resp.json()
      if (data.status === "success") {
        setActiveSkillName(name)
        setActiveSkillDesc(skill.description)
        setActiveSkillCode(data.source)
        setIsCodeOpen(true)
      } else {
        alert(`خطأ: ${data.message}`)
      }
    } catch (e) {
      alert("خطأ في الاتصال بالخادم.")
    }
  }

  const handleDeleteSkill = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`هل تريد بالتأكيد حذف المهارة '${name}'؟`)) return

    try {
      const resp = await fetch(`/api/skill/${name}`, { method: "DELETE" })
      const data = await resp.json()
      if (data.status === "success") {
        logToTerminal(`🗑️ تم حذف المهارة: ${name}`, "warning")
        fetchSkills()
      }
    } catch (e) {
      alert("خطأ في الاتصال.")
    }
  }

  // Parse markdown styling for chat bubbles
  const formatMarkdown = (text: string) => {
    if (!text) return ""
    
    // Simple escape html
    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

    // Fenced Code block
    escaped = escaped.replace(/```python\s*([\s\S]*?)```/g, '<pre class="bg-black/40 border border-white/5 rounded-lg p-3 my-2 overflow-x-auto"><code class="font-mono text-xs text-slate-100">$1</code></pre>')
    escaped = escaped.replace(/```\s*([\s\S]*?)```/g, '<pre class="bg-black/40 border border-white/5 rounded-lg p-3 my-2 overflow-x-auto"><code class="font-mono text-xs text-slate-100">$1</code></pre>')
    
    // Inline Code
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-black/30 font-mono text-xs text-cyan-400 px-1 py-0.5 rounded">$1</code>')
    
    // Bold
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    
    // Newlines
    escaped = escaped.replace(/\n/g, "<br>")

    return <div dangerouslySetInnerHTML={{ __html: escaped }} />
  }

  return (
    <div className="relative min-h-screen bg-[#070913] text-gray-100 selection:bg-violet-500/30 overflow-hidden">
      {/* Cyber Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none z-0" 
        style={{
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "30px 30px"
        }}
      />

      <div className="relative z-10 max-w-[1600px] mx-auto p-4 flex flex-col gap-4 h-screen max-h-screen">
        
        {/* Header */}
        <header className="bg-slate-900/55 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex justify-between items-center shadow-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className={`w-3.5 h-3.5 rounded-full shadow-lg ${
              state === "idle" ? "bg-cyan-500 shadow-cyan-500/50 animate-pulse" :
              state === "thinking" ? "bg-violet-500 shadow-violet-500/50 animate-pulse" :
              state === "coding" ? "bg-emerald-500 shadow-emerald-500/50 animate-pulse" :
              "bg-amber-500 shadow-amber-500/50 animate-pulse"
            }`} />
            <h1 className="text-xl font-extrabold tracking-wide">
              نواة المجنون <span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent font-sans">Al-Majnoun Core</span>
            </h1>
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-400 font-mono">{version}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex bg-white/5 border border-white/5 px-3 py-1.5 rounded-full text-xs gap-2">
              <span className="text-gray-400">الحالة:</span>
              <span className={`font-bold ${
                state === "idle" ? "text-cyan-400" :
                state === "thinking" ? "text-violet-400" :
                state === "coding" ? "text-emerald-400" :
                "text-amber-400"
              }`}>
                {state === "idle" ? "مستعد" :
                 state === "thinking" ? "يفكر 🧠" :
                 state === "coding" ? "يبرمج 🔧" :
                 "ينفذ ⚡"}
              </span>
            </div>

            <div className="bg-white/5 border border-white/5 px-3 py-1.5 rounded-full text-xs gap-2 flex">
              <span className="text-gray-400">المهارات:</span>
              <span className="font-bold text-cyan-400">{skillsCount}</span>
            </div>

            <button 
              onClick={handleResetAgent}
              className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="إعادة تعيين المصنع بالكامل للوكيل"
            >
              إعادة تعيين <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="bg-gradient-to-r from-violet-600 to-indigo-700 hover:shadow-violet-600/20 hover:shadow-lg border border-transparent px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" /> الإعدادات
            </button>
          </div>
        </header>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 flex-grow min-h-0">
          
          {/* Chat Workspace (Left 7 Columns) */}
          <section className="lg:col-span-7 bg-slate-900/55 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex flex-col min-h-0 shadow-lg">
            <div className="flex-grow overflow-y-auto space-y-4 pr-2 bg-black/25 border border-white/5 rounded-xl p-4 mb-4">
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex gap-3 max-w-[85%] ${
                    msg.role === "user" ? "self-start" : "self-end flex-row-reverse"
                  }`}
                  dir={msg.role === "user" ? "rtl" : "rtl"}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg border ${
                    msg.role === "user" 
                      ? "bg-gradient-to-tr from-violet-600 to-purple-500 border-transparent text-white" 
                      : "bg-white/10 border-white/10"
                  }`}>
                    {msg.role === "user" ? "👤" : "🧠"}
                  </div>
                  <div className={`p-3.5 rounded-2xl leading-relaxed text-sm ${
                    msg.role === "user"
                      ? "bg-violet-950/40 border border-violet-800/20 rounded-tr-none text-violet-100"
                      : "bg-white/5 border border-white/10 rounded-tl-none text-slate-200"
                  }`}>
                    {formatMarkdown(msg.content)}
                  </div>
                </div>
              ))}
              
              {state !== "idle" && (
                <div className="flex gap-3 max-w-[80%] self-end flex-row-reverse">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 border border-white/10 text-lg">
                    🧠
                  </div>
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none flex gap-1.5 items-center">
                    <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce delay-0" />
                    <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce delay-150" />
                    <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-bounce delay-300" />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Prompt Input Component Integration */}
            <div className="flex-shrink-0 w-full">
              <PromptInput
                value={inputText}
                onValueChange={setInputText}
                isLoading={state !== "idle"}
                onSubmit={handleSubmitTask}
                className="w-full bg-black/35 border-white/15"
              >
                <PromptInputTextarea 
                  placeholder="اكتب مهمة جديدة للمجنون... (مثال: 'صمم برنامجاً لحساب أرقام فيبوناتشي')" 
                  className="placeholder:text-gray-500 text-sm"
                />

                <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
                  <PromptInputAction tooltip="إرفاق ملف">
                    <label
                      htmlFor="file-upload"
                      className="hover:bg-white/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl transition-colors"
                    >
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        id="file-upload"
                        onChange={() => {
                          logToTerminal("📂 تم استلام ملفات ولكن الرفع معطل حالياً (سوف يتطور الوكيل ليدعم ذلك قريباً!)", "warning")
                        }}
                      />
                      <Paperclip className="text-gray-400 w-4 h-4" />
                    </label>
                  </PromptInputAction>

                  <PromptInputAction
                    tooltip={state !== "idle" ? "جاري المعالجة..." : "إرسال الأمر"}
                  >
                    <Button
                      variant="default"
                      size="icon"
                      className="h-8 w-8 rounded-full bg-violet-600 hover:bg-violet-500 transition-all shadow-md cursor-pointer"
                      onClick={handleSubmitTask}
                      disabled={state !== "idle"}
                    >
                      {state !== "idle" ? (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <ArrowUp className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </PromptInputAction>
                </PromptInputActions>
              </PromptInput>
            </div>
          </section>

          {/* Sidebar Panels (Right 3 Columns) */}
          <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
            
            {/* Skills Panel */}
            <section className="flex-[3] bg-slate-900/55 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex flex-col min-h-0 shadow-lg">
              <div className="flex justify-between items-center mb-1 flex-shrink-0">
                <h2 className="font-bold text-sm">🧰 مكتبة المهارات الذاتية</h2>
                <span className="text-[10px] bg-cyan-950/50 text-cyan-400 border border-cyan-800/30 px-2 py-0.5 rounded-full font-bold">{skillsCount} مهارات</span>
              </div>
              <p className="text-[11px] text-gray-400 mb-3 flex-shrink-0">هذه هي المهارات البرمجية التي كتبها الوكيل لنفسه لتوسيع قدراته تلقائياً.</p>
              
              <div className="flex-grow overflow-y-auto space-y-2 pr-1">
                {Object.keys(skills).length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-6">لا توجد مهارات برمجية بعد. أرسل مهمة ليبني أول مهارة!</div>
                ) : (
                  Object.keys(skills).map(name => (
                    <div 
                      key={name}
                      onClick={() => viewSkillSource(name, skills[name])}
                      className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/40 p-2.5 rounded-xl transition-all duration-250 flex justify-between items-center cursor-pointer"
                    >
                      <div className="flex flex-col gap-0.5 overflow-hidden w-[82%]">
                        <span className="font-mono text-xs text-cyan-400 font-bold truncate">⚙️ {name}</span>
                        <span className="text-[10px] text-gray-400 truncate">{skills[name].description}</span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteSkill(name, e)}
                        className="opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-gray-400 hover:text-red-500 p-1.5 rounded transition-all duration-200"
                        title="حذف هذه المهارة"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Live Terminal Activity Log */}
            <section className="flex-[2] bg-slate-900/55 border border-white/10 backdrop-blur-md rounded-2xl p-3 flex flex-col min-h-0 shadow-lg">
              <h2 className="font-bold text-xs mb-2 flex-shrink-0">📊 موجه سجل العمليات الحي</h2>
              
              <div className="flex-grow bg-black/45 border border-white/5 rounded-xl p-2.5 font-mono text-[10px] leading-normal overflow-y-auto flex flex-col gap-1.5">
                {logs.map((log, i) => (
                  <div 
                    key={i} 
                    className={`break-all ${
                      log.data.level === "success" ? "text-emerald-400" :
                      log.data.level === "warning" ? "text-amber-400" :
                      log.data.level === "error" ? "text-red-400" :
                      "text-sky-400"
                    }`}
                  >
                    [{new Date(log.timestamp).toLocaleTimeString()}] {log.data.message}
                  </div>
                ))}
                <div ref={logBottomRef} />
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div>
              <h2 className="text-lg font-bold">⚙️ إعدادات الوكيل</h2>
              <p className="text-xs text-gray-400 mt-1">قم بتحديث مفتاح التشغيل والذكاء الأساسي للوكيل سحابياً.</p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-300">Gemini API Key:</label>
                <div className="relative">
                  <input 
                    type={showApiKey ? "text" : "password"}
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 pr-10 font-mono text-xs text-slate-100 focus:outline-none focus:border-violet-500"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs"
                  >
                    {showApiKey ? "🔒" : "👁️"}
                  </button>
                </div>
                <small className="text-[10px] text-gray-400">احصل عليه مجاناً بالكامل من <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Google AI Studio</a></small>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-300">النموذج اللغوي (LLM Model):</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (موصى به - فائق السرعة ومجاني)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (ذكي وعميق - أبطأ)</option>
                  <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button 
                onClick={handleSaveSettings}
                className="bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                حفظ التغييرات 💾
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Code Viewer Modal */}
      {isCodeOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95">
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
              <h2 className="text-md font-bold font-mono text-cyan-400">⚙️ مهارة: {activeSkillName}.py</h2>
              <button 
                onClick={() => setIsCodeOpen(false)}
                className="bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer"
              >
                إغلاق ×
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4 flex-shrink-0">{activeSkillDesc}</p>
            
            <div className="flex-grow bg-black/45 border border-white/5 rounded-xl p-4 overflow-auto font-mono text-xs leading-relaxed text-slate-100">
              <pre><code>{activeSkillCode}</code></pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
