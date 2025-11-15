# Agent Forge  
**Multi-Agent Orchestration for AI-Assisted Coding**

Agent Forge is an open-source orchestration layer designed to coordinate multiple coding agents (Claude Code, GPT-Code, and others) in parallel.  
It acts as a conductor for distributed AI coding workflows, allowing developers to delegate tasks across multiple agents without losing track of context, state, or required input.

Unlike typical dashboards or chat interfaces, Agent Forge is a **meta-tool**:  
It interprets agent output, summarizes state, routes developer decisions, and ensures that parallel coding sessions remain comprehensible.

---

## 🎯 Motivation

Modern AI coding tools are powerful — but juggling multiple agents quickly becomes overwhelming.  
Switching between terminals and browser tabs creates cognitive friction:  
Which agent asked the last question? Which one waits for input? What is currently running?

Agent Forge removes that overhead by providing:

- **Unified orchestration** across many AI coding sessions  
- **Real-time state tracking** for each agent  
- **Input routing** so your responses always go to the right place  
- **Summaries** of agent output, condensed to what matters  
- **Project grouping** so complex systems stay navigable  

The result:  
You stop babysitting agents — and start leading them.

---

## 🚀 What Agent Forge Does

### Core Features (MVP)
- Spawn, manage, and monitor multiple coding agents  
- Read native session logs (e.g. Claude Code JSONL sessions)  
- Detect when agents need user input  
- Provide condensed summaries of agent status  
- Group agents by project/module  
- Color-coded metrics (linting, tests, build state)  
- Optional screenshot previews (via Playwright MCP)  
- Web dashboard with real-time updates  

### Roadmap Features
- Autonomous orchestration for routine decisions  
- Multi-project dependency awareness  
- Persistent cross-session context  
- Project-level “What’s next?” suggestions  
- Long-term agent behavior analysis  
- Cost and context monitoring  
- Specialist agents (architecture, research, QA) as internal tools  

---

## 🏗️ Architecture Overview

Agent Forge uses a minimalistic but robust core:

- **Headless agent processes** (via CLI, e.g. `claude --continue`)  
- **Native session files** as the source of truth  
- **Node.js backend** for process lifecycle + WebSocket updates  
- **Browser-based dashboard** for human supervision  
- **Stateless orchestration**: restart any time without losing context  

Think of it as a small operating system for coding agents.

---

## 🖥️ Dashboard

The UI focuses on clarity and cognitive ease:

- All agents listed with compact status indicators  
- Project-level grouping  
- One-click drill-down into each agent  
- Color-coded markers for linting/test/build status  
- Modal gallery for screenshots  
- Sticky global summary bar:  
  - 🟢 running  
  - 🟡 waiting for input  
  - 🔴 error  
  - ⚪ idle  

No clutter. No noise. Just the truth.

---

## 💡 Philosophy

Agent Forge is not intended to replace developers.  
It is meant to **elevate** them — away from code micromanagement and hin zur Intentionsarbeit:  
defining *was* getan werden soll, nicht *wie*.

Long term, Agent Forge may become part of a new kind of development workflow,  
in which humans shape direction and meaning,  
while networks of agents shape implementation.

This project is a quiet prototype of that future.

---

## 📦 Status

Early development.  
Expect rapid iteration and breaking changes.

---

## 🤝 Contribution

Contributions, feedback, and experiments are welcome.  
This is a tool for the future of software development —  
it will grow faster with diverse perspectives and ideas.

---

## 📜 License

MIT License (flexible, open, developer-friendly)

---

## 🔥 Tagline Suggestions

> **Agent Forge – Where coding agents become a workforce.**  
> **Agent Forge – Orchestrate your AI development team.**  
> **Agent Forge – The command center for multi-agent coding.**