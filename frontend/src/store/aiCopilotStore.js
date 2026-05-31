import { create } from "zustand";

import aiCopilotService from "../services/aiCopilotService";
import { logError } from "../utils/logger";

const ACTIVE_CONVERSATION_KEY =
  "workflowos_ai_copilot_active_conversation_id";

function persistActiveConversation(id) {
  if (id) {
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }
}

const useAICopilotStore = create((set, get) => ({
  conversations: [],
  activeConversationId:
    localStorage.getItem(ACTIVE_CONVERSATION_KEY),
  messages: [],
  isLoading: false,
  isSending: false,
  error: null,

  fetchConversations: async () => {
    try {
      set({
        isLoading: true,
        error: null,
      });

      const data = await aiCopilotService.getConversations();
      const activeConversationId =
        get().activeConversationId;

      const activeStillExists =
        activeConversationId &&
        data.some(
          (conversation) =>
            conversation.id === activeConversationId
        );

      set({
        conversations: data,
        activeConversationId:
          activeStillExists
            ? activeConversationId
            : null,
        isLoading: false,
      });

      if (!activeStillExists) {
        persistActiveConversation(null);
      }
    } catch (err) {
      logError(err, "Failed to load conversations");
      set({
        error: "Failed to load conversations",
        isLoading: false,
      });
    }
  },

  loadConversation: async (id) => {
    try {
      set({
        isLoading: true,
        error: null,
      });

      const data = await aiCopilotService.getConversation(id);
      persistActiveConversation(id);

      set({
        activeConversationId: id,
        messages: data.messages || [],
        isLoading: false,
      });
    } catch (err) {
      logError(err, "Failed to load conversation", { conversationId: id });
      if (err?.response?.status === 404) {
        persistActiveConversation(null);
      }
      set({
        error: "Failed to load conversation",
        activeConversationId:
          err?.response?.status === 404
            ? null
            : get().activeConversationId,
        isLoading: false,
      });
    }
  },

  sendMessage: async (message, file) => {
    try {
      set({
        isSending: true,
        error: null,
      });

      const { activeConversationId } = get();

      const tempUserMsg = {
        id: "temp-" + Date.now(),
        role: "user",
        content: message,
        file_name: file?.name || null,
        created_at: new Date().toISOString(),
      };

      set((state) => ({
        messages: [
          ...state.messages,
          tempUserMsg,
        ],
      }));

      const result = await aiCopilotService.sendMessage(
        message,
        activeConversationId,
        file
      );

      const authoritativeConversationId =
        result.conversation_id;

      if (authoritativeConversationId) {
        persistActiveConversation(
          authoritativeConversationId
        );
        set({
          activeConversationId:
            authoritativeConversationId,
        });
      }

      if (
        !activeConversationId ||
        activeConversationId !==
          authoritativeConversationId
      ) {
        get().fetchConversations();
      }

      let pendingAction = null;
      if (!file) {
        try {
          const detectedAction = await aiCopilotService.detectAction(
            message,
            authoritativeConversationId || activeConversationId
          );

          if (
            detectedAction?.intent &&
            detectedAction.intent !== "none" &&
            detectedAction.requires_confirmation
          ) {
            pendingAction = detectedAction;
          }
        } catch (err) {
          logError(err, "AI action detection unavailable");
        }
      }

      set((state) => ({
        messages: [
          ...state.messages.filter(
            (m) => !m.id?.toString().startsWith("temp")
          ),
          tempUserMsg,
          {
            ...result.message,
            pending_action: pendingAction,
            suggested_actions:
              result.suggested_actions ||
              result.message?.suggested_actions ||
              [],
            confidence:
              result.confidence ||
              result.message?.confidence ||
              null,
          },
        ],
        isSending: false,
      }));
    } catch (err) {
      logError(err, "Failed to send message");
      set({
        error:
          "Failed to send message. " +
          "Please try again.",
        isSending: false,
        messages: get().messages.filter(
          (m) => !m.id?.toString().startsWith("temp")
        ),
      });
    }
  },

  executeAction: async (action) => {
    try {
      set({ isSending: true, error: null });
      const response = await aiCopilotService.executeAction(
        action,
        get().activeConversationId
      );

      const cleanedMessages = get().messages.map((msg) => ({
        ...msg,
        pending_action: msg.pending_action ? null : msg.pending_action,
      }));

      set({
        messages: [
          ...cleanedMessages,
          {
            id: response.message.id,
            role: response.message.role,
            content: response.message.content,
            created_at: response.message.created_at,
            action_result: response.action_result,
          },
        ],
        isSending: false,
      });

      if (response.conversation_id) {
        persistActiveConversation(response.conversation_id);
        set({ activeConversationId: response.conversation_id });
      }

      return response;
    } catch (err) {
      logError(err, "AI action execution failed");
      set({
        error: "Unable to perform this action. Please review the request.",
        isSending: false,
      });
      throw err;
    }
  },

  deleteConversation: async (id) => {
    try {
      set((state) => ({
        conversations: state.conversations.filter(
          (conversation) => conversation.id !== id
        ),
      }));

      await aiCopilotService.deleteConversation(id);

      if (get().activeConversationId === id) {
        persistActiveConversation(null);
        set({
          activeConversationId: null,
          messages: [],
        });
      }
    } catch (err) {
      logError(err, "Delete conversation error", { conversationId: id });

      try {
        const data = await aiCopilotService.getConversations();
        set({ conversations: data });
      } catch {
        // Keep the optimistic UI state if refetch also fails.
      }

      throw err;
    }
  },

  startNewConversation: () => {
    persistActiveConversation(null);
    set({
      activeConversationId: null,
      messages: [],
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));


export default useAICopilotStore;
