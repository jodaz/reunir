import { describe, it, expect } from "vitest";
import { decodeUtf8, repairMojibake } from "@/lib/encoding";

describe("decodeUtf8", () => {
  it("decodes UTF-8 bytes at the byte boundary", () => {
    // Bytes for "José Díaz" (é = C3 A9, í = C3 AD).
    const bytes = new Uint8Array([
      0x4a, 0x6f, 0x73, 0xc3, 0xa9, 0x20, 0x44, 0xc3, 0xad, 0x61, 0x7a,
    ]);
    expect(decodeUtf8(bytes)).toBe("José Díaz");
  });

  it("accepts an ArrayBuffer", () => {
    const buf = new Uint8Array([0x44, 0xc3, 0xad, 0x61, 0x7a]).buffer;
    expect(decodeUtf8(buf)).toBe("Díaz");
  });
});

describe("repairMojibake", () => {
  it("repairs double-decoded accented Spanish", () => {
    expect(repairMojibake("JosÃ©")).toBe("José");
    expect(repairMojibake("DÃ­az")).toBe("Díaz");
    expect(repairMojibake("PeÃ±a")).toBe("Peña");
    expect(repairMojibake("MaracaÃ­bo")).toBe("Maracaíbo");
  });

  it("is a no-op for already-correct text (incl. real accents)", () => {
    expect(repairMojibake("José Díaz")).toBe("José Díaz");
    expect(repairMojibake("Caraballeda")).toBe("Caraballeda");
    expect(repairMojibake("")).toBe("");
    expect(repairMojibake("Niño")).toBe("Niño");
  });

  it("leaves non-mojibake punctuation untouched", () => {
    expect(repairMojibake("Edificio \"EL MALECÓN\"")).toBe(
      'Edificio "EL MALECÓN"',
    );
  });
});
