import { useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Capacitor } from "@capacitor/core";

interface MobileClueSheetProps {
  open: boolean;
  onClose: () => void;
  scoreboard: ReactNode;
  cluePanel: ReactNode;
  /**
   * The grid's hidden input. Closing the sheet focuses it again INSIDE the
   * tap, so the on-screen keyboard comes back with the puzzle: the focus
   * trap's own restore runs from an effect cleanup, a later task that iOS
   * and Android ignore for the keyboard, which left the solver on a grid
   * with no focus and no keyboard until they tapped a square (reported
   * 2026-10-30).
   */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function MobileClueSheet({
  open,
  onClose,
  scoreboard,
  cluePanel,
  inputRef,
}: MobileClueSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const native = Capacitor.isNativePlatform();

  // Back to the puzzle: the grid takes focus first, while this is still the
  // user's gesture, then the sheet goes.
  const close = useCallback(() => {
    inputRef?.current?.focus();
    onClose();
  }, [inputRef, onClose]);

  useFocusTrap(open ? sheetRef : { current: null }, close);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-50 ${native ? "native-clue-sheet" : "md:hidden"}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={close}
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
        {native && <button type="button" onClick={close} className="self-end px-4 py-2 text-blue-700 font-semibold">{t("keyboard.backToPuzzle")}</button>}
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 flex flex-col gap-3">
          {scoreboard}
          {cluePanel}
        </div>
      </div>
    </div>
  );
}
