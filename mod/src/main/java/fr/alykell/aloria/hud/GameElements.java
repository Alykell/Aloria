package fr.alykell.aloria.hud;

import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import org.jspecify.annotations.Nullable;

/**
 * Déplacement des éléments du jeu (tableau des scores, chat, barres de boss) : leur dessin passe par une transformation
 * qui envoie leur point d'ancrage habituel vers celui choisi dans la disposition, avec la taille choisie.
 */
public final class GameElements {
	private GameElements() {
	}

	/** Transformation active : {cible x, cible y, taille, ancrage habituel x, ancrage habituel y}, ou null si l'élément est à sa place */
	public static float @Nullable [] transform(String id) {
		Minecraft mc = Minecraft.getInstance();
		HudModule module = null;
		for (HudModule m : AloriaHud.modules()) {
			if (m.id().equals(id)) module = m;
		}
		if (module == null) return null;
		ModuleSettings s = AloriaHud.config().get(module);
		if (!s.enabled) return null;
		int w = mc.getWindow().getGuiScaledWidth();
		int h = mc.getWindow().getGuiScaledHeight();
		HudRenderer.placeGameElement(module, s, w, h);
		float[] natural = module.naturalAnchor(w, h);
		if (natural == null) return null;
		// Dans la disposition, l'exemple tient lieu de l'élément : le vrai est caché (taille presque nulle)
		float scale = Minecraft.getInstance().gui.screen() instanceof fr.alykell.aloria.hud.screen.HudLayoutScreen ? 0.001f : s.scale;
		return new float[] {s.x * w, s.y * h, scale, natural[0], natural[1]};
	}

	/** Avant le dessin de l'élément : toujours appelé avec end() (la pile est poussée même sans déplacement) */
	public static void begin(GuiGraphicsExtractor g, String id) {
		Gfx.push(g);
		float[] t = transform(id);
		if (t == null) return;
		Gfx.translate(g, t[0], t[1]);
		Gfx.scale(g, t[2]);
		Gfx.translate(g, -t[3], -t[4]);
	}

	public static void end(GuiGraphicsExtractor g) {
		Gfx.pop(g);
	}

	/** Position de la souris ramenée à la place habituelle de l'élément (clics dans le chat déplacé) */
	public static double inverseX(String id, double x) {
		float[] t = transform(id);
		return t == null ? x : (x - t[0]) / t[2] + t[3];
	}

	public static double inverseY(String id, double y) {
		float[] t = transform(id);
		return t == null ? y : (y - t[1]) / t[2] + t[4];
	}
}
