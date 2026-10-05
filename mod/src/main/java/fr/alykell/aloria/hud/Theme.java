package fr.alykell.aloria.hud;

/** Couleurs d'Aloria (ARGB), les mêmes que le launcher. */
public final class Theme {
	public static final int SEA_DEEP = 0xFF0B5F86;
	public static final int SEA = 0xFF1A9BC7;
	public static final int LAGOON = 0xFF5CC8E0;
	public static final int FOAM = 0xFFE8F6FB;
	public static final int SAND = 0xFFF6EAD2;
	public static final int WHITE = 0xFFFFFFFF;
	public static final int TEXT_SOFT = 0xFF9FC4D3;

	public static final int PANEL = 0xEE0A2C3D;
	public static final int PANEL_ROW_HOVER = 0x331A9BC7;
	public static final int PANEL_ROW_SELECTED = 0x551A9BC7;

	/** Couleurs proposées dans l'éditeur pour le texte des modules */
	public static final int[] PALETTE = {
		0xFF5CC8E0, 0xFFFFFFFF, 0xFFF6EAD2, 0xFFFFD166, 0xFF7BE495, 0xFFFF9EC7, 0xFFC3A6FF, 0xFFFF6B6B
	};

	private Theme() {
	}

	public static int withAlpha(int color, int alpha) {
		return (alpha << 24) | (color & 0xFFFFFF);
	}
}
