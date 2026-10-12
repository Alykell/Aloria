import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { foldService, HighlightStyle, indentUnit, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language'
import { yaml as yamlLegacy } from '@codemirror/legacy-modes/mode/yaml'
import { json } from '@codemirror/lang-json'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { tags } from '@lezer/highlight'

/**
 * Éditeur de code de l'onglet Fichiers : couleurs selon le type de fichier, traits d'indentation, guillemets et
 * parenthèses fermés tout seuls, numéros de ligne, recherche (Ctrl+F), annuler/refaire, Ctrl+S pour enregistrer.
 */

/**
 * server.properties et fichiers « clé=valeur » : nom du réglage, puis valeur colorée selon son type (oui/non, nombre,
 * texte). Le mode « properties » de CodeMirror colore toute la ligne pareil.
 */
const keyValueMode = {
  name: 'properties',
  startState: () => ({ inValue: false }),
  token(stream: StringStream, state: { inValue: boolean }): string | null {
    if (stream.sol()) {
      state.inValue = false
      stream.eatSpace()
      if (stream.peek() === '#' || stream.peek() === '!') {
        stream.skipToEnd()
        return 'comment'
      }
    }
    if (!state.inValue) {
      if (stream.eat('=') || stream.eat(':')) {
        state.inValue = true
        return 'operator'
      }
      stream.eatWhile(/[^=:]/)
      return 'property'
    }
    const value = stream.string.slice(stream.pos).trim()
    stream.skipToEnd()
    if (/^(true|false)$/i.test(value)) return 'atom'
    if (/^-?\d+(\.\d+)?$/.test(value)) return 'number'
    return value ? 'string' : null
  }
}

/**
 * YAML : le mode classique distingue clés, nombres et oui/non (le parseur récent met toutes les valeurs dans « contenu »).
 * On renomme ses couleurs : clé (« atom » chez lui) en bleu, true/false en rose, valeurs sans guillemets en vert.
 */
const yamlMode = {
  ...yamlLegacy,
  token(stream: StringStream, state: unknown): string | null {
    const style = (yamlLegacy.token as (s: StringStream, st: unknown) => string | null)(stream, state)
    if (style === 'atom') return 'property'
    if (style === 'keyword') return 'atom'
    if (style === 'meta') return 'operator'
    if (style === null && /[^\s:,[\]{}-]/.test(stream.current())) return 'string'
    return style
  }
}

/** Repli des blocs selon l'indentation (YAML, et tout fichier indenté) */
const indentFold = foldService.of((state, from) => {
  const line = state.doc.lineAt(from)
  if (!line.text.trim()) return null
  const indent = (text: string) => /^\s*/.exec(text)![0].length
  const base = indent(line.text)
  let end = line.to
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n)
    if (!next.text.trim()) continue
    if (indent(next.text) <= base) break
    end = next.to
  }
  return end > line.to ? { from: line.to, to: end } : null
})

/** Langage d'après l'extension ; null = texte simple */
function languageOf(name: string): Extension | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'yml' || ext === 'yaml') return [StreamLanguage.define(yamlMode), indentFold]
  if (ext === 'json' || ext === 'json5' || ext === 'mcmeta') return json()
  if (['properties', 'cfg', 'conf', 'ini', 'lang', 'secret'].includes(ext)) return StreamLanguage.define(keyValueMode)
  if (ext === 'toml') return StreamLanguage.define(toml)
  if (ext === 'sh' || ext === 'bat' || ext === 'cmd') return StreamLanguage.define(shell)
  return null
}

/** YAML n'accepte pas les tabulations : indentation en espaces (2 pour YAML, 4 ailleurs) */
const indentOf = (name: string) => (/\.ya?ml$/i.test(name) ? '  ' : '    ')

const aloriaTheme = EditorView.theme(
  {
    '&': { color: '#d6eaf2', backgroundColor: '#0b1b26', height: '100%', fontSize: '13px' },
    '.cm-scroller': { fontFamily: "Consolas, 'Cascadia Mono', monospace", lineHeight: '1.5' },
    '.cm-content': { caretColor: '#5cc8e0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#5cc8e0' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(92, 200, 224, 0.25)' },
    '.cm-gutters': { backgroundColor: '#0b1b26', color: '#4f6d7c', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(92, 200, 224, 0.08)', color: '#9dc4d2' },
    '.cm-activeLine': { backgroundColor: 'rgba(92, 200, 224, 0.06)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(92, 200, 224, 0.25)', outline: '1px solid rgba(92, 200, 224, 0.5)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(246, 234, 210, 0.25)' },
    '.cm-panels': { backgroundColor: '#10263a', color: '#d6eaf2' },
    '.cm-tooltip': { backgroundColor: '#10263a', border: '1px solid rgba(92, 200, 224, 0.3)' },
    '.cm-foldPlaceholder': { backgroundColor: 'rgba(92, 200, 224, 0.15)', border: 'none', color: '#9dc4d2' }
  },
  { dark: true }
)

const aloriaHighlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName), tags.attributeName], color: '#7fd4ee' },
  { tag: [tags.string, tags.special(tags.string)], color: '#a8e6a3' },
  { tag: [tags.number, tags.integer, tags.float], color: '#f6c177' },
  { tag: [tags.bool, tags.null, tags.atom, tags.keyword], color: '#f4a3c0' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#6b8a9a', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.separator, tags.bracket, tags.squareBracket, tags.brace], color: '#9db4c0' },
  { tag: [tags.heading, tags.meta, tags.labelName, tags.typeName], color: '#c4a7f2' },
  { tag: [tags.operator], color: '#9db4c0' },
  { tag: tags.variableName, color: '#d6eaf2' }
])

interface Props {
  /** Nom du fichier (choisit les couleurs) */
  name: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
}

export default function CodeEditor({ name, value, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Les rappels changent à chaque rendu : l'éditeur, créé une fois, lit toujours les derniers
  const callbacks = useRef({ onChange, onSave })
  callbacks.current = { onChange, onSave }

  useEffect(() => {
    if (!host.current) return
    const language = languageOf(name)
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([
          indentWithTab,
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              callbacks.current.onSave()
              return true
            }
          }
        ]),
        indentUnit.of(indentOf(name)),
        EditorState.tabSize.of(indentOf(name).length),
        ...(language ? [language] : []),
        aloriaTheme,
        syntaxHighlighting(aloriaHighlight),
        indentationMarkers({
          markerType: 'fullScope',
          thickness: 1,
          colors: {
            light: 'rgba(92, 200, 224, 0.18)',
            dark: 'rgba(92, 200, 224, 0.18)',
            activeLight: 'rgba(92, 200, 224, 0.5)',
            activeDark: 'rgba(92, 200, 224, 0.5)'
          }
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
        })
      ]
    })
    view.current = new EditorView({ state, parent: host.current })
    view.current.focus()
    return () => {
      view.current?.destroy()
      view.current = null
    }
    // Un nouvel éditeur par fichier ouvert ; le texte tapé n'est pas renvoyé dans l'éditeur
  }, [name])

  return <div className="code-editor" ref={host} />
}
