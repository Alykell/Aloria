package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.GlStateManager;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.util.Window;

/**
 * Déplacement des éléments du jeu (1.8.9) : tableau des scores, chat et barre de boss dessinés à travers une
 * transformation qui envoie leur point d'ancrage habituel vers celui choisi dans la disposition.
 */
public final class GameElements {
	private GameElements() {
	}

	/** {cible x, cible y, taille, ancrage habituel x, ancrage habituel y}, ou null si l'élément est à sa place */
	public static float[] transform(String id) {
		HudModule module = null;
		for (HudModule m : AloriaHud.modules()) {
			if (m.id().equals(id)) module = m;
		}
		if (module == null) return null;
		ModuleSettings s = AloriaHud.config().get(module);
		if (!s.enabled) return null;
		Window window = new Window(MinecraftClient.getInstance());
		int w = window.getWidth();
		int h = window.getHeight();
		HudRenderer.placeGameElement(module, s, w, h);
		float[] natural = module.naturalAnchor(w, h);
		if (natural == null) return null;
		// Dans la disposition, l'exemple tient lieu de l'élément : le vrai est caché (taille presque nulle)
		float scale = MinecraftClient.getInstance().currentScreen instanceof fr.alykell.aloria.hud.screen.HudLayoutScreen ? 0.001f : s.scale;
		return new float[] {s.x * w, s.y * h, scale, natural[0], natural[1]};
	}

	/** Avant le dessin de l'élément : toujours suivi de end() */
	public static void begin(String id) {
		GlStateManager.pushMatrix();
		float[] t = transform(id);
		if (t == null) return;
		GlStateManager.translate(t[0], t[1], 0);
		GlStateManager.scale(t[2], t[2], 1);
		GlStateManager.translate(-t[3], -t[4], 0);
	}

	/**
	 * Chat : le jeu l'a déjà placé à sa ligne de base (0, hauteur - 48) ; on ne fait que décaler et agrandir
	 * autour de ce point.
	 */
	public static void beginChat() {
		GlStateManager.pushMatrix();
		float[] t = transform("chat");
		if (t == null) return;
		GlStateManager.translate(t[0] - t[3], t[1] - t[4], 0);
		GlStateManager.scale(t[2], t[2], 1);
	}

	public static void end() {
		GlStateManager.popMatrix();
	}

	/**
	 * Clic dans le chat déplacé : la souris arrive en pixels de la fenêtre, origine en bas à gauche ; on la ramène
	 * à la place habituelle du chat avant que le jeu cherche le texte visé (x et y se calculent séparément).
	 */
	public static int chatMouseX(int x) {
		float[] t = transform("chat");
		if (t == null) return x;
		int factor = new Window(MinecraftClient.getInstance()).getScaleFactor();
		float gx = x / (float) factor;
		return Math.round(((gx - t[0]) / t[2] + t[3]) * factor);
	}

	public static int chatMouseY(int y) {
		float[] t = transform("chat");
		if (t == null) return y;
		Window window = new Window(MinecraftClient.getInstance());
		int factor = window.getScaleFactor();
		float gy = window.getHeight() - y / (float) factor;
		float ny = (gy - t[1]) / t[2] + t[4];
		return Math.round((window.getHeight() - ny) * factor);
	}
}
