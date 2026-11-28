import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en/translation.json';
import zh from './locales/zh/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    // The product is Chinese-first: a fresh visitor (and every demo sandbox)
    // starts in 中文, and the header toggle persists an explicit choice.
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Drop `navigator`: an English browser locale should not silently flip
      // the UI to English on first visit. Only an explicit toggle wins.
      order: ['localStorage'],
      caches: ['localStorage'],
    },
  });

export default i18n;
