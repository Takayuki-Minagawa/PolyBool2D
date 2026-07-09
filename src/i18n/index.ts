import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import en from './locales/en.json';
import { readLanguage } from '../app/preferences';

const initialLang = readLanguage();

i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
});

export default i18n;
