import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import en from './locales/en.json';

const stored =
  typeof localStorage !== 'undefined' ? localStorage.getItem('pb2d.lang') : null;
const initialLang = stored === 'en' ? 'en' : 'ja';

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
