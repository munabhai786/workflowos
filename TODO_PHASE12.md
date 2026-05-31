# TODO_PHASE12 — Deployment & Portfolio Mode (Phase 12)

## Goal
Turn WorkflowOS into a polished SaaS product demo: demo-ready, onboarding-ready, presentation-ready.

---

## Phase Order (per approved plan)
1. Backend demo workspace seeding (idempotent, safe)
2. Onboarding flow (first login only; skip allowed)
3. AI prompt chips (AICopilot empty state)
4. Presentation mode (demo/presentation mode)
5. Empty states (CTA everywhere)
6. Landing polish (light copy/messaging)

---

## Step 1 — Demo workspace seeding (Backend first)
- [x] Add demo seed marker to user schema (or equivalent) to ensure idempotency
- [x] Create `backend/app/services/demo_seed_service.py`

  - [ ] Seed Projects: Ecommerce Launch, Mobile App Redesign, Marketing Sprint
  - [ ] Seed Tasks across board statuses (todo/in_progress/review/blocked/completed)
  - [ ] Seed Milestones (or sprint-like stages if model exists)
  - [ ] Seed Approvals (or approval-like records using existing models)
  - [ ] Seed Notifications + Activities for activity feed
  - [ ] Seed Sprints + Sprint tasks if `Sprint`/`SprintTask` models are wired
  - [ ] Seed Reports / Analytics snapshots if `AnalyticsSnapshot` / reporting models are available
- [ ] Add auth-protected endpoint `POST /api/v1/demo/seed`
- [ ] Wire endpoint into router
- [ ] Update `backend/app/main.py` if DB migration marker is required

Verification:
- [ ] Create a fresh user
- [ ] Call seed endpoint (or seed via onboarding step later)
- [ ] Confirm dashboards/projects/tasks/notifications are non-empty
- [ ] Confirm seeding is idempotent (no duplicates)

---

## Step 2 — Onboarding flow (Frontend)
- [ ] Create `frontend/src/pages/OnboardingPage.jsx`
  - [ ] Steps: Welcome → Overview → Try AI Copilot → Create first task → Generate project → View analytics
  - [ ] Skip always available
  - [ ] Premium, lightweight, responsive UI
- [ ] Add onboarding route in `frontend/src/App.jsx`
- [ ] Update `frontend/src/components/ProtectedRoute.jsx`
  - [ ] Redirect first-time users to `/onboarding`
  - [ ] Allow skipping onboarding
- [ ] Add backend endpoint or user update for onboarding completion
- [ ] After completion: ensure demo seeding is triggered and dashboards load

Verification:
- [ ] Fresh user sees onboarding immediately after login
- [ ] Skip works and still seeds demo workspace
- [ ] Existing users are not impacted

---

## Step 3 — AI prompt chips
- [ ] Update `frontend/src/pages/AICopilotPage.jsx`
  - [ ] Add empty-state prompt chips
  - [ ] Chips fill/copilot prompt input
  - [ ] Responsive and premium styling

Verification:
- [ ] Empty AI copilot shows chips
- [ ] Clicking chip populates prompt

---

## Step 4 — Presentation mode
- [ ] Update `frontend/src/pages/DashboardPage.jsx` (and layout/sidebar)
  - [ ] Add `?presentation=1` handling (or dedicated route)
  - [ ] Reduce clutter; highlight premium features
  - [ ] Fullscreen-friendly spacing

Verification:
- [ ] Presentation mode looks clean on desktop/tablet

---

## Step 5 — Empty states with CTAs
- [ ] Apply premium empty states with CTAs to:
  - [ ] Tasks
  - [ ] Projects
  - [ ] Notifications
  - [ ] Reports / analytics views (if applicable)
  - [ ] AI list pages if they can be empty

Verification:
- [ ] No dead screens
- [ ] CTAs navigate to meaningful actions

---

## Step 6 — Landing polish
- [ ] Light messaging improvements only
- [ ] Add/adjust onboarding CTA
- [ ] Preserve existing landing layout and motion direction

Verification:
- [ ] Landing still premium and responsive

---

## Deployment Readiness (documentation)
- [ ] Update deployment checklist after code changes stabilize

---

## Regressions checklist (must be green)
- [ ] Authentication
- [ ] AI Copilot
- [ ] workflow automation
- [ ] analytics
- [ ] dashboards
- [ ] projects
- [ ] notifications
- [ ] onboarding redirect


