import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import Select from './Select'
import { useGameData } from '../itemIcons'
import { useVersions, describeProfile } from '../hooks/useVersions'
import type { ProfilesState } from '../hooks/useProfiles'
import type { DatapackCreation, GameData, Recipe, RecipeIngredient, RecipeKind } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../i18n'
import { askConfirm } from '../confirm'

interface Props {
  datapack: DatapackCreation
  profiles: ProfilesState
  onBack: () => void
  onChanged: (dp: DatapackCreation) => void
  onError: (message: string) => void
}

/** Les datapacks existent depuis la 1.13 (« latest-release », snapshots et 26.x : récents) */
export const hasDatapacks = (versionId: string) => {
  const m = /^1\.(\d+)/.exec(versionId)
  return !m || Number(m[1]) >= 13
}

/** Postes de travail : l'établi couvre les recettes avec et sans forme */
const STATIONS: { id: string; kinds: RecipeKind[]; item: string; label: MessageKey }[] = [
  { id: 'crafting', kinds: ['shaped', 'shapeless'], item: 'minecraft:crafting_table', label: 'rc.station.crafting' },
  { id: 'smelting', kinds: ['smelting'], item: 'minecraft:furnace', label: 'rc.station.smelting' },
  { id: 'blasting', kinds: ['blasting'], item: 'minecraft:blast_furnace', label: 'rc.station.blasting' },
  { id: 'smoking', kinds: ['smoking'], item: 'minecraft:smoker', label: 'rc.station.smoking' },
  { id: 'campfire', kinds: ['campfire'], item: 'minecraft:campfire', label: 'rc.station.campfire' },
  { id: 'stonecutting', kinds: ['stonecutting'], item: 'minecraft:stonecutter', label: 'rc.station.stonecutting' }
]
/** Aide « Raccourcis » : touches (textes traduits) → ce qu'elles font */
const SHORTCUTS: [MessageKey[], MessageKey][] = [
  [['rc.key.drag'], 'rc.sc.drag'],
  [['rc.key.click', 'rc.key.click'], 'rc.sc.click'],
  [['rc.key.shift', 'rc.key.drag'], 'rc.sc.shift'],
  [['rc.key.dragSlot'], 'rc.sc.move'],
  [['rc.key.ctrl', 'rc.key.dragSlot'], 'rc.sc.copy'],
  [['rc.key.right'], 'rc.sc.clear'],
  [['rc.key.dragOut'], 'rc.sc.clearOut'],
  [['rc.key.groups'], 'rc.sc.groups']
]
const COOKING_TIME: Partial<Record<RecipeKind, number>> = { smelting: 200, blasting: 100, smoking: 100, campfire: 600 }
const isCooking = (k: RecipeKind) => k in COOKING_TIME
const stationOf = (k: RecipeKind) => STATIONS.find((s) => s.kinds.includes(k))!

/** Les 9 cases de l'établi (les recettes sans forme sont rangées dans l'ordre) */
const cellsOf = (r: Recipe): (RecipeIngredient | null)[] =>
  r.kind === 'shaped' ? (r.grid ?? Array(9).fill(null)) : Array.from({ length: 9 }, (_, i) => r.ingredients?.[i] ?? null)

const isComplete = (r: Recipe) =>
  !!r.result && (r.kind === 'shaped' || r.kind === 'shapeless' ? cellsOf(r).some((c) => c && c.length) : !!r.input?.length)

type Drag = { item: string } | { slot: string }
const DRAG = 'application/x-aloria-recipe'

