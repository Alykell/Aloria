package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Un élément du HUD : il connaît sa taille et sait se dessiner en (0, 0). */
public abstract class HudModule {
	private final String id;

	protected HudModule(String id) {
		this.id = id;
	}

	public String id() {
		return id;
	}

	/** Nom affiché, dans la langue du jeu (clé module.<id>) */
	public String name() {
		return Tr.tr("module." + id);
	}

	/** Onglet du menu : « info » ou « pvp » */
	public String category() {
		return "info";
	}

	/** Précision affichée dans les réglages (ex. quand le module est masqué), ou null */
	public @org.jspecify.annotations.Nullable String hint() {
		return null;
	}

	/** Réglages par défaut (actif ou non, position) à la première utilisation */
	public abstract ModuleSettings defaults();

	/** Taille non mise à l'échelle. En aperçu (éditeur), des données d'exemple remplacent les vides. */
	public abstract int width(Minecraft mc, ModuleSettings s, boolean preview);

	public abstract int height(Minecraft mc, ModuleSettings s, boolean preview);

	public abstract void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview);

	/** Faux pour un module affiché dans le monde (au-dessus des entités) : il n'a pas de place dans la disposition */
	public boolean placeable() {
		return true;
	}

	/** Vrai si la position enregistrée est le centre horizontal du module (largeur variable, ex. bloc visé) */
	public boolean centered() {
		return false;
	}

	/** Dessin libre sur tout l'écran, pour les modules non placés */
	public void drawOverlay(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, float partialTick) {
	}

	/** Faux quand il n'y a rien à afficher (aucun effet actif…) : le module est alors masqué en jeu */
	public boolean hasContent(Minecraft mc) {
		return true;
	}
}
