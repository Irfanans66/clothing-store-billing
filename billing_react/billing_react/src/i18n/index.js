// App language. The shop picks it at signup or in Settings; every screen and receipt follows it.
//
// The English text is the key: t('Print') looks 'Print' up in the shop's language file and
// falls back to the English when a line isn't translated yet, so nothing ever shows blank.
// Language files load on demand (src/i18n/locales/<code>.js), so English shops download none.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCallback } from 'react'

export const LANGUAGES = [
  { code: 'en', name: 'English',  english: 'English' },
  { code: 'hi', name: 'हिन्दी',     english: 'Hindi' },
  { code: 'mr', name: 'मराठी',     english: 'Marathi' },
  { code: 'gu', name: 'ગુજરાતી',    english: 'Gujarati' },
  { code: 'bn', name: 'বাংলা',     english: 'Bengali' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ',     english: 'Punjabi' },
  { code: 'ta', name: 'தமிழ்',     english: 'Tamil' },
  { code: 'te', name: 'తెలుగు',     english: 'Telugu' },
  { code: 'kn', name: 'ಕನ್ನಡ',      english: 'Kannada' },
  { code: 'ml', name: 'മലയാളം',    english: 'Malayalam' },
  { code: 'es', name: 'Español',   english: 'Spanish' },
  { code: 'fr', name: 'Français',  english: 'French' },
  { code: 'pt', name: 'Português', english: 'Portuguese' },
  { code: 'ru', name: 'Русский',   english: 'Russian' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'zh', name: '中文',       english: 'Chinese' },
  { code: 'ar', name: 'العربية',    english: 'Arabic', rtl: true },
  { code: 'ur', name: 'اردو',       english: 'Urdu', rtl: true },
]
/** Arabic and Urdu read right to left: the whole app is mirrored. */
export const isRtl = (code) => LANGUAGES.some((l) => l.code === code && l.rtl)
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.code === 'en' ? 'English' : `${l.name} · ${l.english}`,
}))

const loaders = import.meta.glob('./locales/*.js')

export const useLangStore = create(
  persist(
    (set, get) => ({
      lang: 'en',
      dict: {},
      setLang: async (code) => {
        if (!LANGUAGES.some((l) => l.code === code)) code = 'en'
        const load = loaders[`./locales/${code}.js`]
        const dict = load ? (await load()).default : {}
        set({ lang: code, dict })
        document.documentElement.lang = code
        document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr'
      },
      // After a reload the language is remembered but its file still has to load
      restore: () => { const { lang } = get(); if (lang !== 'en') get().setLang(lang) },
    }),
    { name: 'app-language', partialize: (s) => ({ lang: s.lang }) },
  ),
)

function fill(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : text
}

/** Translate outside React (messages from utilities). */
export function translate(text, vars) {
  return fill(useLangStore.getState().dict[text] ?? text, vars)
}

/** const t = useT();  t('Print')  ·  t('Bill {no} saved', { no }) */
export function useT() {
  const dict = useLangStore((s) => s.dict)
  return useCallback((text, vars) => fill(dict[text] ?? text, vars), [dict])
}
