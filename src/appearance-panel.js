import { isDemo } from './drawings.js'
import { defaultAppearance, cloneAppearance, fetchAppearance, saveAppearance, mergeAppearance } from './appearance.js'

// Panel „Wygląd” — tylko dla właściciela (ten sam dostęp co Studio). Wysuwany z boku,
// zmiany widać od razu w sali; „Zapisz dla wszystkich” utrwala je na serwerze.

const KELVIN = [['2700 K', '#ffa957'], ['3000 K', '#ffb46b'], ['4000 K', '#ffd1a3'], ['5000 K', '#ffe4ce']]

const MATERIALS = [
    ['walls', 'Ściany'],
    ['floor', 'Podłoga (odcień desek)'],
    ['baseboards', 'Listwy'],
    ['ceiling', 'Sufit'],
    ['frames', 'Ramy']
]

const slider = (path, label, max = 100, unit = '%') => `
    <label class="look-row"><span>${label}</span>
        <input type="range" min="0" max="${max}" step="1" data-path="${path}">
        <output data-out="${path}"></output><em>${unit}</em></label>`
const color = (path, label) => `
    <label class="look-row look-row--color"><span>${label}</span>
        <input type="color" data-path="${path}"><output data-out="${path}"></output></label>`

const get = (obj, path) => path.split('.').reduce((o, k) => o[k], obj)
const put = (obj, path, value) => {
    const keys = path.split('.')
    const last = keys.pop()
    keys.reduce((o, k) => o[k], obj)[last] = value
}

export const initAppearancePanel = async ({ apply, beforeOpen, afterClose }) => {
    let access = false
    try { access = (await (await fetch('/api/studio', { cache: 'no-store' })).json()).studio } catch { access = false }
    if (isDemo) access = true
    if (!access) return

    let saved = await fetchAppearance()
    let draft = cloneAppearance(saved)

    const button = document.createElement('button')
    button.className = 'studio-button look-button'
    button.type = 'button'
    button.textContent = 'Wygląd'
    document.body.appendChild(button)

    const panel = document.createElement('aside')
    panel.className = 'look-panel'
    panel.hidden = true
    panel.innerHTML = `
        <header class="look-head">
            <p class="studio-eyebrow">Wygląd galerii</p>
            <button type="button" class="look-x" data-close title="Zwiń panel">Zwiń</button>
        </header>
        <section class="look-section">
            <h3>Światło</h3>
            <p class="look-sub">Ogólne</p>
            ${slider('light.ambient.intensity', 'Natężenie', 150)}
            ${color('light.ambient.color', 'Barwa')}
            <p class="look-sub">Reflektory — plamy światła na pracach</p>
            ${slider('light.spots.intensity', 'Natężenie', 200)}
            ${color('light.spots.color', 'Barwa')}
            <div class="look-chips">${KELVIN.map(([k, hex]) => `<button type="button" data-kelvin="${hex}">${k}</button>`).join('')}</div>
            <p class="look-sub">Świetliki w suficie</p>
            ${slider('light.skylights.intensity', 'Jasność', 150)}
            <p class="look-sub">Przygaszenie w głębi sali</p>
            ${slider('light.fog.intensity', 'Siła', 200)}
            ${color('light.fog.color', 'Kolor')}
        </section>
        <section class="look-section">
            <h3>Materiały</h3>
            ${MATERIALS.map(([key, label]) => `
                <p class="look-sub">${label}</p>
                ${color(`materials.${key}.color`, 'Kolor')}
                ${slider(`materials.${key}.gloss`, 'Połysk', 100)}`).join('')}
        </section>
        <section class="look-section">
            <h3>Napisy</h3>
            ${color('text.dark', 'Czarne (tytuły)')}
            ${color('text.gray', 'Szare (numery, daty)')}
        </section>
        <section class="look-section">
            <h3>Efekty</h3>
            ${slider('effects.glass', 'Odbicie w szkle', 100)}
            ${slider('effects.shadows', 'Cienie ram i ścianek', 200)}
            ${slider('effects.vignette', 'Winieta', 200)}
        </section>
        <footer class="look-foot">
            <p class="studio-status" data-status></p>
            <button type="button" class="primary" data-save>Zapisz dla wszystkich</button>
            <div class="look-foot__row">
                <button type="button" data-revert>Cofnij do zapisanych</button>
                <button type="button" data-defaults>Domyślne</button>
            </div>
        </footer>`
    document.body.appendChild(panel)

    const status = panel.querySelector('[data-status]')
    const inputs = [...panel.querySelectorAll('[data-path]')]
    const show = (path, value) => {
        const out = panel.querySelector(`[data-out="${path}"]`)
        if (out) out.textContent = typeof value === 'number' ? String(Math.round(value)) : value
    }
    const fill = () => inputs.forEach((input) => {
        const value = get(draft, input.dataset.path)
        input.value = value
        show(input.dataset.path, value)
    })
    const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved)
    const updateStatus = (text) => { status.textContent = text ?? (dirty() ? 'Niezapisane zmiany — widzisz je tylko Ty.' : 'Zgodne z zapisanymi.') }

    // podgląd na żywo: jedno zastosowanie na klatkę; kolory napisów (przebudowa sali) z opóźnieniem
    let frame = 0, textTimer = 0
    const preview = (rebuildText) => {
        if (rebuildText) {
            clearTimeout(textTimer)
            textTimer = setTimeout(() => apply(cloneAppearance(draft)), 350)
            return
        }
        if (frame) return
        frame = requestAnimationFrame(() => {
            frame = 0
            // napisy zostają w zapisanych kolorach, dopóki ich nie zmienisz (bez zbędnej przebudowy)
            apply(cloneAppearance(draft))
        })
    }

    panel.addEventListener('input', (event) => {
        const path = event.target.dataset?.path
        if (!path) return
        const value = event.target.type === 'range' ? Number(event.target.value) : event.target.value.toLowerCase()
        put(draft, path, value)
        show(path, value)
        preview(path.startsWith('text.'))
        updateStatus()
    })
    panel.addEventListener('click', (event) => {
        const kelvin = event.target.dataset?.kelvin
        if (!kelvin) return
        put(draft, 'light.spots.color', kelvin)
        fill()
        preview(false)
        updateStatus()
    })
    // klawisze w panelu nie sterują spacerem
    panel.addEventListener('keydown', (event) => event.stopPropagation())

    const open = () => {
        beforeOpen()
        fill()
        updateStatus()
        panel.hidden = false
        button.hidden = true
    }
    const close = () => {
        panel.hidden = true
        button.hidden = false
        afterClose()
    }
    button.addEventListener('click', (event) => { event.stopPropagation(); open() })
    panel.querySelector('[data-close]').addEventListener('click', close)

    panel.querySelector('[data-save]').addEventListener('click', async () => {
        updateStatus('Zapisywanie…')
        try {
            await saveAppearance(draft)
            saved = mergeAppearance(draft)
            updateStatus('Zapisano — tak widzą galerię wszyscy odwiedzający.')
        } catch (error) {
            updateStatus(`Nie udało się zapisać: ${error.message}`)
        }
    })
    panel.querySelector('[data-revert]').addEventListener('click', () => {
        draft = cloneAppearance(saved)
        fill()
        apply(cloneAppearance(draft))
        updateStatus()
    })
    panel.querySelector('[data-defaults]').addEventListener('click', () => {
        draft = cloneAppearance(defaultAppearance)
        fill()
        apply(cloneAppearance(draft))
        updateStatus('Wartości domyślne — zapisz, żeby obowiązywały dla wszystkich.')
    })
}
