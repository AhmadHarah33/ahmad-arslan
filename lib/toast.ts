export type ToastType = "error" | "success" | "info";

// Fire a toast from anywhere (client). Rendered by <Toaster/> in the app shell.
export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app-toast", { detail: { message, type } })
  );
}

export const toastErr = (message: string) => toast(message, "error");
