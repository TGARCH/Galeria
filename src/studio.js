import { FORMATS, PHOTO_FORMATS, SCENARIOS, estimateDuration } from './reel.js'
import { zipSync } from 'fflate'
import { displayTitle, formatDate, imageUrl, isDemo } from './drawings.js'

// Panel „Studio” — widoczny tylko z ważnym dostępem (api/studio).
// Kroki: 1. format → 2. rodzaj prezentacji → 3. sale (wiele) → 4. prace (wiele, z miniaturami).

const MAX_ARTS = 24
const AUTO_PER_ROOM = { newWork: 0, room: 5, walk: 3, photos: 0 }
const KINDS = { ...SCENARIOS, photos: { label: 'Zdjęcia do postów', hint: 'każda praca w 3 ujęciach: z bliska, z dystansu, z 5 m — bez napisów' } }
const formatChoices = (kind) => Object.entries(kind === 'photos' ? PHOTO_FORMATS : FORMATS).map(([k, v], i) => `
    <label class="studio-choice"><input type="radio" name="studio-format" value="${k}"${i === 0 ? ' checked' : ''}><span><strong>${k}</strong><small>${escapeHtml(v.label.split('—')[1] || '')}</small></span></label>`).join('')
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const missingNote = (n) => n ? ` Uwaga: ${n} ${n === 1 ? 'praca nie wczytała się' : 'prac nie wczytało się'} z Dysku (puste płótno) — spróbuj jeszcze raz za chwilę.` : ''
const formatTime = (s) => s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`

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
            <p class="studio-eyebrow">Studio · filmy do mediów społecznościowych</p>
            <section class="studio-step">
                <h3><b>1</b> Format</h3>
                <div class="studio-choices" data-format></div>
            </section>
            <section class="studio-step">
                <h3><b>2</b> Rodzaj prezentacji</h3>
                <div class="studio-choices studio-choices--4" data-scenario>${Object.entries(KINDS).map(([k, v], i) => `
                    <label class="studio-choice"><input type="radio" name="studio-scenario" value="${k}"${i === 0 ? ' checked' : ''}><span><strong>${v.label}</strong><small>${v.hint}</small></span></label>`).join('')}
                </div>
            </section>
            <section class="studio-step">
                <h3><b>3</b> Sale <em data-room-count></em></h3>
                <div class="studio-rooms" data-rooms></div>
            </section>
            <section class="studio-step">
                <h3><b>4</b> Prace <em data-art-count></em></h3>
                <div class="studio-tools"><button type="button" data-auto>Wybierz automatycznie</button><button type="button" data-clear>Wyczyść</button></div>
                <div class="studio-arts" data-arts></div>
            </section>
            <div class="studio-actions">
                <button type="button" data-preview>Podgląd</button>
                <button type="button" data-record class="primary">Nagraj film</button>
            </div>
            <p class="studio-status" data-status></p>
            <div class="studio-results" data-results hidden></div>
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
    const roomsBox = $('[data-rooms]')
    const artsBox = $('[data-arts]')
    const status = $('[data-status]')
    const resultsBox = $('[data-results]')
    const formatBox = $('[data-format]')
    let photoResults = []
    const selectedArts = new Set()
    const selectedRooms = new Set()

    const scenario = () => panel.querySelector('input[name="studio-scenario"]:checked').value
    const format = () => panel.querySelector('input[name="studio-format"]:checked').value
    const roomArts = (room) => gallery.artworks.filter((a) => a.room === room)
    // format i przyciski zależne od rodzaju (film / zdjęcia)
    const syncKind = () => {
        const photos = scenario() === 'photos'
        const current = panel.querySelector('input[name="studio-format"]:checked')?.value
        const list = photos ? PHOTO_FORMATS : FORMATS
        if (formatBox.dataset.kind !== String(photos)) {
            formatBox.innerHTML = formatChoices(photos ? 'photos' : 'video')
            formatBox.dataset.kind = String(photos)
            const keep = current && list[current] && formatBox.querySelector(`input[value="${current}"]`)
            if (keep) keep.checked = true
        }
        $('[data-preview]').hidden = photos
        $('[data-record]').textContent = photos ? 'Utwórz zdjęcia' : 'Nagraj film'
    }
    const newest = (arts) => [...arts].sort((a, b) => String(b.drawing.created || '').localeCompare(String(a.drawing.created || '')))

    // równomiernie rozłożone prace z sali (różne ściany)
    const spread = (arts, n) => Array.from({ length: Math.min(n, arts.length) }, (_, i) => arts[Math.floor((i + 0.5) * arts.length / Math.min(n, arts.length))])

    const autoSelect = () => {
        selectedArts.clear()
        const kind = scenario()
        if (kind === 'newWork' || kind === 'photos') {
            const pool = newest(gallery.artworks.filter((a) => selectedRooms.has(a.room)))
            pool.slice(0, 3).forEach((a) => selectedArts.add(a.drawing.id))
        } else {
            for (const room of selectedRooms) spread(roomArts(room), AUTO_PER_ROOM[kind]).forEach((a) => selectedArts.add(a.drawing.id))
        }
    }

    const renderRooms = () => {
        roomsBox.innerHTML = gallery.roomTitles.map((title, i) => `
            <label class="studio-room"><input type="checkbox" value="${i}"${selectedRooms.has(i) ? ' checked' : ''}><span>${escapeHtml(title)}</span><small>${roomArts(i).length}</small></label>`).join('')
        $('[data-room-count]').textContent = selectedRooms.size ? `— wybrano ${selectedRooms.size}` : '— zaznacz co najmniej jedną'
    }

    const renderArts = () => {
        const kind = scenario()
        const rooms = [...selectedRooms].sort((a, b) => a - b)
        artsBox.innerHTML = rooms.map((room) => {
            const arts = kind === 'newWork' ? newest(roomArts(room)) : roomArts(room)
            return `<p class="studio-arts__room">${escapeHtml(gallery.roomTitles[room])}</p><div class="studio-arts__grid">${arts.map((art) => {
                const id = art.drawing.id
                const date = formatDate(art.drawing.date)
                return `<label class="studio-thumb" title="${escapeHtml(displayTitle(art.drawing))}${date ? ` — ${date}` : ''}"><input type="checkbox" value="${id}"${selectedArts.has(id) ? ' checked' : ''}><img loading="lazy" alt="" src="${imageUrl(art.drawing, 240)}"><span>${escapeHtml(art.drawing.title || date || 'Bez tytułu')}</span></label>`
            }).join('')}</div>`
        }).join('') || '<p class="studio-empty">Najpierw wybierz salę.</p>'
        updateCount()
    }

    const updateCount = () => {
        const n = selectedArts.size
        const info = scenario() === 'photos' ? `${n * 3} zdjęć` : `film ok. ${formatTime(estimateDuration(n))}`
        $('[data-art-count]').textContent = n ? `— wybrano ${n}, ${info}` : '— zaznacz co najmniej jedną'
    }

    // prace spoza wybranych sal odpadają
    const pruneArts = () => {
        for (const art of gallery.artworks) if (!selectedRooms.has(art.room)) selectedArts.delete(art.drawing.id)
    }

    roomsBox.addEventListener('change', (event) => {
        const room = Number(event.target.value)
        if (event.target.checked) {
            selectedRooms.add(room)
            const kind = scenario()
            if (AUTO_PER_ROOM[kind]) spread(roomArts(room), AUTO_PER_ROOM[kind]).forEach((a) => selectedArts.add(a.drawing.id))
        } else selectedRooms.delete(room)
        pruneArts()
        renderRooms()
        renderArts()
    })
    artsBox.addEventListener('change', (event) => {
        const id = event.target.value
        if (event.target.checked) {
            if (selectedArts.size >= MAX_ARTS) { event.target.checked = false; status.textContent = `Najwyżej ${MAX_ARTS} prac w jednym filmie.`; return }
            selectedArts.add(id)
        } else selectedArts.delete(id)
        status.textContent = ''
        updateCount()
    })
    $('[data-scenario]').addEventListener('change', () => {
        // „Prezentacja sali” — domyślnie jedna sala
        if (scenario() === 'room' && selectedRooms.size > 1) {
            const first = Math.min(...selectedRooms)
            selectedRooms.clear()
            selectedRooms.add(first)
        }
        syncKind()
        autoSelect()
        renderRooms()
        renderArts()
    })
    $('[data-auto]').addEventListener('click', () => { autoSelect(); renderArts() })
    $('[data-clear]').addEventListener('click', () => { selectedArts.clear(); renderArts() })

    const open = () => {
        if (!getDrawings().length) return
        // wybór zostaje między otwarciami; usuwamy tylko to, czego już nie ma
        const ids = new Set(gallery.artworks.map((a) => a.drawing.id))
        for (const id of [...selectedArts]) if (!ids.has(id)) selectedArts.delete(id)
        for (const room of [...selectedRooms]) if (room >= gallery.roomTitles.length) selectedRooms.delete(room)
        if (!selectedRooms.size) {
            // na start: sala z najnowszą pracą
            const latest = newest(gallery.artworks)[0]
            selectedRooms.add(latest ? latest.room : 0)
            autoSelect()
        }
        syncKind()
        renderRooms()
        renderArts()
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
        if (!selectedArts.size) { status.textContent = 'Zaznacz prace do pokazania (krok 4).'; return }
        panel.hidden = true
        button.hidden = true
        badge.hidden = false
        badge.textContent = 'Przygotowanie…'
        beforeStart()
        const kind = scenario()
        const fmt = format()
        let result
        try {
            result = await reel.play({
                scenario: kind,
                format: fmt,
                record,
                options: { artIds: [...selectedArts] },
                onLoading: (done, total) => { badge.textContent = `Wczytywanie prac ${done} / ${total}…` },
                renderFrame: reel.renderFrame,
                onProgress: (t, total, fraction) => {
                    badge.textContent = record && fraction !== undefined
                        ? `● Tworzenie filmu ${Math.round(fraction * 100)}%   ·   Esc — przerwij`
                        : `Podgląd  ${Math.floor(t)} / ${Math.round(total)} s   ·   Esc — przerwij`
                }
            })
        } catch (error) {
            console.error(error)
            result = { completed: false, error: 'build' }
        }
        badge.hidden = true
        button.hidden = false
        panel.hidden = false
        if (result.completed && result.blob) {
            const name = `galeria-${kind}-${fmt.replace(':', 'x')}-${new Date().toISOString().slice(0, 10)}.${result.extension}`
            const url = URL.createObjectURL(result.blob)
            const link = document.createElement('a')
            link.href = url
            link.download = name
            link.click()
            setTimeout(() => URL.revokeObjectURL(url), 60000)
            status.textContent = `Zapisano plik ${name} (${(result.blob.size / 1048576).toFixed(1)} MB).${result.extension === 'webm' ? ' Format WebM — na Instagram może być potrzebna konwersja do MP4.' : ''}${missingNote(reel.missing)}`
        } else if (result.error === 'encoder') status.textContent = 'Nie udało się zakodować filmu w tej przeglądarce — spróbuj w Chrome lub Edge.'
        else if (result.error) status.textContent = 'Nie udało się przygotować trasy — zmień wybór prac.'
        else status.textContent = result.completed ? 'Podgląd zakończony.' : 'Przerwano.'
    }
    const makePhotos = async () => {
        if (!selectedArts.size) { status.textContent = 'Zaznacz prace (krok 4).'; return }
        photoResults.forEach((r) => URL.revokeObjectURL(r.url))
        photoResults = []
        resultsBox.hidden = true
        panel.hidden = true
        button.hidden = true
        badge.hidden = false
        badge.textContent = 'Przygotowanie…'
        beforeStart()
        const fmt = format()
        try {
            photoResults = await reel.photos({
                format: fmt,
                artIds: [...selectedArts],
                renderFrame: reel.renderFrame,
                onLoading: (done, total) => { badge.textContent = `Wczytywanie prac ${done} / ${total}…` },
                onProgress: (done, total) => { badge.textContent = `Zdjęcia ${done} / ${total}…` }
            })
        } catch (error) {
            console.error(error)
            status.textContent = 'Nie udało się utworzyć zdjęć.'
        }
        badge.hidden = true
        button.hidden = false
        panel.hidden = false
        if (!photoResults.length) return
        const stamp = new Date().toISOString().slice(0, 10)
        resultsBox.innerHTML = `<div class="studio-results__head"><span>${photoResults.length} zdjęć · ${fmt}</span><button type="button" class="primary" data-zip>Pobierz wszystkie (ZIP)</button></div>
            <div class="studio-results__grid">${photoResults.map((r) => `<a href="${r.url}" download="${r.name}" title="Pobierz ${r.name}"><img src="${r.url}" alt=""></a>`).join('')}</div>
            <p class="studio-results__hint">Kliknij zdjęcie, żeby pobrać pojedynczo.</p>`
        resultsBox.hidden = false
        status.textContent = missingNote(reel.missing).trim()
        resultsBox.querySelector('[data-zip]').addEventListener('click', async () => {
            const files = {}
            for (const r of photoResults) files[r.name] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }]
            const zip = new Blob([zipSync(files)], { type: 'application/zip' })
            const url = URL.createObjectURL(zip)
            const link = document.createElement('a')
            link.href = url
            link.download = `galeria-zdjecia-${fmt.replace(':', 'x')}-${stamp}.zip`
            link.click()
            setTimeout(() => URL.revokeObjectURL(url), 60000)
        })
        resultsBox.scrollIntoView({ block: 'nearest' })
    }
    $('[data-preview]').addEventListener('click', () => run(false))
    $('[data-record]').addEventListener('click', () => {
        if (scenario() === 'photos') { makePhotos(); return }
        if (!window.MediaRecorder && !window.VideoEncoder) { status.textContent = 'Ta przeglądarka nie obsługuje nagrywania — użyj Chrome lub Edge.'; return }
        run(true)
    })
    window.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && reel.active) reel.cancel()
    }, true)
}
