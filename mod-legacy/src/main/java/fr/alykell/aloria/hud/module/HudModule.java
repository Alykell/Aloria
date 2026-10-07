package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;

/** Un élément du HUD : il connaît sa taille et sait se dessiner en (0, 0). */
public abstract class HudModule {
	private final String id;
	private final String name;

	protected HudModule(String id, String name) {
		this.id = id;
		this.name = name;
	}

	public String id() {
		return id;
	}

	public String name() {
		return name;
	}

	/** Onglet du menu : « info » ou « pvp » */
	public String category() {
		return "info";
	}

	/** Précision affichée dans les réglages (ex. quand le module est masqué), ou null */
	public String hint() {
		return null;
	}

	public abstract ModuleSettings defaults();

	/** Taille non mise à l'échelle. En aperçu (menu), des données d'exemple remplacent les vides. */
	public abstract int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview);

	public abstract int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview);

	public abstract void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview);

	/** Faux pour un module affiché dans le monde (au-dessus des entités) : pas de place dans la disposition */
	public boolean placeable() {
		return true;
	}

	/** Vrai si la position enregistrée est le centre horizontal du module */
	public boolean centered() {
		return false;
	}

	/** Dessin libre sur tout l'écran, pour les modules non placés */
	public void drawOverlay(G g, MinecraftClient mc, ModuleSettings s, float partialTick) {
	}

	/** Faux quand il n'y a rien à afficher : le module est alors masqué en jeu */
	public boolean hasContent(MinecraftClient mc) {
		return true;
	}
}
