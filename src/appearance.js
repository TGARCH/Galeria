// Wygląd galerii: światło, materiały, napisy i efekty — ustawiane w panelu „Wygląd”
// (dla właściciela), zapisywane na serwerze i stosowane u wszystkich odwiedzających.
// Wartości domyślne = obecny, kameralny wygląd galerii.

export const defaultAppearance = {
    light: {
        ambient: { intensity: 70, color: '#ffe9d0' },     // światło ogólne: % i barwa
        spots: { intensity: 100, color: '#ffb877' },      // reflektory: plamy światła na pracach (ok. 2800 K)
        skylights: { intensity: 55 },                    // świetliki w suficie
        fog: { intensity: 100, color: '#4a4540' }         // przygaszenie dalszych partii sali i tło
    },
    materials: {                                         // kolor i połysk (0 = matowy, 100 = lustro)
        walls: { color: '#b8b4ae', gloss: 6 },
        floor: { color: '#9a755c', gloss: 58 },          // odcień nakładany na rysunek desek
        baseboards: { color: '#9d9993', gloss: 40 },
        ceiling: { color: '#e9e8e4', gloss: 0 },
        frames: { color: '#1c1b1a', gloss: 55 }
    },
    text: { dark: '#1f1d1a', gray: '#9a948a' },          // napisy czarne i szare
    effects: { glass: 10, shadows: 100, vignette: 100 }   // %
}

const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)

// Łączy zapisane ustawienia z domyślnymi: przyjmuje tylko znane pola o poprawnym typie,
// liczby przycina do zakresu — nic z serwera nie może zepsuć galerii.
export const mergeAppearance = (saved, base = defaultAppearance) => {
    const out = {}
    for (const [key, def] of Object.entries(base)) {
        const value = saved?.[key]
        if (def && typeof def === 'object') out[key] = mergeAppearance(value, def)
        else if (isColor(def)) out[key] = isColor(value) ? value.toLowerCase() : def
        else if (isNumber(def)) out[key] = isNumber(value) ? Math.min(Math.max(value, 0), 200) : def
        else out[key] = def
    }
    return out
}

export const cloneAppearance = (a) => JSON.parse(JSON.stringify(a))

export const fetchAppearance = async () => {
    try {
        const response = await fetch('/api/appearance', { cache: 'no-store' })
        return mergeAppearance(response.ok ? await response.json() : {})
    } catch {
        return cloneAppearance(defaultAppearance)
    }
}

export const saveAppearance = async (appearance) => {
    const response = await fetch('/api/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appearance)
    })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`)
}
