# Phase 1 - Optional project tasks

Completed changes:
- Backend: task.project_id supported as null in routes/events and progress updates.
- Frontend: TasksPage creation form supports "No Project (Personal Task)" and submits null project_id.
- Frontend: task filtering supports "No Project (Personal)".

Files updated:
- backend/app/api/routes/tasks.py
- frontend/app/models/task.py (already nullable)
- backend/app/schemas/task.py (already optional)
- frontend/src/pages/TasksPage.jsx

