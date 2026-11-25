import React from 'react'

/** Puts React elements into a translated sentence: rich(translatedText, { link: <a/> }) fills {link}. */
export function rich(text, parts) {
  return text.split(/(\{\w+\})/).map((p, i) => {
    const k = p.match(/^\{(\w+)\}$/)?.[1]
    return k && k in parts ? <React.Fragment key={i}>{parts[k]}</React.Fragment> : p
  })
}
