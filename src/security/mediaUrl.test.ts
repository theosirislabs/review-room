import { describe, expect, it, vi } from "vitest";
import {
  fetchExternalMedia,
  isPrivateOrReservedAddress,
  normalizeExternalMediaUrl,
  resolveExternalMediaUrl,
  validateExternalMediaUrlSyntax,
} from "./mediaUrl.js";

describe("external media URL guard", () => {
  it("rejects private, loopback, link-local, metadata, and reserved addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fc00::1", "fe80::1"]) {
      expect(isPrivateOrReservedAddress(address)).toBe(true);
    }
    expect(isPrivateOrReservedAddress("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("allows only bounded HTTP URLs and preserves safe provider normalization", () => {
    expect(validateExternalMediaUrlSyntax("https://cdn.example.com/video.mp4").protocol).toBe("https:");
    expect(() => validateExternalMediaUrlSyntax("ftp://cdn.example.com/video.mp4")).toThrow();
    expect(() => validateExternalMediaUrlSyntax("http://localhost/video.mp4")).toThrow();
    expect(() => validateExternalMediaUrlSyntax("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => validateExternalMediaUrlSyntax("https://user:pass@cdn.example.com/video.mp4")).toThrow();
    expect(() => validateExternalMediaUrlSyntax("https://cdn.example.com:8080/video.mp4")).toThrow();
    expect(normalizeExternalMediaUrl("https://drive.google.com/file/d/abc123/view")).toContain("drive.google.com/uc?export=download&id=abc123");
    expect(normalizeExternalMediaUrl("https://www.dropbox.com/s/file/video.mp4?dl=0")).toContain("dl=1");
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    await expect(resolveExternalMediaUrl("https://public.example/video.mp4", async () => ["93.184.216.34"])).resolves.toBeTruthy();
    await expect(resolveExternalMediaUrl("https://public.example/video.mp4", async () => ["10.0.0.5"])).rejects.toThrow();
  });

  it("revalidates redirect destinations", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://private.example/video.mp4" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const lookup = vi.fn(async (hostname: string) => hostname === "public.example" ? ["93.184.216.34"] : ["127.0.0.1"]);

    await expect(fetchExternalMedia("https://public.example/video.mp4", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup,
    })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
