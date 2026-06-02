import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * DeleteConfirmationModal - Prevents accidental data loss
 * Shows a confirmation dialog before deleting any resource
 */
export const DeleteConfirmationModal = ({
  isOpen,
  title = "Delete item?",
  description = "This action cannot be undone.",
  itemName = "",
  isDeleting = false,
  onConfirm,
  onCancel,
  isDangerous = true,
}) => {
  const [confirmText, setConfirmText] = useState("");

  const handleConfirm = () => {
    setConfirmText("");
    onConfirm?.();
  };

  const handleCancel = () => {
    setConfirmText("");
    onCancel?.();
  };

  const shouldDisableConfirm = isDangerous && confirmText !== "DELETE";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl text-slate-900 dark:text-slate-100"
            role="alertdialog"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
          >
            <div className="flex gap-3">
              <div className="mt-0.5 flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
              </div>

              <div className="flex-1">
                <h2 id="confirm-title" className="font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </h2>

                <p id="confirm-desc" className="mt-1 text-sm text-slate-600 dark:text-slate-300 break-words">
                  {description}
                  {itemName && <> — <strong className="break-all">{itemName}</strong></>}
                </p>

                {isDangerous && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Type <strong className="text-red-600 dark:text-red-400">DELETE</strong> to confirm
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !shouldDisableConfirm) {
                          handleConfirm();
                        }
                      }}
                    />
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={shouldDisableConfirm || isDeleting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DeleteConfirmationModal;
