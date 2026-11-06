package fr.alykell.aloria.hud.config;

/** Réglages d'un module, sauvegardés dans config/aloria-hud.json. */
public class ModuleSettings {
	public boolean enabled;
	/** Position du coin haut-gauche en fraction de l'écran (0 à 1) : suit les changements de résolution */
	public float x;
	public float y;
	public float scale = 1.0f;
	public int color = 0xFF5CC8E0;
	public boolean background = true;
	public boolean shadow = true;
	/** Opacité du fond, en pourcentage */
	public int opacity = 35;
	/** Couleur du fond (RVB, l'opacité est à part) */
	public int bgColor = 0x2C7391;
	/** Bordure : couleur ARGB et épaisseur de 0 à 3 pixels */
	public int borderColor = 0x59FFFFFF;
	public int borderWidth = 1;
	/** Police du module (voir Fonts.CHOICES) */
	public String font = "nunito";
	/** Pas touché par les réglages « tous les modules » (police, fond, couleur commune) */
	public boolean ownStyle = false;
	/** Caché pendant que le chat est ouvert, pour ne pas le recouvrir */
	public boolean hideInChat = false;
	/** Module Coordonnées : ligne du biome */
	public boolean showBiome = true;

	/**
	 * Côté d'où le module s'agrandit : « auto » (selon sa place à l'écran) ou un des neuf points
	 * (t/m/b = haut/milieu/bas, puis l/c/r = gauche/centre/droite). x et y sont alors la position de ce point.
	 */
	public String anchor = AUTO;
	/** Point choisi automatiquement au dernier placement (utilisé quand anchor vaut « auto ») */
	public String autoAnchor = "tl";
	/** Faux pour les réglages d'avant les ancrages : x et y y désignent le coin haut-gauche */
	public boolean anchored = false;

	public static final String AUTO = "auto";
	public static final String[] ANCHORS = {"tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"};

	public ModuleSettings() {
	}

	/** Point d'ancrage réellement utilisé */
	public String effectiveAnchor() {
		String a = AUTO.equals(anchor) ? autoAnchor : anchor;
		return a == null || a.length() != 2 ? "tl" : a;
	}

	/** Part de la largeur à gauche du point d'ancrage (0, 0,5 ou 1) */
	public static float fx(String anchor) {
		char c = anchor.charAt(1);
		return c == 'l' ? 0f : c == 'r' ? 1f : 0.5f;
	}

	/** Part de la hauteur au-dessus du point d'ancrage (0, 0,5 ou 1) */
	public static float fy(String anchor) {
		char c = anchor.charAt(0);
		return c == 't' ? 0f : c == 'b' ? 1f : 0.5f;
	}

	/** Point automatique : le module grandit vers le centre de l'écran (écran coupé en tiers) */
	public static String autoFor(float centerX, float centerY, int screenW, int screenH) {
		char v = centerY < screenH / 3f ? 't' : centerY > screenH * 2 / 3f ? 'b' : 'm';
		char h = centerX < screenW / 3f ? 'l' : centerX > screenW * 2 / 3f ? 'r' : 'c';
		return "" + v + h;
	}

	/** Coin gauche du module (largeur w, en pixels) */
	public int left(int w, int screenW) {
		return Math.round(x * screenW - fx(effectiveAnchor()) * w);
	}

	/** Haut du module (hauteur h, en pixels) */
	public int top(int h, int screenH) {
		return Math.round(y * screenH - fy(effectiveAnchor()) * h);
	}

	/** Place le module (coin haut-gauche en pixels) ; en automatique, le point suit sa place à l'écran */
	public void place(int left, int top, int w, int h, int screenW, int screenH) {
		if (AUTO.equals(anchor)) autoAnchor = autoFor(left + w / 2f, top + h / 2f, screenW, screenH);
		String a = effectiveAnchor();
		x = (left + fx(a) * w) / screenW;
		y = (top + fy(a) * h) / screenH;
		anchored = true;
	}

	/** Change le point d'ancrage sans déplacer le module */
	public void setAnchor(String anchor, int left, int top, int w, int h, int screenW, int screenH) {
		this.anchor = anchor;
		place(left, top, w, h, screenW, screenH);
	}

	/** Anciens réglages (coin haut-gauche, ou centre horizontal pour centeredX) : convertis sans bouger le module */
	public void migrate(boolean centeredX, int w, int h, int screenW, int screenH) {
		if (anchored || screenW <= 0 || screenH <= 0) return;
		int left = Math.round(x * screenW) - (centeredX ? w / 2 : 0);
		place(left, Math.round(y * screenH), w, h, screenW, screenH);
	}

	public ModuleSettings(boolean enabled, float x, float y) {
		this.enabled = enabled;
		this.x = x;
		this.y = y;
	}
}
