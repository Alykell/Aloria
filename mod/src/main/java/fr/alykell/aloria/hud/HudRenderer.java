package fr.alykell.aloria.hud;

import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.screen.HudLayoutScreen;
import fr.alykell.aloria.hud.screen.VisualScreen;
//#if MC >= 12100
import net.minecraft.client.DeltaTracker;
//#endif
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.util.Mth;

/** Dessine les modules actifs à leur place, en jeu comme dans l'éditeur. */
public final class HudRenderer {
	/** Écart minimal entre un module et le bord de l'écran */
	public static final int MARGIN = 3;

	private HudRenderer() {
	}

	/** Rectangle occupé par un module à l'écran (coordonnées de l'interface, après mise à l'échelle). */
	public record Bounds(int x, int y, int width, int height) {
		public boolean contains(double px, double py) {
			return px >= x && px < x + width && py >= y && py < y + height;
		}
	}

	/** Modules dont l'erreur a déjà été signalée (une fois suffit, le rendu a lieu à chaque image) */
	private static final java.util.Set<String> FAILED = new java.util.HashSet<>();

	public static Bounds bounds(Minecraft mc, HudModule module, ModuleSettings s, int screenW, int screenH, boolean preview) {
		int w = Math.round(module.width(mc, s, preview) * s.scale);
		int h = Math.round(module.height(mc, s, preview) * s.scale);
		// La position est gardée en fraction de l'écran, et le module reste toujours visible
		int left = Math.round(s.x * screenW) - (module.centered() ? w / 2 : 0);
		int x = Mth.clamp(left, MARGIN, Math.max(MARGIN, screenW - w - MARGIN));
		int y = Mth.clamp(Math.round(s.y * screenH), MARGIN, Math.max(MARGIN, screenH - h - MARGIN));
		return new Bounds(x, y, w, h);
	}

	public static void drawModule(GuiGraphicsExtractor g, Minecraft mc, HudModule module, ModuleSettings s, Bounds b, boolean preview) {
		Gfx.push(g);
		Gfx.translate(g, b.x(), b.y());
		Gfx.scale(g, s.scale);
		try {
			module.draw(g, mc, s, preview);
		} finally {
			Gfx.pop(g);
		}
	}

	//#if MC >= 12100
	/** Élément enregistré dans le HUD de Fabric */
	public static void extract(GuiGraphicsExtractor g, DeltaTracker delta) {
		render(g, delta.getGameTimeDeltaPartialTick(false));
	}
	//#endif

	public static void render(GuiGraphicsExtractor g, float partialTick) {
		Minecraft mc = Minecraft.getInstance();
		// Interface masquée (F1), disposition en cours (l'écran dessine lui-même les modules)
		// ou écran Visuel (on doit bien voir les mains et le décor)
		if (mc.gui.hud.isHidden() || mc.gui.screen() instanceof HudLayoutScreen || mc.gui.screen() instanceof VisualScreen) return;

		boolean chatOpen = mc.gui.screen() instanceof ChatScreen;
		for (HudModule module : AloriaHud.modules()) {
			ModuleSettings s = AloriaHud.config().get(module);
			if (!s.enabled || (s.hideInChat && chatOpen)) continue;
			// Une erreur dans un module (donnée inattendue d'un serveur…) ne doit jamais faire planter le jeu
			try {
				if (!module.placeable()) {
					module.drawOverlay(g, mc, s, partialTick);
					continue;
				}
				if (!module.hasContent(mc)) continue;
				drawModule(g, mc, module, s, bounds(mc, module, s, g.guiWidth(), g.guiHeight(), false), false);
			} catch (RuntimeException e) {
				if (FAILED.add(module.id())) AloriaHud.LOGGER.error("Module " + module.id() + " : erreur de rendu, ignorée", e);
			}
		}
	}
}
