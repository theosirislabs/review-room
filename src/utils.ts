/** Returns true if the URL appears to point to a video file. */
export function isVideo(url: string | undefined): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.includes(".mp4") ||
        lower.includes(".mov") ||
        lower.includes(".webm") ||
        lower.includes(".avi") ||
        lower.includes(".m4v") ||
        lower.endsWith(".m4v") ||
        lower.endsWith(".mp4") ||
        lower.endsWith(".mov") ||
        lower.endsWith(".webm") ||
        lower.endsWith(".avi") ||
        lower.includes("seeds/video") ||
        lower.includes("video/") ||
        lower.includes("type=video") ||
        lower.includes("type%3Dvideo") ||
        // Google Drive with a video extension in the filename portion
        (lower.includes("drive.google.com") && lower.includes("/file/d/") && /\.(mp4|mov|webm|avi|m4v)(\?|$|%3F)/.test(lower)) ||
        // Dropbox shared links that point to video files
        (lower.includes("dropbox.com") && /\.(mp4|mov|webm|avi|m4v)(\?|$)/.test(lower))
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
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".png") ||
        lower.endsWith(".gif") ||
        lower.endsWith(".webp") ||
        lower.includes("image/") ||
        lower.includes("type=image") ||
        lower.includes("type%3Dimage")
    );
}

/**
 * Determines the correct media rendering type.
 * - If format is "reel" and URL is unknown/unclear → video (user explicitly chose reel)
 * - If format is "image"/"carousel" and URL looks like video → video (auto-detect)
 * - Google Drive links with no extension in filename → use the format field as source of truth
 * - When URL type is ambiguous and not marked as reel → image (safer fallback)
 */
export function shouldRenderAsVideo(url: string | undefined, format: string): boolean {
    if (!url) return false;
    if (format === "reel") return true; // user explicitly chose reel format
    // If URL inspection clearly says video, trust it
    if (isVideo(url)) return true;
    // For Google Drive/Dropbox links whose file extension is ambiguous, trust the format
    if (isFromCloudStorage(url)) return format === "reel";
    // Default: image
    return false;
}

/** Returns true if the URL originates from a cloud storage service where the file extension may be hidden. */
export function isFromCloudStorage(url: string | undefined): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.includes("drive.google.com") ||
        lower.includes("dropbox.com") ||
        lower.includes("picsum.photos")
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
