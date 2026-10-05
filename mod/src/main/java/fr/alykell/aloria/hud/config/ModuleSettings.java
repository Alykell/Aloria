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

	public ModuleSettings() {
	}

	public ModuleSettings(boolean enabled, float x, float y) {
		this.enabled = enabled;
		this.x = x;
		this.y = y;
	}
}
