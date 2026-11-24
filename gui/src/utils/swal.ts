import Swal, { SweetAlertResult } from "sweetalert2";

const THEME = {
  background: "var(--bg-secondary)",
  color: "var(--text-main)",
};

export const swalSuccess = (title: string, text?: string): Promise<SweetAlertResult> =>
  Swal.fire({
    ...THEME,
    title,
    text,
    icon: "success",
    confirmButtonColor: "var(--accent)",
  });

export const swalError = (title: string, text?: string): Promise<SweetAlertResult> =>
  Swal.fire({
    ...THEME,
    title,
    text,
    icon: "error",
    confirmButtonColor: "var(--accent)",
  });

export const swalConfirm = (
  title: string,
  text?: string,
  confirmText: string = "Yes"
): Promise<SweetAlertResult> =>
  Swal.fire({
    ...THEME,
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    confirmButtonColor: "var(--danger)",
    cancelButtonColor: "var(--bg-tertiary)",
  });

export const swalInfo = (title: string, text?: string): Promise<SweetAlertResult> =>
  Swal.fire({
    ...THEME,
    title,
    text,
    icon: "info",
    confirmButtonColor: "var(--accent)",
  });
