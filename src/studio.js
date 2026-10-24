import { FORMATS, SCENARIOS } from './reel.js'
import { displayTitle, formatDate, isDemo } from './drawings.js'

// Panel „Studio” — widoczny tylko z ważnym dostępem (api/studio). Wybór scenariusza,
// sali / pracy i formatu; podgląd albo nagranie i pobranie pliku wideo.

export const initStudio = async ({ reel, gallery, getDrawings, beforeStart, afterEnd }) => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('studio')) {
        try { await fetch(`/api/studio?key=${encodeURIComponent(params.get('studio'))}`, { credentials: 'same-origin' }) } catch { /* brak sieci */ }
        params.delete('studio')
        const query = params.toString()
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
    let access = false
    try { access = (await (await fetch('/api/studio', { cache: 'no-store' })).json()).studio } catch { access = false }
    if (isDemo) access = true   // podgląd lokalny bez serwera
    if (!access) return

    const button = document.createElement('button')
    button.className = 'studio-button'
    button.type = 'button'
    button.textContent = 'Studio'
    document.body.appendChild(button)

    const panel = document.createElement('div')
    panel.className = 'studio-panel'
    panel.hidden = true
    panel.innerHTML = `
        <div class="studio-card">
            <p class="studio-eyebrow">Studio · rolki do mediów społecznościowych</p>
            <label>Scenariusz<select data-scenario>${Object.entries(SCENARIOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label data-room-field hidden>Sala<select data-room></select></label>
            <label data-art-field>Praca<select data-art></select></label>
            <label>Format<select data-format>${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
            <div class="studio-actions">
                <button type="button" data-preview>Podgląd</button>
                <button type="button" data-record class="primary">Nagraj</button>
            </div>
            <p class="studio-status" data-status></p>
            <div class="studio-footer">
                <button type="button" data-close>Zamknij</button>
                <button type="button" data-logout>Wyloguj ze studia</button>
            </div>
        </div>`
    document.body.appendChild(panel)

    const badge = document.createElement('div')
    badge.className = 'studio-badge'
    badge.hidden = true
    document.body.appendChild(badge)

    const $ = (selector) => panel.querySelector(selector)
    const scenarioSelect = $('[data-scenario]')
    const roomSelect = $('[data-room]')
    const artSelect = $('[data-art]')
    const formatSelect = $('[data-format]')
    const status = $('[data-status]')

    const fillLists = () => {
        roomSelect.innerHTML = gallery.roomTitles.map((title, i) => `<option value="${i}">${i + 1}. ${title}</option>`).join('')
        // najnowsze prace na górze listy
        const arts = [...gallery.artworks].sort((a, b) => String(b.drawing.created || '').localeCompare(String(a.drawing.created || '')))
        artSelect.innerHTML = arts.map((art) => {
            const date = formatDate(art.drawing.date)
            return `<option value="${art.drawing.id}">${displayTitle(art.drawing)}${date ? ` — ${date}` : ''} · ${gallery.roomTitles[art.room]}</option>`
        }).join('')
    }
    const syncFields = () => {
        $('[data-room-field]').hidden = scenarioSelect.value !== 'room'
        $('[data-art-field]').hidden = scenarioSelect.value !== 'newWork'
    }
    scenarioSelect.addEventListener('change', syncFields)

    const open = () => {
        if (!getDrawings().length) return
        fillLists()
        syncFields()
        status.textContent = ''
        panel.hidden = false
        beforeStart()
    }
    const close = () => { panel.hidden = true; afterEnd() }
    button.addEventListener('click', (event) => { event.stopPropagation(); open() })
    $('[data-close]').addEventListener('click', close)
    $('[data-logout]').addEventListener('click', async () => {
        await fetch('/api/studio', { method: 'DELETE' })
        panel.remove(); button.remove(); badge.remove()
        afterEnd()
    })

    const run = async (record) => {
        panel.hidden = true
        button.hidden = true
        badge.hidden = false
        badge.textContent = 'Przygotowanie…'
        beforeStart()
        const result = await reel.play({
            scenario: scenarioSelect.value,
            format: formatSelect.value,
            record,
            options: { room: roomSelect.value, artId: artSelect.value },
            renderFrame: reel.renderFrame,
            onProgress: (t, total, fraction) => {
                badge.textContent = record && fraction !== undefined
                    ? `● Tworzenie filmu ${Math.round(fraction * 100)}%   ·   Esc — przerwij`
                    : `Podgląd  ${t.toFixed(0)} / ${total.toFixed(0)} s   ·   Esc — przerwij`
            }
        })
        badge.hidden = true
        button.hidden = false
        panel.hidden = false
        if (result.completed && result.blob) {
            const name = `galeria-${scenarioSelect.value}-${formatSelect.value.replace(':', 'x')}-${new Date().toISOString().slice(0, 10)}.${result.extension}`
            const url = URL.createObjectURL(result.blob)
            const link = document.createElement('a')
            link.href = url
            link.download = name
            link.click()
            setTimeout(() => URL.revokeObjectURL(url), 60000)
            status.textContent = `Zapisano plik ${name} (${(result.blob.size / 1048576).toFixed(1)} MB).${result.extension === 'webm' ? ' Format WebM — Facebook i YouTube go przyjmują; na Instagram może być potrzebna konwersja do MP4.' : ''}`
        } else status.textContent = result.error ? 'Nie udało się zakodować filmu w tej przeglądarce — spróbuj w Chrome lub Edge.' : result.completed ? 'Podgląd zakończony.' : 'Przerwano.'
    }
    $('[data-preview]').addEventListener('click', () => run(false))
    $('[data-record]').addEventListener('click', () => {
        if (!window.MediaRecorder && !window.VideoEncoder) { status.textContent = 'Ta przeglądarka nie obsługuje nagrywania — użyj Chrome lub Edge.'; return }
        run(true)
    })
    window.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && reel.active) reel.cancel()
    }, true)
}
