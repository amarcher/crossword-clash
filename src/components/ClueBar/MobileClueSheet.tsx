import { useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface MobileClueSheetProps {
  open: boolean;
  onClose: () => void;
  scoreboard: ReactNode;
  cluePanel: ReactNode;
}

export function MobileClueSheet({
  open,
  onClose,
  scoreboard,
  cluePanel,
}: MobileClueSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const handleEscape = useCallback(() => {
    onClose();
  }, [onClose]);

  useFocusTrap(open ? sheetRef : { current: null }, handleEscape);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 max-h-[60dvh] bg-white rounded-t-2xl shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={t('clueSheet.ariaLabel')}
      >
        {/* Handle */}
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 flex flex-col gap-3">
          {scoreboard}
          {cluePanel}
        </div>
      </div>
    </div>
  );
}
