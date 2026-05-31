import { useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AdminPage from "./pages/AdminPage";
import AcceptInvitationPage from "./pages/AcceptInvitationPage";


import AboutPage from "./pages/AboutPage";

import CareersPage from "./pages/CareersPage";

import ContactPage from "./pages/ContactPage";

import PrivacyPage from "./pages/PrivacyPage";

import TermsPage from "./pages/TermsPage";

import SecurityPage from "./pages/SecurityPage";

import LandingPage from "./pages/LandingPage";


import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import VerifyOtpPage from "./pages/VerifyOtpPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import MFAVerificationPage from "./pages/MFAVerificationPage";

import ResetPasswordPage from "./pages/ResetPasswordPage";

import SignupPage from "./pages/SignupPage";

import DashboardPage from "./pages/DashboardPage";

import ProjectsPage from "./pages/ProjectsPage";

import TasksPage from "./pages/TasksPage";

import AIInsightsPage from "./pages/AIInsightsPage";
import AIAgentsPage from "./pages/AIAgentsPage";
import AICopilotPage from "./pages/AICopilotPage";
import AIRecommendationsPage from "./pages/AIRecommendationsPage";
import AIApprovalsPage from "./pages/AIApprovalsPage";
import AIExecutionLogsPage from "./pages/AIExecutionLogsPage";
import AIRiskPredictionsPage from "./pages/AIRiskPredictionsPage";
import PlanningPage from "./pages/PlanningPage";
import AutomationsPage from "./pages/AutomationsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import TeamAnalyticsPage from "./pages/TeamAnalyticsPage";
import ExecutiveReportsPage from "./pages/ExecutiveReportsPage";

import NotificationsPage from "./pages/NotificationsPage";

import SettingsPage from "./pages/SettingsPage";

import ProtectedRoute from "./components/ProtectedRoute";
import { featureFlags } from "./config/featureFlags";
import useThemeStore from "./store/themeStore";


export default function App() {
  const initTheme = useThemeStore((state) => state.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <Routes>

      {/* LANDING PAGE */}

      <Route
        path="/"
        element={<LandingPage />}
      />
      <Route
  path="/admin"
  element={
    <ProtectedRoute>
      <AdminPage />
    </ProtectedRoute>
  }
/>


      {/* AUTH PAGES */}

      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/mfa"
        element={<MFAVerificationPage />}
      />

      <Route
  path="/forgot-password"
  element={<ForgotPasswordPage />}
/>
<Route
  path="/verify-otp"
  element={<VerifyOtpPage />}
/>

<Route
  path="/reset-password"
  element={<ResetPasswordPage />}
/>

      <Route
        path="/signup"
        element={<SignupPage />}
      />

      <Route
        path="/verify-email"
        element={<VerifyEmailPage />}
      />

      <Route
  path="/about"
  element={<AboutPage />}
/>

<Route
  path="/careers"
  element={<CareersPage />}
/>

<Route
  path="/contact"
  element={<ContactPage />}
/>

<Route
  path="/privacy"
  element={<PrivacyPage />}
/>

<Route
  path="/terms"
  element={<TermsPage />}
/>

<Route
  path="/security"
  element={<SecurityPage />}
/>
<Route
  path="/accept-invitation/:token"
  element={<AcceptInvitationPage />}
/>


      {/* PROTECTED ROUTES */}

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <TasksPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/ai-insights"
        element={
          <ProtectedRoute>
            <AIInsightsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-risk"
        element={
          <ProtectedRoute>
            <AIRiskPredictionsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-agents"
        element={
          <ProtectedRoute>
            <AIAgentsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-copilot"
        element={
          <ProtectedRoute>
            <AICopilotPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-recommendations"
        element={
          <ProtectedRoute>
            <AIRecommendationsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-approvals"
        element={
          <ProtectedRoute>
            <AIApprovalsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-execution-logs"
        element={
          <ProtectedRoute>
            <AIExecutionLogsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/planning"
        element={
          <ProtectedRoute>
            <PlanningPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/automations"
        element={
          <ProtectedRoute>
            <AutomationsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/integrations"
        element={
          featureFlags.integrationsEnabled ? (
            <ProtectedRoute>
              <IntegrationsPage />
            </ProtectedRoute>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />

      <Route
        path="/team-analytics"
        element={
          <ProtectedRoute>
            <TeamAnalyticsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/executive-reports"
        element={
          <ProtectedRoute>
            <ExecutiveReportsPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />


      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />


      {/* FALLBACK */}

      <Route
        path="*"
        element={<Navigate to="/" />}
      />

    </Routes>
  );
}
