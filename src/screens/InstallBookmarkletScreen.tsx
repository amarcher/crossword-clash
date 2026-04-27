import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router";
import { useTranslation, Trans } from "react-i18next";
import { buildBookmarkletUrl } from "../lib/bookmarkletSource";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function InstallBookmarkletScreen() {
  const { t } = useTranslation();
  const url = useMemo(buildBookmarkletUrl, []);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <div className="min-h-dvh crossword-bg">
      <div className="max-w-xl mx-auto px-5 py-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-neutral-800">
            {t("bookmarklet.pageTitle")}
          </h1>
          <LanguageSwitcher />
        </div>

        <h2 className="text-lg font-semibold text-neutral-700 mt-8 mb-3">
          {t("bookmarklet.option1Heading")}
        </h2>
        <div className="flex flex-col items-start gap-3 mb-3">
          <span className="font-semibold text-neutral-600">
            {t("bookmarklet.option1Instruction")}
          </span>
          <div className="flex items-center gap-4">
            <a
              href={url}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold text-lg no-underline cursor-grab active:cursor-grabbing"
              onClick={(e) => e.preventDefault()}
            >
              {t("bookmarklet.buttonLabel")}
            </a>
            <span className="pointer-events-none animate-[bounce-up_1.5s_ease-in-out_infinite]">
              <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16">
                <path d="M32 56V16" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
                <path
                  d="M16 30L32 16L48 30"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect x="10" y="4" width="44" height="6" rx="2" fill="#2563eb" opacity="0.15" />
              </svg>
            </span>
          </div>
        </div>
        <p className="text-sm text-neutral-500">
          {t("bookmarklet.bookmarksBarHint")}
        </p>

        <h2 className="text-lg font-semibold text-neutral-700 mt-8 mb-3">
          {t("bookmarklet.option2Heading")}
        </h2>
        <ol className="list-decimal pl-5 space-y-2 text-neutral-700">
          <li>{t("bookmarklet.option2Step1")}</li>
          <li>
            <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-sm">
              {t("bookmarklet.option2Step2")}
            </code>
          </li>
          <li>{t("bookmarklet.option2Step3")}</li>
        </ol>
        <textarea
          readOnly
          rows={4}
          value={url}
          className="w-full mt-3 p-2 text-[10px] font-mono border border-neutral-300 rounded bg-white"
        />
        <button
          onClick={handleCopy}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {copied ? t("bookmarklet.copied") : t("bookmarklet.copy")}
        </button>

        <div className="mt-8 p-4 rounded-lg border border-amber-200 bg-amber-50/70 text-sm text-neutral-700">
          <p className="font-semibold mb-1 text-neutral-800">
            {t("bookmarklet.disclosureHeading")}
          </p>
          <p className="leading-relaxed">{t("bookmarklet.disclosureText")}</p>
        </div>

        <h2 className="text-lg font-semibold text-neutral-700 mt-8 mb-3">
          {t("bookmarklet.usageHeading")}
        </h2>
        <ol className="list-decimal pl-5 space-y-2 text-neutral-700">
          <li>
            <Trans
              i18nKey="bookmarklet.usageStep1"
              components={{
                daily: (
                  // eslint-disable-next-line jsx-a11y/anchor-has-content
                  <a
                    href="https://www.nytimes.com/crosswords/game/daily"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  />
                ),
                mini: (
                  // eslint-disable-next-line jsx-a11y/anchor-has-content
                  <a
                    href="https://www.nytimes.com/crosswords/game/mini"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  />
                ),
              }}
            />
          </li>
          <li>{t("bookmarklet.usageStep2")}</li>
          <li>{t("bookmarklet.usageStep3")}</li>
        </ol>

        <div className="mt-8">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            {t("bookmarklet.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
