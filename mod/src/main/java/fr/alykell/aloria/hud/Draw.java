package fr.alykell.aloria.hud;

import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * Formes arrondies. Les rectangles ne se chevauchent pas, pour qu'une couleur semi-transparente
 * reste uniforme (sinon les recouvrements apparaîtraient plus foncés).
 */
public final class Draw {
	private Draw() {
	}

	/** Rectangle aux coins arrondis (rayon 2 px) */
	public static void round(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		if (w < 4 || h < 4) {
			g.fill(x, y, x + w, y + h, color);
			return;
		}
		g.fill(x + 2, y, x + w - 2, y + h, color);
		g.fill(x + 1, y + 1, x + 2, y + h - 1, color);
		g.fill(x + w - 2, y + 1, x + w - 1, y + h - 1, color);
		g.fill(x, y + 2, x + 1, y + h - 2, color);
		g.fill(x + w - 1, y + 2, x + w, y + h - 2, color);
	}

	/** Contour arrondi d'un pixel */
	public static void roundOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		g.horizontalLine(x + 2, x + w - 3, y, color);
		g.horizontalLine(x + 2, x + w - 3, y + h - 1, color);
		g.verticalLine(x, y + 2, y + h - 3, color);
		g.verticalLine(x + w - 1, y + 2, y + h - 3, color);
		g.fill(x + 1, y + 1, x + 2, y + 2, color);
		g.fill(x + w - 2, y + 1, x + w - 1, y + 2, color);
		g.fill(x + 1, y + h - 2, x + 2, y + h - 1, color);
		g.fill(x + w - 2, y + h - 2, x + w - 1, y + h - 1, color);
	}

	/** Fond et bordure d'un module, selon ses réglages (couleur, opacité, épaisseur de bordure) */
	public static void panel(GuiGraphicsExtractor g, int x, int y, int w, int h, ModuleSettings s) {
		if (s.background) round(g, x, y, w, h, Theme.withAlpha(s.bgColor, Math.round(Math.clamp(s.opacity, 0, 100) * 2.55f)));
		for (int i = 0; i < s.borderWidth && w - 2 * i >= 4 && h - 2 * i >= 4; i++) {
			roundOutline(g, x + i, y + i, w - 2 * i, h - 2 * i, s.borderColor);
		}
	}
}
