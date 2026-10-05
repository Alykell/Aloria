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

	/** Fond des modules du HUD : bleu océan clair, opacité réglable (en %) */
	public static int hudBackground(int opacityPercent) {
		return withAlpha(0x2C7391, Math.round(Math.clamp(opacityPercent, 0, 100) * 2.55f));
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
