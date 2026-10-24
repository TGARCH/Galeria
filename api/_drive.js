// Wspólne funkcje dla endpointów /api — rozmowa z Google Drive API.
// Klucz API i ID folderu są tylko po stronie serwera (zmienne środowiskowe Vercel).

const DRIVE = 'https://www.googleapis.com/drive/v3/files'

export const config = () => {
    const key = process.env.GOOGLE_API_KEY
    const folder = process.env.DRIVE_FOLDER_ID
    if (!key || !folder) {
        const missing = [!key && 'GOOGLE_API_KEY', !folder && 'DRIVE_FOLDER_ID'].filter(Boolean)
        const error = new Error(`Brak zmiennych środowiskowych: ${missing.join(', ')}`)
        error.status = 503
        throw error
    }
    return { key, folder }
}

export const driveJson = async (url) => {
    const response = await fetch(url)
    if (!response.ok) {
        const body = await response.text()
        const error = new Error(`Google Drive API ${response.status}: ${body.slice(0, 300)}`)
        error.status = response.status === 404 ? 404 : 502
        throw error
    }
    return response.json()
}

const listChildren = async (parent, mimeFilter, fields) => {
    const { key } = config()
    const files = []
    let pageToken = ''
    do {
        const params = new URLSearchParams({
            q: `'${parent}' in parents and ${mimeFilter} and trashed = false`,
            fields: `nextPageToken, files(${fields})`,
            orderBy: 'createdTime',
            pageSize: '1000',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true',
            key
        })
        if (pageToken) params.set('pageToken', pageToken)
        const page = await driveJson(`${DRIVE}?${params}`)
        files.push(...(page.files || []))
        pageToken = page.nextPageToken || ''
    } while (pageToken)
    return files
}

const IMAGE_FIELDS = 'id, name, description, createdTime, modifiedTime, version, imageMediaMetadata(width, height, rotation)'
export const listImages = (folder) => listChildren(folder, "mimeType contains 'image/'", IMAGE_FIELDS)

// "2 Grupa środowa" → { order: 2, title: "Grupa środowa" }; bez numeru — alfabetycznie, po numerowanych
const parseFolderName = (name) => {
    const match = /^(\d+)[\s._)-]+(.+)$/.exec(name.trim())
    return match ? { order: Number(match[1]), title: match[2].trim() } : { order: Infinity, title: name.trim() }
}

// Sale galerii: pliki luzem w folderze głównym (pierwsza sala) + po jednej sali na podfolder.
// Puste foldery są pomijane.
export const listGallery = async () => {
    const { folder } = config()
    const [loose, subfolders] = await Promise.all([
        listImages(folder),
        listChildren(folder, "mimeType = 'application/vnd.google-apps.folder'", 'id, name')
    ])
    const sorted = subfolders
        .map((sub) => ({ id: sub.id, ...parseFolderName(sub.name) }))
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pl'))
    const rooms = await Promise.all(sorted.map(async (sub) => ({ id: sub.id, title: sub.title, files: await listImages(sub.id) })))
    return [{ id: folder, title: null, files: loose }, ...rooms].filter((room) => room.files.length)
}

export const fileMeta = async (id) => {
    const { key } = config()
    const params = new URLSearchParams({ fields: 'id, mimeType, thumbnailLink', supportsAllDrives: 'true', key })
    return driveJson(`${DRIVE}/${encodeURIComponent(id)}?${params}`)
}

export const mediaUrl = (id) => {
    const { key } = config()
    return `${DRIVE}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&key=${key}`
}

export const sendError = (res, error) => {
    res.setHeader('Cache-Control', 'no-store')
    res.status(error.status || 500).json({ error: error.message })
}
