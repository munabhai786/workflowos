# TODO.md

## Phase 9 — Collaboration Premium

### Milestone 1: Threaded comments
- [ ] Frontend: update `TaskDiscussionPanel.jsx` to render replies recursively
- [ ] Frontend: add Reply UI (POST comment with `parent_id`)
- [ ] Frontend: keep existing root comment create/delete/attachments behavior unchanged

### Milestone 2: Mentions + notifications
- [ ] Backend: in `comment_service.py`, create notification(s) for mentioned users
- [ ] Frontend: add `@username` autocomplete UX in `TaskDiscussionPanel.jsx`
- [ ] Backend: add mention-suggestion endpoint if missing

### Milestone 3: Presence indicators (soft realtime)
- [ ] Backend: support websocket presence state updates (viewing/editing) best-effort
- [ ] Frontend: emit presence state on panel open + textarea focus
- [ ] Frontend: display presence strip (online/viewing/editing/last active)

### Milestone 4: Activity feed realtime (MVP)
- [ ] Frontend: update `ActivityFeed.jsx` to subscribe to realtime `activity.created`
- [ ] Ensure realtime updates respect `projectId`

### Verification (no regressions)
- [ ] comments work (threads + replies)
- [ ] mentions work (autocomplete + notification delivery)
- [ ] activity feed works (realtime)
- [ ] notifications integrated (realtime toast + dropdown refresh)
- [ ] run lint/tests and ensure no broken routes or websocket regressions

