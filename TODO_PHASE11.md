# TODO_PHASE11 Security & Reliability (Phase 11)

## Step 1 — Repo audit confirmation (completed)
- Identify existing auth, JWT validation, and unsafe client role header usage.

## Step 2 — Centralized RBAC guard (planned)
- Create `backend/app/core/rbac.py` that maps DB `user.role` → permission checks.
- Use `get_current_user()` as the only authorization source.

## Step 3 — Migrate role-header routes (planned)
- Update these files to remove/ignore `role: Header(None)` for authorization:
  - `backend/app/api/routes/projects.py`
  - `backend/app/api/routes/tasks.py`
  - `backend/app/api/routes/admin.py`
  - `backend/app/api/routes/ai.py`
  - `backend/app/api/routes/ai_copilot.py`

## Step 4 — Frontend cleanup (planned)
- Remove `config.headers.role = localStorage.getItem('user_role')` from:
  - `frontend/src/services/api.js`

## Step 5 — Audit logs (planned)
- Verify whether `Activity` model already matches required audit schema.
- If not compatible, add minimal `AuditLog` model + service + admin viewer.

## Step 6 — Rate limiting (planned)
- Implement rate limiting dependency/middleware.
- Apply to:
  - auth login/signup/OTP/verify-otp
  - uploads/attachments
  - workflow execution endpoints
  - AI copilot execution/chat

## Step 7 — Session hardening + UX (planned)
- Ensure frontend handles 401 token expiry gracefully.
- Ensure backend returns consistent auth error codes.

## Step 8 — AI abuse prevention (planned)
- Add safe execution limits for AI action execution.
- Require confirmation for destructive/bulk edits and mass approvals.

## Step 9 — Error boundaries & resilience (planned)
- Wrap external AI failures and workflow partial failures to avoid UI crashes.

## Step 10 — Security review & verification (planned)
- Verify no console errors.
- Verify audit logs, rate limiting, RBAC enforcement.

