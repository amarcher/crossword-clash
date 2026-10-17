import { useCallback } from "react";
import { useNavigate, type NavigateOptions } from "react-router";
import { navigateWithTransition } from "../lib/transitionNavigate";

/** `useNavigate` whose pushes run inside the site's cross-fade (see lib/transitionNavigate). */
export function useTransitionNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: string, options?: NavigateOptions) => {
      void navigateWithTransition(navigate, to, options);
    },
    [navigate],
  );
}
