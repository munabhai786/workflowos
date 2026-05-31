from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.agents.base_agent import BaseAgent


class WorkspaceCopilotAgent(BaseAgent):
    key = "workspace_copilot"
    name = "AI Workspace Copilot"
    description = "Context-aware execution assistant for projects, tasks, planning, collaboration, and uploaded workspace files."

    def analyze(self, db: Session, context: dict) -> list:
        return []

    def answer(self, db: Session, context: dict, prompt: str) -> dict:
        normalized = prompt.lower().strip()
        tasks = context["tasks"]
        projects = context["projects"]
        workload = context["signals"]["workload_by_user"]
        analytics = context["analytics"]
        file_context = context.get("file_context", [])
        conversation_memory = context.get("conversation_memory", [])
        now = datetime.utcnow()

        if file_context and self._is_file_request(normalized):
            result = self._answer_from_files(normalized, file_context, tasks, projects)
            answer = result["answer"]
            actions = result["actions"]
            evidence = result["evidence"]
            confidence = result["confidence"]
            reasoning = result["reasoning"]
        elif "task" in normalized and ("generate" in normalized or "create" in normalized or "break" in normalized):
            result = self._generate_task_plan(normalized, file_context, tasks, projects)
            answer = result["answer"]
            actions = result["actions"]
            evidence = result["evidence"]
            confidence = result["confidence"]
            reasoning = result["reasoning"]
        elif "blocking" in normalized or "blocked" in normalized:
            blocked = [task for task in tasks if task["status"] == "blocked"]
            overdue = [
                task for task in tasks
                if task["status"] != "completed" and task["due_date"] and task["due_date"] < now
            ]
            answer = f"{len(blocked)} blocked task(s) and {len(overdue)} overdue task(s) are currently constraining execution."
            actions = ["Escalate blocked owners", "Rebalance overdue work", "Review project due dates"]
            evidence = blocked[:8] + overdue[:8]
            confidence = 0.84
            reasoning = "Blocker analysis uses current task status, due dates, and overdue work in accessible workspace context."
        elif "overloaded" in normalized or "workload" in normalized:
            ranked = sorted(
                workload.items(),
                key=lambda item: item[1]["open"] * 10 + item[1]["overdue"] * 18 + item[1]["points"] * 4,
                reverse=True,
            )
            top = ranked[0] if ranked else None
            answer = (
                f"Team member {top[0]} is most overloaded with {top[1]['open']} open task(s), "
                f"{top[1]['overdue']} overdue task(s), and {top[1]['points']} point(s)."
                if top else
                "No overload is visible in the current accessible context."
            )
            actions = ["Move low-priority tasks", "Protect focus time", "Limit new in-progress work"]
            evidence = [{"user_id": user_id, **stats} for user_id, stats in ranked[:6]]
            confidence = 0.8 if top else 0.56
            reasoning = "Workload ranking weighs open tasks, overdue tasks, in-progress work, and estimate points."
        elif "today" in normalized and ("activity" in normalized or "summarize" in normalized):
            comments = [
                comment for comment in context["comments"]
                if comment["created_at"] and comment["created_at"] >= now - timedelta(days=1)
            ]
            answer = f"Today has {len(comments)} comment(s), {context['signals']['tasks_by_status'].get('completed', 0)} completed task(s), and {context['signals']['tasks_by_status'].get('in_progress', 0)} task(s) in progress."
            actions = ["Publish daily summary", "Escalate stale discussions", "Refresh sprint status"]
            evidence = comments[:8]
            confidence = 0.76
            reasoning = "Activity summary is grounded in recent comments and task movement visible to the current user."
        elif "highest risk" in normalized or "risk" in normalized:
            project_scores = []
            for project in projects:
                project_tasks = [task for task in tasks if task["project_id"] == project["id"]]
                overdue = len([
                    task for task in project_tasks
                    if task["status"] != "completed" and task["due_date"] and task["due_date"] < now
                ])
                blocked = len([task for task in project_tasks if task["status"] == "blocked"])
                score = overdue * 20 + blocked * 22 + max(0, 70 - project["progress"])
                project_scores.append({"project": project, "risk_score": score, "overdue": overdue, "blocked": blocked})
            project_scores.sort(key=lambda item: item["risk_score"], reverse=True)
            top = project_scores[0] if project_scores else None
            answer = (
                f"{top['project']['name']} is highest risk with score {top['risk_score']}, "
                f"{top['overdue']} overdue task(s), and {top['blocked']} blocked task(s)."
                if top else
                "No project risk is visible in the current accessible context."
            )
            actions = ["Run recovery plan", "Freeze scope", "Clear blockers"]
            evidence = project_scores[:5]
            confidence = 0.82 if top else 0.52
            reasoning = "Risk scoring combines overdue work, blocked work, and incomplete project progress."
        elif "automation" in normalized:
            automation = context["automation"].get("summary", {})
            answer = (
                f"Automation coverage includes {automation.get('enabled_rules', 0)} enabled rule(s) "
                f"with {automation.get('success_rate', 100)}% success rate."
            )
            actions = ["Add blocked-task escalation", "Add review SLA reminders", "Audit failing automation rules"]
            evidence = automation
            confidence = 0.72
            reasoning = "Automation guidance is based on enabled rules, execution success, and common operational gaps."
        elif "sprint" in normalized or "plan" in normalized:
            sprint = analytics.get("sprint", {}).get("summary", {})
            answer = (
                f"Sprint predictability is {sprint.get('predictability', 0)}% with "
                f"{sprint.get('carry_over_work', 0)} carry-over item(s)."
            )
            actions = ["Move excess scope", "Prioritize blocked work", "Reserve review capacity"]
            evidence = analytics.get("sprint", {})
            confidence = 0.78
            reasoning = "Sprint guidance uses sprint predictability, carry-over work, blockers, and current task risk."
        else:
            # Safely attempt to pull real dynamic scores from ai_intelligence_service.py
            # Fallback to the nested 'kpis' object to avoid breaking existing routes that haven't migrated yet
            kpis = analytics.get("kpis", {})
            health_score = analytics.get("workflow_health_score", kpis.get("organization_health", 0))
            confidence_score = analytics.get("execution_quality_score", kpis.get("delivery_confidence", 0))
            prod_score = analytics.get("productivity_score", kpis.get("productivity", 0))
            
            answer = (
                f"Workspace health is {health_score}%, delivery execution quality is "
                f"{confidence_score}%, and productivity is {prod_score}%."
            )
            actions = [
                "Identify blockers",
                "Generate execution plan",
                "Create sprint backlog",
            ]
            evidence = {
                "kpis": kpis,
                "recent_memory": conversation_memory[-3:],
                "attached_files": self._file_evidence(file_context),
            }
            confidence = 0.7
            reasoning = "General workspace guidance uses KPI health plus recent conversation and attached file signals when present."

        return {
            "agent_key": self.key,
            "answer": answer,
            "suggested_actions": actions,
            "evidence": evidence,
            "context_hash": context["context_hash"],
            "confidence": confidence,
            "reasoning": reasoning,
            "generated_at": datetime.utcnow(),
        }

    def _is_file_request(self, normalized: str) -> bool:
        file_terms = {
            "file",
            "document",
            "pdf",
            "prd",
            "spec",
            "screenshot",
            "mockup",
            "image",
            "diagram",
            "architecture",
            "summarize this",
            "from this",
        }
        return any(term in normalized for term in file_terms)

    def _file_evidence(self, file_context: list[dict]) -> list[dict]:
        return [
            {
                "name": item.get("name"),
                "kind": item.get("kind"),
                "mime_type": item.get("mime_type"),
                "size": item.get("size"),
                "extracted": bool(item.get("text_excerpt")),
            }
            for item in file_context[:8]
        ]

    def _combined_file_text(self, file_context: list[dict]) -> str:
        chunks = []
        for item in file_context[:6]:
            text = (item.get("text_excerpt") or "").strip()
            if text:
                chunks.append(f"{item.get('name', 'Untitled file')}:\n{text[:3500]}")
        return "\n\n".join(chunks)

    def _answer_from_files(self, normalized: str, file_context: list[dict], tasks: list[dict], projects: list[dict]) -> dict:
        file_names = ", ".join(item.get("name", "Untitled file") for item in file_context[:4])
        text = self._combined_file_text(file_context)
        image_files = [item for item in file_context if str(item.get("kind", "")).startswith("image")]
        document_files = [item for item in file_context if item not in image_files]
        open_tasks = len([task for task in tasks if task["status"] != "completed"])
        active_projects = len([project for project in projects if project["status"] != "completed"])

        if "sprint" in normalized or "plan" in normalized:
            answer = (
                f"I reviewed {len(file_context)} attached file(s): {file_names}. "
                "Recommended sprint structure: discovery and requirement confirmation first, implementation by functional area second, "
                "QA/accessibility/performance validation third, and release readiness last. "
                f"Map this against {open_tasks} open workspace task(s) across {active_projects} active project(s) before committing scope."
            )
            actions = ["Generate sprint backlog", "Create milestone plan", "Find delivery risks"]
        elif "risk" in normalized or "blocker" in normalized:
            answer = (
                f"I reviewed {len(file_context)} attached file(s): {file_names}. "
                "Primary execution risks to validate are ambiguous requirements, missing owner decisions, dependency sequencing, "
                "acceptance criteria gaps, review capacity, and test coverage. "
                "Convert each unresolved requirement into an owned task before sprint commitment."
            )
            actions = ["Create risk register", "Generate validation checklist", "Break down dependencies"]
        elif image_files and ("ui" in normalized or "design" in normalized or "screenshot" in normalized or "mockup" in normalized):
            answer = (
                f"I found {len(image_files)} image/mockup file(s): {', '.join(item.get('name', 'image') for item in image_files[:4])}. "
                "Use them to drive an implementation checklist: responsive layout states, navigation behavior, empty/loading/error states, "
                "component reuse, accessibility focus order, and visual regression checks. "
                "Attach acceptance criteria to each generated frontend task so design intent survives handoff."
            )
            actions = ["Generate frontend tasks", "Create UX review checklist", "Estimate implementation complexity"]
        elif "task" in normalized or "backlog" in normalized:
            answer = self._task_generation_answer(file_context, text)
            actions = ["Create frontend/backend breakdown", "Generate QA checklist", "Create sprint backlog"]
        else:
            if text:
                answer = (
                    f"I reviewed {len(document_files)} document file(s): {file_names}. "
                    "The useful execution move is to turn the extracted requirements into project phases, owned tasks, acceptance criteria, "
                    "risks, and sprint-ready slices. Start by separating must-have delivery scope from decisions still needing clarification."
                )
            else:
                answer = (
                    f"I registered {len(file_context)} file(s): {file_names}. "
                    "For image, PDF, DOC/DOCX, and binary files without extracted text, I can still create an execution review framework, "
                    "but richer answers need pasted/extracted requirements or text-bearing files."
                )
            actions = ["Summarize requirements", "Generate execution plan", "Identify missing decisions"]

        return {
            "answer": answer,
            "actions": actions,
            "evidence": self._file_evidence(file_context),
            "confidence": 0.82 if text else 0.62,
            "reasoning": "File-aware guidance uses extracted document text when available and file type metadata for multimodal execution planning.",
        }

    def _task_generation_answer(self, file_context: list[dict], text: str) -> str:
        if not text:
            return (
                "I can generate a sprint-ready task plan from the attached files once requirements text is available. "
                "For now, create discovery tasks for requirement extraction, design review, API mapping, QA strategy, and release criteria."
            )

        keywords = [
            "authentication",
            "dashboard",
            "upload",
            "notification",
            "calendar",
            "approval",
            "analytics",
            "comment",
            "mobile",
            "accessibility",
            "performance",
            "api",
        ]
        found = [keyword for keyword in keywords if keyword in text.lower()]
        scope = ", ".join(found[:8]) if found else "core product requirements"
        return (
            f"Generated task direction from {len(file_context)} file(s). Suggested backlog: requirements confirmation for {scope}; "
            "frontend implementation tasks; backend/API support tasks; data validation and migration checks; QA and accessibility checklist; "
            "release readiness and stakeholder review. Split each item into owner, estimate, dependency, and acceptance criteria before sprint planning."
        )

    def _generate_task_plan(self, normalized: str, file_context: list[dict], tasks: list[dict], projects: list[dict]) -> dict:
        open_tasks = [task for task in tasks if task["status"] != "completed"]
        blocked = [task for task in open_tasks if task["status"] == "blocked"]
        file_text = self._combined_file_text(file_context)

        if file_context:
            answer = self._task_generation_answer(file_context, file_text)
            evidence = self._file_evidence(file_context)
            confidence = 0.82 if file_text else 0.64
            reasoning = "Task generation is grounded in attached file text where available, then reconciled with existing open and blocked work."
        else:
            answer = (
                f"Use the current workspace to generate execution tasks: resolve {len(blocked)} blocked item(s), protect delivery for "
                f"{len(open_tasks)} open task(s), then split new scope into discovery, implementation, review, QA, and release tasks."
            )
            evidence = {"open_tasks": len(open_tasks), "blocked_tasks": len(blocked), "projects": len(projects)}
            confidence = 0.74
            reasoning = "Task generation is grounded in current workspace task status and project count."

        return {
            "answer": answer,
            "actions": ["Create task checklist", "Generate sprint backlog", "Identify dependencies"],
            "evidence": evidence,
            "confidence": confidence,
            "reasoning": reasoning,
        }
