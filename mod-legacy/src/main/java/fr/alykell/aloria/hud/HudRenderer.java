package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.GlStateManager;
import fr.alykell.aloria.hud.config.ModuleSettings;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.screen.HudLayoutScreen;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.ChatScreen;

/** Dessine les modules actifs à leur place, en jeu comme dans l'éditeur. */
public final class HudRenderer {
	/** Écart minimal entre un module et le bord de l'écran */
	public static final int MARGIN = 3;

	private HudRenderer() {
	}

	/** Rectangle occupé par un module à l'écran (coordonnées de l'interface, après mise à l'échelle). */
	public static final class Bounds {
		public final int x;
		public final int y;
		public final int width;
		public final int height;

		Bounds(int x, int y, int width, int height) {
			this.x = x;
			this.y = y;
			this.width = width;
			this.height = height;
		}

		public boolean contains(double px, double py) {
			return px >= x && px < x + width && py >= y && py < y + height;
		}
	}

	public static Bounds bounds(MinecraftClient mc, G g, HudModule module, ModuleSettings s, int screenW, int screenH, boolean preview) {
		int w = Math.round(module.width(mc, g, s, preview) * s.scale);
		int h = Math.round(module.height(mc, g, s, preview) * s.scale);
		// La position est gardée en fraction de l'écran, et le module reste toujours visible
		int left = Math.round(s.x * screenW) - (module.centered() ? w / 2 : 0);
		int x = Draw.clamp(left, MARGIN, Math.max(MARGIN, screenW - w - MARGIN));
		int y = Draw.clamp(Math.round(s.y * screenH), MARGIN, Math.max(MARGIN, screenH - h - MARGIN));
		return new Bounds(x, y, w, h);
	}

	public static void drawModule(G g, MinecraftClient mc, HudModule module, ModuleSettings s, Bounds b, boolean preview) {
		g.push();
		g.translate(b.x, b.y);
		g.scale(s.scale);
		module.draw(g, mc, s, preview);
		g.pop();
	}

	/** Appelé à la fin du HUD du jeu (InGameHudMixin) */
	public static void render(float partialTick) {
		MinecraftClient mc = MinecraftClient.getInstance();
		// Interface masquée (F1), ou disposition en cours : l'écran dessine lui-même les modules
		if (mc.options.hudHidden || mc.currentScreen instanceof HudLayoutScreen) return;

		G g = new G();
		GlStateManager.enableBlend();
		boolean chatOpen = mc.currentScreen instanceof ChatScreen;
		for (HudModule module : AloriaHud.modules()) {
			ModuleSettings s = AloriaHud.config().get(module);
			if (!s.enabled || (s.hideInChat && chatOpen)) continue;
			if (!module.placeable()) {
				module.drawOverlay(g, mc, s, partialTick);
				continue;
			}
			if (!module.hasContent(mc)) continue;
			drawModule(g, mc, module, s, bounds(mc, g, module, s, g.guiWidth(), g.guiHeight(), false), false);
		}
		GlStateManager.color(1, 1, 1, 1);
	}
}
