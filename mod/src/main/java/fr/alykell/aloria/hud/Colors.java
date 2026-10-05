package fr.alykell.aloria.hud;

/** Conversions de couleurs pour le sélecteur (teinte / saturation / luminosité). */
public final class Colors {
	private Colors() {
	}

	/** h, s, v entre 0 et 1 → RVB (sans alpha) */
	public static int hsvToRgb(float h, float s, float v) {
		float hh = (h % 1f + 1f) % 1f * 6f;
		int sector = (int) Math.floor(hh);
		float f = hh - sector;
		float p = v * (1 - s);
		float q = v * (1 - s * f);
		float t = v * (1 - s * (1 - f));
		float r;
		float g;
		float b;
		switch (sector) {
			case 0 -> { r = v; g = t; b = p; }
			case 1 -> { r = q; g = v; b = p; }
			case 2 -> { r = p; g = v; b = t; }
			case 3 -> { r = p; g = q; b = v; }
			case 4 -> { r = t; g = p; b = v; }
			default -> { r = v; g = p; b = q; }
		}
		return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
	}

	/** RVB → {h, s, v} entre 0 et 1 */
	public static float[] rgbToHsv(int rgb) {
		float r = ((rgb >> 16) & 0xFF) / 255f;
		float g = ((rgb >> 8) & 0xFF) / 255f;
		float b = (rgb & 0xFF) / 255f;
		float max = Math.max(r, Math.max(g, b));
		float min = Math.min(r, Math.min(g, b));
		float d = max - min;
		float h = 0;
		if (d > 0) {
			if (max == r) h = ((g - b) / d) % 6;
			else if (max == g) h = (b - r) / d + 2;
			else h = (r - g) / d + 4;
			h /= 6;
			if (h < 0) h += 1;
		}
		return new float[] {h, max == 0 ? 0 : d / max, max};
	}

	public static String hex(int rgb) {
		return String.format("#%06X", rgb & 0xFFFFFF);
	}
}
