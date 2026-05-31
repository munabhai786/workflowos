import axios from "axios";
import { logError } from "../utils/logger";
import { safeRedirect, isSafeRedirectPath } from "../utils/navigation";

const api = axios.create({

  baseURL:
    import.meta.env.VITE_API_URL,

});


const FALLBACK_ERROR_MESSAGE =
  "Something went wrong. Please try again.";


export function getSafeApiMessage(error, fallback = FALLBACK_ERROR_MESSAGE) {
  const data = error?.response?.data;

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (typeof data?.detail === "object" && typeof data.detail?.message === "string") {
    return data.detail.message;
  }

  if (error?.code === "ECONNABORTED") {
    return "The request took too long. Please try again.";
  }

  if (!error?.response) {
    return "Unable to reach the server. Please try again.";
  }

  return fallback;
}


api.interceptors.request.use(

  (config) => {

    const token =
      localStorage.getItem("token") ||
      localStorage.getItem(
        "workflowos_token"
      );

    if (token) {

      config.headers.Authorization =
        `Bearer ${token}`;

    }


    return config;

  },

  (error) => Promise.reject(error)

);


api.interceptors.response.use(

  (response) => response,

  (error) => {
    const status =
      error?.response?.status;

    const requestUrl =
      error?.config?.url || "";

    if (
      status === 401 &&
      !requestUrl.includes("/auth/login")
    ) {

      localStorage.removeItem("token");
      localStorage.removeItem(
        "workflowos_token"
      );

      logError(error, "Authentication failed - redirecting to login");
      
      if (isSafeRedirectPath("/login")) {
        safeRedirect("/login", true);
      } else {
        window.location.href = "/login";
      }

    }

    return Promise.reject(error);

  }

);


export default api;
