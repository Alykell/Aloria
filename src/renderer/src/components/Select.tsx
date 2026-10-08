import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  className?: string
  /** Pour les captures de développement (sélection d'une valeur par script) */
  name?: string
}

/**
 * Menu déroulant aux couleurs d'Aloria, à la place de celui de Windows (carré, impossible à styliser).
 * La liste s'ouvre dans un calque au-dessus de tout (pas coupée par une fenêtre défilante), vers le bas ou vers
 * le haut selon la place, et se pilote aussi au clavier (flèches, Entrée, Échap, lettres).
 */
export default function Select<T extends string>({ value, options, onChange, className, name }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
    maxHeight: number
  } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const selected = options.find((o) => o.value === value)

  const openList = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value)
      )
    )
    setOpen(true)
  }

  // Position sous le bouton, ou au-dessus s'il n'y a pas la place
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const wanted = Math.min(320, options.length * 38 + 12)
    const down = below >= wanted || below >= above
    setPlace({
      left: r.left,
      width: r.width,
      ...(down ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }),
      maxHeight: Math.max(120, Math.min(320, down ? below : above))
    })
  }, [open, options.length])

  // L'élément choisi visible à l'ouverture et pendant la navigation au clavier
  useEffect(() => {
    if (!open) return
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active, place])

  // Fermeture : clic ailleurs, défilement de la page, fenêtre redimensionnée
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.target instanceof Node && (list.current?.contains(e.target) || button.current?.contains(e.target))) return
      setOpen(false)
    }
    const shut = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', shut)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', shut)
    }
  }, [open])

  const choose = (i: number) => {
    const o = options[i]
    if (o && o.value !== value) onChange(o.value)
    setOpen(false)
    button.current?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(options.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key.length === 1) {
      // Première option qui commence par la lettre tapée (après l'icône éventuelle)
      const letter = e.key.toLowerCase()
      const i = options.findIndex(
        (o, j) =>
          j > active &&
          o.label
            .replace(/^\P{L}+/u, '')
            .toLowerCase()
            .startsWith(letter)
      )
      const first = options.findIndex((o) =>
        o.label
          .replace(/^\P{L}+/u, '')
          .toLowerCase()
          .startsWith(letter)
      )
      if (i >= 0 || first >= 0) setActive(i >= 0 ? i : first)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`select ${open ? 'open' : ''} ${className ?? ''}`}
        data-select={name}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <span className="select__label">{selected?.label ?? ''}</span>
        <svg className="select__chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            className="select__list"
            role="listbox"
            style={{
              left: place.left,
              minWidth: place.width,
              top: place.top,
              bottom: place.bottom,
              maxHeight: place.maxHeight
            }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`${i === active ? 'active' : ''} ${o.value === value ? 'chosen' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                {o.label}
                {o.value === value && <span className="select__check">✓</span>}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  )
}
