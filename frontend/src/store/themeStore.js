import { create } from "zustand";
import { persist } from "zustand/middleware";

const useThemeStore = create(
  persist(
    (set, get) => ({
      isDark: false,

      toggleDark: () => {
        const newVal = !get().isDark;
        set({ isDark: newVal });

        if (newVal) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      },

      initTheme: () => {
        const isDark = get().isDark;

        if (isDark) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      },
    }),
    {
      name: "workflowos-theme",
      partialize: (state) => ({
        isDark: state.isDark,
      }),
    }
  )
);

export default useThemeStore;
