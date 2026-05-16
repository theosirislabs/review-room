export function isVideo(url: string | undefined): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.includes(".mp4") ||
        lower.includes(".mov") ||
        lower.includes(".webm") ||
        lower.includes(".avi") ||
        lower.includes(".m4v") ||
        lower.includes("seeds/video") ||
        lower.includes("video/") ||
        lower.includes("type=video") ||
        // Google Drive file share links have no extension in the URL but usually point to one file (often video for reels)
        (lower.includes("drive.google.com") && lower.includes("/file/d/")) ||
        (lower.includes("drive.google.com") && lower.includes("uc?") && lower.includes("export=download")) ||
        // Dropbox shared links (dl=1 direct)
        (lower.includes("dropbox.com") && lower.includes("/s/"))
    );
}

/** Returns true if URL appears to be an image (not video). Used for reel validation. */
export function isImageUrl(url: string | undefined): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.includes(".jpg") ||
        lower.includes(".jpeg") ||
        lower.includes(".png") ||
        lower.includes(".gif") ||
        lower.includes(".webp") ||
        lower.includes(".bmp") ||
        lower.includes("image/") ||
        lower.includes("type=image")
    );
}

export const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='100' height='100' fill='%23f4f4f5' stroke='none'/%3E%3Crect width='40' height='40' x='30' y='30' rx='4'/%3E%3Cpath d='M40 40h.01'/%3E%3Cpath d='m30 60 10-10 15 15'/%3E%3Cpath d='m50 50 5-5 15 15'/%3E%3C/svg%3E";

export function parseDateSafe(d: string, t: string): number {
    let dateStr = d + 'T' + (() => {
        if (!t) return "00:00:00";
        let [time, modifier] = t.split(' ');
        if (!modifier) return t;
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier && modifier.toUpperCase() === 'PM') hours = (parseInt(hours, 10) + 12).toString();
        return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`;
    })();
    return new Date(dateStr).getTime();
}

/** Posts with client status "Not Ready for Client" are omitted from the client review link. */
export function isPostVisibleToClient(clientStatus: string | undefined): boolean {
    return clientStatus !== "Not Ready for Client";
}
