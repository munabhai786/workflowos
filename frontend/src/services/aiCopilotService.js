import api from "./api";


const aiCopilotService = {
  getConversations: async () => {
    const res = await api.get(
      "/ai-copilot/conversations"
    );
    return res.data;
  },

  getConversation: async (id) => {
    const res = await api.get(
      `/ai-copilot/conversations/${id}`
    );
    return res.data;
  },

  deleteConversation: async (id) => {
    const idStr = id.toString();

    const res = await api.delete(
      `/ai-copilot/conversations/${idStr}`
    );
    return res.data;
  },

  createConversation: async () => {
    const res = await api.post(
      "/ai-copilot/conversations"
    );
    return res.data;
  },

  sendMessage: async (
    message,
    conversationId,
    file
  ) => {
    const formData = new FormData();
    formData.append("message", message);

    if (conversationId) {
      formData.append(
        "conversation_id",
        conversationId
      );
    }

    if (file) {
      formData.append("file", file);
    }

    const res = await api.post(
      "/ai-copilot/chat",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return res.data;
  },

  detectAction: async (
    message,
    conversationId
  ) => {
    const res = await api.post(
      "/ai-copilot/actions/detect",
      {
        message,
        conversation_id: conversationId || null,
      }
    );
    return res.data;
  },

  executeAction: async (action, conversationId) => {
    const res = await api.post(
      "/ai-copilot/actions/execute",
      {
        action,
        conversation_id: conversationId || null,
      }
    );
    return res.data;
  },
};


export default aiCopilotService;
