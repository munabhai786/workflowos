from app.models.user import User

from app.models.project import Project

from app.models.project_member import ProjectMember

from app.models.task import Task

from app.models.notification import Notification

from app.models.activity import Activity

from app.models.project_invitation import ProjectInvitation

from app.models.task_comment import TaskComment

from app.models.attachment import Attachment

from app.models.milestone import Milestone

from app.models.sprint import Sprint, SprintTask

from app.models.automation import AutomationRule, AutomationExecution, WorkflowTrigger

from app.models.analytics import (
    AnalyticsSnapshot,
    ProductivityMetric,
    SprintMetric,
    WorkloadMetric,
    ForecastingResult,
    AIAnalyticsSummary,
)

from app.models.ai_agent import (
    AIConversation,
    AIDocument,
    AIDocumentChunk,
    AIAgentMemory,
    AIRecommendation,
    AIMessage,
    AIRetrievalLog,
    AIExecutionLog,
    AIApprovalHistory,
    AIContextSnapshot,
    AIDecisionHistory,
    AISummary,
    AIOperationalObservation,
)

from app.models.integration import (
    APIToken,
    ExternalEvent,
    Integration,
    IntegrationSetting,
    OAuthAccount,
    OAuthState,
    OrchestrationEvent,
    SyncHistory,
    WebhookEndpoint,
    WebhookLog,
)

from app.models.ai_copilot import (
    AIConversation,
    AIMessage,
    AIUploadedFile,
)
