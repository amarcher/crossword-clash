import { useCallback, type MouseEvent } from "react";
import { Link, type LinkProps } from "react-router";
import { prefetchRoute } from "../../routeModules";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";

interface TransitionLinkProps extends Omit<LinkProps, "to"> {
  to: string;
}

/** A click the browser would handle in this tab: left button, no modifier, no target. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>, target: string | undefined): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!target || target === "_self")
  );
}

/**
 * A router Link that warms its route's chunk on intent (pointer enter, focus,
 * touch start) and, on a plain click, navigates inside the site cross-fade.
 * Modified clicks (new tab, etc.) and `target` links fall through to the Link.
 */
export function TransitionLink({ to, onClick, onPointerEnter, onFocus, onTouchStart, replace, target, ...rest }: TransitionLinkProps) {
  const go = useTransitionNavigate();
  const warm = useCallback(() => {
    prefetchRoute(to);
  }, [to]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !isPlainClick(event, target)) return;
    event.preventDefault();
    go(to, { replace });
  };

  return (
    <Link
      to={to}
      replace={replace}
      target={target}
      onClick={handleClick}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        warm();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        warm();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        warm();
      }}
      {...rest}
    />
  );
}