export default function RecipeEditor({ datapack, profiles, onBack, onChanged, onError }: Props) {
  const [dp, setDp] = useState(datapack)
  const [selected, setSelected] = useState<number>(datapack.recipes.length ? 0 : -1)
  const [slot, setSlot] = useState<string>('g0')
  const [saved, setSaved] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [vanillaOpen, setVanillaOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const { versions } = useVersions(false)
  const { data, icons } = useGameData(dp.gameVersion, onError)
  const dirty = useRef(false)
  const dpRef = useRef(dp)
  dpRef.current = dp

  // Ingrédients au choix (tags…) : l'icône change chaque seconde, comme dans le livre de recettes du jeu
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const save = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    const res = await window.aloria.datapacks.save(dpRef.current)
    if (!res.ok) return onError(res.error)
    setSaved(!dirty.current)
    onChanged(res.value)
  }, [onChanged, onError])

  // Enregistré tout seul peu après chaque modification (et remis à jour dans les profils où il est installé)
  useEffect(() => {
    if (!dirty.current) return
    setSaved(false)
    const id = setTimeout(save, 700)
    return () => clearTimeout(id)
  }, [dp, save])

  const change = (next: DatapackCreation) => {
    dirty.current = true
    setDp(next)
  }
  const recipe = selected >= 0 ? dp.recipes[selected] : null
  const updateRecipe = (patch: Partial<Recipe>) => {
    if (!recipe) return
    let next = { ...recipe, ...patch }
    // Recette ajoutée (pas une du jeu) : son nom de fichier suit le résultat
    if (patch.result && next.id.startsWith('aloria:')) next = { ...next, id: uniqueId(dp.recipes, patch.result, selected) }
    change({ ...dp, recipes: dp.recipes.map((r, i) => (i === selected ? next : r)) })
  }

  const items = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data])
  const nameOf = useCallback(
    (id: string) => (id.startsWith('#') ? t('rc.tag', { name: id.slice(1).replace(/^minecraft:/, '') }) : (items.get(id)?.name ?? id)),
    [items]
  )
  /** Ce qu'affiche une case : un des items possibles, à tour de rôle */
  const shown = (ing: RecipeIngredient | null | undefined): string | null => {
    if (!ing || ing.length === 0) return null
    const all = ing.flatMap((i) => (i.startsWith('#') ? (data?.tags[i.slice(1)] ?? []) : [i]))
    return all.length ? all[tick % all.length] : ing[0]
  }

  // ---------------------------------------------------------------- cases

  const getSlot = (key: string): RecipeIngredient | null => {
    if (!recipe) return null
    if (key === 'in') return recipe.input ?? null
    if (key === 'out') return recipe.result ? [recipe.result] : null
    return cellsOf(recipe)[Number(key.slice(1))]
  }
  const setSlots = (changes: Record<string, RecipeIngredient | null>) => {
    if (!recipe) return
    const patch: Partial<Recipe> = {}
    const cells = cellsOf(recipe)
    let gridChanged = false
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'in') patch.input = value
      else if (key === 'out') patch.result = value?.[0] ?? ''
      else {
        cells[Number(key.slice(1))] = value
        gridChanged = true
      }
    }
    if (gridChanged) {
      if (recipe.kind === 'shaped') patch.grid = cells
      else patch.ingredients = cells.filter((c): c is RecipeIngredient => !!c && c.length > 0)
    }
    updateRecipe(patch)
  }

  const putItem = (key: string, id: string, add: boolean) => {
    // Le résultat est toujours un item précis ; une case peut accepter plusieurs items (Maj)
    if (key === 'out' && id.startsWith('#')) return
    // Potion ou livre enchanté précis : seulement en résultat (en ingrédient, le jeu accepterait n'importe lequel)
    if (id.includes('@') && key !== 'out') {
      setSlots({ out: [id] })
      return
    }
    const cur = getSlot(key)
    const value = add && key !== 'out' && cur ? (cur.includes(id) ? cur : [...cur, id]) : [id]
    setSlots({ [key]: value })
  }

  const onSlotDrop = (key: string, e: DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG)
    if (!raw) return
    const drag = JSON.parse(raw) as Drag
    if ('item' in drag) putItem(key, drag.item, e.shiftKey)
    else if (drag.slot !== key) {
      const from = getSlot(drag.slot)
      const to = getSlot(key)
      // Glisser d'une case à l'autre : déplace (échange), Ctrl : copie
      if (key === 'out' || drag.slot === 'out') {
        if (from) putItem(key, from[0], false)
      } else setSlots(e.ctrlKey ? { [key]: from } : { [key]: from, [drag.slot]: to })
    }
    setSlot(key)
  }

  const pickItem = (id: string, e: MouseEvent) => {
    if (!recipe) return
    putItem(slot, id, e.shiftKey)
    // Établi : la case suivante est choisie, pour remplir la grille en cliquant
    if (!e.shiftKey && slot.startsWith('g')) setSlot(`g${Math.min(8, Number(slot.slice(1)) + 1)}`)
  }

  // ---------------------------------------------------------------- recettes

  const addRecipe = (r?: Recipe) => {
    if (r) {
      const existing = dp.recipes.findIndex((x) => x.id === r.id)
      if (existing >= 0) {
        setSelected(existing)
        return
      }
    }
    const next: Recipe = r ? structuredClone(r) : { id: uniqueId(dp.recipes, 'minecraft:recipe', -1), kind: 'shaped', grid: Array(9).fill(null), result: '', count: 1 }
    change({ ...dp, recipes: [...dp.recipes, next] })
    setSelected(dp.recipes.length)
    setSlot(next.kind === 'shaped' || next.kind === 'shapeless' ? 'g0' : 'in')
  }

  const removeRecipe = async (index: number) => {
    const r = dp.recipes[index]
    if (!(await askConfirm(t('rc.confirmDelete', { name: r.result ? nameOf(r.result) : t('rc.untitled') }), { confirmLabel: t('common.remove') }))) return
    change({ ...dp, recipes: dp.recipes.filter((_, i) => i !== index) })
    setSelected((s) => (s === index ? -1 : s > index ? s - 1 : s))
  }

  const setKind = (kind: RecipeKind) => {
    if (!recipe || recipe.kind === kind) return
    const wasCrafting = recipe.kind === 'shaped' || recipe.kind === 'shapeless'
    const cells = cellsOf(recipe)
    const first = recipe.input ?? cells.find((c) => c && c.length) ?? null
    const next: Recipe = { id: recipe.id, kind, result: recipe.result, count: recipe.count, group: recipe.group }
    if (kind === 'shaped') next.grid = wasCrafting ? cells : [first, ...Array(8).fill(null)]
    else if (kind === 'shapeless') next.ingredients = wasCrafting ? cells.filter((c): c is RecipeIngredient => !!c) : first ? [first] : []
    else {
      next.input = first
      if (isCooking(kind)) {
        next.experience = recipe.experience ?? 0.1
        next.cookingTime = COOKING_TIME[kind]
        next.count = 1
      }
    }
    change({ ...dp, recipes: dp.recipes.map((r, i) => (i === selected ? next : r)) })
    setSlot(kind === 'shaped' || kind === 'shapeless' ? 'g0' : 'in')
  }

  /** Recette du jeu supprimée : elle n'existera plus (sa version modifiée, s'il y en avait une, part aussi) */
  const removeVanilla = async (r: Recipe) => {
    const index = dp.recipes.findIndex((x) => x.id === r.id)
    if (index >= 0 && !(await askConfirm(t('rc.confirmRemoveGame', { name: nameOf(r.result) }), { confirmLabel: t('common.continue') }))) return
    change({ ...dp, removed: [...dp.removed.filter((id) => id !== r.id), r.id], recipes: dp.recipes.filter((x) => x.id !== r.id) })
    if (index >= 0) setSelected((s) => (s === index ? -1 : s > index ? s - 1 : s))
    setNotice(t('rc.removedGame', { name: nameOf(r.result) }))
  }
  const restoreVanilla = (id: string) => change({ ...dp, removed: dp.removed.filter((x) => x !== id) })
  const vanillaById = useMemo(() => new Map((data?.recipes ?? []).map((r) => [r.id, r])), [data])

  const back = async () => {
    await save()
    onBack()
  }

  const toggleInstall = async (profileId: string, on: boolean) => {
    await save()
    const res = await window.aloria.datapacks.install(dp.id, profileId, on)
    if (!res.ok) return onError(res.error)
    setDp((cur) => ({ ...cur, installed: res.value.dp.installed }))
    onChanged({ ...dpRef.current, installed: res.value.dp.installed })
    const name = profiles.profiles.find((p) => p.id === profileId)?.name ?? ''
    if (!on) setNotice(t('rc.uninstalled', { profile: name }))
    else if (res.value.skipped.length) setNotice(t('rc.installedSkipped', { profile: name, n: res.value.skipped.length }))
    else setNotice(t('rc.installed', { profile: name }))
  }

  const exportZip = async () => {
    await save()
    const res = await window.aloria.datapacks.exportZip(dpRef.current)
    if (!res.ok) return onError(res.error)
    if (!res.value) return
    setNotice(res.value.skipped.length ? t('rc.exportedSkipped', { n: res.value.skipped.length }) : t('rc.exported'))
  }

  const versionOptions = useMemo(() => {
    const list = versions.filter((v) => v.type === 'release' && hasDatapacks(v.id)).map((v) => ({ value: v.id, label: `Minecraft ${v.id}` }))
    if (!list.some((o) => o.value === dp.gameVersion)) list.unshift({ value: dp.gameVersion, label: `Minecraft ${dp.gameVersion}` })
    return list
  }, [versions, dp.gameVersion])

  const installedCount = Object.keys(dp.installed).length

  return (
    <section className="server-panel recipe-editor">
      <header className="server-panel__header">
        <button className="secondary" onClick={back}>
          ← {t('nav.creations')}
        </button>
        <span className="server-panel__icon">📜</span>
        <div className="server-panel__title">
          <input
            className="title-input"
            value={dp.name}
            maxLength={40}
            aria-label={t('editor.name')}
            onChange={(e) => change({ ...dp, name: e.target.value })}
          />
          <span className="muted">
            {t(dp.recipes.length > 1 ? 'rc.countMany' : 'rc.countOne', { n: dp.recipes.length })} · {saved ? `✓ ${t('rc.saved')}` : t('rc.saving')}
          </span>
        </div>
        <div className="server-panel__actions">
          <div className="popover-anchor">
            <button className="secondary" onClick={() => setHelpOpen((o) => !o)}>
              ⌨ {t('rc.shortcuts')}
            </button>
            {helpOpen && (
              <>
                <div className="popover-backdrop" onClick={() => setHelpOpen(false)} />
                <div className="popover shortcuts">
                  <strong>{t('rc.shortcuts')}</strong>
                  {SHORTCUTS.map(([keys, text]) => (
                    <div key={text} className="shortcut">
                      <span className="shortcut__keys">
                        {keys.map((k) => (
                          <kbd key={k}>{t(k)}</kbd>
                        ))}
                      </span>
                      <span>{t(text)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <Select value={dp.gameVersion} options={versionOptions} onChange={(v) => change({ ...dp, gameVersion: v })} />
          <div className="popover-anchor">
            <button className="primary" onClick={() => setInstallOpen((o) => !o)}>
              {installedCount ? t('rc.installedIn', { n: installedCount }) : t('rc.install')} ▾
            </button>
            {installOpen && (
              <>
                <div className="popover-backdrop" onClick={() => setInstallOpen(false)} />
                <div className="popover install-list">
                  <strong>{t('rc.installTitle')}</strong>
                  <small className="muted">{t('rc.installHint')}</small>
                  {profiles.profiles.map((p) => {
                    const ok = hasDatapacks(p.versionId)
                    const on = !!dp.installed[p.id]
                    return (
                      <label key={p.id} className={'install-row' + (ok ? '' : ' disabled')} title={ok ? '' : t('rc.tooOld')}>
                        <input type="checkbox" checked={on} disabled={!ok} onChange={(e) => toggleInstall(p.id, e.target.checked)} />
                        <span className="install-row__icon">{p.icon}</span>
                        <span className="install-row__name">
                          {p.name}
                          <small className="muted">{ok ? describeProfile(p) : t('rc.tooOld')}</small>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <button className="secondary" onClick={exportZip} title={t('rc.exportTitle')}>
            ⬇ {t('rc.export')}
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      <div className="recipe-editor__body">
        {/* ------------------------------------------------ recettes du datapack */}
        <aside className="recipe-list card">
          <div className="recipe-list__actions">
            <button className="primary" onClick={() => addRecipe()} disabled={!data}>
              + {t('rc.new')}
            </button>
            <button className="secondary" onClick={() => setVanillaOpen(true)} disabled={!data}>
              ✎ {t('rc.gameRecipes')}
            </button>
          </div>
          <div className="recipe-list__items">
            {dp.recipes.length === 0 && <p className="muted recipe-list__empty">{t('rc.emptyList')}</p>}
            {dp.recipes.map((r, i) => (
              <div key={i} className={'recipe-row' + (i === selected ? ' active' : '')} onClick={() => setSelected(i)}>
                <ItemSlotIcon id={r.result || null} icons={icons} small />
                <span className="recipe-row__text">
                  <strong>{r.result ? nameOf(r.result) : t('rc.untitled')}</strong>
                  <small className="muted">
                    {t(stationOf(r.kind).label)}
                    {r.id.startsWith('minecraft:') && ` · ${t('rc.replaces')}`}
                    {!isComplete(r) && ` · ${t('rc.incomplete')}`}
                  </small>
                </span>
                <button
                  className="recipe-row__delete"
                  title={t('common.delete')}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeRecipe(i)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {dp.removed.length > 0 && <h4 className="recipe-list__section">{t('rc.removedTitle')}</h4>}
            {dp.removed.map((id) => {
              const r = vanillaById.get(id)
              return (
                <div key={id} className="recipe-row removed" title={id}>
                  <ItemSlotIcon id={r?.result ?? null} icons={icons} small />
                  <span className="recipe-row__text">
                    <strong>{r ? nameOf(r.result) : id.replace(/^minecraft:/, '')}</strong>
                    <small className="muted">{r ? `${t(stationOf(r.kind).label)} · ${t('rc.removedTag')}` : t('rc.removedTag')}</small>
                  </span>
                  <button className="recipe-row__delete restore" title={t('rc.restore')} onClick={() => restoreVanilla(id)}>
                    ↺
                  </button>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ------------------------------------------------ la recette */}
        <div className="recipe-main card">
          {!data ? (
            <div className="recipe-main__empty">
              <div className="spinner" />
              <p className="muted">{t('rc.loading', { version: dp.gameVersion })}</p>
            </div>
          ) : !recipe ? (
            <div className="recipe-main__empty">
              <h3>{t('rc.startTitle')}</h3>
              <p className="muted">{t('rc.startText')}</p>
              <div className="recipe-start">
                <button className="choice-card" onClick={() => addRecipe()}>
                  <span className="choice-card__icon">✨</span>
                  <strong>{t('rc.new')}</strong>
                  <small className="muted">{t('rc.newText')}</small>
                </button>
                <button className="choice-card" onClick={() => setVanillaOpen(true)}>
                  <span className="choice-card__icon">✎</span>
                  <strong>{t('rc.editGame')}</strong>
                  <small className="muted">{t('rc.editGameText')}</small>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="station-picker">
                {STATIONS.map((s) => {
                  const ok = s.kinds.some((k) => data.kinds.includes(k))
                  return (
                    <button
                      key={s.id}
                      className={'station' + (s.kinds.includes(recipe.kind) ? ' active' : '')}
                      disabled={!ok}
                      title={ok ? '' : t('rc.stationMissing', { version: dp.gameVersion })}
                      onClick={() => setKind(s.kinds[0])}
                    >
                      <ItemSlotIcon id={s.item} icons={icons} small />
                      <span>{t(s.label)}</span>
                    </button>
                  )
                })}
              </div>

              {(recipe.kind === 'shaped' || recipe.kind === 'shapeless') && (
                <div className="segmented">
                  <button className={recipe.kind === 'shaped' ? 'active' : ''} onClick={() => setKind('shaped')}>
                    {t('rc.shaped')}
                  </button>
                  <button className={recipe.kind === 'shapeless' ? 'active' : ''} onClick={() => setKind('shapeless')}>
                    {t('rc.shapeless')}
                  </button>
                </div>
              )}

              <div className="mc-panel">
                {recipe.kind === 'shaped' || recipe.kind === 'shapeless' ? (
                  <div className="mc-grid">
                    {cellsOf(recipe).map((cell, i) => (
                      <SlotView
                        key={i}
                        k={`g${i}`}
                        ing={cell}
                        shownId={shown(cell)}
                        icons={icons}
                        nameOf={nameOf}
                        active={slot === `g${i}`}
                        onSelect={setSlot}
                        onDrop={onSlotDrop}
                        onClear={(k) => setSlots({ [k]: null })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mc-input">
                    <SlotView
                      k="in"
                      ing={recipe.input}
                      shownId={shown(recipe.input)}
                      icons={icons}
                      nameOf={nameOf}
                      active={slot === 'in'}
                      onSelect={setSlot}
                      onDrop={onSlotDrop}
                      onClear={(k) => setSlots({ [k]: null })}
                    />
                    {isCooking(recipe.kind) && <span className="mc-flame">🔥</span>}
                  </div>
                )}
                <span className="mc-arrow">➜</span>
                <SlotView
                  k="out"
                  big
                  ing={recipe.result ? [recipe.result] : null}
                  shownId={recipe.result || null}
                  count={recipe.count}
                  icons={icons}
                  nameOf={nameOf}
                  active={slot === 'out'}
                  onSelect={setSlot}
                  onDrop={onSlotDrop}
                  onClear={(k) => setSlots({ [k]: null })}
                />
              </div>

              <div className="recipe-options">
                {!isCooking(recipe.kind) && (
                  <label className="field">
                    <span>{t('rc.count')}</span>
                    <Stepper value={recipe.count} min={1} max={64} onChange={(count) => updateRecipe({ count })} />
                  </label>
                )}
                {isCooking(recipe.kind) && (
                  <>
                    <label className="field">
                      <span>{t('rc.time')}</span>
                      <Stepper
                        value={Math.round(((recipe.cookingTime ?? COOKING_TIME[recipe.kind]!) / 20) * 10) / 10}
                        min={0.5}
                        max={600}
                        step={0.5}
                        unit="s"
                        onChange={(s) => updateRecipe({ cookingTime: Math.round(s * 20) })}
                      />
                    </label>
                    <label className="field">
                      <span>{t('rc.xp')}</span>
                      <Stepper value={recipe.experience ?? 0} min={0} max={100} step={0.1} onChange={(experience) => updateRecipe({ experience })} />
                    </label>
                  </>
                )}
              </div>

              <p className="recipe-hint muted">
                {recipe.id.startsWith('minecraft:') ? `${t('rc.replacesHint', { name: nameOf(recipe.result) })} ` : ''}
                {t('rc.hintShort')}
              </p>
            </>
          )}
        </div>

        {/* ------------------------------------------------ items du jeu */}
        <ItemBrowser data={data} icons={icons} onPick={pickItem} onDropBack={(key) => setSlots({ [key]: null })} />
      </div>

      {vanillaOpen && data && (
        <VanillaPicker
          data={data}
          icons={icons}
          nameOf={nameOf}
          removed={dp.removed}
          onClose={() => setVanillaOpen(false)}
          onPick={(r) => {
            setVanillaOpen(false)
            addRecipe(r)
          }}
          onRemove={removeVanilla}
          onRestore={restoreVanilla}
        />
      )}
    </section>
  )
}

/** Nom de fichier libre dans le datapack : « aloria:diamond », « aloria:diamond_2 »… */
function uniqueId(recipes: Recipe[], result: string, self: number): string {
  const base = `aloria:${result.replace(/^[^:]*:/, '').replace(/[^a-z0-9_./-]/g, '_')}`
  const taken = new Set(recipes.filter((_, i) => i !== self).map((r) => r.id))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
}

// ---------------------------------------------------------------- petits composants

function ItemSlotIcon({ id, icons, small }: { id: string | null; icons: Map<string, string>; small?: boolean }) {
  const src = id ? icons.get(id) : undefined
  return (
    <span className={'item-icon' + (small ? ' small' : '')}>
      {src ? <img src={src} alt="" draggable={false} /> : id ? <span className="item-icon__missing">?</span> : null}
    </span>
  )
}

interface SlotProps {
  k: string
  ing: RecipeIngredient | null | undefined
  shownId: string | null
  count?: number
  big?: boolean
  icons: Map<string, string>
  nameOf: (id: string) => string
  active: boolean
  onSelect: (k: string) => void
  onDrop: (k: string, e: DragEvent) => void
  onClear: (k: string) => void
}

function SlotView({ k, ing, shownId, count, big, icons, nameOf, active, onSelect, onDrop, onClear }: SlotProps) {
  const [over, setOver] = useState(false)
  const filled = !!ing && ing.length > 0
  const title = filled ? ing!.map(nameOf).join(` ${t('rc.or')} `) : ''
  return (
    <div
      className={'mc-slot' + (big ? ' big' : '') + (active ? ' active' : '') + (over ? ' over' : '')}
      title={title}
      draggable={filled}
      onClick={() => onSelect(k)}
      onContextMenu={(e) => {
        e.preventDefault()
        onClear(k)
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, JSON.stringify({ slot: k } satisfies Drag))
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        onDrop(k, e)
      }}
    >
      {filled && <ItemSlotIcon id={shownId} icons={icons} />}
      {filled && ing!.length > 1 && <span className="mc-slot__badge">{ing!.length}</span>}
      {filled && ing!.some((i) => i.startsWith('#')) && <span className="mc-slot__badge tag">#</span>}
      {!!count && count > 1 && <span className="mc-slot__count">{count}</span>}
    </div>
  )
}

function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const fix = (v: number) => Number(clamp(v).toFixed(2))
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(fix(value - step))} disabled={value <= min}>
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => e.target.value !== '' && onChange(fix(Number(e.target.value)))}
      />
      {unit && <span className="stepper__unit">{unit}</span>}
      <button type="button" onClick={() => onChange(fix(value + step))} disabled={value >= max}>
        +
      </button>
    </div>
  )
}

function ItemBrowser({
  data,
  icons,
  onPick,
  onDropBack
}: {
  data: GameData | null
  icons: Map<string, string>
  onPick: (id: string, e: MouseEvent) => void
  onDropBack: (slot: string) => void
}) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'items' | 'tags'>('items')
  const q = query.trim().toLowerCase()
  const list = useMemo(() => {
    if (!data) return []
    if (mode === 'tags')
      return Object.entries(data.tags)
        .filter(([id, members]) => members.length > 0 && (!q || id.includes(q)))
        .map(([id, members]) => ({ id: `#${id}`, name: `#${id.replace(/^minecraft:/, '')}`, icon: members[0], n: members.length }))
        .sort((a, b) => a.name.localeCompare(b.name))
    return data.items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.includes(q)).map((i) => ({ id: i.id, name: i.name, icon: i.id, n: 0 }))
  }, [data, q, mode])

  return (
    <aside
      className="item-browser card"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // Une case glissée hors de la table : vidée
        const raw = e.dataTransfer.getData(DRAG)
        if (!raw) return
        const drag = JSON.parse(raw) as Drag
        if ('slot' in drag) onDropBack(drag.slot)
      }}
    >
      <div className="search-bar">
        <input placeholder={t('rc.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="segmented small">
        <button className={mode === 'items' ? 'active' : ''} onClick={() => setMode('items')}>
          {t('rc.items')}
        </button>
        <button className={mode === 'tags' ? 'active' : ''} onClick={() => setMode('tags')} title={t('rc.tagsTitle')}>
          {t('rc.tags')}
        </button>
      </div>
      {mode === 'tags' && <small className="muted">{t('rc.tagsHint')}</small>}
      <div className={'item-grid' + (mode === 'tags' ? ' tags' : '')}>
        {list.map((it) => (
          <button
            key={it.id}
            className="item-cell"
            title={`${it.name}\n${it.id}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG, JSON.stringify({ item: it.id } satisfies Drag))
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={(e) => onPick(it.id, e)}
          >
            <ItemSlotIcon id={it.icon} icons={icons} />
            {mode === 'tags' && (
              <span className="item-cell__label">
                {it.name}
                <small className="muted">{t('rc.tagCount', { n: it.n })}</small>
              </span>
            )}
          </button>
        ))}
        {data && list.length === 0 && <p className="muted">{t('rc.noResult')}</p>}
      </div>
    </aside>
  )
}

function VanillaPicker({
  data,
  icons,
  nameOf,
  removed,
  onClose,
  onPick,
  onRemove,
  onRestore
}: {
  data: GameData
  icons: Map<string, string>
  nameOf: (id: string) => string
  removed: string[]
  onClose: () => void
  onPick: (r: Recipe) => void
  onRemove: (r: Recipe) => void
  onRestore: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const list = useMemo(
    () =>
      data.recipes
        .filter((r) => !q || nameOf(r.result).toLowerCase().includes(q) || r.id.includes(q))
        .sort((a, b) => nameOf(a.result).localeCompare(nameOf(b.result)))
        .slice(0, 200),
    [data, q, nameOf]
  )
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog vanilla-picker" onClick={(e) => e.stopPropagation()}>
        <h3>{t('rc.gameRecipes')}</h3>
        <p className="muted">{t('rc.gameRecipesText')}</p>
        <div className="search-bar">
          <input autoFocus placeholder={t('rc.searchRecipe')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="vanilla-picker__list">
          {list.map((r) => {
            const gone = removed.includes(r.id)
            return (
              <div key={r.id} className={'recipe-row' + (gone ? ' removed' : '')}>
                <ItemSlotIcon id={r.result} icons={icons} small />
                <span className="recipe-row__text">
                  <strong>
                    {nameOf(r.result)}
                    {r.count > 1 && ` ×${r.count}`}
                  </strong>
                  <small className="muted">
                    {t(stationOf(r.kind).label)} · {gone ? t('rc.removedTag') : r.id.replace(/^minecraft:/, '')}
                  </small>
                </span>
                {gone ? (
                  <button className="secondary small" onClick={() => onRestore(r.id)}>
                    ↺ {t('rc.restore')}
                  </button>
                ) : (
                  <>
                    <button className="secondary small" onClick={() => onPick(r)}>
                      ✎ {t('rc.modify')}
                    </button>
                    <button className="secondary small danger" onClick={() => onRemove(r)}>
                      🗑 {t('rc.removeGame')}
                    </button>
                  </>
                )}
              </div>
            )
          })}
          {list.length === 0 && <p className="muted">{t('rc.noResult')}</p>}
        </div>
        <div className="dialog__actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  )
}
