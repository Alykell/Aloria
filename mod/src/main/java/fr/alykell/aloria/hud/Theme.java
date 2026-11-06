package fr.alykell.aloria.hud;

/** Couleurs d'Aloria (ARGB), les mêmes que le launcher, en version nuit pour le jeu. */
public final class Theme {
	public static final int SEA_DEEP = 0xFF0B5F86;
	public static final int SEA = 0xFF1A9BC7;
	public static final int LAGOON = 0xFF5CC8E0;
	public static final int FOAM = 0xFFE8F6FB;
	public static final int SAND = 0xFFF6EAD2;
	public static final int WHITE = 0xFFFFFFFF;
	public static final int TEXT_SOFT = 0xFF8FB3C4;
	public static final int CORAL = 0xFFE5534B;

	/** Fond des fenêtres, cartes et bordures */
	public static final int WINDOW = 0xB4091C27;
	public static final int CARD = 0xA00F2A39;
	public static final int CARD_HOVER = 0xC0143649;
	public static final int CARD_OFF = 0x800C2230;
	public static final int BORDER = 0x305CC8E0;
	public static final int BORDER_HOVER = 0x905CC8E0;

	/** Interface des menus (pas les modules) : neutres bleu nuit et une couleur par catégorie */
	public static final int UI_SIDE = 0xF0070910;
	public static final int UI_PANEL = 0xE60C0F1A;
	public static final int UI_CARD = 0xFF151A2B;
	public static final int UI_CARD_HOVER = 0xFF1C2338;
	public static final int UI_INSET = 0xFF0D1120;
	public static final int UI_LINE = 0xFF262E48;
	public static final int UI_TEXT = 0xFFE9EDF9;
	public static final int UI_MUTED = 0xFF8C95B3;
	public static final int UI_DIM = 0xFF5B6380;
	public static final int UI_TRACK = 0xFF2A3150;
	public static final int UI_ACCENT = 0xFF4FD1FF;
	public static final int CAT_INFO = 0xFF4FD1FF;
	public static final int CAT_PVP = 0xFFFF6B6B;
	public static final int CAT_RENDER = 0xFFB18CFF;
	public static final int CAT_GAME = 0xFFFFC24D;
	public static final int CAT_PACKS = 0xFF5BE39A;
	public static final int CAT_ALL = 0xFFE9EDF9;

	/** Couleur mélangée : t = 0 donne a, t = 1 donne b (opacité comprise) */
	public static int mix(int a, int b, float t) {
		int r = 0;
		for (int shift = 0; shift < 32; shift += 8) {
			int ca = (a >>> shift) & 0xFF;
			int cb = (b >>> shift) & 0xFF;
			r |= Math.round(ca + (cb - ca) * t) << shift;
		}
		return r;
	}


	/** Couleurs proposées pour le texte des modules */
	public static final int[] PALETTE = {
		0xFF5CC8E0, 0xFFFFFFFF, 0xFFF6EAD2, 0xFFFFD166, 0xFF7BE495, 0xFFFF9EC7, 0xFFC3A6FF, 0xFFFF6B6B
	};

	private Theme() {
	}

	public static int withAlpha(int color, int alpha) {
		return (alpha << 24) | (color & 0xFFFFFF);
	}
}
