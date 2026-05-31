import { create } from "zustand";

import api from "../services/api";


const useAuthStore = create((set) => ({
  user: null,

  token: localStorage.getItem(
    "workflowos_token"
  ),

  isAuthenticated: !!localStorage.getItem(
    "workflowos_token"
  ),

  isLoading: false,


  login: async (credentialsOrEmail, password) => {
    try {
      set({ isLoading: true, error: null });

      const credentials =
        typeof credentialsOrEmail === "object"
          ? credentialsOrEmail
          : {
              email: credentialsOrEmail,
              password,
            };

      const response = await api.post(
        "/auth/login",
        credentials
      );

      if (response.data.mfa_required) {
        set({ isLoading: false });

        return {
          success: true,
          mfaRequired: true,
          mfaToken: response.data.mfa_token,
          method: response.data.method,
          resendAfter:
            response.data.resend_after || 0,
        };
      }

      const token =
        response.data.access_token ||
        response.data.token;

      localStorage.setItem(
        "workflowos_token",
        token
      );

      const user =
        response.data.user ||
        (
          await api.get(
            "/auth/me",
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )
        ).data.data;

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });

      if (user?.full_name) {
        localStorage.setItem(
          "user_name",
          user.full_name
        );
      }

      if (user?.email) {
        localStorage.setItem(
          "user_email",
          user.email
        );
      }

      if (user?.role) {
        localStorage.setItem(
          "user_role",
          user.role
        );
      }

      if (user?.avatar_url) {
        localStorage.setItem(
          "user_avatar_url",
          user.avatar_url
        );
      }

      return {
        success: true,
      };

    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },


  signup: async (
    full_name,
    email,
    password,
    account_type
  ) => {
    try {
      set({ isLoading: true });

      await api.post("/auth/register", {
        full_name,
        email,
        password,
        account_type,
      });

      set({ isLoading: false });

      return {
        success: true,
      };

    } catch (error) {
      set({ isLoading: false });

      return {
        success: false,
        message:
          error.response?.data?.detail
          || "Signup failed",
      };
    }
  },


  logout: () => {
    localStorage.removeItem(
      "workflowos_token"
    );
    localStorage.removeItem(
      "user_avatar_url"
    );

    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },


  updateUser: (updates) => {
    set((state) => {
      const nextUser = {
        ...(state.user || {}),
        ...updates,
      };

      if (nextUser.full_name) {
        localStorage.setItem(
          "user_name",
          nextUser.full_name
        );
      }

      if (nextUser.email) {
        localStorage.setItem(
          "user_email",
          nextUser.email
        );
      }

      if (nextUser.role) {
        localStorage.setItem(
          "user_role",
          nextUser.role
        );
      }

      if (nextUser.avatar_url) {
        localStorage.setItem(
          "user_avatar_url",
          nextUser.avatar_url
        );
      }

      return {
        user: nextUser,
      };
    });
  },
}));


export default useAuthStore;
