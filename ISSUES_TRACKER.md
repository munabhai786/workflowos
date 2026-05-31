# Production Hardening - Issues Tracker

## CRITICAL ISSUES (MUST FIX)

### C1: Console Error Exposure
- **Status**: 🔴 CRITICAL
- **Impact**: Security/UX - Raw error messages shown in browser
- **Locations**: 61 instances across frontend
- **Example**: [frontend/src/store/aiCopilotStore.js#L56](frontend/src/store/aiCopilotStore.js#L56)
- **Fix**: Create `utils/errorFormatter.js` to sanitize all errors
- **Estimated Time**: 2-3 hours
- **Owner**: Frontend Lead

```javascript
// Recommended implementation
export function formatErrorForUI(error) {
  // Log full error internally
  logger.error(error);
  
  // Return safe message to UI
  return error?.response?.data?.detail || 
         'An error occurred. Please try again.';
}

// Usage: Replace all console.error() with this
```

---

### C2: Missing Delete Confirmations
- **Status**: 🔴 CRITICAL
- **Impact**: UX - Users can accidentally delete data
- **Locations**:
  - [frontend/src/pages/TasksPage.jsx#L252](frontend/src/pages/TasksPage.jsx#L252) - Task deletion
  - [frontend/src/store/aiCopilotStore.js#L245](frontend/src/store/aiCopilotStore.js#L245) - Conversation deletion
  - [frontend/src/pages/AdminPage.jsx#L283](frontend/src/pages/AdminPage.jsx#L283) - User deletion
- **Fix**: Add confirmation modal before each delete
- **Estimated Time**: 1-2 hours
- **Owner**: Frontend Lead

```javascript
// Pattern for all deletes
const handleDelete = async (id) => {
  const confirmed = await showConfirmDialog({
    title: 'Delete Task?',
    description: 'This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });
  
  if (confirmed) {
    await deleteTask(id);
    toast.success('Task deleted');
  }
};
```

---

### C3: Unhandled Promise Rejections
- **Status**: 🔴 CRITICAL
- **Impact**: Silent failures, app state corruption
- **Locations**:
  - [frontend/src/services/realtime.js#L40](frontend/src/services/realtime.js#L40) - Empty catch
  - [frontend/src/hooks/useVoiceAssistant.js#L34](frontend/src/hooks/useVoiceAssistant.js#L34) - Empty catch
  - [frontend/src/services/api.js#L72](frontend/src/services/api.js#L72) - Promise rejection not handled
- **Fix**: Add error handlers to all catch blocks
- **Estimated Time**: 1-2 hours
- **Owner**: Frontend Lead

---

### C4: Window.location XSS/Open Redirect
- **Status**: 🔴 CRITICAL
- **Impact**: Security - Open redirect vulnerability
- **Locations**:
  - [frontend/src/services/api.js#L98](frontend/src/services/api.js#L98) - `window.location.href`
  - [frontend/src/pages/IntegrationsPage.jsx#L163](frontend/src/pages/IntegrationsPage.jsx#L163) - `window.location.assign()`
- **Fix**: Replace with React Router navigation or validate URLs
- **Estimated Time**: 1-2 hours
- **Owner**: Frontend Security

```javascript
// Replace:
window.location.href = redirectUrl;

// With:
if (validateRedirectURL(redirectUrl)) {
  navigate(redirectUrl);
}
```

---

### C5: Thrown Error Without Wrapping
- **Status**: 🔴 CRITICAL
- **Impact**: Security - Raw error exposed
- **Location**: [frontend/src/pages/AIApprovalsPage.jsx#L83](frontend/src/pages/AIApprovalsPage.jsx#L83)
- **Code**: `throw new Error("Invalid payload")`
- **Fix**: Wrap with safe error
- **Estimated Time**: 0.5 hours

---

## HIGH PRIORITY ISSUES

### H1: No Retry Logic on API Failures
- **Status**: 🟠 HIGH
- **Impact**: UX - Transient failures cause poor UX
- **Locations**: All axios calls
- **Fix**: Implement axios-retry middleware
- **Estimated Time**: 3-4 hours
- **Owner**: Frontend Lead

```javascript
// Install: npm install axios-retry
import axiosRetry from 'axios-retry';

axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429; // Rate limit
  }
});
```

---

### H2: No Rate Limit Handling
- **Status**: 🟠 HIGH
- **Impact**: UX - Users see raw 429 errors
- **Backend**: Has classification [backend/app/services/openai_rag_service.py#L491](backend/app/services/openai_rag_service.py#L491)
- **Frontend**: Missing handling
- **Fix**: Show user-friendly queue/wait message
- **Estimated Time**: 2-3 hours

---

### H3: Empty Catch Blocks
- **Status**: 🟠 HIGH
- **Impact**: Reliability - Errors silently ignored
- **Locations**:
  - [frontend/src/services/realtime.js#L40](frontend/src/services/realtime.js#L40)
  - [frontend/src/hooks/useVoiceAssistant.js#L34](frontend/src/hooks/useVoiceAssistant.js#L34), L176
  - [frontend/src/components/AttachmentPreviewModal.jsx#L41](frontend/src/components/AttachmentPreviewModal.jsx#L41)
  - [frontend/src/pages/AIApprovalsPage.jsx#L117](frontend/src/pages/AIApprovalsPage.jsx#L117), L139
- **Fix**: Add logging and user feedback
- **Estimated Time**: 1-2 hours

---

### H4: Invalid Form Validation
- **Status**: 🟠 HIGH
- **Impact**: UX - No inline error messages
- **Locations**: All form pages
- **Missing**:
  - Pattern validation for email
  - Password strength feedback
  - Cross-field validation
  - Inline error displays
- **Fix**: Implement zod validation with error display
- **Estimated Time**: 4-5 hours

---

### H5: No Input Field Validations
- **Status**: 🟠 HIGH
- **Impact**: UX/Security - Invalid data accepted
- **Example**: [frontend/src/pages/TasksPage.jsx#L381](frontend/src/pages/TasksPage.jsx#L381) - Task title only has `required`
- **Missing**:
  - Min/max length
  - Pattern matching
  - Real-time feedback
- **Fix**: Add comprehensive validation rules
- **Estimated Time**: 2-3 hours

---

## MEDIUM PRIORITY ISSUES

### M1: Inconsistent Loading States
- **Status**: 🟡 MEDIUM
- **Impact**: UX - Confusing loading indicators
- **Issue**: Some pages use loading, some don't. No skeleton loaders on most pages
- **Fix**: Standardize with skeleton loaders
- **Pages**:
  - [frontend/src/pages/PlanningPage.jsx](frontend/src/pages/PlanningPage.jsx)
  - [frontend/src/pages/IntegrationsPage.jsx](frontend/src/pages/IntegrationsPage.jsx)
  - [frontend/src/pages/AutomationsPage.jsx](frontend/src/pages/AutomationsPage.jsx)
- **Estimated Time**: 3-4 hours

---

### M2: Missing Empty States
- **Status**: 🟡 MEDIUM
- **Impact**: UX - Unclear when no data exists
- **Locations**:
  - All AI pages (Recommendations, Insights, Predictions)
  - Tasks page
  - Projects page
  - Automations page
- **Example**: [TeamAnalyticsPage.jsx#L280](frontend/src/pages/TeamAnalyticsPage.jsx#L280) shows proper empty state
- **Fix**: Apply EmptyState component everywhere
- **Estimated Time**: 3-4 hours

---

### M3: No State Persistence
- **Status**: 🟡 MEDIUM
- **Impact**: UX - Lose state on page reload
- **Issue**: Only auth state persists
- **Fix**: Persist to localStorage with hydration
- **Estimated Time**: 2-3 hours

---

### M4: WebSocket No Reconnection
- **Status**: 🟡 MEDIUM
- **Impact**: Reliability - Lost real-time connection
- **Location**: [frontend/src/services/realtime.js](frontend/src/services/realtime.js)
- **Missing**:
  - Reconnection logic
  - Exponential backoff
  - Heartbeat/ping
  - Connection pool
- **Fix**: Implement auto-reconnect
- **Estimated Time**: 2-3 hours

---

### M5: No Inline Form Validation Errors
- **Status**: 🟡 MEDIUM
- **Impact**: UX - Users don't know what's wrong
- **Example**: [frontend/src/pages/SignupPage.jsx#L346](frontend/src/pages/SignupPage.jsx#L346) - No validation feedback
- **Fix**: Show field-level error messages
- **Estimated Time**: 2-3 hours

---

### M6: Toast Notification Inconsistency
- **Status**: 🟡 MEDIUM
- **Impact**: UX - Inconsistent user feedback
- **Issue**: Some errors show toast, some don't
- **Example**: [frontend/src/pages/AutomationsPage.jsx#L123](frontend/src/pages/AutomationsPage.jsx#L123) - Error toast only in some paths
- **Fix**: Ensure all errors show toast
- **Estimated Time**: 1-2 hours

---

### M7: Race Condition in Store
- **Status**: 🟡 MEDIUM
- **Impact**: Reliability - Data inconsistency
- **Location**: [frontend/src/store/aiCopilotStore.js#L138](frontend/src/store/aiCopilotStore.js#L138)
- **Issue**: Multiple concurrent API calls
- **Fix**: Add request deduplication
- **Estimated Time**: 2 hours

---

### M8: Missing Null Checks
- **Status**: 🟡 MEDIUM
- **Impact**: Reliability - Potential runtime errors
- **Locations**: Various pages where optional data accessed
- **Example**: [frontend/src/pages/SettingsPage.jsx#L307](frontend/src/pages/SettingsPage.jsx#L307) - `user?.full_name` good, but not comprehensive
- **Fix**: Add comprehensive null coalescing
- **Estimated Time**: 2-3 hours

---

## LOW PRIORITY ISSUES

### L1: No Centralized Error Logging
- **Status**: 🟢 LOW
- **Impact**: Ops - Hard to debug production issues
- **Fix**: Integrate Sentry or LogRocket
- **Estimated Time**: 2-3 hours

---

### L2: No Request Deduplication
- **Status**: 🟢 LOW
- **Impact**: Performance - Duplicate API calls
- **Recommendation**: Use request deduplication middleware
- **Estimated Time**: 2 hours

---

### L3: No API Rate Limiting UI
- **Status**: 🟢 LOW
- **Impact**: UX - User sees error when rate limited
- **Fix**: Show queue/wait message
- **Estimated Time**: 1-2 hours

---

## COMPLETION CHECKLIST

### Frontend
- [ ] Remove all raw console.error() statements
- [ ] Add delete confirmations to destructive actions
- [ ] Fix all empty catch blocks
- [ ] Implement retry logic with exponential backoff
- [ ] Validate all window.location assignments
- [ ] Add loading skeletons to all data pages
- [ ] Add empty states to all data lists
- [ ] Implement inline form validation errors
- [ ] Add WebSocket reconnection
- [ ] Standardize toast notification usage
- [ ] Add rate limit handling
- [ ] Implement state persistence

### Backend
- [ ] Verify all error codes map to user-safe messages ✅
- [ ] Ensure rate limit responses are consistent
- [ ] Add request logging for audit trail
- [ ] Implement backup error handler

### DevOps
- [ ] Set up error tracking (Sentry)
- [ ] Configure alerting for critical errors
- [ ] Set up monitoring for API response times
- [ ] Configure log aggregation

---

## TIMELINE

| Phase | Issues | Effort | Timeline |
|-------|--------|--------|----------|
| Phase 1 | C1-C5, H1, H3 | 8-10h | 1 sprint (1 dev) |
| Phase 2 | H2, H4, H5, M1-M3 | 15-18h | 1.5 sprints (2 devs) |
| Phase 3 | M4-M8, L1-L3 | 12-15h | 1 sprint (1-2 devs) |
| **Total** | **23 major issues** | **35-43 hours** | **3-4 weeks (1 FTE)** |

---

## Notes for Developers

1. **Use provided code patterns** - See example implementations above
2. **Test thoroughly** - Especially error paths
3. **Get security review** - Before merging C4 changes
4. **Update docs** - Add error handling to dev guide
5. **Create tests** - For all error scenarios

---

Generated: May 31, 2026
Audit Performed By: GitHub Copilot
