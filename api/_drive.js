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

export const listFolder = async () => {
    const { key, folder } = config()
    const files = []
    let pageToken = ''
    do {
        const params = new URLSearchParams({
            q: `'${folder}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'nextPageToken, files(id, name, description, createdTime, imageMediaMetadata(width, height, rotation))',
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
