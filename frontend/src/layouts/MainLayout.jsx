import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import CommandPalette from "../components/CommandPalette";

import Topbar from "../components/Topbar";


export default function MainLayout({
  children,
}) {
  const [isOpen, setIsOpen] =
    useState(false);
  const location = useLocation();


  return (
    <div className="app-shell flex min-h-dvh overflow-x-hidden bg-slate-50 text-slate-950 transition-colors duration-200 dark:bg-slate-900 dark:text-slate-100">

      <Sidebar
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />

      <CommandPalette />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-slate-50 transition-colors duration-200 dark:bg-slate-900">

        <Topbar
          setIsOpen={setIsOpen}
        />

        <main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-3 transition-colors duration-200 dark:bg-slate-900 sm:p-5 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="relative w-full min-w-0 max-w-none animate-fade-in"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

    </div>
  );
}
